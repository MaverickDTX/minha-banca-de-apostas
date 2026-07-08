import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type TelegramLink = {
  user_id: string;
  chat_id: number | null;
  link_code: string | null;
  code_expires_at: string | null;
  created_at: string;
};

function generateCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export function useTelegramLink() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["telegram_link", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<TelegramLink | null> => {
      const { data, error } = await supabase
        .from("telegram_links")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as TelegramLink | null;
    },
  });
}

export function useGenerateLinkCode() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<string> => {
      if (!user) throw new Error("User not authenticated");
      const code = generateCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      const { error } = await supabase
        .from("telegram_links")
        .upsert({
          user_id: user.id,
          link_code: code,
          code_expires_at: expiresAt,
        }, { onConflict: "user_id" });

      if (error) throw error;
      return code;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["telegram_link", user?.id] });
    },
  });
}

export function useUnlinkTelegram() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("User not authenticated");
      const { error } = await supabase
        .from("telegram_links")
        .update({ chat_id: null, link_code: null, code_expires_at: null })
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["telegram_link", user?.id] });
    },
  });
}