/** Formata um valor monetário (em R$, valor bruto do banco).
 *  Quando currency === "u" e unitValue > 0, converte para unidades ("X.XX u").
 *  Sem unitValue (ou <= 0) com currency "u", cai no formato monetário padrão. */
export function formatCurrency(
  value: number | null | undefined,
  currency = "BRL",
  unitValue?: number | null,
): string {
  const v = Number(value ?? 0);
  if (currency === "u") {
    const uv = Number(unitValue ?? 0);
    if (uv > 0) return `${(v / uv).toFixed(2)} u`;
    // Sem unit_value definido: não há como converter — mostra o próprio número em u.
    return `${v.toFixed(2)} u`;
  }
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(v);
  } catch {
    return `R$ ${v.toFixed(2)}`;
  }
}
/** Valor monetário seguido da conversão em unidades: "R$ 50,00 (2.00 u)".
 *  Sem unit_value (nulo/zero), retorna apenas o valor em moeda.
 *  Quando currency já é "u", não duplica — retorna só "X.XX u". */
export function formatWithUnits(
  value: number | null | undefined,
  currency: string,
  unitValue: number | null | undefined,
): string {
  if (currency === "u") return formatCurrency(value, currency, unitValue);
  const rs = formatCurrency(value, currency);
  const uv = Number(unitValue ?? 0);
  if (!uv || uv <= 0) return rs;
  const u = (Number(value ?? 0) / uv).toFixed(2);
  return `${rs} (${u} u)`;
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  const v = Number(value ?? 0);
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v);
}

export function formatPercent(value: number | null | undefined, digits = 2): string {
  const v = Number(value ?? 0);
  return `${formatNumber(v, digits)}%`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(d);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(d);
}

/** Apenas a hora local (HH:mm). Retorna "" se não houver valor. */
export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" }).format(d);
}

export function toISODateInput(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Chave de dia (YYYY-MM-DD) no fuso LOCAL — evita deslocamento por UTC. */
export function toLocalDateKey(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
