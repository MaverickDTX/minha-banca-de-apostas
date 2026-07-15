import { z } from "npm:zod";

const BetExtractedSchema = z.object({
  event_name: z.string().nullable().optional(),
  event_date: z.string().nullable().optional(),
  // Campo auxiliar da extração. Não é persistido: permite corrigir de forma
  // determinística uma data cujo ano não aparece no bilhete.
  event_date_year_visible: z.boolean(),
  bet_date: z.string().nullable().optional(),
  market: z.string().nullable().optional(),
  selection: z.string().nullable().optional(),
  odds: z.number().gt(1),
  stake_amount: z.number().gt(0),
  bookmaker: z.string().nullable().optional(),
  status: z.enum(["pendente", "green", "red", "void"]).default("pendente"),
});

type BetExtracted = z.infer<typeof BetExtractedSchema>;

export interface BetInput {
  odds: number;
  stake_amount: number;
  status: string;
  bet_date: string;
  event_name: string | null;
  event_date: string | null;
  market: string | null;
  selection: string | null;
  bookmaker: string | null;
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    event_name: { type: "string", nullable: true },
    event_date: { type: "string", nullable: true },
    event_date_year_visible: { type: "boolean" },
    bet_date: { type: "string", nullable: true },
    market: { type: "string", nullable: true },
    selection: { type: "string", nullable: true },
    odds: { type: "number" },
    stake_amount: { type: "number" },
    bookmaker: { type: "string", nullable: true },
    status: { type: "string", enum: ["pendente", "green", "red", "void"] },
  },
  required: ["odds", "stake_amount", "status", "event_date_year_visible"],
};

function dateInstruction(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `datas em ISO 8601; hoje é ${today}; event_date é a data do jogo. Informe event_date_year_visible como true somente se o ano estiver explícito no bilhete/descrição. Se o ano não estiver visível, informe false e use a próxima ocorrência futura da data a partir de hoje — nunca assuma 2025 sem que 2025 esteja explícito. bet_date só se o bilhete/descritivo mostrar quando a aposta foi feita.`;
}

const EXTRACTION_PROMPT =
  "Extraia os dados deste bilhete de aposta. Regras: use null para qualquer campo NÃO VISÍVEL na imagem (não infira — em especial a casa de apostas: se o nome não estiver escrito, é null); valores monetários como número puro; ";

const TEXT_EXTRACTION_PROMPT =
  "Extraia os dados desta descrição de aposta. Regras: use null para qualquer campo NÃO INFORMADO (não infira — em especial a casa de apostas: se o nome não for dito, é null); valores monetários como número puro; ";

function buildPrompt(userText?: string, caption?: string, currentPayload?: string, correctionText?: string): string {
  let prompt: string;

  if (correctionText && currentPayload) {
    prompt =
      `Aqui está a extração atual de um bilhete de aposta:\n${currentPayload}\n\n` +
      `O usuário enviou as seguintes correções:\n${correctionText}\n\n` +
      `Atualize o JSON extraído com as correções do usuário. As correções do usuário VENCEM os valores anteriores. Mantenha campos não mencionados. ${dateInstruction()}`;
  } else if (userText) {
    prompt = TEXT_EXTRACTION_PROMPT + dateInstruction() + `\n\nDescrição: ${userText}`;
  } else {
    prompt = EXTRACTION_PROMPT + dateInstruction();
  }

  if (caption) {
    prompt += `\n\nO usuário informou adicionalmente: '${caption}'. Estas informações VENCEM o que estiver na imagem e preenchem campos não visíveis.`;
  }

  return prompt;
}

