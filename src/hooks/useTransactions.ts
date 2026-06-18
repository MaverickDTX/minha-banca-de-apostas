import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type TxType = "deposit" | "withdrawal" | "adjustment" | "bonus" | "transfer" | "unit_change";

export type BankrollTx = {
  id: string;
  user_id: string;
  tx_date: string;
  tx_type: TxType;
  amount: number;
  bookmaker: string | null;
  notes: string | null;
  created_at: string;
};

export const TX_LABELS: Record<TxType, string> = {
  deposit: "Depósito",
  withdrawal: "Saque",
  adjustment: "Ajuste",
  bonus: "Bônus / Freebet",
  transfer: "Transferência",
  unit_change: "Alteração de unidade",
};

export function useTransactions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["transactions", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<BankrollTx[]> => {
      const { data, error } = await supabase
        .from("bankroll_transactions")
        .select("*")
        .eq("user_id", user!.id)
        .order("tx_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BankrollTx[];
    },
  });
}

export function useCreateTransaction() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<BankrollTx, "id" | "user_id" | "created_at">) => {
      const { error } = await supabase
        .from("bankroll_transactions")
        .insert({ ...input, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transactions", user?.id] }),
  });
}

export function useDeleteTransaction() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bankroll_transactions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transactions", user?.id] }),
  });
}