import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { BetStatus } from "@/lib/calc";

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
};

export function useBets() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["bets", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Bet[]> => {
      const { data, error } = await supabase
        .from("bets")
        .select("*")
        .eq("user_id", user!.id)
        .order("bet_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Bet[];
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

export function useCreateBet() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BetInput) => {
      const { error, data } = await supabase
        .from("bets")
        .insert({ ...input, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data as Bet;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bets", user?.id] }),
  });
}

export function useUpdateBet() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<BetInput> }) => {
      const { error } = await supabase.from("bets").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bets", user?.id] });
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