function extractJsonFromText(text: string): string | null {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

type ProviderResult =
  | { ok: true; raw: string }
  | { ok: false; reason: "http" | "network" | "empty"; httpStatus?: number };

function logProviderAttempt(
  provider: string,
  outcome: "ok" | "http_error" | "network_error" | "empty" | "validation_failed",
  httpStatus: number | null,
): void {
  console.log(
    JSON.stringify({
      tag: "provider_attempt",
      provider,
      http_status: httpStatus,
      outcome,
    }),
  );
}

async function callGemini(
  model: string,
  prompt: string,
  base64Image: string | undefined,
  apiKey: string,
  useSchema: boolean,
): Promise<ProviderResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [{ text: prompt }];
  if (base64Image) {
    parts.push({ inline_data: { mime_type: "image/jpeg", data: base64Image } });
  }

  const body: Record<string, unknown> = { contents: [{ parts }] };
  if (useSchema) {
    body.generationConfig = {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.1,
    };
  } else {
    body.generationConfig = { temperature: 0.1 };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Gemini ${model} error ${res.status}:`, errText);
      logProviderAttempt(model, "http_error", res.status);
      return { ok: false, reason: "http", httpStatus: res.status };
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      logProviderAttempt(model, "empty", res.status);
      return { ok: false, reason: "empty", httpStatus: res.status };
    }

    const raw = useSchema ? text : extractJsonFromText(text);
    if (!raw) {
      logProviderAttempt(model, "empty", res.status);
      return { ok: false, reason: "empty", httpStatus: res.status };
    }

    logProviderAttempt(model, "ok", res.status);
    return { ok: true, raw };
  } catch (err) {
    console.error(`Gemini ${model} exception:`, err);
    logProviderAttempt(model, "network_error", null);
    return { ok: false, reason: "network" };
  }
}

async function callZen(
  prompt: string,
  base64Image: string | undefined,
  apiKey: string,
): Promise<ProviderResult> {
  const url = "https://opencode.ai/zen/v1/chat/completions";
  const provider = "mimo-v2.5-free";

  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [{ type: "text", text: prompt }];
  if (base64Image) {
    content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } });
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: provider,
        messages: [{ role: "user", content }],
        temperature: 0.1,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Zen API error", res.status, errText);
      logProviderAttempt(provider, "http_error", res.status);
      return { ok: false, reason: "http", httpStatus: res.status };
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) {
      logProviderAttempt(provider, "empty", res.status);
      return { ok: false, reason: "empty", httpStatus: res.status };
    }

    const raw = extractJsonFromText(text);
    if (!raw) {
      logProviderAttempt(provider, "empty", res.status);
      return { ok: false, reason: "empty", httpStatus: res.status };
    }

    logProviderAttempt(provider, "ok", res.status);
    return { ok: true, raw };
  } catch (err) {
    console.error("Zen exception:", err);
    logProviderAttempt(provider, "network_error", null);
    return { ok: false, reason: "network" };
  }
}

export function resolveDateWithoutVisibleYear(eventDate: string, now = new Date()): string {
  const parsed = new Date(eventDate);
  if (Number.isNaN(parsed.getTime())) return eventDate;

  const makeCandidate = (year: number) => new Date(Date.UTC(
    year,
    parsed.getUTCMonth(),
    parsed.getUTCDate(),
    parsed.getUTCHours(),
    parsed.getUTCMinutes(),
    parsed.getUTCSeconds(),
    parsed.getUTCMilliseconds(),
  ));

  let candidate = makeCandidate(now.getUTCFullYear());
  if (candidate.getTime() < now.getTime()) candidate = makeCandidate(now.getUTCFullYear() + 1);
  return candidate.toISOString();
}

export function validateAndNormalize(rawJson: string): BetInput | null {
  try {
    const parsed = JSON.parse(rawJson);
    const result = BetExtractedSchema.safeParse(parsed);
    if (!result.success) {
      console.error("Zod validation failed:", result.error.issues);
      return null;
    }
    const data = result.data;
    const eventDate = data.event_date_year_visible === false && data.event_date
      ? resolveDateWithoutVisibleYear(data.event_date)
      : data.event_date ?? null;
    const betDate = data.bet_date ?? new Date().toISOString();
    return {
      odds: data.odds,
      stake_amount: data.stake_amount,
      status: data.status ?? "pendente",
      bet_date: betDate,
      event_name: data.event_name ?? null,
      event_date: eventDate,
      market: data.market ?? null,
      selection: data.selection ?? null,
      bookmaker: data.bookmaker ?? null,
    };
  } catch (err) {
    console.error("JSON parse error:", err);
    return null;
  }
}

interface ExtractParams {
  base64Image?: string;
  userText?: string;
  caption?: string;
  currentPayload?: string;
  correctionText?: string;
}

export type ExtractOutcome =
  | { status: "ok"; bet: BetInput }
  | { status: "unreadable" }
  | { status: "unavailable" };

export async function extractBetData(params: ExtractParams): Promise<ExtractOutcome> {
  const prompt = buildPrompt(params.userText, params.caption, params.currentPayload, params.correctionText);
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  const zenApiKey = Deno.env.get("ZEN_API_KEY");

  // Cadeia de provedores (ordem preservada)
  const providers: Array<{ name: string; run: () => Promise<ProviderResult> }> = [];

  if (geminiApiKey) {
    providers.push({
      name: "gemini-3.1-flash-lite",
      run: () => callGemini("gemini-3.1-flash-lite", prompt, params.base64Image, geminiApiKey, true),
    });
    providers.push({
      name: "gemini-3.5-flash",
      run: () => callGemini("gemini-3.5-flash", prompt, params.base64Image, geminiApiKey, true),
    });
    providers.push({
      name: "gemma-4-26b-a4b-it",
      run: () => callGemini("gemma-4-26b-a4b-it", prompt, params.base64Image, geminiApiKey, false),
    });
  }

  if (zenApiKey) {
    providers.push({
      name: "mimo-v2.5-free",
      run: () => callZen(prompt, params.base64Image, zenApiKey),
    });
  }

  // sawContent: algum provedor respondeu, mas o conteúdo não validou (imagem/descrição ilegível).
  // sawInfraFailure: houve falha de rede/HTTP em algum provedor.
  let sawContent = false;
  let sawInfraFailure = false;

  for (const provider of providers) {
    const result = await provider.run();

    if (result.ok) {
      const bet = validateAndNormalize(result.raw);
      if (bet) {
        return { status: "ok", bet };
      }
      // provedor respondeu, mas o JSON não passou na validação → conteúdo insuficiente
      logProviderAttempt(provider.name, "validation_failed", null);
      sawContent = true;
      continue;
    }

    if (result.reason === "http" || result.reason === "network") {
      sawInfraFailure = true;
    } else {
      // "empty": provedor respondeu 200 sem conteúdo aproveitável → tratar como ilegível
      sawContent = true;
    }
  }

  // Nenhum provedor produziu uma aposta válida.
  // Se algum chegou a responder com conteúdo (mas nada validou) → ilegível.
  // Caso contrário (só falhas de rede/HTTP, ou nenhum provedor configurado) → indisponível.
  if (sawContent) {
    return { status: "unreadable" };
  }
  return { status: "unavailable" };
}
