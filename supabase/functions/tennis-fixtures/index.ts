// Proxy para o Tennis API (ATP/WTA/ITF) via RapidAPI.
// A chave fica no Supabase Vault (get_secret), nunca no bundle do front.
// Recebe { type, start, end, pageNo?, pageSize? } e devolve sempre HTTP 200 com
// { ok, status, body } — o status real do RapidAPI vai no envelope para o cliente
// preservar o tratamento de 429/paginação sem invoke() lançar erro.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const HOST = "tennis-api-atp-wta-itf.p.rapidapi.com";
const FS_HOST = "flashscore4.p.rapidapi.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Cache em escopo de módulo: a chave é lida do Vault uma vez por cold start.
let cachedKey: string | null = null;
async function rapidKey(): Promise<string> {
  if (cachedKey) return cachedKey;
  const { data, error } = await admin.rpc("get_secret", { p_name: "TENNIS_RAPIDAPI_KEY" });
  if (error) throw new Error(`get_secret: ${error.message}`);
  if (!data) throw new Error("TENNIS_RAPIDAPI_KEY ausente no Vault");
  cachedKey = data as string;
  return cachedKey;
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, status: 405, body: null, error: "method not allowed" }, 405);

  let params: {
    type?: string; start?: string; end?: string; pageNo?: number; pageSize?: number;
    provider?: string; path?: string;
  };
  try {
    params = await req.json();
  } catch {
    return json({ ok: false, status: 400, body: null, error: "invalid json body" }, 400);
  }

  let key: string;
  try {
    key = await rapidKey();
  } catch (e) {
    return json({ ok: false, status: 500, body: null, error: String(e) }, 500);
  }

  // ---- Modo Flashscore: chamada genérica de caminho (search / results / fixtures)
  // Reusa a mesma X-RapidAPI-Key do Vault. Encadeamento search→results é feito
  // no cliente (tennis.ts); aqui só repassamos o path com a chave e o host certo.
  if (params.provider === "flashscore" && typeof params.path === "string" && params.path.length > 0) {
    if (!params.path.startsWith("/")) {
      return json({ ok: false, status: 400, body: null, error: "bad params" }, 400);
    }
    const url = `https://${FS_HOST}${params.path}`;
    let upstream: Response;
    try {
      upstream = await fetch(url, { headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": FS_HOST } });
    } catch (e) {
      return json({ ok: false, status: 502, body: null, error: `upstream fetch: ${String(e)}` }, 200);
    }
    const text = await upstream.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = text; }
    return json({ ok: upstream.ok, status: upstream.status, body }, 200);
  }

  // ---- Modo Matchstat (primário): fixtures por tour/janela.
  const { type, start, end } = params;
  const pageNo = Number(params.pageNo ?? 1);
  const pageSize = Number(params.pageSize ?? 100);
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (
    (type !== "atp" && type !== "wta" && type !== "itf") ||
    !dateRe.test(start ?? "") || !dateRe.test(end ?? "") ||
    !Number.isInteger(pageNo) || pageNo < 1 ||
    !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100
  ) {
    return json({ ok: false, status: 400, body: null, error: "bad params" }, 400);
  }

  const url = `https://${HOST}/tennis/v2/${type}/fixtures/${start}/${end}?pageSize=${pageSize}&pageNo=${pageNo}`;
  let upstream: Response;
  try {
    upstream = await fetch(url, { headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": HOST } });
  } catch (e) {
    // Envelope 200 com ok:false → cliente trata como carga incompleta, sem quebrar.
    return json({ ok: false, status: 502, body: null, error: `upstream fetch: ${String(e)}` }, 200);
  }

  const text = await upstream.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { body = text; }

  return json({ ok: upstream.ok, status: upstream.status, body }, 200);
});
