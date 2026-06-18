import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: "positive" | "negative" | "neutral";
  className?: string;
}) {
  return (
    <div className={cn("surface p-4 flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between">
        <span className="stat-label">{label}</span>
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