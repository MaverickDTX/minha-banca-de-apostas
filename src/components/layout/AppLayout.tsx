import { useEffect } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { Loader2 } from "lucide-react";

export default function AppLayout() {
  const { user, loading } = useAuth();
  const { data: profile } = useProfile();

  // Aplica o tema salvo no perfil ao carregar / quando muda.
  useEffect(() => {
    if (profile?.theme) {
      document.documentElement.classList.toggle("dark", profile.theme === "dark");
    }
  }, [profile?.theme]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b border-border flex items-center gap-2 px-4 sticky top-0 bg-background/80 backdrop-blur z-20">
            <SidebarTrigger />
            <div className="flex-1" />
          </header>
          <main className="flex-1 p-4 md:p-6 max-w-[1600px] w-full mx-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}