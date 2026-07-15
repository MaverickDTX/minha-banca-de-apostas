import { resolveDateWithoutVisibleYear, validateAndNormalize } from "./providers.ts";

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Esperado ${JSON.stringify(expected)}, recebido ${JSON.stringify(actual)}`);
  }
}

Deno.test("resolveDateWithoutVisibleYear usa o próximo ano quando a data deste ano já passou", () => {
  assertEquals(
    resolveDateWithoutVisibleYear("2025-06-10T18:30:00.000Z", new Date("2026-07-14T12:00:00.000Z")),
    "2027-06-10T18:30:00.000Z",
  );
});

Deno.test("extractor não usa a data do evento como data da aposta", () => {
  const bet = validateAndNormalize(JSON.stringify({
    event_name: "Jogador A x Jogador B",
    event_date: "2025-12-20T18:30:00.000Z",
    event_date_year_visible: false,
    odds: 1.9,
    stake_amount: 20,
    status: "pendente",
  }));

  assertEquals(bet?.event_date?.startsWith("2025-12-20T18:30:00.000Z"), false);
  assertEquals(bet?.bet_date === bet?.event_date, false);
});
