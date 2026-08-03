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
          account_kind: string
          connection_state: string
          country_code: string | null
          created_at: string
          description: string | null
          external_id: string
          handle: string | null
          id: string
          is_selected: boolean
          last_synced_at: string | null
          provider: string
          published_at: string | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          uploads_playlist_id: string | null
          workspace_id: string
          youtube_connection_id: string | null
        }
        Insert: {
          account_kind?: string
          connection_state?: string
          country_code?: string | null
          created_at?: string
          description?: string | null
          external_id: string
          handle?: string | null
          id?: string
          is_selected?: boolean
          last_synced_at?: string | null
          provider?: string
          published_at?: string | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          uploads_playlist_id?: string | null
          workspace_id: string
          youtube_connection_id?: string | null
        }
        Update: {
          account_kind?: string
          connection_state?: string
          country_code?: string | null
          created_at?: string
          description?: string | null
          external_id?: string
          handle?: string | null
          id?: string
          is_selected?: boolean
          last_synced_at?: string | null
          provider?: string
          published_at?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          uploads_playlist_id?: string | null
          workspace_id?: string
          youtube_connection_id?: string | null
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
      job_events: {
        Row: {
          attempt: number
          correlation_id: string
          created_at: string
          event_type: string
          id: number
          job_id: string
          metadata: Json
          workspace_id: string
        }
        Insert: {
          attempt: number
          correlation_id: string
          created_at?: string
          event_type: string
          id?: never
          job_id: string
          metadata?: Json
          workspace_id: string
        }
        Update: {
          attempt?: number
          correlation_id?: string
          created_at?: string
          event_type?: string
          id?: never
          job_id?: string
          metadata?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_events_workspace_job_fk"
            columns: ["workspace_id", "job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      jobs: {
        Row: {
          attempts: number
          available_at: string
          cancellation_requested_at: string | null
          correlation_id: string
          created_at: string
          id: string
          idempotency_key: string
          kind: string
          last_error: string | null
          lease_expires_at: string | null
          lease_token: string | null
          leased_by: string | null
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
          cancellation_requested_at?: string | null
          correlation_id?: string
          created_at?: string
          id?: string
          idempotency_key: string
          kind: string
          last_error?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          leased_by?: string | null
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
          cancellation_requested_at?: string | null
          correlation_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          kind?: string
          last_error?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          leased_by?: string | null
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
          {
            foreignKeyName: "jobs_workspace_run_fk"
            columns: ["workspace_id", "research_run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["workspace_id", "id"]
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
      provider_invocations: {
        Row: {
          actual_units: number | null
          completed_at: string | null
          correlation_id: string
          credits: number | null
          duration_ms: number | null
          error_code: string | null
          id: string
          idempotency_key: string
          job_id: string
          metadata: Json
          operation: string
          provider: string
          provider_cost_usd: number | null
          requested_units: number
          research_run_id: string
          started_at: string
          state: string
          workspace_id: string
        }
        Insert: {
          actual_units?: number | null
          completed_at?: string | null
          correlation_id: string
          credits?: number | null
          duration_ms?: number | null
          error_code?: string | null
          id?: string
          idempotency_key: string
          job_id: string
          metadata?: Json
          operation: string
          provider: string
          provider_cost_usd?: number | null
          requested_units: number
          research_run_id: string
          started_at?: string
          state?: string
          workspace_id: string
        }
        Update: {
          actual_units?: number | null
          completed_at?: string | null
          correlation_id?: string
          credits?: number | null
          duration_ms?: number | null
          error_code?: string | null
          id?: string
          idempotency_key?: string
          job_id?: string
          metadata?: Json
          operation?: string
          provider?: string
          provider_cost_usd?: number | null
          requested_units?: number
          research_run_id?: string
          started_at?: string
          state?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_invocations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_invocations_workspace_id_research_run_id_fkey"
            columns: ["workspace_id", "research_run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "provider_invocations_workspace_id_research_run_id_job_id_fkey"
            columns: ["workspace_id", "research_run_id", "job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["workspace_id", "research_run_id", "id"]
          },
        ]
      }
      research_credit_reservations: {
        Row: {
          actual_credits: number | null
          estimated_credits: number
          id: string
          idempotency_key: string
          release_reason: string | null
          research_run_id: string
          reserved_at: string
          settled_at: string | null
          state: string
          workspace_id: string
        }
        Insert: {
          actual_credits?: number | null
          estimated_credits: number
          id?: string
          idempotency_key: string
          release_reason?: string | null
          research_run_id: string
          reserved_at?: string
          settled_at?: string | null
          state?: string
          workspace_id: string
        }
        Update: {
          actual_credits?: number | null
          estimated_credits?: number
          id?: string
          idempotency_key?: string
          release_reason?: string | null
          research_run_id?: string
          reserved_at?: string
          settled_at?: string | null
          state?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_credit_reservations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_credit_reservations_workspace_id_research_run_id_fkey"
            columns: ["workspace_id", "research_run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      research_runs: {
        Row: {
          actual_credits: number | null
          cancellation_reason: string | null
          cancellation_requested_at: string | null
          cancellation_requested_by: string | null
          completed_at: string | null
          correlation_id: string
          created_at: string
          error_code: string | null
          estimated_credits: number
          id: string
          idempotency_key: string | null
          max_sources: number
          mode: string
          project_id: string | null
          prompt: string
          requested_by: string
          requested_sources: string[]
          started_at: string | null
          state: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          actual_credits?: number | null
          cancellation_reason?: string | null
          cancellation_requested_at?: string | null
          cancellation_requested_by?: string | null
          completed_at?: string | null
          correlation_id?: string
          created_at?: string
          error_code?: string | null
          estimated_credits?: number
          id?: string
          idempotency_key?: string | null
          max_sources?: number
          mode?: string
          project_id?: string | null
          prompt: string
          requested_by: string
          requested_sources?: string[]
          started_at?: string | null
          state?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          actual_credits?: number | null
          cancellation_reason?: string | null
          cancellation_requested_at?: string | null
          cancellation_requested_by?: string | null
          completed_at?: string | null
          correlation_id?: string
          created_at?: string
          error_code?: string | null
          estimated_credits?: number
          id?: string
          idempotency_key?: string | null
          max_sources?: number
          mode?: string
          project_id?: string | null
          prompt?: string
          requested_by?: string
          requested_sources?: string[]
          started_at?: string | null
          state?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_runs_cancellation_actor_workspace_fk"
            columns: ["workspace_id", "cancellation_requested_by"]
            isOneToOne: false
            referencedRelation: "workspace_members"
            referencedColumns: ["workspace_id", "user_id"]
          },
          {
            foreignKeyName: "research_runs_cancellation_requested_by_fkey"
            columns: ["cancellation_requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "research_sources_workspace_run_fk"
            columns: ["workspace_id", "research_run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["workspace_id", "id"]
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
      youtube_channel_snapshots: {
        Row: {
          captured_at: string
          channel_id: string
          created_at: string
          hidden_subscriber_count: boolean
          id: number
          source_etag: string | null
          subscriber_count: number | null
          video_count: number | null
          view_count: number | null
          workspace_id: string
        }
        Insert: {
          captured_at: string
          channel_id: string
          created_at?: string
          hidden_subscriber_count?: boolean
          id?: never
          source_etag?: string | null
          subscriber_count?: number | null
          video_count?: number | null
          view_count?: number | null
          workspace_id: string
        }
        Update: {
          captured_at?: string
          channel_id?: string
          created_at?: string
          hidden_subscriber_count?: boolean
          id?: never
          source_etag?: string | null
          subscriber_count?: number | null
          video_count?: number | null
          view_count?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "youtube_channel_snapshots_workspace_channel_fk"
            columns: ["workspace_id", "channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "youtube_channel_snapshots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      youtube_quota_ledger: {
        Row: {
          id: number
          occurred_at: string
          operation: string
          quota_date: string | null
          quota_units: number
          request_idempotency_key: string
          sync_run_id: string
          workspace_id: string
        }
        Insert: {
          id?: never
          occurred_at?: string
          operation: string
          quota_date?: string | null
          quota_units: number
          request_idempotency_key: string
          sync_run_id: string
          workspace_id: string
        }
        Update: {
          id?: never
          occurred_at?: string
          operation?: string
          quota_date?: string | null
          quota_units?: number
          request_idempotency_key?: string
          sync_run_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "youtube_quota_ledger_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "youtube_quota_ledger_workspace_sync_fk"
            columns: ["workspace_id", "sync_run_id"]
            isOneToOne: false
            referencedRelation: "youtube_sync_runs"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      youtube_sync_runs: {
        Row: {
          attempt_count: number
          channel_id: string | null
          completed_at: string | null
          correlation_id: string
          created_at: string
          id: string
          idempotency_key: string
          items_fetched: number
          last_error_code: string | null
          lease_expires_at: string | null
          lease_token: string | null
          max_items: number
          max_pages: number
          pages_fetched: number
          quota_units: number
          started_at: string | null
          state: string
          updated_at: string
          workspace_id: string
          youtube_connection_id: string
        }
        Insert: {
          attempt_count?: number
          channel_id?: string | null
          completed_at?: string | null
          correlation_id?: string
          created_at?: string
          id?: string
          idempotency_key: string
          items_fetched?: number
          last_error_code?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          max_items: number
          max_pages: number
          pages_fetched?: number
          quota_units?: number
          started_at?: string | null
          state?: string
          updated_at?: string
          workspace_id: string
          youtube_connection_id: string
        }
        Update: {
          attempt_count?: number
          channel_id?: string | null
          completed_at?: string | null
          correlation_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          items_fetched?: number
          last_error_code?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          max_items?: number
          max_pages?: number
          pages_fetched?: number
          quota_units?: number
          started_at?: string | null
          state?: string
          updated_at?: string
          workspace_id?: string
          youtube_connection_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "youtube_sync_runs_workspace_channel_fk"
            columns: ["workspace_id", "channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "youtube_sync_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      youtube_video_snapshots: {
        Row: {
          captured_at: string
          comment_count: number | null
          created_at: string
          id: number
          like_count: number | null
          source_etag: string | null
          video_id: string
          view_count: number | null
          workspace_id: string
        }
        Insert: {
          captured_at: string
          comment_count?: number | null
          created_at?: string
          id?: never
          like_count?: number | null
          source_etag?: string | null
          video_id: string
          view_count?: number | null
          workspace_id: string
        }
        Update: {
          captured_at?: string
          comment_count?: number | null
          created_at?: string
          id?: never
          like_count?: number | null
          source_etag?: string | null
          video_id?: string
          view_count?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "youtube_video_snapshots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "youtube_video_snapshots_workspace_video_fk"
            columns: ["workspace_id", "video_id"]
            isOneToOne: false
            referencedRelation: "youtube_videos"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      youtube_videos: {
        Row: {
          channel_id: string
          created_at: string
          description: string | null
          duration_seconds: number | null
          etag: string | null
          external_id: string
          id: string
          live_broadcast_content: string | null
          privacy_status: string | null
          published_at: string | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          etag?: string | null
          external_id: string
          id?: string
          live_broadcast_content?: string | null
          privacy_status?: string | null
          published_at?: string | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          etag?: string | null
          external_id?: string
          id?: string
          live_broadcast_content?: string | null
          privacy_status?: string | null
          published_at?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "youtube_videos_workspace_channel_fk"
            columns: ["workspace_id", "channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "youtube_videos_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ack_research_job: {
        Args: {
          normalized_sources: Json
          target_job_id: string
          target_lease_token: string
        }
        Returns: undefined
      }
      acknowledge_research_cancellation: {
        Args: {
          target_actual_credits?: number
          target_job_id: string
          target_lease_token: string
        }
        Returns: undefined
      }
      begin_provider_invocation: {
        Args: {
          request_idempotency_key: string
          target_job_id: string
          target_lease_token: string
          target_operation: string
          target_provider: string
          target_requested_units: number
        }
        Returns: Json
      }
      begin_youtube_sync: {
        Args: {
          request_idempotency_key: string
          request_max_items?: number
          request_max_pages?: number
          target_channel_id: string
          target_connection_id: string
          target_workspace_id: string
        }
        Returns: Json
      }
      cancel_research_run: {
        Args: { cancellation_note?: string; target_run_id: string }
        Returns: Json
      }
      complete_youtube_revocation: {
        Args: { target_lease_token: string; target_workspace_id: string }
        Returns: undefined
      }
      complete_youtube_token_refresh: {
        Args: {
          target_credential_version: string
          target_encrypted_credentials: string
          target_expires_at: string
          target_lease_token: string
          target_workspace_id: string
        }
        Returns: undefined
      }
      consume_youtube_oauth_state: {
        Args: { target_state_hash: string }
        Returns: {
          user_id: string
          workspace_id: string
        }[]
      }
      create_research_run: {
        Args: {
          request_estimated_credits: number
          request_idempotency_key: string
          request_max_sources: number
          request_mode: string
          request_prompt: string
          request_sources: string[]
          target_workspace_id: string
        }
        Returns: Json
      }
      create_research_run_unchecked: {
        Args: {
          request_estimated_credits: number
          request_idempotency_key: string
          request_max_sources: number
          request_mode: string
          request_prompt: string
          request_sources: string[]
          target_workspace_id: string
        }
        Returns: Json
      }
      create_workspace: {
        Args: { workspace_name: string; workspace_slug: string }
        Returns: string
      }
      create_youtube_connection_approval: {
        Args: { target_workspace_id: string }
        Returns: Json
      }
      create_youtube_oauth_state: {
        Args: {
          target_approval_id: string
          target_expires_at: string
          target_state_hash: string
          target_workspace_id: string
        }
        Returns: undefined
      }
      create_youtube_revocation_approval: {
        Args: { target_workspace_id: string }
        Returns: Json
      }
      decide_research_approval: {
        Args: {
          approval_decision: string
          approval_note?: string
          target_approval_id: string
        }
        Returns: Json
      }
      decide_research_approval_unchecked: {
        Args: {
          approval_decision: string
          approval_note?: string
          target_approval_id: string
        }
        Returns: Json
      }
      decide_youtube_connection_approval: {
        Args: {
          approval_decision: string
          approval_note?: string
          target_approval_id: string
        }
        Returns: Json
      }
      fail_research_job: {
        Args: {
          failure_code: string
          is_retryable: boolean
          target_job_id: string
          target_lease_token: string
        }
        Returns: string
      }
      finish_provider_invocation: {
        Args: {
          safe_metadata?: Json
          target_actual_units: number
          target_credits?: number
          target_error_code?: string
          target_invocation_id: string
          target_provider_cost_usd?: number
          target_state: string
        }
        Returns: undefined
      }
      finish_youtube_sync: {
        Args: {
          target_error_code?: string
          target_items_fetched: number
          target_lease_token: string
          target_pages_fetched: number
          target_state: string
          target_sync_run_id: string
        }
        Returns: undefined
      }
      lease_research_job: {
        Args: { lease_seconds?: number; worker_id: string }
        Returns: Json
      }
      lease_youtube_revocation: {
        Args: {
          target_approval_id: string
          target_lease_expires_at: string
          target_lease_token: string
          target_workspace_id: string
        }
        Returns: {
          credential_version: string
          encrypted_credentials: string
          lease_token: string
          workspace_id: string
        }[]
      }
      lease_youtube_sync: {
        Args: { lease_seconds?: number; worker_id: string }
        Returns: Json
      }
      lease_youtube_token_refresh: {
        Args: {
          target_lease_expires_at: string
          target_lease_token: string
          target_workspace_id: string
        }
        Returns: {
          credential_version: string
          encrypted_credentials: string
          lease_token: string
          workspace_id: string
        }[]
      }
      mark_youtube_reconnect_required: {
        Args: {
          target_lease_token: string
          target_reason: string
          target_workspace_id: string
        }
        Returns: undefined
      }
      persist_youtube_sync_page: {
        Args: {
          channel_rows?: Json
          target_cursor_initialized?: boolean
          target_encrypted_page_token?: string
          target_lease_token: string
          target_page_token_version?: number
          target_sync_run_id: string
          video_rows?: Json
        }
        Returns: Json
      }
      record_youtube_quota: {
        Args: {
          request_idempotency_key: string
          target_lease_token: string
          target_operation: string
          target_quota_units: number
          target_sync_run_id: string
        }
        Returns: boolean
      }
      request_youtube_sync: {
        Args: {
          target_channel_id: string
          target_idempotency_key: string
          target_max_items?: number
          target_max_pages?: number
          target_workspace_id: string
        }
        Returns: Json
      }
      research_cancellation_requested: {
        Args: { target_job_id: string; target_lease_token: string }
        Returns: boolean
      }
      select_youtube_channel: {
        Args: { target_channel_id: string; target_workspace_id: string }
        Returns: Json
      }
      settle_research_usage: {
        Args: {
          target_actual_credits: number
          target_job_id: string
          target_lease_token: string
        }
        Returns: undefined
      }
      store_youtube_connection: {
        Args: {
          target_channels: Json
          target_credential_version: string
          target_encrypted_credentials: string
          target_expires_at: string
          target_provider: string
          target_scopes: string[]
          target_state_hash: string
          target_workspace_id: string
        }
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

