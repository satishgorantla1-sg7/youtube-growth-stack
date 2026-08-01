export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      approvals: {
        Row: {
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          entity_id: string
          entity_type: string
          estimated_credits: number
          id: string
          requested_at: string
          requested_by: string
          risk_summary: string
          state: string
          workspace_id: string
        }
        Insert: {
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          entity_id: string
          entity_type: string
          estimated_credits?: number
          id?: string
          requested_at?: string
          requested_by: string
          risk_summary: string
          state?: string
          workspace_id: string
        }
        Update: {
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          entity_id?: string
          entity_type?: string
          estimated_credits?: number
          id?: string
          requested_at?: string
          requested_by?: string
          risk_summary?: string
          state?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: number
          metadata: Json
          workspace_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: never
          metadata?: Json
          workspace_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: never
          metadata?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          connection_state: string
          created_at: string
          external_id: string
          handle: string | null
          id: string
          last_synced_at: string | null
          provider: string
          thumbnail_url: string | null
          title: string
          workspace_id: string
        }
        Insert: {
          connection_state?: string
          created_at?: string
          external_id: string
          handle?: string | null
          id?: string
          last_synced_at?: string | null
          provider?: string
          thumbnail_url?: string | null
          title: string
          workspace_id: string
        }
        Update: {
          connection_state?: string
          created_at?: string
          external_id?: string
          handle?: string | null
          id?: string
          last_synced_at?: string | null
          provider?: string
          thumbnail_url?: string | null
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      content_packages: {
        Row: {
          citations: Json
          created_at: string
          created_by: string
          hooks: Json
          id: string
          idea_id: string
          outline: Json
          script: string | null
          state: string
          thumbnail_concepts: Json
          titles: Json
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          citations?: Json
          created_at?: string
          created_by: string
          hooks?: Json
          id?: string
          idea_id: string
          outline?: Json
          script?: string | null
          state?: string
          thumbnail_concepts?: Json
          titles?: Json
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          citations?: Json
          created_at?: string
          created_by?: string
          hooks?: Json
          id?: string
          idea_id?: string
          outline?: Json
          script?: string | null
          state?: string
          thumbnail_concepts?: Json
          titles?: Json
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_packages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_packages_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_packages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          project_id: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          project_id?: string | null
          title?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          project_id?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ideas: {
        Row: {
          created_at: string
          id: string
          premise: string
          project_id: string | null
          research_run_id: string | null
          score: number | null
          scoring_reason: Json
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          premise: string
          project_id?: string | null
          research_run_id?: string | null
          score?: number | null
          scoring_reason?: Json
          status?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          premise?: string
          project_id?: string | null
          research_run_id?: string | null
          score?: number | null
          scoring_reason?: Json
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ideas_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideas_research_run_id_fkey"
            columns: ["research_run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideas_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          attempts: number
          available_at: string
          created_at: string
          id: string
          idempotency_key: string
          kind: string
          last_error: string | null
          lease_expires_at: string | null
          max_attempts: number
          payload: Json
          research_run_id: string | null
          state: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          created_at?: string
          id?: string
          idempotency_key: string
          kind: string
          last_error?: string | null
          lease_expires_at?: string | null
          max_attempts?: number
          payload?: Json
          research_run_id?: string | null
          state?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attempts?: number
          available_at?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          kind?: string
          last_error?: string | null
          lease_expires_at?: string | null
          max_attempts?: number
          payload?: Json
          research_run_id?: string | null
          state?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_research_run_id_fkey"
            columns: ["research_run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          created_by: string | null
          id: string
          metadata: Json
          modality: string
          role: string
          workspace_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          modality?: string
          role: string
          workspace_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          modality?: string
          role?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          channel_id: string | null
          created_at: string
          created_by: string
          id: string
          name: string
          niche: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          name: string
          niche?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          niche?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      research_runs: {
        Row: {
          actual_credits: number | null
          completed_at: string | null
          created_at: string
          error_code: string | null
          estimated_credits: number
          id: string
          mode: string
          project_id: string | null
          prompt: string
          requested_by: string
          started_at: string | null
          state: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          actual_credits?: number | null
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          estimated_credits?: number
          id?: string
          mode?: string
          project_id?: string | null
          prompt: string
          requested_by: string
          started_at?: string | null
          state?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          actual_credits?: number | null
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          estimated_credits?: number
          id?: string
          mode?: string
          project_id?: string | null
          prompt?: string
          requested_by?: string
          started_at?: string | null
          state?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_runs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      research_sources: {
        Row: {
          captured_at: string
          content: string | null
          content_hash: string | null
          id: string
          provenance: Json
          provider: string
          research_run_id: string
          source_type: string
          title: string | null
          url: string
          workspace_id: string
        }
        Insert: {
          captured_at?: string
          content?: string | null
          content_hash?: string | null
          id?: string
          provenance?: Json
          provider: string
          research_run_id: string
          source_type: string
          title?: string | null
          url: string
          workspace_id: string
        }
        Update: {
          captured_at?: string
          content?: string | null
          content_hash?: string | null
          id?: string
          provenance?: Json
          provider?: string
          research_run_id?: string
          source_type?: string
          title?: string | null
          url?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_sources_research_run_id_fkey"
            columns: ["research_run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_sources_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_ledger: {
        Row: {
          correlation_id: string | null
          created_at: string
          credits: number
          id: number
          operation: string
          provider: string
          provider_cost_usd: number | null
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          correlation_id?: string | null
          created_at?: string
          credits: number
          id?: never
          operation: string
          provider: string
          provider_cost_usd?: number | null
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          correlation_id?: string | null
          created_at?: string
          credits?: number
          id?: never
          operation?: string
          provider?: string
          provider_cost_usd?: number | null
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_ledger_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_assets: {
        Row: {
          created_at: string
          duration_ms: number | null
          id: string
          message_id: string | null
          retention_until: string | null
          storage_path: string | null
          transcript: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          id?: string
          message_id?: string | null
          retention_until?: string | null
          storage_path?: string | null
          transcript?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          id?: string
          message_id?: string | null
          retention_until?: string | null
          storage_path?: string | null
          transcript?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_assets_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_assets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          daily_credit_limit: number
          id: string
          name: string
          owner_id: string
          plan: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          daily_credit_limit?: number
          id?: string
          name: string
          owner_id: string
          plan?: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          daily_credit_limit?: number
          id?: string
          name?: string
          owner_id?: string
          plan?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_workspace: {
        Args: { workspace_name: string; workspace_slug: string }
        Returns: string
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
