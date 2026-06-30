import { getBookmaker, fallbackTile } from "@/lib/bookmakers";
import { cn } from "@/lib/utils";

// Local bundled logos, keyed by bookmaker slug. Vite resolves these at build
// time, so they ship with the app — no network, no token, no cache.
const LOCAL_LOGOS = import.meta.glob("@/assets/bookmakers/*.{svg,png}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

// Map each slug to its bundled logo url, regardless of file extension.
const LOGO_BY_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(LOCAL_LOGOS).map(([path, url]) => {
    const file = path.split("/").pop() ?? "";
    const slug = file.replace(/\.(svg|png)$/i, "");
    return [slug, url];
  }),
);

function localLogoForSlug(slug?: string | null): string | null {
  if (!slug) return null;
  return LOGO_BY_SLUG[slug] ?? null;
}

type Size = "xs" | "sm" | "md" | "lg";

const SIZES: Record<Size, string> = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-base",
};

const PX: Record<Size, number> = { xs: 24, sm: 32, md: 40, lg: 56 };

export function BookmakerLogo({
  name,
  size = "md",
  className,
}: {
  name?: string | null;
  size?: Size;
  className?: string;
}) {
  const known = getBookmaker(name);
  const tile = known ?? (name ? { ...fallbackTile(name), name } : null);

  const localLogo = localLogoForSlug(known?.slug);
  const px = PX[size];

  if (!tile) {
    return (
      <div
        className={cn(
          "rounded-lg bg-muted text-muted-foreground font-bold flex items-center justify-center",
          SIZES[size],
          className,
        )}
        aria-hidden
      >
        ?
      </div>
    );
  }

  // Local bundled logo: full-bleed (the logo carries its own brand background).
  if (localLogo) {
    return (
      <div
        className={cn(
          "rounded-lg overflow-hidden flex items-center justify-center ring-1 ring-black/10 shadow-sm",
          SIZES[size],
          className,
        )}
        title={name ?? undefined}
      >
        <img
          src={localLogo}
          alt={name ?? "Casa"}
          width={px}
          height={px}
          loading="lazy"
          className="h-full w-full object-contain"
        />
      </div>
    );
  }

  // Fallback: colored monogram tile for bookmakers without a bundled logo.
  return (
    <div
      className={cn(
        "rounded-lg font-extrabold flex items-center justify-center tracking-tight shadow-sm ring-1 ring-black/10",
        SIZES[size],
        className,
      )}
      style={{
        backgroundColor: `hsl(${tile.bg})`,
        color: `hsl(${tile.fg})`,
      }}
      aria-label={name ?? "Casa"}
      title={name ?? undefined}
    >
      {tile.monogram}
    </div>
  );
}
