import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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

/** Substitui integralmente as pernas de uma aposta (delete-all + insert). */
async function replaceBetLegs(betId: string, legs: BetLegInput[]) {
  const { error: delErr } = await supabase.from("bet_legs").delete().eq("bet_id", betId);
  if (delErr) throw delErr;
  if (legs.length === 0) return;
  const rows = legs.map((l, idx) => ({
    bet_id: betId,
    order_index: l.order_index ?? idx,
    sport: l.sport ?? null,
    league: l.league ?? null,
    event_name: l.event_name ?? null,
    home_team: l.home_team ?? null,
    away_team: l.away_team ?? null,
    event_date: l.event_date ?? null,
    market: l.market ?? null,
    selection: l.selection ?? null,
    odds: l.odds,
    status: l.status,
    tipster: l.tipster ?? null,
  }));
  const { error: insErr } = await supabase.from("bet_legs").insert(rows);
  if (insErr) throw insErr;
}

export function useBulkCreateBets() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inputs: BetInput[]) => {
      if (!user) throw new Error("User not authenticated");
      
      const rows = inputs.map((input) => {
        const { legs, ...fields } = input;
        return { ...fields, user_id: user.id };
      });

      // Inserir as bets e retornar os IDs gerados
      const { data, error } = await supabase.from("bets").insert(rows).select("id");
      if (error) throw error;

      const insertedBets = data || [];
      const legsToInsert: any[] = [];

      insertedBets.forEach((bet, i) => {
        const input = inputs[i];
        if (input.legs && input.legs.length > 0) {
          input.legs.forEach((l, idx) => {
            legsToInsert.push({
              bet_id: bet.id,
              order_index: l.order_index ?? idx,
              sport: l.sport ?? null,
              league: l.league ?? null,
              event_name: l.event_name ?? null,
              home_team: l.home_team ?? null,
              away_team: l.away_team ?? null,
              event_date: l.event_date ?? null,
              market: l.market ?? null,
              selection: l.selection ?? null,
              odds: l.odds,
              status: l.status,
              tipster: l.tipster ?? null,
            });
          });
        }
      });

      if (legsToInsert.length > 0) {
        const { error: legsErr } = await supabase.from("bet_legs").insert(legsToInsert);
        if (legsErr) throw legsErr;
      }

      return rows.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bets", user?.id] });
    },
  });
}

export function useBulkUpdateBets() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: { id: string; bet_type: string; patch: Partial<BetInput> }[]) => {
      if (!user) throw new Error("User not authenticated");
      
      const promises = updates.map(async ({ id, bet_type, patch }) => {
        const { error } = await supabase.from("bets").update(patch).eq("id", id).eq("user_id", user.id);
        if (error) throw error;
        
        if (bet_type === "multipla" && patch.status) {
          const statusMap: Record<string, string> = {
            green: "green",
            red: "red",
            void: "void",
            pendente: "pendente",
            half_green: "green",
            half_red: "red",
            cashout: "green",
          };
          const legStatus = statusMap[patch.status] || "pendente";
          const { error: legErr } = await supabase
            .from("bet_legs")
            .update({ status: legStatus })
            .eq("bet_id", id);
          if (legErr) throw legErr;
        }
      });

      await Promise.all(promises);
      return updates.length;
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
    mutationFn: async (input: BetInput) => {
      const { legs, ...betFields } = input;
      const { error, data } = await supabase
        .from("bets")
        .insert({ ...betFields, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      const bet = data as Bet;
      if (legs && legs.length > 0) {
        await replaceBetLegs(bet.id, legs);
      }
      return bet;
    },
    onSuccess: (bet) => {
      qc.invalidateQueries({ queryKey: ["bets", user?.id] });
      qc.invalidateQueries({ queryKey: ["bet_legs", bet.id] });
    },
  });
}

export function useUpdateBet() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<BetInput> }) => {
      const { legs, ...betFields } = patch;
      if (Object.keys(betFields).length > 0) {
        const { error } = await supabase.from("bets").update(betFields).eq("id", id);
        if (error) throw error;
      }
      if (legs != null) {
        await replaceBetLegs(id, legs);
      }
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
      const { error } = await supabase.from("bets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bets", user?.id] }),
  });
}