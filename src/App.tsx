import { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { Loader2 } from "lucide-react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import AppLayout from "@/components/layout/AppLayout";

// #22 — code-splitting por rota: cada página vira um chunk carregado sob demanda.
const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Bets = lazy(() => import("./pages/Bets"));
const NewBet = lazy(() => import("./pages/NewBet"));
const Bankroll = lazy(() => import("./pages/Bankroll"));
const Analytics = lazy(() => import("./pages/Analytics"));
const CalendarPage = lazy(() => import("./pages/Calendar"));
const MobileGate = lazy(() => import("./components/mobile/MobileGate"));
const ImportExport = lazy(() => import("./pages/ImportExport"));
const SettingsPage = lazy(() => import("./pages/Settings"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const PageFallback = () => (
  <div className="min-h-[50vh] flex items-center justify-center">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        <Sonner richColors position="top-right" />
        <BrowserRouter>
          <AuthProvider>
            <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route element={<AppLayout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/inicio" element={<MobileGate />} />
                <Route path="/apostas" element={<Bets />} />
                <Route path="/apostas/:id" element={<NewBet />} />
                <Route path="/nova-aposta" element={<NewBet />} />
                <Route path="/bankroll" element={<Bankroll />} />
                <Route path="/analises" element={<Analytics />} />
                <Route path="/calendario" element={<CalendarPage />} />
                <Route path="/importar" element={<ImportExport />} />
                <Route path="/configuracoes" element={<SettingsPage />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </MotionConfig>
  </QueryClientProvider>
);

export default App;
