import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BetForm } from "@/components/bets/BetForm";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useBet, useBetLegs, useCreateBet, useUpdateBet, useBets } from "@/hooks/useBets";
import { useTransactions } from "@/hooks/useTransactions";
import { useProfile } from "@/hooks/useProfile";
import { computeBankroll } from "@/lib/metrics";
import { toast } from "sonner";

export default function NewBet() {
  const { id } = useParams();
  const editing = !!id;
  useEffect(() => { document.title = `${editing ? "Editar" : "Nova"} aposta · Bankroll Pro`; }, [editing]);
  const nav = useNavigate();
  const create = useCreateBet();
  const update = useUpdateBet();
  const { data: bet } = useBet(id);
  const { data: betLegs } = useBetLegs(id);
  const { data: bets = [] } = useBets();
  const { data: txs = [] } = useTransactions();
  const { data: profile } = useProfile();
  const bank = computeBankroll(Number(profile?.initial_bankroll ?? 0), bets, txs);

  if (editing && !bet) {
    return <div className="text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{editing ? "Editar aposta" : "Nova aposta"}</h1>
          <p className="text-sm text-muted-foreground">Preencha os campos. Os cálculos são automáticos.</p>
        </div>
        {!editing && (
          <Button type="button" variant="outline" size="sm" onClick={() => nav(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Cancelar
          </Button>
        )}
      </div>
      <div className="surface p-4 md:p-6">
        <BetForm
          initial={bet ?? undefined}
          initialLegs={betLegs}
          bankrollNow={bank.current}
          submitLabel={editing ? "Atualizar aposta" : "Salvar aposta"}
          onSubmit={async (data) => {
            if (editing && bet) {
              await update.mutateAsync({ id: bet.id, patch: data });
              toast.success("Aposta atualizada");
            } else {
              await create.mutateAsync(data);
              toast.success("Aposta registrada");
            }
            nav({ pathname: "/apostas", search: window.location.search });
          }}
        />
      </div>
    </div>
  );
}