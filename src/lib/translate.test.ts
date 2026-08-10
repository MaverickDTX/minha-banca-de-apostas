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

  // Regressão do bug que motivou tudo: a regra genérica /Serie A/ vinha antes e
  // devolvia "Serie A" para o Brasileirão, fundindo-o com a liga italiana.
  it("traduz as divisões do Brasileirão pelo nome da TheSportsDB", () => {
    expect(translateLeague("Brazilian Serie A")).toBe("Brasileirão Série A");
    expect(translateLeague("Brazilian Serie B")).toBe("Brasileirão Série B");
    expect(translateLeague("Brazilian Serie C")).toBe("Brasileirão Série C");
    expect(translateLeague("Brazilian Serie D")).toBe("Brasileirão Série D");
  });

  it("desambigua 'Serie A' pelo país", () => {
    expect(translateLeague("Serie A", "Brazil")).toBe("Brasileirão Série A");
    expect(translateLeague("Serie B", "Brazil")).toBe("Brasileirão Série B");
    expect(translateLeague("Serie A", "Ecuador")).toBe("Serie A (Equador)");
    expect(translateLeague("Serie A", "Italy")).toBe("Serie A");
  });

  it("sem país, 'Serie A' cru fica intacto em vez de virar Brasileirão errado", () => {
    expect(translateLeague("Serie A")).toBe("Serie A");
  });

  it("é idempotente e absorve as variantes digitadas à mão", () => {
    expect(translateLeague("Brasileirão Série A")).toBe("Brasileirão Série A");
    expect(translateLeague("Brasileiro Série B")).toBe("Brasileirão Série B");
    expect(translateLeague("Série B Brasileira")).toBe("Brasileirão Série B");
  });

  it("não confunde competições brasileiras que não são o Brasileirão", () => {
    expect(translateLeague("Copa do Brasil", "Brazil")).toBe("Copa do Brasil");
    // Estaduais usam A1/A2 — o \b impede que virem "Série A".
    expect(translateLeague("Campeonato Paulista Série A1", "Brazil")).toBe(
      "Campeonato Paulista Série A1",
    );
  });

  it("traduz a Copa do Mundo sem colidir com as eliminatórias", () => {
    expect(translateLeague("FIFA World Cup")).toBe("Copa do Mundo");
    expect(translateLeague("FIFA World Cup Qualifiers")).toBe("Eliminatórias da Copa do Mundo");
  });

  it("cobre a Conference League após a renomeação da UEFA", () => {
    expect(translateLeague("UEFA Conference League")).toBe("Liga Conferência");
    expect(translateLeague("UEFA Europa Conference League")).toBe("Liga Conferência");
  });

  it("traduz as demais ligas que vinham em inglês", () => {
    expect(translateLeague("Argentinian Primera Division")).toBe("Campeonato Argentino");
    expect(translateLeague("American Major League Soccer")).toBe("MLS");
    expect(translateLeague("Mexican Primera League")).toBe("Campeonato Mexicano");
    expect(translateLeague("Swedish Allsvenskan")).toBe("Allsvenskan (Suécia)");
    expect(translateLeague("South Korean K League 2")).toBe("K League 2 (Coreia do Sul)");
  });

  it("devolve o original quando não conhece a liga", () => {
    expect(translateLeague("Liga Desconhecida XYZ")).toBe("Liga Desconhecida XYZ");
  });
});
