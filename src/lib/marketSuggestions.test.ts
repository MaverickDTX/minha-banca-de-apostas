import { expect, it } from "vitest";
import { getSelectionSuggestions } from "./marketSuggestions";
import { normalizeSearchText } from "./searchText";
it.each(["Tênis", "Vôlei"])("does not suggest a draw for match winner in %s", sport => {
 expect(getSelectionSuggestions("Vencedor da Partida", "A", "B", sport).map(s => s.label)).toEqual(["Vitória A", "Vitória B"]);
});
it("retains the draw in football 1X2", () => {
 expect(getSelectionSuggestions("Resultado final (1X2)", "A", "B", "Futebol").map(s => s.label)).toContain("Empate");
});
it("matches accents and repeated spaces in local suggestions", () => {
 expect(normalizeSearchText("  MÉTODO   de Vitória ")).toBe("metodo de vitoria");
 expect(normalizeSearchText("Cartões")).toContain("cartoes");
});
import { getMarketSuggestions } from "./marketSuggestions";
it("total sets uses totals while exact set scores retain scores", () => {
 expect(getSelectionSuggestions("Total de Sets", "A", "B", "Tênis")[0].label).toBe("Mais de 2.5 sets");
 expect(getSelectionSuggestions("Placar de Sets", "A", "B", "Tênis")[0].label).toBe("2-0 A");
 expect(getSelectionSuggestions("Handicap de Games", "A", "B", "Tênis")[0].label).toBe("A -1.5");
});
it("every configured sport has nonempty, distinct market labels", () => {
 for (const sport of ["Futebol", "Tênis", "Automobilismo", "Basquete", "MMA", "Futebol Americano", "Vôlei", "Beisebol", "Hóquei no Gelo", "Handebol", "eSports", "Outro"]) {
  const options = getMarketSuggestions(sport);
  expect(options.length).toBeGreaterThan(0);
  expect(new Set(options).size).toBe(options.length);
 }
});
