export type BookmakerDef = {
  slug: string;
  name: string;
  /** 2-3 letter monogram shown on the logo tile */
  monogram: string;
  /** Brand background color (HSL string body — e.g. "142 70% 38%") */
  bg: string;
  /** Foreground (text) color on the tile */
  fg: string;
};

export const BOOKMAKERS: BookmakerDef[] = [
  { slug: "bet365",         name: "Bet365",          monogram: "365",  bg: "142 72% 26%", fg: "60 100% 60%" },
  { slug: "betano",         name: "Betano",          monogram: "BO",   bg: "16 92% 50%",  fg: "0 0% 100%" },
  { slug: "betfair",        name: "Betfair",         monogram: "BF",   bg: "44 96% 55%",  fg: "0 0% 8%" },
  { slug: "sportingbet",    name: "Sportingbet",     monogram: "SB",   bg: "0 84% 50%",   fg: "0 0% 100%" },
  { slug: "kto",            name: "KTO",             monogram: "KTO",  bg: "152 76% 38%", fg: "0 0% 100%" },
  { slug: "superbet",       name: "Superbet",        monogram: "SU",   bg: "0 78% 48%",   fg: "0 0% 100%" },
  { slug: "estrelabet",     name: "Estrela Bet",     monogram: "EB",   bg: "350 88% 50%", fg: "0 0% 100%" },
  { slug: "pixbet",         name: "Pixbet",          monogram: "PX",   bg: "168 84% 38%", fg: "0 0% 100%" },
  { slug: "blaze",          name: "Blaze",           monogram: "BZ",   bg: "20 96% 55%",  fg: "0 0% 8%" },
  { slug: "novibet",        name: "Novibet",         monogram: "NV",   bg: "210 90% 48%", fg: "0 0% 100%" },
  { slug: "betnacional",    name: "BetNacional",     monogram: "BN",   bg: "138 70% 36%", fg: "0 0% 100%" },
  { slug: "bwin",           name: "Bwin",            monogram: "BW",   bg: "48 100% 50%", fg: "0 0% 8%" },
  { slug: "888sport",       name: "888sport",        monogram: "888",  bg: "18 94% 52%",  fg: "0 0% 100%" },
  { slug: "stake",          name: "Stake",           monogram: "ST",   bg: "210 14% 16%", fg: "144 96% 58%" },
  { slug: "galera",         name: "Galera.bet",      monogram: "GL",   bg: "262 70% 50%", fg: "0 0% 100%" },
  { slug: "esportesdasorte",name: "Esportes da Sorte", monogram: "ES", bg: "48 96% 52%",  fg: "0 0% 8%" },
  { slug: "f12bet",         name: "F12.bet",         monogram: "F12",  bg: "0 0% 8%",     fg: "48 100% 56%" },
  { slug: "pinnacle",       name: "Pinnacle",        monogram: "PN",   bg: "0 78% 46%",   fg: "0 0% 100%" },
  { slug: "betmgm",         name: "BetMGM",          monogram: "MGM",  bg: "44 90% 50%",  fg: "0 0% 8%" },
  { slug: "esportivabet",   name: "Esportiva.bet",   monogram: "EV",   bg: "208 88% 44%", fg: "0 0% 100%" },
];

const BY_NAME = new Map(BOOKMAKERS.map((b) => [b.name.toLowerCase(), b]));
const BY_SLUG = new Map(BOOKMAKERS.map((b) => [b.slug, b]));

export function getBookmaker(value?: string | null): BookmakerDef | null {
  if (!value) return null;
  const key = value.trim().toLowerCase();
  return BY_NAME.get(key) ?? BY_SLUG.get(key) ?? null;
}

/** Derive a stable color tile for a custom (unknown) bookmaker string. */
export function fallbackTile(name: string): { bg: string; fg: string; monogram: string } {
  const clean = name.trim();
  const mono = clean
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase() || "?";
  let hash = 0;
  for (let i = 0; i < clean.length; i++) hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return { bg: `${hue} 60% 38%`, fg: "0 0% 100%", monogram: mono };
}