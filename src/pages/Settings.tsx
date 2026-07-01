import { useEffect, useState } from "react";
import { useProfile, useUpdateProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookmakerSelect } from "@/components/bookmakers/BookmakerSelect";
import { toast } from "sonner";

const KELLY_OPTIONS = [
  { v: "1", l: "Kelly cheio (1/1)" },
  { v: "0.5", l: "Meio Kelly (1/2)" },
  { v: "0.25", l: "Quarto de Kelly (1/4)" },
  { v: "0.125", l: "Oitavo de Kelly (1/8)" },
];

export default function SettingsPage() {
  useEffect(() => { document.title = "Configurações · Bankroll Pro"; }, []);
  const { data: profile } = useProfile();
  const update = useUpdateProfile();

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
  });
  const [newTipster, setNewTipster] = useState("");

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
      });
    }
  }, [profile]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await update.mutateAsync({ ...form, default_bookmaker: form.default_bookmaker || null });
    toast.success("Configurações salvas");
    document.documentElement.classList.toggle("dark", form.theme === "dark");
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Preferências da sua conta e parâmetros padrão para apostas.</p>
      </div>

      <form onSubmit={save} className="surface p-5 space-y-4">
        <div><Label>Nome de exibição</Label><Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></div>

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
            <Label>Tema</Label>
            <Select value={form.theme} onValueChange={(v) => setForm({ ...form, theme: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dark">Escuro</SelectItem>
                <SelectItem value="light">Claro</SelectItem>
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
          <div>
            <Label className="mb-1 block">Casa de aposta padrão</Label>
            <BookmakerSelect value={form.default_bookmaker} onChange={(v) => setForm({ ...form, default_bookmaker: v })} />
          </div>
        </div>

        <div>
          <Label className="mb-1 block">Tipsters</Label>
          <p className="text-xs text-muted-foreground mb-2">Cadastre as fontes das suas tips. Elas aparecem como sugestões ao registrar apostas.</p>
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
        </div>

        <div className="flex justify-end"><Button type="submit" disabled={update.isPending}>{update.isPending ? "Salvando..." : "Salvar"}</Button></div>
      </form>
    </div>
  );
}
