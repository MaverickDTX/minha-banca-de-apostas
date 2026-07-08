import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  sendMessage,
  answerCallbackQuery,
  editMessageText,
  getFile,
  downloadFileAsBase64,
  formatBetSummary,
  confirmationKeyboard,
} from "./telegram.ts";
import { extractBetData } from "./providers.ts";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ── Supabase helpers ──────────────────────────────────────────

async function callRpc(name: string, params: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RPC ${name}: ${res.status} ${text}`);
  }
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function queryOne(table: string, filters: Record<string, string>): Promise<Record<string, unknown> | null> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) params.set(k, v);
  params.set("limit", "1");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

async function insertRow(table: string, data: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      Prefer: "return=representation",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Insert ${table}: ${res.status} ${text}`);
  }
  const json = await res.json();
  return Array.isArray(json) && json.length > 0 ? json[0] : null;
}

async function updateRow(table: string, id: string, data: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Update ${table}: ${res.status} ${text}`);
  }
}

async function deleteRow(table: string, id: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: "DELETE",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Delete ${table}: ${res.status} ${text}`);
  }
}

// ── Chat resolution ───────────────────────────────────────────

async function resolveUser(chatId: number): Promise<string | null> {
  const row = await queryOne("telegram_links", { chat_id: `eq.${chatId}` });
  return row ? (row.user_id as string) : null;
}

async function getPendingBet(chatId: number): Promise<Record<string, unknown> | null> {
  return queryOne("telegram_pending_bets", {
    chat_id: `eq.${chatId}`,
    expires_at: "gt.now",
    order: "created_at.desc",
  });
}

async function getCorrectionPending(chatId: number): Promise<Record<string, unknown> | null> {
  return queryOne("telegram_pending_bets", {
    chat_id: `eq.${chatId}`,
    awaiting_correction: "eq.true",
    expires_at: "gt.now",
    order: "created_at.desc",
  });
}

// ── Kill-switch (pausa processamento via Gemini) ──────────────

const PAUSE_KEY = "extraction_paused";

async function isExtractionPaused(): Promise<boolean> {
  const row = await queryOne("telegram_settings", { key: `eq.${PAUSE_KEY}` });
  return row ? row.value === true : false;
}

async function setExtractionPaused(paused: boolean): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/telegram_settings?on_conflict=key`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({ key: PAUSE_KEY, value: paused, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upsert telegram_settings: ${res.status} ${text}`);
  }
}

// ── Handlers ──────────────────────────────────────────────────

async function handleStart(chatId: number): Promise<void> {
  const msg =
    "🤖 *Bankroll Pro Bot*\n\n" +
    "Envie a foto do seu bilhete de aposta ou descreva a aposta em texto. " +
    "O bot extrai os dados automaticamente e você confirma antes de salvar no Bankroll Pro.\n\n" +
    "Antes de usar, vincule sua conta:\n" +
    "1. No app, vá em *Configurações > Telegram*\n" +
    "2. Gere um código de vínculo\n" +
    "3. Envie `/vincular CODIGO` aqui\n\n" +
    "Comandos:\n" +
    "/start — Instruções\n" +
    "/vincular CODIGO — Vincular sua conta\n" +
    "/pausar — Pausar processamento de apostas\n" +
    "/retomar — Retomar processamento";
  await sendMessage(BOT_TOKEN, chatId, msg, undefined, "Markdown");
}

async function handleVincular(chatId: number, code: string): Promise<void> {
  // Check if already linked
  const existing = await resolveUser(chatId);
  if (existing) {
    await sendMessage(BOT_TOKEN, chatId, "Sua conta já está vinculada ✅");
    return;
  }

  const ok = await callRpc("link_telegram_chat", { p_code: code, p_chat_id: chatId });
  if (ok === true || ok === "true") {
    await sendMessage(BOT_TOKEN, chatId, "Conta vinculada ✅");
  } else {
    await sendMessage(BOT_TOKEN, chatId, "Código inválido ou expirado. Gere um novo código em Configurações.");
  }
}

