import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reply = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => body });
const fight = (id: number, home = "Alex Pereira", away = "Magomed Ankalaev") => ({
  id: String(id), home_team: home, away_team: away, sport_title: "MMA", commence_time: "2026-12-12T22:00:00Z",
});

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("VITE_ODDS_API_KEY", "test");
  vi.stubEnv("VITE_API_SPORTS_KEY", "test");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("MMA autocomplete", () => {
  it("finds fighters beyond the first 40 events and accepts x and accents", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => reply(url.includes("/events?")
      ? [...Array.from({ length: 45 }, (_, i) => fight(i, `Fighter ${i}`, "Opponent")), fight(99)]
      : { events: [] })));
    const { searchMmaEvents } = await import("./mma");
    expect(await searchMmaEvents("Álex Pereira x Magomed Ankalaev")).toMatchObject([{ name: "Alex Pereira x Magomed Ankalaev" }]);
    expect(await searchMmaEvents("Alex Pereira vs. Magomed Ankalaev")).toMatchObject([{ name: "Alex Pereira x Magomed Ankalaev" }]);
  });

  it("retries sources after an aborted request instead of caching empty results", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.signal === controller.signal) {
        controller.abort();
        throw new DOMException("Aborted", "AbortError");
      }
      return reply(_url.includes("/events?") ? [fight(1)] : { events: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { searchMmaEvents } = await import("./mma");
    await expect(searchMmaEvents("Pereira", controller.signal)).rejects.toThrow();
    expect(await searchMmaEvents("Pereira")).toHaveLength(1);
  });

  it("recovers from HTTP failures and expires successful caches", async () => {
    let failing = true;
    const fetchMock = vi.fn(async (url: string) => failing ? reply({}, false)
      : reply(url.includes("/events?") ? [fight(1)] : { events: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const { searchMmaEvents } = await import("./mma");
    expect(await searchMmaEvents("Pereira", undefined, { fighterFallback: false })).toEqual([]);
    failing = false;
    expect(await searchMmaEvents("Pereira")).toHaveLength(1);
    const calls = fetchMock.mock.calls.length;
    await searchMmaEvents("Pereira");
    expect(fetchMock).toHaveBeenCalledTimes(calls);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 6 * 60_000);
    await searchMmaEvents("Pereira");
    expect(fetchMock.mock.calls.length).toBeGreaterThan(calls);
    vi.restoreAllMocks();
  });

  it("finds an event by promotion and number", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => reply(url.includes("id=4443")
      ? { events: [{ idEvent: "1", strEvent: "UFC 999: Alex Pereira vs Magomed Ankalaev", strLeague: "UFC" }] }
      : url.includes("/events?") ? [] : { events: [] })));
    const { searchMmaEvents } = await import("./mma");
    expect(await searchMmaEvents("UFC 999")).toMatchObject([{ name: "UFC 999: Alex Pereira x Magomed Ankalaev", homeTeam: "Alex Pereira", awayTeam: "Magomed Ankalaev" }]);
  });

  it("queries the current season and reads API-Sports first/second fighters", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/fighters?")) return reply({ response: [{ id: 2436 }] });
      if (url.includes("/fights?")) return reply({ response: [{ id: 1, date: "2026-12-12T22:00:00Z",
        fighters: { first: { name: "Alex Pereira" }, second: { name: "Magomed Ankalaev" } } }] });
      return reply(url.includes("/events?") ? [] : { events: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { searchMmaEvents } = await import("./mma");
    expect(await searchMmaEvents("Pereira")).toMatchObject([{ name: "Alex Pereira x Magomed Ankalaev" }]);
    expect(fetchMock.mock.calls.some(([url]) => url.includes(`season=${new Date().getFullYear()}`))).toBe(true);
  });
});
