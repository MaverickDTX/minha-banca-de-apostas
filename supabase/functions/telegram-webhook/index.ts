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

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ── Tipos mínimos do payload do Telegram (só os campos que consumimos) ──

interface TelegramPhotoSize {
  file_id: string;
  file_unique_id?: string;
  width?: number;
  height?: number;
  file_size?: number;
}

interface TelegramChat {
  id: number;
}

interface TelegramMessage {
  message_id: number;
  chat: TelegramChat;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
}

interface TelegramCallbackQuery {
  id: string;
  data?: string;
  message: TelegramMessage;
}

interface TelegramUpdate {
  callback_query?: TelegramCallbackQuery;
  message?: TelegramMessage;
}

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

    const outcome = await extractBetData({
      currentPayload,
      correctionText: text,
    });

    switch (outcome.status) {
      case "ok": {
        const bet = outcome.bet;
        await updateRow("telegram_pending_bets", pendingId, {
          payload: bet as unknown as Record<string, unknown>,
          awaiting_correction: false,
        });
        const summary = formatBetSummary(bet);
        await sendMessage(BOT_TOKEN, chatId, summary, confirmationKeyboard(pendingId), "Markdown");
        break;
      }
      case "unreadable": {
        await sendMessage(
          BOT_TOKEN,
          chatId,
          "Não entendi as correções. Envie no formato: `casa: Betano, stake: 25`",
        );
        break;
      }
      case "unavailable": {
        await sendMessage(
          BOT_TOKEN,
          chatId,
          "O serviço de leitura está temporariamente indisponível. Tente reenviar em alguns instantes.",
        );
        break;
      }
    }
    return;
  }

  // Check if linked
  const user = await resolveUser(chatId);
  if (!user) {
    await sendMessage(BOT_TOKEN, chatId, "Você precisa vincular sua conta primeiro. Envie /start para instruções.");
    return;
  }

  const outcome = await extractBetData({ userText: text });
  switch (outcome.status) {
    case "ok": {
      const bet = outcome.bet;
      const pending = await insertRow("telegram_pending_bets", {
        chat_id: chatId,
        payload: bet as unknown as Record<string, unknown>,
      });
      if (pending) {
        const summary = formatBetSummary(bet);
        await sendMessage(BOT_TOKEN, chatId, summary, confirmationKeyboard(pending.id as string), "Markdown");
      }
      break;
    }
    case "unreadable": {
      await sendMessage(
        BOT_TOKEN,
        chatId,
        "Não foi possível interpretar sua descrição. Tente incluir: evento, odd, stake, casa de apostas.",
      );
      break;
    }
    case "unavailable": {
      await sendMessage(
        BOT_TOKEN,
        chatId,
        "O serviço de leitura está temporariamente indisponível. Tente reenviar em alguns instantes.",
      );
      break;
    }
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

  const outcome = await extractBetData({ base64Image: base64, caption });
  switch (outcome.status) {
    case "ok": {
      const bet = outcome.bet;
      const pending = await insertRow("telegram_pending_bets", {
        chat_id: chatId,
        payload: bet as unknown as Record<string, unknown>,
      });
      if (pending) {
        const summary = formatBetSummary(bet);
        await sendMessage(BOT_TOKEN, chatId, summary, confirmationKeyboard(pending.id as string), "Markdown");
      }
      break;
    }
    case "unreadable": {
      await sendMessage(
        BOT_TOKEN,
        chatId,
        "Não foi possível extrair os dados da imagem. Tente enviar uma foto mais nítida ou descrever a aposta em texto.",
      );
      break;
    }
    case "unavailable": {
      await sendMessage(
        BOT_TOKEN,
        chatId,
        "O serviço de leitura está temporariamente indisponível. Tente reenviar em alguns instantes.",
      );
      break;
    }
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

// ── Update processing (background) ────────────────────────────

async function processUpdate(update: TelegramUpdate): Promise<void> {
  try {
    // Handle callback query
    const cq = update.callback_query;
    if (cq) {
      await handleCallbackQuery(
        cq.id,
        cq.data,
        cq.message.chat.id,
        cq.message.message_id,
      );
      return;
    }

    // Handle message
    const msg = update.message;
    if (!msg) return;

    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    const photos = msg.photo;
    const caption = msg.caption?.trim();

    // Commands
    if (text) {
      if (text === "/start") {
        await handleStart(chatId);
        return;
      }

      const vincularMatch = text.match(/^\/vincular\s+(.+)$/i);
      if (vincularMatch) {
        await handleVincular(chatId, vincularMatch[1].trim());
        return;
      }

      if (text === "/pausar" || text === "/retomar") {
        const user = await resolveUser(chatId);
        if (!user) {
          await sendMessage(BOT_TOKEN, chatId, "Você precisa vincular sua conta primeiro. Envie /start para instruções.");
          return;
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
        return;
      }
    }

    // Kill-switch: bloqueia qualquer caminho que chame o Gemini
    if ((photos && photos.length > 0) || text) {
      if (await isExtractionPaused()) {
        await sendMessage(BOT_TOKEN, chatId, "Processamento pausado ⏸️ Envie /retomar para reativar.");
        return;
      }
    }

    // Photo
    if (photos && photos.length > 0) {
      await handlePhotoMessage(chatId, photos, caption);
      return;
    }

    // Plain text (not a command, not a photo)
    if (text) {
      await handleTextMessage(chatId, text);
      return;
    }
  } catch (err) {
    console.error("processUpdate error:", err);
  }
}

// ── HTTP handler (ACK imediato) ───────────────────────────────

serve((req) => {
  // 1. Verify secret token
  const secret = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (secret !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 2. Parse do body e ACK imediato; o processamento roda em background.
  //    O parse precisa ocorrer aqui (o corpo do request não sobrevive ao
  //    término do handler); só processUpdate roda via EdgeRuntime.waitUntil.
  return (async () => {
    let update: TelegramUpdate;
    try {
      update = (await req.json()) as TelegramUpdate;
    } catch {
      // Corpo inválido: ainda respondemos 200 para o Telegram não reenviar.
      return new Response("OK", { status: 200 });
    }

    console.log("Update:", JSON.stringify(update).slice(0, 500));
    EdgeRuntime.waitUntil(processUpdate(update));
    return new Response("OK", { status: 200 });
  })();
});