async function handleTextMessage(chatId: number, text: string): Promise<void> {
  // Check if there's a pending bet awaiting correction
  const correctionPending = await getCorrectionPending(chatId);
  if (correctionPending) {
    const pendingId = correctionPending.id as string;
    const currentPayload = JSON.stringify(correctionPending.payload);

    const bet = await extractBetData({
      currentPayload,
      correctionText: text,
    });

    if (bet) {
      await updateRow("telegram_pending_bets", pendingId, {
        payload: bet as unknown as Record<string, unknown>,
        awaiting_correction: false,
      });
      const summary = formatBetSummary(bet);
      await sendMessage(BOT_TOKEN, chatId, summary, confirmationKeyboard(pendingId), "Markdown");
    } else {
      await sendMessage(
        BOT_TOKEN,
        chatId,
        "Não entendi as correções. Envie no formato: `casa: Betano, stake: 25`",
      );
    }
    return;
  }

  // Check if linked
  const user = await resolveUser(chatId);
  if (!user) {
    await sendMessage(BOT_TOKEN, chatId, "Você precisa vincular sua conta primeiro. Envie /start para instruções.");
    return;
  }

  const bet = await extractBetData({ userText: text });
  if (bet) {
    const pending = await insertRow("telegram_pending_bets", {
      chat_id: chatId,
      payload: bet as unknown as Record<string, unknown>,
    });
    if (pending) {
      const summary = formatBetSummary(bet);
      await sendMessage(BOT_TOKEN, chatId, summary, confirmationKeyboard(pending.id as string), "Markdown");
    }
  } else {
    await sendMessage(
      BOT_TOKEN,
      chatId,
      "Não foi possível interpretar sua descrição. Tente incluir: evento, odd, stake, casa de apostas.",
    );
  }
}

async function handlePhotoMessage(
  chatId: number,
  photos: Array<{ file_id: string }>,
  caption?: string,
): Promise<void> {
  const user = await resolveUser(chatId);
  if (!user) {
    await sendMessage(BOT_TOKEN, chatId, "Você precisa vincular sua conta primeiro. Envie /start para instruções.");
    return;
  }

  // Pick largest photo
  const largest = photos[photos.length - 1];

  // Download photo
  let filePath: string;
  try {
    const fileInfo = await getFile(BOT_TOKEN, largest.file_id);
    if (!fileInfo.ok || !fileInfo.result?.file_path) {
      await sendMessage(BOT_TOKEN, chatId, "Erro ao baixar a imagem. Tente novamente.");
      return;
    }
    filePath = fileInfo.result.file_path;
  } catch {
    await sendMessage(BOT_TOKEN, chatId, "Erro ao acessar a imagem. Tente novamente.");
    return;
  }

  let base64: string;
  try {
    base64 = await downloadFileAsBase64(BOT_TOKEN, filePath);
  } catch {
    await sendMessage(BOT_TOKEN, chatId, "Erro ao processar a imagem. Tente novamente.");
    return;
  }

  const bet = await extractBetData({ base64Image: base64, caption });
  if (bet) {
    const pending = await insertRow("telegram_pending_bets", {
      chat_id: chatId,
      payload: bet as unknown as Record<string, unknown>,
    });
    if (pending) {
      const summary = formatBetSummary(bet);
      await sendMessage(BOT_TOKEN, chatId, summary, confirmationKeyboard(pending.id as string), "Markdown");
    }
  } else {
    await sendMessage(
      BOT_TOKEN,
      chatId,
      "Não foi possível extrair os dados da imagem. Tente enviar uma foto mais nítida ou descrever a aposta em texto.",
    );
  }
}

