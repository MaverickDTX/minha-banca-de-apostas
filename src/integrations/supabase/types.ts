export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bankroll_transactions: {
        Row: {
          amount: number
          bookmaker: string | null
          created_at: string
          id: string
          notes: string | null
          tx_date: string
          tx_type: string
          user_id: string
        }
        Insert: {
          amount: number
          bookmaker?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          tx_date?: string
          tx_type: string
          user_id: string
        }
        Update: {
          amount?: number
          bookmaker?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          tx_date?: string
          tx_type?: string
          user_id?: string
        }
        Relationships: []
      }
      bet_legs: {
        Row: {
          away_team: string | null
          bet_id: string
          created_at: string
          event_date: string | null
          event_name: string | null
          home_team: string | null
          id: string
          league: string | null
          market: string | null
          odds: number
          order_index: number
          selection: string | null
          sport: string | null
          status: string
          tipster: string | null
          updated_at: string
        }
        Insert: {
          away_team?: string | null
          bet_id: string
          created_at?: string
          event_date?: string | null
          event_name?: string | null
          home_team?: string | null
          id?: string
          league?: string | null
          market?: string | null
          odds: number
          order_index?: number
          selection?: string | null
          sport?: string | null
          status?: string
          tipster?: string | null
          updated_at?: string
        }
        Update: {
          away_team?: string | null
          bet_id?: string
          created_at?: string
          event_date?: string | null
          event_name?: string | null
          home_team?: string | null
          id?: string
          league?: string | null
          market?: string | null
          odds?: number
          order_index?: number
          selection?: string | null
          sport?: string | null
          status?: string
          tipster?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bet_legs_bet_id_fkey"
            columns: ["bet_id"]
            isOneToOne: false
            referencedRelation: "bets"
            referencedColumns: ["id"]
          },
        ]
      }
      bets: {
        Row: {
          bet_date: string
          bet_type: string
          bookmaker: string | null
          closing_odds: number | null
          clv: number | null
          created_at: string
          edge: number | null
          estimated_probability: number | null
          ev: number | null
          event_date: string | null
          event_name: string | null
          external_link: string | null
          gross_return: number | null
          id: string
          implied_probability: number | null
          kelly_fraction: number | null
          league: string | null
          market: string | null
          net_profit: number | null
          notes: string | null
          odds: number
          recommended_stake: number | null
          selection: string | null
          sport: string | null
          stake_amount: number
          stake_units: number | null
          status: string
          tags: string[] | null
          timing: string
          tipster: string | null
          unit_value_at_bet: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bet_date?: string
          bet_type?: string
          bookmaker?: string | null
          closing_odds?: number | null
          clv?: number | null
          created_at?: string
          edge?: number | null
          estimated_probability?: number | null
          ev?: number | null
          event_date?: string | null
          event_name?: string | null
          external_link?: string | null
          gross_return?: number | null
          id?: string
          implied_probability?: number | null
          kelly_fraction?: number | null
          league?: string | null
          market?: string | null
          net_profit?: number | null
          notes?: string | null
          odds: number
          recommended_stake?: number | null
          selection?: string | null
          sport?: string | null
          stake_amount: number
          stake_units?: number | null
          status?: string
          tags?: string[] | null
          timing?: string
          tipster?: string | null
          unit_value_at_bet?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bet_date?: string
          bet_type?: string
          bookmaker?: string | null
          closing_odds?: number | null
          clv?: number | null
          created_at?: string
          edge?: number | null
          estimated_probability?: number | null
          ev?: number | null
          event_date?: string | null
          event_name?: string | null
          external_link?: string | null
          gross_return?: number | null
          id?: string
          implied_probability?: number | null
          kelly_fraction?: number | null
          league?: string | null
          market?: string | null
          net_profit?: number | null
          notes?: string | null
          odds?: number
          recommended_stake?: number | null
          selection?: string | null
          sport?: string | null
          stake_amount?: number
          stake_units?: number | null
          status?: string
          tags?: string[] | null
          timing?: string
          tipster?: string | null
          unit_value_at_bet?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          currency: string
          default_bookmaker: string | null
          display_name: string | null
          email: string | null
          id: string
          initial_bankroll: number
          kelly_fraction: number
          stake_warning_percent: number
          theme: string
          unit_mode: string
          unit_percent: number
          unit_value: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          default_bookmaker?: string | null
          display_name?: string | null
          email?: string | null
          id: string
          initial_bankroll?: number
          kelly_fraction?: number
          stake_warning_percent?: number
          theme?: string
          unit_mode?: string
          unit_percent?: number
          unit_value?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          default_bookmaker?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          initial_bankroll?: number
          kelly_fraction?: number
          stake_warning_percent?: number
          theme?: string
          unit_mode?: string
          unit_percent?: number
          unit_value?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][CompositeTypeName]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
