import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ArrowUpRight, HelpCircle, LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  className,
  info,
  size = "md",
  to,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: "positive" | "negative" | "neutral";
  className?: string;
  /** Explicação curta da métrica — vira tooltip com (?) ao lado do rótulo. */
  info?: string;
  /** "lg" = KPI primário (valor maior) — hierarquia entre métricas. */
  size?: "md" | "lg";
  /** Drill-down: envolve o card em Link com hover/focus animado. */
  to?: string;
}) {
  const card = (
    <div
      className={cn(
        "surface p-4 flex flex-col gap-2 relative h-full",
        to &&         "motion-safe:transition-all motion-safe:duration-200 group-hover:shadow-xl group-hover:ring-2 group-hover:ring-primary/30 group-hover:border-primary/10 group-focus-visible:shadow-xl group-focus-visible:ring-2 group-focus-visible:ring-primary/30",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        {info ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="stat-label inline-flex items-center gap-1 cursor-help"
                onClick={(e) => e.stopPropagation()}
              >
                {label}
                <HelpCircle className="h-3 w-3 opacity-60" />
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-[240px] text-xs leading-relaxed">{info}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="stat-label">{label}</span>
        )}
        <div className="flex items-center gap-1.5">
          {to && (
            <ArrowUpRight
              aria-hidden
              className="h-3.5 w-3.5 text-muted-foreground opacity-0 motion-safe:transition-opacity motion-safe:duration-200 group-hover:opacity-70 group-focus-visible:opacity-70"
            />
          )}
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>
      <div
        className={cn(
          "stat-value",
          size === "lg" && "text-3xl",
          tone === "positive" && "positive",
          tone === "negative" && "negative",
        )}
      >
        {value}
      </div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );

  if (to) {
    return (
      <Link
        to={to}
        className={cn(
          "group block rounded-lg outline-none cursor-pointer",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out",
          "motion-safe:hover:-translate-y-0.5 motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.95]",
        )}
      >
        {card}
      </Link>
    );
  }

  return card;
}