async function handleCallbackQuery(
  callbackId: string,
  data: string,
  chatId: number,
  messageId: number,
): Promise<void> {
  // Always answer callback query first to dismiss Telegram's loading state
  await answerCallbackQuery(BOT_TOKEN, callbackId).catch(() => {});

  const prefix = data[0];
  const pendingId = data.slice(2);

  // Verificação de posse: o pending precisa pertencer ao chat que clicou
  const pending = await queryOne("telegram_pending_bets", {
    id: `eq.${pendingId}`,
    chat_id: `eq.${chatId}`,
  });
  if (!pending) {
    await editMessageText(BOT_TOKEN, chatId, messageId, "Esta aposta expirou ou já foi processada.");
    return;
  }

  if (prefix === "c") {
    // Confirmar
    try {
      await callRpc("create_bet_from_telegram", {
        p_chat_id: chatId,
        p_bet: pending.payload,
      });
      await deleteRow("telegram_pending_bets", pendingId);

      const summary = [`Aposta cadastrada ✅`];
      const p = pending.payload as Record<string, unknown>;
      if (p.event_name) summary.push(`Evento: ${p.event_name}`);
      if (p.odds) summary.push(`Odd: ${Number(p.odds).toFixed(2)}`);
      if (p.stake_amount) summary.push(`Stake: R$ ${Number(p.stake_amount).toFixed(2)}`);

      await editMessageText(BOT_TOKEN, chatId, messageId, summary.join("\n"));
    } catch (err) {
      console.error("Confirm error:", err);
      await editMessageText(BOT_TOKEN, chatId, messageId, "Erro ao cadastrar a aposta. Tente novamente.");
    }
  } else if (prefix === "e") {
    // Corrigir
    await updateRow("telegram_pending_bets", pendingId, { awaiting_correction: true });
    await sendMessage(
      BOT_TOKEN,
      chatId,
      "Envie as correções em texto (ex.: `casa: Betano, stake: 25`). Os campos enviados substituirão os atuais.",
    );
  } else if (prefix === "x") {
    // Cancelar
    await deleteRow("telegram_pending_bets", pendingId);
    await editMessageText(BOT_TOKEN, chatId, messageId, "Cancelado ❌");
  }
}

// ── Main ──────────────────────────────────────────────────────

serve(async (req) => {
  try {
    // 1. Verify secret token
    const secret = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (secret !== WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    // 2. Parse update
    const update = await req.json();
    console.log("Update:", JSON.stringify(update).slice(0, 500));

    // 3. Handle callback query
    const cq = update.callback_query;
    if (cq) {
      await handleCallbackQuery(
        cq.id,
        cq.data,
        cq.message.chat.id,
        cq.message.message_id,
      );
      return new Response("OK", { status: 200 });
    }

    // 4. Handle message
    const msg = update.message;
    if (!msg) return new Response("OK", { status: 200 });

    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    const photos = msg.photo;
    const caption = msg.caption?.trim();

    // Commands
    if (text) {
      if (text === "/start") {
        await handleStart(chatId);
        return new Response("OK", { status: 200 });
      }

      const vincularMatch = text.match(/^\/vincular\s+(.+)$/i);
      if (vincularMatch) {
        await handleVincular(chatId, vincularMatch[1].trim());
        return new Response("OK", { status: 200 });
      }

      if (text === "/pausar" || text === "/retomar") {
        const user = await resolveUser(chatId);
        if (!user) {
          await sendMessage(BOT_TOKEN, chatId, "Você precisa vincular sua conta primeiro. Envie /start para instruções.");
          return new Response("OK", { status: 200 });
        }
        const paused = text === "/pausar";
        await setExtractionPaused(paused);
        await sendMessage(
          BOT_TOKEN,
          chatId,
          paused
            ? "Processamento de apostas pausado ⏸️ Fotos e textos serão ignorados até você enviar /retomar."
            : "Processamento reativado ▶️",
        );
        return new Response("OK", { status: 200 });
      }
    }

    // Kill-switch: bloqueia qualquer caminho que chame o Gemini
    if ((photos && photos.length > 0) || text) {
      if (await isExtractionPaused()) {
        await sendMessage(BOT_TOKEN, chatId, "Processamento pausado ⏸️ Envie /retomar para reativar.");
        return new Response("OK", { status: 200 });
      }
    }

    // Photo
    if (photos && photos.length > 0) {
      await handlePhotoMessage(chatId, photos, caption);
      return new Response("OK", { status: 200 });
    }

    // Plain text (not a command, not a photo)
    if (text) {
      await handleTextMessage(chatId, text);
      return new Response("OK", { status: 200 });
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Unhandled error:", err);
    return new Response("OK", { status: 200 });
  }
});
