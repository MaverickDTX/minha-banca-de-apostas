import { cn } from "@/lib/utils";
import { HelpCircle, LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  className,
  info,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: "positive" | "negative" | "neutral";
  className?: string;
  /** Explicação curta da métrica — vira tooltip com (?) ao lado do rótulo. */
  info?: string;
}) {
  return (
    <div className={cn("surface p-4 flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between">
        {info ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="stat-label inline-flex items-center gap-1 cursor-help">
                {label}
                <HelpCircle className="h-3 w-3 opacity-60" />
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-[240px] text-xs leading-relaxed">{info}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="stat-label">{label}</span>
        )}
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div
        className={cn(
          "stat-value",
          tone === "positive" && "positive",
          tone === "negative" && "negative",
        )}
      >
        {value}
      </div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}