const API_BASE = "https://api.telegram.org";

export async function sendMessage(
  token: string,
  chatId: number,
  text: string,
  replyMarkup?: Record<string, unknown>,
  parseMode?: string,
): Promise<{ ok: boolean; result?: { message_id: number } }> {
  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (replyMarkup) body.reply_markup = replyMarkup;
  if (parseMode) body.parse_mode = parseMode;
  const res = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function answerCallbackQuery(token: string, callbackQueryId: string): Promise<void> {
  await fetch(`${API_BASE}/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  });
}

export async function editMessageText(
  token: string,
  chatId: number,
  messageId: number,
  text: string,
  replyMarkup?: Record<string, unknown>,
  parseMode?: string,
): Promise<void> {
  const body: Record<string, unknown> = { chat_id: chatId, message_id: messageId, text };
  if (replyMarkup) body.reply_markup = replyMarkup;
  if (parseMode) body.parse_mode = parseMode;
  await fetch(`${API_BASE}/bot${token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function getFile(token: string, fileId: string): Promise<{ ok: boolean; result?: { file_path: string } }> {
  const res = await fetch(`${API_BASE}/bot${token}/getFile?file_id=${fileId}`);
  return res.json();
}

export async function downloadFileAsBase64(token: string, filePath: string): Promise<string> {
  const res = await fetch(`${API_BASE}/file/bot${token}/${filePath}`);
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function formatBetSummary(bet: {
  event_name?: string | null;
  market?: string | null;
  selection?: string | null;
  odds?: number | null;
  stake_amount?: number | null;
  bookmaker?: string | null;
  event_date?: string | null;
}): string {
  const lines = ["📋 *Resumo da aposta*"];
  lines.push(`Evento: ${bet.event_name ?? "—"}`);
  lines.push(`Mercado: ${bet.market ?? "—"}`);
  lines.push(`Seleção: ${bet.selection ?? "—"}`);
  lines.push(`Odd: ${bet.odds != null ? Number(bet.odds).toFixed(2) : "—"}`);
  lines.push(`Stake: R$ ${bet.stake_amount != null ? Number(bet.stake_amount).toFixed(2) : "—"}`);
  lines.push(`Casa: ${bet.bookmaker ?? "—"}`);
  if (bet.event_date) {
    const d = new Date(bet.event_date);
    lines.push(`Data evento: ${d.toLocaleDateString("pt-BR")}`);
  }
  lines.push("");
  lines.push("Confirma o cadastro?");
  return lines.join("\n");
}

export function confirmationKeyboard(pendingId: string): Record<string, unknown> {
  return {
    inline_keyboard: [[
      { text: "✅ Confirmar", callback_data: `c:${pendingId}` },
      { text: "✏️ Corrigir", callback_data: `e:${pendingId}` },
      { text: "❌ Cancelar", callback_data: `x:${pendingId}` },
    ]],
  };
}
