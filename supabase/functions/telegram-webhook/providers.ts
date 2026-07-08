import { z } from "npm:zod";

const BetExtractedSchema = z.object({
  event_name: z.string().nullable().optional(),
  event_date: z.string().nullable().optional(),
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
    bet_date: { type: "string", nullable: true },
    market: { type: "string", nullable: true },
    selection: { type: "string", nullable: true },
    odds: { type: "number" },
    stake_amount: { type: "number" },
    bookmaker: { type: "string", nullable: true },
    status: { type: "string", enum: ["pendente", "green", "red", "void"] },
  },
  required: ["odds", "stake_amount", "status"],
};

const EXTRACTION_PROMPT =
  "Extraia os dados deste bilhete de aposta. Regras: use null para qualquer campo NÃO VISÍVEL na imagem (não infira — em especial a casa de apostas: se o nome não estiver escrito, é null); valores monetários como número puro; datas em ISO 8601; event_date é a data do jogo mostrada no bilhete — se o ano não estiver visível, assuma a próxima ocorrência futura da data; bet_date só se o bilhete mostrar quando a aposta foi feita.";

const TEXT_EXTRACTION_PROMPT =
  "Extraia os dados desta descrição de aposta. Regras: use null para qualquer campo NÃO INFORMADO (não infira — em especial a casa de apostas: se o nome não for dito, é null); valores monetários como número puro; datas em ISO 8601; event_date é a data do jogo — se o ano não estiver visível, assuma a próxima ocorrência futura da data; bet_date só se a descrição mencionar quando a aposta foi feita.";

function buildPrompt(userText?: string, caption?: string, currentPayload?: string, correctionText?: string): string {
  let prompt: string;

  if (correctionText && currentPayload) {
    prompt =
      `Aqui está a extração atual de um bilhete de aposta:\n${currentPayload}\n\n` +
      `O usuário enviou as seguintes correções:\n${correctionText}\n\n` +
      `Atualize o JSON extraído com as correções do usuário. As correções do usuário VENCEM os valores anteriores. Mantenha campos não mencionados.`;
  } else if (userText) {
    prompt = TEXT_EXTRACTION_PROMPT + `\n\nDescrição: ${userText}`;
  } else {
    prompt = EXTRACTION_PROMPT;
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

async function callGemini(
  model: string,
  prompt: string,
  base64Image: string | undefined,
  apiKey: string,
  useSchema: boolean,
): Promise<string | null> {
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
      return null;
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    return useSchema ? text : extractJsonFromText(text);
  } catch (err) {
    console.error(`Gemini ${model} exception:`, err);
    return null;
  }
}

async function callZen(
  prompt: string,
  base64Image: string | undefined,
  apiKey: string,
): Promise<string | null> {
  const url = "https://opencode.ai/zen/v1/chat/completions";

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
        model: "mimo-v2.5-free",
        messages: [{ role: "user", content }],
        temperature: 0.1,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Zen API error", res.status, errText);
      return null;
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) return null;

    return extractJsonFromText(text);
  } catch (err) {
    console.error("Zen exception:", err);
    return null;
  }
}

function validateAndNormalize(rawJson: string): BetInput | null {
  try {
    const parsed = JSON.parse(rawJson);
    const result = BetExtractedSchema.safeParse(parsed);
    if (!result.success) {
      console.error("Zod validation failed:", result.error.issues);
      return null;
    }
    const data = result.data;
    const betDate = data.bet_date ?? data.event_date ?? new Date().toISOString();
    return {
      odds: data.odds,
      stake_amount: data.stake_amount,
      status: data.status ?? "pendente",
      bet_date: betDate,
      event_name: data.event_name ?? null,
      event_date: data.event_date ?? null,
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

export async function extractBetData(params: ExtractParams): Promise<BetInput | null> {
  const prompt = buildPrompt(params.userText, params.caption, params.currentPayload, params.correctionText);
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  const zenApiKey = Deno.env.get("ZEN_API_KEY");

  // Provider chain
  const providers: Array<{
    name: string;
    run: () => Promise<string | null>;
  }> = [];

  if (geminiApiKey) {
    // 1 — Gemini 3.1 flash lite (com schema)
    providers.push({
      name: "gemini-3.1-flash-lite",
      run: () => callGemini("gemini-3.1-flash-lite", prompt, params.base64Image, geminiApiKey, true),
    });
    // 2 — Gemini 3.5 flash (com schema)
    providers.push({
      name: "gemini-3.5-flash",
      run: () => callGemini("gemini-3.5-flash", prompt, params.base64Image, geminiApiKey, true),
    });
    // 3 — Gemma 4 (sem schema)
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

  for (const provider of providers) {
    console.log(`Trying provider: ${provider.name}`);
    const raw = await provider.run();
    if (!raw) {
      console.log(`Provider ${provider.name} returned null, trying next`);
      continue;
    }

    const bet = validateAndNormalize(raw);
    if (bet) {
      console.log(`Provider ${provider.name} succeeded`);
      return bet;
    }
    console.log(`Provider ${provider.name} failed validation, trying next`);
  }

  return null;
}
