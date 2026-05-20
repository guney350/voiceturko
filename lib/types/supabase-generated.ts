export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      api_keys: {
        Row: {
          api_key: string
          created_at: string | null
          id: string
          key_name: string
          last_used_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          api_key: string
          created_at?: string | null
          id?: string
          key_name: string
          last_used_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          api_key?: string
          created_at?: string | null
          id?: string
          key_name?: string
          last_used_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      assistant: {
        Row: {
          ai_model: string | null
          created_at: string | null
          elevenlabs_model: string | null
          elevenlabs_voice_id: string | null
          first_message: string | null
          first_message_mode: string
          id: string
          name: string
          system_prompt: string | null
          updated_at: string | null
          user_id: string
          vapi_assistant_id: string | null
          vapi_synced_at: string | null
        }
        Insert: {
          ai_model?: string | null
          created_at?: string | null
          elevenlabs_model?: string | null
          elevenlabs_voice_id?: string | null
          first_message?: string | null
          first_message_mode: string
          id?: string
          name?: string
          system_prompt?: string | null
          updated_at?: string | null
          user_id: string
          vapi_assistant_id?: string | null
          vapi_synced_at?: string | null
        }
        Update: {
          ai_model?: string | null
          created_at?: string | null
          elevenlabs_model?: string | null
          elevenlabs_voice_id?: string | null
          first_message?: string | null
          first_message_mode?: string
          id?: string
          name?: string
          system_prompt?: string | null
          updated_at?: string | null
          user_id?: string
          vapi_assistant_id?: string | null
          vapi_synced_at?: string | null
        }
        Relationships: []
      }
      vapi_accounts: {
        Row: {
          api_key: string
          created_at: string | null
          current_balance: number | null
          email: string
          error_count: number | null
          error_message: string | null
          id: string
          initial_balance: number | null
          is_current: boolean | null
          last_balance_check: string | null
          last_used_at: string | null
          min_balance_threshold: number | null
          priority: number | null
          spending_limit: number | null
          status: string | null
          total_calls_made: number | null
          total_spent: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          api_key: string
          created_at?: string | null
          current_balance?: number | null
          email: string
          error_count?: number | null
          error_message?: string | null
          id?: string
          initial_balance?: number | null
          is_current?: boolean | null
          last_balance_check?: string | null
          last_used_at?: string | null
          min_balance_threshold?: number | null
          priority?: number | null
          spending_limit?: number | null
          status?: string | null
          total_calls_made?: number | null
          total_spent?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          api_key?: string
          created_at?: string | null
          current_balance?: number | null
          email?: string
          error_count?: number | null
          error_message?: string | null
          id?: string
          initial_balance?: number | null
          is_current?: boolean | null
          last_balance_check?: string | null
          last_used_at?: string | null
          min_balance_threshold?: number | null
          priority?: number | null
          spending_limit?: number | null
          status?: string | null
          total_calls_made?: number | null
          total_spent?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      vapi_balance_logs: {
        Row: {
          account_id: string | null
          balance: number
          balance_change: number | null
          checked_at: string | null
          id: string
        }
        Insert: {
          account_id?: string | null
          balance: number
          balance_change?: number | null
          checked_at?: string | null
          id?: string
        }
        Update: {
          account_id?: string | null
          balance?: number
          balance_change?: number | null
          checked_at?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vapi_balance_logs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "vapi_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      vapi_account_switch_logs: {
        Row: {
          from_account_id: string | null
          from_balance: number | null
          id: string
          switch_reason: string
          switched_at: string | null
          switched_by: string | null
          to_account_id: string | null
          to_balance: number | null
          user_id: string | null
        }
        Insert: {
          from_account_id?: string | null
          from_balance?: number | null
          id?: string
          switch_reason: string
          switched_at?: string | null
          switched_by?: string | null
          to_account_id?: string | null
          to_balance?: number | null
          user_id?: string | null
        }
        Update: {
          from_account_id?: string | null
          from_balance?: number | null
          id?: string
          switch_reason?: string
          switched_at?: string | null
          switched_by?: string | null
          to_account_id?: string | null
          to_balance?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vapi_account_switch_logs_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "vapi_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vapi_account_switch_logs_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "vapi_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      vapi_phone_numbers: {
        Row: {
          country_code: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          last_used_at: string | null
          phone_number: string
          provider: string | null
          updated_at: string | null
          vapi_phone_number_id: string
        }
        Insert: {
          country_code?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          last_used_at?: string | null
          phone_number: string
          provider?: string | null
          updated_at?: string | null
          vapi_phone_number_id: string
        }
        Update: {
          country_code?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          last_used_at?: string | null
          phone_number?: string
          provider?: string | null
          updated_at?: string | null
          vapi_phone_number_id?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          auto_recovery_interval_seconds: number | null
          created_at: string | null
          default_call_timeout_seconds: number | null
          default_lock_ttl_seconds: number | null
          default_max_attempts: number | null
          default_phone_number_id: string | null
          default_retry_delay_seconds: number | null
          id: string
          max_auto_recovery_attempts: number | null
          max_global_concurrent_calls: number | null
          stale_heartbeat_threshold_seconds: number | null
          updated_at: string | null
          user_id: string | null
          vapi_auto_switch_enabled: boolean | null
          vapi_balance_check_interval: number | null
          vapi_critical_balance: number | null
        }
        Insert: {
          auto_recovery_interval_seconds?: number | null
          created_at?: string | null
          default_call_timeout_seconds?: number | null
          default_lock_ttl_seconds?: number | null
          default_max_attempts?: number | null
          default_phone_number_id?: string | null
          default_retry_delay_seconds?: number | null
          id?: string
          max_auto_recovery_attempts?: number | null
          max_global_concurrent_calls?: number | null
          stale_heartbeat_threshold_seconds?: number | null
          updated_at?: string | null
          user_id?: string | null
          vapi_auto_switch_enabled?: boolean | null
          vapi_balance_check_interval?: number | null
          vapi_critical_balance?: number | null
        }
        Update: {
          auto_recovery_interval_seconds?: number | null
          created_at?: string | null
          default_call_timeout_seconds?: number | null
          default_lock_ttl_seconds?: number | null
          default_max_attempts?: number | null
          default_phone_number_id?: string | null
          default_retry_delay_seconds?: number | null
          id?: string
          max_auto_recovery_attempts?: number | null
          max_global_concurrent_calls?: number | null
          stale_heartbeat_threshold_seconds?: number | null
          updated_at?: string | null
          user_id?: string | null
          vapi_auto_switch_enabled?: boolean | null
          vapi_balance_check_interval?: number | null
          vapi_critical_balance?: number | null
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          active_call_count: number | null
          assistant_id: string
          completed_at: string | null
          completed_calls: number | null
          created_at: string | null
          delay_seconds: number | null
          failed_calls: number | null
          id: string
          last_action: string | null
          last_error_code: string | null
          last_error_detail: string | null
          last_heartbeat_at: string | null
          last_progress_at: string | null
          last_recovery_at: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number | null
          max_concurrent_calls: number | null
          name: string
          next_retry_at: string | null
          pause_reason: string | null
          paused_at: string | null
          pending_calls: number | null
          retry_count: number | null
          schedule_type: string | null
          scheduled_at: string | null
          stalled_at: string | null
          started_at: string | null
          status: string
          successful_calls: number | null
          total_contacts: number | null
          user_id: string
          worker_id: string | null
        }
        Insert: {
          active_call_count?: number | null
          assistant_id: string
          completed_at?: string | null
          completed_calls?: number | null
          created_at?: string | null
          delay_seconds?: number | null
          failed_calls?: number | null
          id?: string
          last_action?: string | null
          last_error_code?: string | null
          last_error_detail?: string | null
          last_heartbeat_at?: string | null
          last_progress_at?: string | null
          last_recovery_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number | null
          max_concurrent_calls?: number | null
          name: string
          next_retry_at?: string | null
          pause_reason?: string | null
          paused_at?: string | null
          pending_calls?: number | null
          retry_count?: number | null
          schedule_type?: string | null
          scheduled_at?: string | null
          stalled_at?: string | null
          started_at?: string | null
          status?: string
          successful_calls?: number | null
          total_contacts?: number | null
          user_id: string
          worker_id?: string | null
        }
        Update: {
          active_call_count?: number | null
          assistant_id?: string
          completed_at?: string | null
          completed_calls?: number | null
          created_at?: string | null
          delay_seconds?: number | null
          failed_calls?: number | null
          id?: string
          last_action?: string | null
          last_error_code?: string | null
          last_error_detail?: string | null
          last_heartbeat_at?: string | null
          last_progress_at?: string | null
          last_recovery_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number | null
          max_concurrent_calls?: number | null
          name?: string
          next_retry_at?: string | null
          pause_reason?: string | null
          paused_at?: string | null
          pending_calls?: number | null
          retry_count?: number | null
          schedule_type?: string | null
          scheduled_at?: string | null
          stalled_at?: string | null
          started_at?: string | null
          status?: string
          successful_calls?: number | null
          total_contacts?: number | null
          user_id?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_assistant_id_fkey"
            columns: ["assistant_id"]
            isOneToOne: false
            referencedRelation: "assistant"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_items: {
        Row: {
          attempt_count: number | null
          call_duration: number | null
          call_order: number
          call_started_at: string | null
          call_timeout_at: string | null
          called_at: string | null
          campaign_id: string | null
          completed_at: string | null
          created_at: string | null
          customer_data: Json | null
          customer_name: string
          customer_phone: string
          error_message: string | null
          id: string
          last_error: string | null
          last_stall_at: string | null
          lock_expires_at: string | null
          lock_owner: string | null
          locked_at: string | null
          next_retry_at: string | null
          stall_count: number | null
          status: string | null
          updated_at: string | null
          vapi_call_id: string | null
          worker_id: string | null
        }
        Insert: {
          attempt_count?: number | null
          call_duration?: number | null
          call_order: number
          call_started_at?: string | null
          call_timeout_at?: string | null
          called_at?: string | null
          campaign_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          customer_data?: Json | null
          customer_name: string
          customer_phone: string
          error_message?: string | null
          id?: string
          last_error?: string | null
          last_stall_at?: string | null
          lock_expires_at?: string | null
          lock_owner?: string | null
          locked_at?: string | null
          next_retry_at?: string | null
          stall_count?: number | null
          status?: string | null
          updated_at?: string | null
          vapi_call_id?: string | null
          worker_id?: string | null
        }
        Update: {
          attempt_count?: number | null
          call_duration?: number | null
          call_order?: number
          call_started_at?: string | null
          call_timeout_at?: string | null
          called_at?: string | null
          campaign_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          customer_data?: Json | null
          customer_name?: string
          customer_phone?: string
          error_message?: string | null
          id?: string
          last_error?: string | null
          last_stall_at?: string | null
          lock_expires_at?: string | null
          lock_owner?: string | null
          locked_at?: string | null
          next_retry_at?: string | null
          stall_count?: number | null
          status?: string | null
          updated_at?: string | null
          vapi_call_id?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_items_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_next_campaign_item: {
        Args: {
          p_campaign_id: string
          p_lock_ttl_seconds?: number
          p_worker_id: string
        }
        Returns: {
          attempt_count: number
          call_order: number
          customer_data: Json
          customer_name: string
          customer_phone: string
          id: string
        }[]
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
