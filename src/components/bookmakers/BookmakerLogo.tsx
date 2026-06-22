import { useEffect, useState } from "react";
import { getBookmaker, fallbackTile, logoUrl } from "@/lib/bookmakers";
import { getCachedLogoUrl } from "@/lib/logoCache";
import { cn } from "@/lib/utils";

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
  const [failed, setFailed] = useState(false);
  const [src, setSrc] = useState<string | null>(null);

  const domain = known?.domain ?? null;
  const px = PX[size];

  useEffect(() => {
    if (!domain) { setSrc(null); return; }
    let cancelled = false;
    setFailed(false);
    getCachedLogoUrl(`${domain}@${px * 2}`, logoUrl(domain, px * 2)).then((url) => {
      if (cancelled) return;
      if (url) setSrc(url);
      else setFailed(true);
    });
    return () => { cancelled = true; };
  }, [domain, px]);

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

  if (domain && !failed && src) {
    return (
      <div
        className={cn(
          "rounded-lg bg-white flex items-center justify-center overflow-hidden ring-1 ring-black/10 shadow-sm",
          SIZES[size],
          className,
        )}
        title={name ?? undefined}
      >
        <img
          src={src}
          alt={name ?? "Casa"}
          width={px}
          height={px}
          loading="lazy"
          className="h-full w-full object-contain p-1"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

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