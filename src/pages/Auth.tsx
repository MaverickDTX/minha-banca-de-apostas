import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TrendingUp, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Auth() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = "Entrar · Bankroll Pro"; }, []);
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
  if (user) return <Navigate to="/" replace />;

  async function signIn(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message); else nav("/");
  }
  async function signUp(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { display_name: name },
      },
    });
    setBusy(false);
    if (error) toast.error(error.message); else toast.success("Conta criada! Você já pode entrar.");
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-10 bg-gradient-to-br from-primary/15 via-background to-accent/10 border-r border-border">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <TrendingUp className="h-6 w-6 text-primary" />
          </div>
          <span className="text-xl font-semibold">Bankroll Pro</span>
        </div>
        <div className="space-y-4 max-w-md">
          <h1 className="text-4xl font-bold leading-tight">A planilha inteligente do apostador profissional.</h1>
          <p className="text-muted-foreground">
            Registre apostas, controle sua banca e acompanhe ROI, yield, CLV, EV e Kelly em tempo real. Tudo privado, organizado e pronto para escalar a sua operação.
          </p>
          <ul className="text-sm text-muted-foreground space-y-1.5">
            <li>• Dashboard com curva de banca e drawdown</li>
            <li>• Análises por esporte, casa, mercado, faixa de odds</li>
            <li>• Importação e exportação CSV</li>
            <li>• Cálculos automáticos de Kelly, EV e CLV</li>
          </ul>
        </div>
        <div className="text-xs text-muted-foreground">© Bankroll Pro · Dados privados por usuário</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm surface p-6">
          <h2 className="text-xl font-semibold mb-1">Bem-vindo</h2>
          <p className="text-sm text-muted-foreground mb-6">Acesse sua conta para gerenciar sua banca.</p>

          <Tabs defaultValue="signin">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={signIn} className="space-y-3 pt-4">
                <div><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div><Label>Senha</Label><Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                <Button type="submit" className="w-full" disabled={busy}>{busy ? "Entrando..." : "Entrar"}</Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={signUp} className="space-y-3 pt-4">
                <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
                <div><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div><Label>Senha</Label><Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                <Button type="submit" className="w-full" disabled={busy}>{busy ? "Criando..." : "Criar conta"}</Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}