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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
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
          is_free_bet: boolean
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
          is_free_bet?: boolean
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
          is_free_bet?: boolean
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
          bookmakers: string[]
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
          tipsters: string[]
          unit_mode: string
          unit_percent: number
          unit_value: number
          updated_at: string
        }
        Insert: {
          bookmakers?: string[]
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
          tipsters?: string[]
          unit_mode?: string
          unit_percent?: number
          unit_value?: number
          updated_at?: string
        }
        Update: {
          bookmakers?: string[]
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
          tipsters?: string[]
          unit_mode?: string
          unit_percent?: number
          unit_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      telegram_links: {
        Row: {
          chat_id: number | null
          code_expires_at: string | null
          created_at: string
          link_code: string | null
          user_id: string
        }
        Insert: {
          chat_id?: number | null
          code_expires_at?: string | null
          created_at?: string
          link_code?: string | null
          user_id: string
        }
        Update: {
          chat_id?: number | null
          code_expires_at?: string | null
          created_at?: string
          link_code?: string | null
          user_id?: string
        }
        Relationships: []
      }
      telegram_pending_bets: {
        Row: {
          awaiting_correction: boolean
          chat_id: number
          created_at: string
          expires_at: string
          id: string
          payload: Json
        }
        Insert: {
          awaiting_correction?: boolean
          chat_id: number
          created_at?: string
          expires_at?: string
          id?: string
          payload: Json
        }
        Update: {
          awaiting_correction?: boolean
          chat_id?: number
          created_at?: string
          expires_at?: string
          id?: string
          payload?: Json
        }
        Relationships: []
      }
      telegram_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      tennis_matches_cache: {
        Row: {
          hay: string
          is_past: boolean
          match_id: number
          player1_id: number | null
          player1_name: string
          player2_id: number | null
          player2_name: string
          rank_id: number | null
          refreshed_at: string
          starts_at: string | null
          tour: string
          tournament: string | null
        }
        Insert: {
          hay: string
          is_past?: boolean
          match_id: number
          player1_id?: number | null
          player1_name: string
          player2_id?: number | null
          player2_name: string
          rank_id?: number | null
          refreshed_at?: string
          starts_at?: string | null
          tour: string
          tournament?: string | null
        }
        Update: {
          hay?: string
          is_past?: boolean
          match_id?: number
          player1_id?: number | null
          player1_name?: string
          player2_id?: number | null
          player2_name?: string
          rank_id?: number | null
          refreshed_at?: string
          starts_at?: string | null
          tour?: string
          tournament?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bulk_settle_bets: { Args: { p_updates: Json }; Returns: number }
      create_bet_from_telegram: {
        Args: { p_bet: Json; p_chat_id: number }
        Returns: string
      }
      create_bets_with_legs: { Args: { p_bets: Json }; Returns: string[] }
      get_secret: { Args: { p_name: string }; Returns: string }
      link_telegram_chat: {
        Args: { p_chat_id: number; p_code: string }
        Returns: boolean
      }
      replace_bet_legs: {
        Args: { p_bet_id: string; p_legs: Json }
        Returns: undefined
      }
      update_bet_with_legs: {
        Args: { p_bet_id: string; p_fields?: Json; p_legs?: Json }
        Returns: undefined
      }
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
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
