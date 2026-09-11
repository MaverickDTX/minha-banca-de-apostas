import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EventAutocomplete } from "./EventAutocomplete";
import { MarketAutocomplete } from "./MarketAutocomplete";
import { SelectionAutocomplete } from "./SelectionAutocomplete";
import { TipsterAutocomplete } from "./TipsterAutocomplete";
const { search } = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock("@/lib/sportsdb", () => ({ searchEvents: search, mapSportLabel: (s: string) => s }));
vi.mock("@/hooks/useProfile", () => ({ useProfile: () => ({ data: { tipsters: ["João"] } }) }));
vi.mock("@/hooks/useBets", () => ({ useBets: () => ({ data: [{ tipster: "André" }] }) }));
beforeEach(() => { vi.useFakeTimers(); search.mockReset(); search.mockResolvedValue([]); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("discards a pending event response as soon as the query changes", async () => {
 let resolve!: (events: unknown[]) => void;
 search.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
 const props = { onChange: vi.fn(), onPick: vi.fn(), sport: "Futebol" };
 const { rerender } = render(<EventAutocomplete {...props} value="" />);
 rerender(<EventAutocomplete {...props} value="Alpha" />);
 await act(async () => { await vi.advanceTimersByTimeAsync(500); });
 const signal = search.mock.calls[0][1];
 rerender(<EventAutocomplete {...props} value="Beta" />);
 expect(signal.aborted).toBe(true);
 await act(async () => { resolve([{ id: "a", name: "Alpha x Gamma", sport: "Futebol", league: "Liga", date: null }]); });
 expect(screen.queryByText("Alpha x Gamma")).not.toBeInTheDocument();
});
it("can search an initial event again after editing it", async () => {
 const props = { onChange: vi.fn(), onPick: vi.fn(), sport: "Futebol" };
 const { rerender } = render(<EventAutocomplete {...props} value="Alpha" />);
 rerender(<EventAutocomplete {...props} value="Beta" />);
 rerender(<EventAutocomplete {...props} value="Alpha" />);
 await act(async () => { await vi.advanceTimersByTimeAsync(500); });
 expect(search).toHaveBeenCalledWith("Alpha", expect.any(AbortSignal), "Futebol");
});
it("accepts F1 in the event input", async () => {
 const props = { onChange: vi.fn(), onPick: vi.fn(), sport: "Automobilismo" };
 const { rerender } = render(<EventAutocomplete {...props} value="" />);
 rerender(<EventAutocomplete {...props} value="F1" />);
 await act(async () => { await vi.advanceTimersByTimeAsync(500); });
 expect(search).toHaveBeenCalled();
});
it("selects an accented market using an unaccented query", () => {
 const onChange = vi.fn(); render(<MarketAutocomplete value="cartoes" sport="Futebol" onChange={onChange} />);
 fireEvent.focus(screen.getByRole("textbox"));
 fireEvent.click(screen.getByRole("button", { name: "Cartões" }));
 expect(onChange).toHaveBeenCalledWith("Cartões");
});
it("filters accented selections", () => {
 render(<SelectionAutocomplete value="vitoria" market="Vencedor da Partida" sport="Tênis" homeTeam="João" awayTeam="André" onChange={vi.fn()} />);
 fireEvent.focus(screen.getByRole("textbox"));
 expect(screen.getByRole("button", { name: "Vitória João" })).toBeInTheDocument();
 expect(screen.queryByText("Empate")).not.toBeInTheDocument();
});
it("finds tipsters from both profile and bet history without accents", () => {
 const { rerender } = render(<TipsterAutocomplete value="joao" onChange={vi.fn()} />);
 fireEvent.focus(screen.getByRole("textbox"));
 expect(screen.getByRole("button", { name: "João" })).toBeInTheDocument();
 rerender(<TipsterAutocomplete value="andre" onChange={vi.fn()} />);
 expect(screen.getByRole("button", { name: "André" })).toBeInTheDocument();
});
