import { describe, it, expect } from "vitest";
import { translateQueryToEnglish, translateEventName, translateLeague } from "./translate";

describe("translateQueryToEnglish (busca PT → EN)", () => {
  it("traduz match exato", () => {
    expect(translateQueryToEnglish("Alemanha")).toBe("Germany");
    expect(translateQueryToEnglish("holanda")).toBe("Netherlands");
    expect(translateQueryToEnglish("País de Gales")).toBe("Wales");
  });

  it("é insensível a acentos e caixa", () => {
    expect(translateQueryToEnglish("belgica")).toBe("Belgium");
    expect(translateQueryToEnglish("SUICA")).toBe("Switzerland");
    expect(translateQueryToEnglish("colombia")).toBe("Colombia");
  });

  it("resolve prefixo não-ambíguo com ≥ 3 caracteres", () => {
    expect(translateQueryToEnglish("alem")).toBe("Germany");
    expect(translateQueryToEnglish("marro")).toBe("Morocco");
  });

  it("retorna null para prefixo ambíguo", () => {
    // "irlanda" e "irlanda do norte" → EN distintos
    expect(translateQueryToEnglish("irl")).toBeNull();
  });

  it("match exato vence ambiguidade de prefixo", () => {
    expect(translateQueryToEnglish("irlanda")).toBe("Ireland");
    expect(translateQueryToEnglish("coreia do sul")).toBe("South Korea");
  });

  it("retorna null quando não há tradução (clubes, texto livre)", () => {
    expect(translateQueryToEnglish("flamengo")).toBeNull();
    expect(translateQueryToEnglish("xy")).toBeNull();
  });

  it("nomes idênticos em PT/EN são estáveis", () => {
    expect(translateQueryToEnglish("portugal")).toBe("Portugal");
  });
});

describe("translateEventName", () => {
  it("traduz 'A vs B' para 'A x B' em PT", () => {
    expect(translateEventName("Uruguay vs Brazil", "Uruguay", "Brazil")).toBe("Uruguai x Brasil");
  });
});

describe("translateLeague", () => {
  it("traduz ligas conhecidas", () => {
    expect(translateLeague("UEFA Champions League")).toBe("Liga dos Campeões");
  });
});
