import { Link } from "react-router-dom";
import { BarChart3, CalendarDays, LayoutDashboard, ListChecks, Plus, Settings, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Apostas", url: "/apostas", icon: ListChecks },
  { title: "Banca", url: "/bankroll", icon: Wallet },
  { title: "Análises", url: "/analises", icon: BarChart3 },
  { title: "Calendário", url: "/calendario", icon: CalendarDays },
  { title: "Config.", url: "/configuracoes", icon: Settings },
] as const;

export default function MobileHome() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-6 gap-8">
      <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
        {items.map((item) => (
          <Link
            key={item.url}
            to={item.url}
            className={cn(
              "flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl surface",
              "motion-safe:transition-all motion-safe:duration-200",
              "motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-xl",
            )}
          >
            <item.icon className="h-6 w-6 text-primary" />
            <span className="text-[11px] font-medium text-center leading-tight">{item.title}</span>
          </Link>
        ))}
      </div>

      <Button asChild size="lg" className="w-full max-w-sm gap-2 h-12 text-base font-semibold">
        <Link to="/nova-aposta">
          <Plus className="h-5 w-5" />
          Nova aposta
        </Link>
      </Button>
    </div>
  );
}