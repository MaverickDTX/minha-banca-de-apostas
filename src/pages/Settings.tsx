import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile, useUpdateProfile } from "@/hooks/useProfile";
import { useTelegramLink, useGenerateLinkCode, useUnlinkTelegram } from "@/hooks/useTelegramLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookmakerSelect } from "@/components/bookmakers/BookmakerSelect";
import { Sun, Moon } from "lucide-react";
import { toast } from "sonner";

const KELLY_OPTIONS = [
  { v: "1", l: "Kelly cheio (1/1)" },
  { v: "0.5", l: "Meio Kelly (1/2)" },
  { v: "0.25", l: "Quarto de Kelly (1/4)" },
  { v: "0.125", l: "Oitavo de Kelly (1/8)" },
];

function Box({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="surface p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  useEffect(() => { document.title = "Configurações · Bankroll Pro"; }, []);
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const { data: telegramLink } = useTelegramLink();
  const generateCode = useGenerateLinkCode();
  const unlinkTelegram = useUnlinkTelegram();
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  const [form, setForm] = useState({
    display_name: "",
    currency: "BRL",
    initial_bankroll: 1000,
    unit_value: 10,
    unit_mode: "fixed" as "fixed" | "percent",
    unit_percent: 1.0,
    kelly_fraction: 0.25,
    stake_warning_percent: 5,
    theme: "dark",
    default_bookmaker: "" as string,
    tipsters: [] as string[],
    bookmakers: [] as string[],
  });
  const [newTipster, setNewTipster] = useState("");
  const [newBookmaker, setNewBookmaker] = useState("");

  useEffect(() => {
    if (profile) {
      setForm({
        display_name: profile.display_name ?? "",
        currency: profile.currency,
        initial_bankroll: Number(profile.initial_bankroll),
        unit_value: Number(profile.unit_value),
        unit_mode: profile.unit_mode,
        unit_percent: Number(profile.unit_percent),
        kelly_fraction: Number(profile.kelly_fraction),
        stake_warning_percent: Number(profile.stake_warning_percent),
        theme: profile.theme,
        default_bookmaker: profile.default_bookmaker ?? "",
        tipsters: profile.tipsters ?? [],
        bookmakers: profile.bookmakers ?? [],
      });
    }
  }, [profile]);

  function setTheme(theme: "dark" | "light") {
    setForm((f) => ({ ...f, theme }));
    document.documentElement.classList.toggle("dark", theme === "dark");
  }

  function addTipster() {
    const t = newTipster.trim();
    if (!t) return;
    if (form.tipsters.some((x) => x.toLowerCase() === t.toLowerCase())) { setNewTipster(""); return; }
    setForm({ ...form, tipsters: [...form.tipsters, t].sort((a, b) => a.localeCompare(b, "pt-BR")) });
    setNewTipster("");
  }
  function removeTipster(t: string) {
    setForm({ ...form, tipsters: form.tipsters.filter((x) => x !== t) });
  }

  function addBookmaker() {
    const b = newBookmaker.trim();
    if (!b) return;
    if (form.bookmakers.some((x) => x.toLowerCase() === b.toLowerCase())) { setNewBookmaker(""); return; }
    setForm({ ...form, bookmakers: [...form.bookmakers, b].sort((a, b2) => a.localeCompare(b2, "pt-BR")) });
    setNewBookmaker("");
  }
  function removeBookmaker(b: string) {
    setForm({ ...form, bookmakers: form.bookmakers.filter((x) => x !== b) });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await update.mutateAsync({ ...form, default_bookmaker: form.default_bookmaker || null });
    toast.success("Configurações salvas");
    document.documentElement.classList.toggle("dark", form.theme === "dark");
  }

  // #15a — troca de senha (Supabase Auth). Apagar conta fica p/ #15b (exige Edge Function).
  // O projeto tem "Require current password when changing password" habilitado no
  // dashboard, então o updateUser exige `current_password`.
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!pw.current) {
      toast.error("Informe a senha atual");
      return;
    }
    if (pw.next.length < 8) {
      toast.error("A nova senha precisa ter pelo menos 8 caracteres");
      return;
    }
    if (pw.next !== pw.confirm) {
      toast.error("As senhas não coincidem");
      return;
    }
    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({
      password: pw.next,
      current_password: pw.current,
    });
    setPwSaving(false);
    if (error) {
      const msg = error.message.toLowerCase();
      toast.error(
        msg.includes("current password")
          ? "Senha atual incorreta"
          : msg.includes("different from the old password")
            ? "A nova senha deve ser diferente da atual"
            : `Erro ao trocar a senha: ${error.message}`,
      );
      return;
    }
    toast.success("Senha alterada com sucesso");
    setPw({ current: "", next: "", confirm: "" });
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Preferências da sua conta e parâmetros padrão para apostas.</p>
      </div>

      <form onSubmit={save} className="space-y-4">
        <Box title="Informações do Perfil">
          <div>
            <Label>Nome de exibição</Label>
            <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
          </div>
        </Box>

        <Box title="Configurações das Apostas" description="Moeda, banca e parâmetros de stake/Kelly.">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label>Moeda padrão</Label>
              <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BRL">Real (BRL)</SelectItem>
                  <SelectItem value="USD">Dólar (USD)</SelectItem>
                  <SelectItem value="EUR">Euro (EUR)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Banca inicial</Label>
              <Input type="number" step="0.01" value={form.initial_bankroll} onChange={(e) => setForm({ ...form, initial_bankroll: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <Label>Modo de unidade</Label>
              <Select value={form.unit_mode} onValueChange={(v) => setForm({ ...form, unit_mode: v as "fixed" | "percent" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixa (valor em moeda)</SelectItem>
                  <SelectItem value="percent">Percentual da banca</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.unit_mode === "fixed" ? (
              <div>
                <Label>Valor da unidade ({form.currency})</Label>
                <Input type="number" step="0.01" value={form.unit_value} onChange={(e) => setForm({ ...form, unit_value: parseFloat(e.target.value) || 0 })} />
              </div>
            ) : (
              <div>
                <Label>Unidade (% da banca)</Label>
                <Input type="number" step="0.01" value={form.unit_percent} onChange={(e) => setForm({ ...form, unit_percent: parseFloat(e.target.value) || 0 })} />
              </div>
            )}
            <div>
              <Label>Fração padrão de Kelly</Label>
              <Select value={String(form.kelly_fraction)} onValueChange={(v) => setForm({ ...form, kelly_fraction: parseFloat(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{KELLY_OPTIONS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Alerta de stake máxima (% da banca)</Label>
              <Input type="number" step="0.1" value={form.stake_warning_percent} onChange={(e) => setForm({ ...form, stake_warning_percent: parseFloat(e.target.value) || 0 })} />
            </div>
          </div>
        </Box>

        <Box title="Casas de Aposta" description="Casa padrão e casas personalizadas (aparecem no seletor ao registrar apostas).">
          <div>
            <Label className="mb-1 block">Casa de aposta padrão</Label>
            <BookmakerSelect value={form.default_bookmaker} onChange={(v) => setForm({ ...form, default_bookmaker: v })} />
          </div>
          <div>
            <Label className="mb-1 block">Adicionar casa personalizada</Label>
            <div className="flex gap-2">
              <Input
                value={newBookmaker}
                onChange={(e) => setNewBookmaker(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addBookmaker(); } }}
                placeholder="Nome da casa"
              />
              <Button type="button" variant="outline" onClick={addBookmaker}>Adicionar</Button>
            </div>
            {form.bookmakers.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {form.bookmakers.map((b) => (
                  <span key={b} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm">
                    {b}
                    <button type="button" onClick={() => removeBookmaker(b)} className="text-muted-foreground hover:text-destructive" aria-label={`Remover ${b}`}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </Box>

        <Box title="Tipsters" description="Fontes das suas tips — aparecem como sugestões ao registrar apostas.">
          <div className="flex gap-2">
            <Input
              value={newTipster}
              onChange={(e) => setNewTipster(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTipster(); } }}
              placeholder="Nome do tipster"
            />
            <Button type="button" variant="outline" onClick={addTipster}>Adicionar</Button>
          </div>
          {form.tipsters.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {form.tipsters.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm">
                  {t}
                  <button type="button" onClick={() => removeTipster(t)} className="text-muted-foreground hover:text-destructive" aria-label={`Remover ${t}`}>×</button>
                </span>
              ))}
            </div>
          )}
        </Box>

        <Box title="Telegram" description="Conecte sua conta ao @BankrollProBot para cadastrar apostas por foto ou mensagem.">
          {telegramLink?.chat_id ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-success"></span>
                <span className="text-sm font-medium">Conectado ✅</span>
              </div>
              <Button variant="outline" onClick={() => unlinkTelegram.mutate(undefined, { onError: () => toast.error("Erro ao desvincular. Tente novamente.") })} disabled={unlinkTelegram.isPending}>
                {unlinkTelegram.isPending ? "Desvinculando..." : "Desvincular"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const code = await generateCode.mutateAsync();
                    setGeneratedCode(code);
                  } catch {
                    toast.error("Erro ao gerar código. Tente novamente.");
                  }
                }}
                disabled={generateCode.isPending}
              >
                {generateCode.isPending ? "Gerando..." : "Gerar código de vínculo"}
              </Button>
              {generatedCode && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Envie <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono text-sm">/vincular {generatedCode}</kbd>
                    para <a href="https://t.me/BankrollProBot" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">@BankrollProBot</a> no Telegram.
                  </p>
                  <Input
                    readOnly
                    value={generatedCode}
                    className="text-center text-xl font-mono tracking-widest"
                  />
                  <p className="text-xs text-muted-foreground">Código expira em 10 minutos.</p>
                </div>
              )}
            </div>
          )}
        </Box>

        <Box title="Aparência">
          <div>
            <Label className="mb-2 block">Tema</Label>
            <div className="inline-flex rounded-lg border border-border p-1 gap-1">
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition ${form.theme === "light" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Sun className="h-4 w-4" /> Claro
              </button>
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition ${form.theme === "dark" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Moon className="h-4 w-4" /> Escuro
              </button>
            </div>
          </div>
        </Box>

        <div className="flex justify-end"><Button type="submit" disabled={update.isPending}>{update.isPending ? "Salvando..." : "Salvar"}</Button></div>
      </form>

      <form onSubmit={changePassword} className="space-y-4">
        <Box title="Segurança" description="Troque a senha da sua conta. Mínimo de 8 caracteres.">
          <div className="grid md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label>Senha atual</Label>
              <Input
                type="password"
                autoComplete="current-password"
                value={pw.current}
                onChange={(e) => setPw({ ...pw, current: e.target.value })}
              />
            </div>
            <div>
              <Label>Nova senha</Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={pw.next}
                onChange={(e) => setPw({ ...pw, next: e.target.value })}
              />
            </div>
            <div>
              <Label>Confirmar nova senha</Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={pw.confirm}
                onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="outline" disabled={pwSaving || !pw.next}>
              {pwSaving ? "Alterando..." : "Alterar senha"}
            </Button>
          </div>
        </Box>
      </form>
    </div>
  );
}
