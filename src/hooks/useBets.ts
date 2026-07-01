import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "./useAuth";
import type { BetStatus, LegStatus } from "@/lib/calc";

export type BetLegRow = {
  id: string;
  bet_id: string;
  order_index: number;
  sport: string | null;
  league: string | null;
  event_name: string | null;
  home_team: string | null;
  away_team: string | null;
  event_date: string | null;
  market: string | null;
  selection: string | null;
  odds: number;
  status: LegStatus;
  tipster: string | null;
  created_at: string;
  updated_at: string;
};

/** Payload de uma perna ao criar/atualizar uma múltipla — sem ids/timestamps gerenciados pelo banco. */
export type BetLegInput = {
  order_index?: number;
  sport?: string | null;
  league?: string | null;
  event_name?: string | null;
  home_team?: string | null;
  away_team?: string | null;
  event_date?: string | null;
  market?: string | null;
  selection?: string | null;
  odds: number;
  status: LegStatus;
  tipster?: string | null;
};

export type Bet = {
  id: string;
  user_id: string;
  bet_date: string;
  event_date: string | null;
  sport: string | null;
  league: string | null;
  event_name: string | null;
  market: string | null;
  selection: string | null;
  bookmaker: string | null;
  bet_type: string;
  timing: string;
  odds: number;
  closing_odds: number | null;
  stake_amount: number;
  stake_units: number | null;
  unit_value_at_bet: number | null;
  status: BetStatus;
  is_free_bet: boolean;
  gross_return: number | null;
  net_profit: number | null;
  estimated_probability: number | null;
  implied_probability: number | null;
  edge: number | null;
  ev: number | null;
  kelly_fraction: number | null;
  recommended_stake: number | null;
  clv: number | null;
  tags: string[] | null;
  tipster: string | null;
  notes: string | null;
  external_link: string | null;
  created_at: string;
  updated_at: string;
};

export type BetInput = Partial<Omit<Bet, "id" | "user_id" | "created_at" | "updated_at">> & {
  odds: number;
  stake_amount: number;
  status: BetStatus;
  bet_date?: string;
  /** Quando presente (bet_type === "multipla"), substitui integralmente as pernas da aposta. */
  legs?: BetLegInput[];
};

export function useBets() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["bets", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Bet[]> => {
      let allData: any[] = [];
      let from = 0;
      const step = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("bets")
          .select("*")
          .eq("user_id", user!.id)
          .order("bet_date", { ascending: false })
          .range(from, from + step - 1);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          allData = [...allData, ...data];
          from += step;
          if (data.length < step) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }
      
      return allData as Bet[];
    },
  });
}

export function useBet(id: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["bet", id],
    enabled: !!user && !!id,
    queryFn: async (): Promise<Bet | null> => {
      const { data, error } = await supabase.from("bets").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data as Bet | null;
    },
  });
}

/** Pernas de uma aposta múltipla, ordenadas por order_index. */
export function useBetLegs(betId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["bet_legs", betId],
    enabled: !!user && !!betId,
    queryFn: async (): Promise<BetLegRow[]> => {
      const { data, error } = await supabase
        .from("bet_legs")
        .select("*")
        .eq("bet_id", betId!)
        .order("order_index", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BetLegRow[];
    },
  });
}

// Escritas compostas (bets + bet_legs) passam por RPCs transacionais no Postgres
// (migration atomic_bet_write_rpcs). Falha parcial reverte a transação inteira.
// As funções são SECURITY INVOKER: a RLS continua valendo, e cada uma revalida
// a posse via auth.uid().

export function useBulkCreateBets() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inputs: BetInput[]) => {
      if (!user) throw new Error("User not authenticated");
      const { data, error } = await supabase.rpc("create_bets_with_legs", {
        p_bets: inputs as unknown as Json,
      });
      if (error) throw error;
      return data?.length ?? 0;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bets", user?.id] });
    },
  });
}

/**
 * Liquidação em lote. O payload é fixo (status, net_profit, gross_return);
 * a RPC também propaga o status às pernas de múltiplas, tudo numa transação —
 * qualquer id inválido reverte o lote inteiro.
 */
export function useBulkUpdateBets() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: { id: string; bet_type: string; patch: Partial<BetInput> }[]) => {
      if (!user) throw new Error("User not authenticated");
      const payload = updates.map(({ id, bet_type, patch }) => ({
        id,
        bet_type,
        status: patch.status,
        net_profit: patch.net_profit ?? null,
        gross_return: patch.gross_return ?? null,
      }));
      const { data, error } = await supabase.rpc("bulk_settle_bets", {
        p_updates: payload as unknown as Json,
      });
      if (error) throw error;
      return data ?? 0;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bets", user?.id] });
    },
  });
}

export function useCreateBet() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BetInput): Promise<string> => {
      if (!user) throw new Error("User not authenticated");
      const { data, error } = await supabase.rpc("create_bets_with_legs", {
        p_bets: [input] as unknown as Json,
      });
      if (error) throw error;
      const id = data?.[0];
      if (!id) throw new Error("Falha ao criar aposta");
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["bets", user?.id] });
      qc.invalidateQueries({ queryKey: ["bet_legs", id] });
    },
  });
}

export function useUpdateBet() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<BetInput> }) => {
      const { legs, ...betFields } = patch;
      const { error } = await supabase.rpc("update_bet_with_legs", {
        p_bet_id: id,
        p_fields: betFields as unknown as Json,
        // p_legs omitido/null = não mexe nas pernas; array = substituição integral.
        p_legs: legs != null ? (legs as unknown as Json) : undefined,
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["bets", user?.id] });
      qc.invalidateQueries({ queryKey: ["bet_legs", vars.id] });
      qc.invalidateQueries({ queryKey: ["bet", vars.id] });
    },
  });
}

export function useDeleteBet() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("User not authenticated");
      // #21: filtro por user_id além da RLS (defense in depth).
      const { error } = await supabase.from("bets").delete().eq("id", id).eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bets", user?.id] }),
  });
}