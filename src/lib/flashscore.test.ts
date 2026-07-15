import { describe, expect, it } from "vitest";
import { deriveTour, parseFlashscoreMatches, tennisPlayerIdsFromSearch } from "./flashscore";

// Fixtures reais capturados da API Flashscore4 (endpoints results/fixtures/search).

// players/tennis/fixtures?player_id=ABqFnqUJ (Jade D.) — singles + doubles reais.
const jadeFixtures = [
  {
    tournament_url: "/tennis/itf-men-singles/m25-uriage/",
    name: "ITF MEN - SINGLES: M25 Uriage (France), clay",
    matches: [
      {
        match_id: "MaL6NIv0",
        timestamp: 1784097000,
        home_team: { player_id: "ABqFnqUJ", name: "Jade D.", country_name: "France" },
        away_team: { player_id: "IB6rAbr3", name: "Aubriot A.", country_name: "France" },
      },
    ],
  },
  {
    tournament_url: "/tennis/itf-men-doubles/m25-uriage/",
    name: "ITF MEN - DOUBLES: M25 Uriage (France), clay",
    matches: [
      {
        match_id: "h8VnIeVr",
        timestamp: 1784127600,
        home_team: [
          { player_id: "j5mYmWV6", name: "Bonnaud A." },
          { player_id: "txt1SgPI", name: "Scaglia M." },
        ],
        away_team: [
          { player_id: "UJ8WrEdd", name: "Domenc M." },
          { player_id: "ABqFnqUJ", name: "Jade D." },
        ],
      },
    ],
  },
];

describe("deriveTour", () => {
  it.each([
    ["/tennis/itf-men-singles/m25-uriage/", "ITF"],
    ["/tennis/challenger-men-singles/royan/", "Challenger"],
    ["/tennis/atp-singles/french-open/", "ATP"],
    ["/tennis/wta-singles/wimbledon/", "WTA"],
    ["/tennis/boys-singles/wimbledon/", "Juvenil"],
    ["/tennis/girls-singles/french-open/", "Juvenil"],
  ])("%s → %s", (url, expected) => {
    expect(deriveTour(url)).toBe(expected);
  });

  it("desconhecido cai para Tênis", () => {
    expect(deriveTour(undefined)).toBe("Tênis");
    expect(deriveTour("/tennis/exhibition/whatever/")).toBe("Tênis");
  });
});

describe("parseFlashscoreMatches", () => {
  it("encontra o confronto Jade x Aubriot (singles) com data e tour ITF", () => {
    const events = parseFlashscoreMatches(jadeFixtures);
    const duel = events.find((e) => e.name === "Jade D. x Aubriot A.");
    expect(duel).toBeDefined();
    expect(duel!.league).toBe("ITF");
    expect(duel!.homeTeam).toBe("Jade D.");
    expect(duel!.awayTeam).toBe("Aubriot A.");
    expect(duel!.date).toBe(new Date(1784097000 * 1000).toISOString());
    expect(duel!.id).toBe("tennis-fs-MaL6NIv0");
  });

  it("achata partida de duplas juntando os nomes com ' / '", () => {
    const events = parseFlashscoreMatches(jadeFixtures);
    const doubles = events.find((e) => e.id === "tennis-fs-h8VnIeVr");
    expect(doubles).toBeDefined();
    expect(doubles!.homeTeam).toBe("Bonnaud A. / Scaglia M.");
    expect(doubles!.awayTeam).toBe("Domenc M. / Jade D.");
  });

  it("descarta partida sem os dois lados nomeados", () => {
    const events = parseFlashscoreMatches([
      { tournament_url: "/tennis/itf-men-singles/x/", matches: [{ match_id: "z", home_team: { name: "So Um" } }] },
    ]);
    expect(events).toHaveLength(0);
  });

  it.each([null, undefined, {}, "erro", []])("entrada inválida %s → []", (bad) => {
    expect(parseFlashscoreMatches(bad)).toEqual([]);
  });
});

describe("tennisPlayerIdsFromSearch", () => {
  // Amostra real da general/search?q=jade (mistura futebol e tênis).
  const searchJade = [
    { id: "f9Thi8Ij", type: "player", name: "Lewis Jade", sport: { id: 2, name: "Tennis" } },
    { id: "ABqFnqUJ", type: "player", name: "Jade Daniel", sport: { id: 2, name: "Tennis" } },
    { id: "z7jlVVx8", type: "player_in_team", name: "Alguem Futebol", sport: { id: 1, name: "Soccer" } },
  ];

  it("retorna só player_id de tênis (sport.id==2, type=player)", () => {
    expect(tennisPlayerIdsFromSearch(searchJade)).toEqual(["f9Thi8Ij", "ABqFnqUJ"]);
  });

  it("acha o id do Jade Daniel", () => {
    expect(tennisPlayerIdsFromSearch(searchJade)).toContain("ABqFnqUJ");
  });

  it.each([null, undefined, "x", {}])("entrada inválida %s → []", (bad) => {
    expect(tennisPlayerIdsFromSearch(bad)).toEqual([]);
  });
});
