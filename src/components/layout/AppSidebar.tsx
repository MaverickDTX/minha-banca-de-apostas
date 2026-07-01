import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ListChecks,
  PlusCircle,
  Wallet,
  BarChart3,
  CalendarDays,
  FileUp,
  Settings,
  LogOut,
  TrendingUp,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Apostas", url: "/apostas", icon: ListChecks },
  { title: "Nova aposta", url: "/nova-aposta", icon: PlusCircle },
  { title: "Bankroll", url: "/bankroll", icon: Wallet },
  { title: "Análises", url: "/analises", icon: BarChart3 },
  { title: "Calendário", url: "/calendario", icon: CalendarDays },
  { title: "Importar / Exportar", url: "/importar", icon: FileUp },
  { title: "Configurações", url: "/configuracoes", icon: Settings },
];

export function AppSidebar() {
  const { pathname } = useLocation();
  const { signOut, user } = useAuth();
  const { data: profile } = useProfile();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-4">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="font-semibold text-sidebar-foreground">Bankroll Pro</span>
            <span className="text-[11px] text-muted-foreground">Minha Banca de Apostas</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = pathname === item.url;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                      <NavLink to={item.url} end className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{profile?.display_name || "Usuário"}</div>
            <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
          </div>
          <button
            onClick={() => signOut()}
            className="p-2 rounded-md hover:bg-sidebar-accent text-muted-foreground hover:text-foreground transition"
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  