// Generated types from Supabase
// This file is auto-generated. Do not edit manually.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// Import the full Database type from Supabase
import type { Database as SupabaseDatabase } from './supabase-generated'

export type Database = SupabaseDatabase

// Helper types for easier access
type PublicSchema = Database['public']
type TableName = keyof PublicSchema['Tables']

export type Tables<T extends TableName> = PublicSchema['Tables'][T]['Row']
export type TablesInsert<T extends TableName> = PublicSchema['Tables'][T]['Insert']
export type TablesUpdate<T extends TableName> = PublicSchema['Tables'][T]['Update']

// Exported types for common use
export type Campaign = Tables<'campaigns'>
export type CampaignItem = Tables<'campaign_items'>
export type CampaignLog = Tables<'campaign_logs'>
export type CampaignRecoveryLog = Tables<'campaign_recovery_logs'>
export type CampaignStateLog = Tables<'campaign_state_logs'>
export type Assistant = Tables<'assistant'>
export type VapiAccount = Tables<'vapi_accounts'>
export type VapiBalanceLog = Tables<'vapi_balance_logs'>
export type VapiAccountSwitchLog = Tables<'vapi_account_switch_logs'>
export type VapiPhoneNumber = Tables<'vapi_phone_numbers'>
export type SystemSettings = Tables<'system_settings'>
export type DefaultAssistantSettings = Tables<'default_assistant_settings'>
export type Call = Tables<'calls'>
export type Usage = Tables<'usages'>
export type Subscription = Tables<'subscriptions'>
export type Plan = Tables<'plans'>
export type Invoice = Tables<'invoices'>
export type MinutePurchase = Tables<'minute_purchases'>
export type MinutePricing = Tables<'minute_pricing'>
export type ApiKey = Tables<'api_keys'>
export type AuditLog = Tables<'audit_logs'>
export type Sip = Tables<'sips'>
export type CampaignContact = Tables<'campaign_contacts'>