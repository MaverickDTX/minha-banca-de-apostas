import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const { api, f1, tennis, mma } = vi.hoisted(() => ({ api: vi.fn(), f1: vi.fn(), tennis: vi.fn(), mma: vi.fn() }));
vi.mock("./apisportsMulti", () => ({ searchEventsBySport: api, hasApiProduct: (s: string) => ["futebol", "basquete", "automobilismo"].includes(s) }));
vi.mock("./apisportsF1", () => ({ searchF1Races: f1 }));
vi.mock("./tennis", () => ({ searchTennisMatches: tennis }));
vi.mock("./mma", () => ({ searchMmaEvents: mma }));
const event = { id: "1", name: "Alpha x Beta", sport: "Soccer", league: "Liga", date: "2026-12-01T12:00:00Z" };
const reply = (body: unknown) => ({ ok: true, json: async () => body });
beforeEach(() => {
 vi.resetModules(); vi.clearAllMocks();
 for (const mock of [api, f1, tennis, mma]) mock.mockResolvedValue([]);
 vi.stubGlobal("fetch", vi.fn(async () => reply({ event: [], teams: [] })));
});
afterEach(() => vi.unstubAllGlobals());
describe("event search routing", () => {
 it("returns the football fallback previously disabled and discarded", async () => {
  api.mockResolvedValue([event]);
  const { searchEvents } = await import("./sportsdb");
  expect(await searchEvents("Alpha", undefined, "Futebol")).toEqual([event]);
  expect(api).toHaveBeenCalledWith("Alpha", undefined, "futebol");
 });
 it("searches one side of a matchup and filters the opponent", async () => {
  api.mockResolvedValue([event, { ...event, id: "2", name: "Alpha x Gamma" }]);
  const { searchEvents } = await import("./sportsdb");
  expect(await searchEvents("Alpha x Beta", undefined, "Futebol")).toEqual([event]);
  expect(api).toHaveBeenCalledWith("Alpha", undefined, "futebol");
 });
 it("does not let an unrelated sport suppress the selected-sport fallback", async () => {
  f1.mockResolvedValue([{ ...event, id: "f1", sport: "Formula 1" }]);
  api.mockResolvedValue([event]);
  const { searchEvents } = await import("./sportsdb");
  expect((await searchEvents("Alpha", undefined, "Futebol"))[0]).toEqual(event);
 });
 it("accepts timestamps already containing a timezone", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => reply(url.includes("searchevents")
   ? { event: [{ idEvent: "1", strEvent: "Alpha vs Beta", strSport: "Soccer", strTimestamp: "2026-12-01T12:00:00Z" }] }
   : { teams: [] })));
  const { searchEvents } = await import("./sportsdb");
  expect(await searchEvents("Alpha", undefined, "Futebol")).toMatchObject([{ date: new Date(event.date).toISOString() }]);
  expect(api).not.toHaveBeenCalled();
 });
 it("does not cache empty or aborted searches", async () => {
  const { searchEvents } = await import("./sportsdb");
  expect(await searchEvents("Alpha", undefined, "Futebol")).toEqual([]);
  api.mockResolvedValue([event]);
  expect(await searchEvents("Alpha", undefined, "Futebol")).toEqual([event]);
  const controller = new AbortController(); controller.abort();
  await expect(searchEvents("Gamma", controller.signal, "Futebol")).rejects.toThrow();
 });
 it("allows F1 as a short query", async () => {
  api.mockResolvedValue([{ ...event, sport: "Formula 1" }]);
  const { searchEvents } = await import("./sportsdb");
  expect(await searchEvents("F1", undefined, "Automobilismo")).toHaveLength(1);
 });
});
