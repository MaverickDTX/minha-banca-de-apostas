import { describe, it, expect } from "vitest";
import { formatCurrency, formatWithUnits } from "./format";

describe("formatCurrency — moeda unidade (u)", () => {
  it("converte R$ para unidades usando unit_value", () => {
    expect(formatCurrency(50, "u", 10)).toBe("5.00 u");
    expect(formatCurrency(25, "u", 10)).toBe("2.50 u");
  });

  it("aceita valores negativos (prejuízo)", () => {
    expect(formatCurrency(-30, "u", 10)).toBe("-3.00 u");
  });

  it("trata zero", () => {
    expect(formatCurrency(0, "u", 10)).toBe("0.00 u");
  });

  it("sem unit_value (0/undefined) não divide — mostra o próprio número em u", () => {
    expect(formatCurrency(50, "u", 0)).toBe("50.00 u");
    expect(formatCurrency(50, "u")).toBe("50.00 u");
    expect(formatCurrency(50, "u", null)).toBe("50.00 u");
  });

  it("null/undefined viram 0", () => {
    expect(formatCurrency(null, "u", 10)).toBe("0.00 u");
    expect(formatCurrency(undefined, "u", 10)).toBe("0.00 u");
  });
});

describe("formatCurrency — moedas tradicionais (unit_value ignorado)", () => {
  it("BRL não é afetado por unit_value", () => {
    const s = formatCurrency(50, "BRL", 10);
    expect(s).toContain("50");
    expect(s).not.toContain(" u");
  });

  it("USD/EUR formatam normalmente", () => {
    expect(formatCurrency(50, "USD").length).toBeGreaterThan(0);
    expect(formatCurrency(50, "EUR").length).toBeGreaterThan(0);
  });
});

describe("formatWithUnits — não duplica quando currency=u", () => {
  it("currency=u retorna só a forma em unidades, sem parênteses", () => {
    expect(formatWithUnits(50, "u", 10)).toBe("5.00 u");
    expect(formatWithUnits(50, "u", 10)).not.toContain("(");
  });

  it("currency=BRL mantém o sufixo entre parênteses", () => {
    const s = formatWithUnits(50, "BRL", 10);
    expect(s).toContain("(5.00 u)");
  });

  it("currency=BRL sem unit_value retorna só a moeda", () => {
    const s = formatWithUnits(50, "BRL", 0);
    expect(s).not.toContain("u)");
  });
});
