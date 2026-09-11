import { afterEach, beforeEach, expect, it, vi } from "vitest";
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-10T12:00:00Z")); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const setup = () => vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ MRData: { RaceTable: { Races:
 Array.from({ length: 23 }, (_, i) => ({ season: "2026", round: String(i + 1), raceName: i === 22 ? "Abu Dhabi Grand Prix" : `Race ${i}`, date: `2026-${String(Math.floor(i / 2) + 1).padStart(2, "0")}-15`, Circuit: { circuitId: i === 22 ? "yas_marina" : `circuit${i}` } }))
} } }) })));
it("prioritizes upcoming races so the 15-result cap does not hide season-end races", async () => {
 setup(); const { searchF1Races } = await import("./apisportsF1");
 const results = await searchF1Races("F1");
 expect(Date.parse(results[0].date!)).toBeGreaterThan(Date.now());
 expect(results.some(e => e.name === "GP de Abu Dhabi")).toBe(true);
});
it("filters three-letter place queries instead of returning every race", async () => {
 setup(); const { searchF1Races } = await import("./apisportsF1");
 expect(await searchF1Races("Abu")).toMatchObject([{ name: "GP de Abu Dhabi" }]);
 expect(await searchF1Races("Abu")).toHaveLength(1);
});
