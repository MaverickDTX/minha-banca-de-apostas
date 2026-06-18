import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import AppLayout from "@/components/layout/AppLayout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Bets from "./pages/Bets";
import NewBet from "./pages/NewBet";
import Bankroll from "./pages/Bankroll";
import Analytics from "./pages/Analytics";
import CalendarPage from "./pages/Calendar";
import ImportExport from "./pages/ImportExport";
import SettingsPage from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner richColors position="top-right" />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route element={<AppLayout />}>
              <Route path="/" element={<Dashboard />} />
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
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
