import { createClient } from '@supabase/supabase-js'

export type Database = {
  public: {
    Tables: {
      rooms: {
        Row: { id: string; code: string; status: string; started_at: string | null; finished_at: string | null; created_at: string }
        Insert: { id?: string; code: string; status?: string; started_at?: string | null; finished_at?: string | null; created_at?: string }
        Update: Partial<{ code: string; status: string; started_at: string | null; finished_at: string | null }>
        Relationships: []
      }
      teams: {
        Row: { id: string; room_id: string; name: string; color: string; created_at: string }
        Insert: { id?: string; room_id: string; name: string; color: string; created_at?: string }
        Update: Partial<{ room_id: string; name: string; color: string }>
        Relationships: []
      }
      progress: {
        Row: { id: string; team_id: string; room_id: string; zone: string; status: string; errors: number; conquered_at: string | null }
        Insert: { id?: string; team_id: string; room_id: string; zone: string; status?: string; errors?: number; conquered_at?: string | null }
        Update: Partial<{ team_id: string; room_id: string; zone: string; status: string; errors: number; conquered_at: string | null }>
        Relationships: []
      }
      attempts: {
        Row: { id: string; team_id: string; zone: string; step: number; correct: boolean; created_at: string }
        Insert: { id?: string; team_id: string; zone: string; step: number; correct: boolean; created_at?: string }
        Update: Partial<{ team_id: string; zone: string; step: number; correct: boolean }>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

let browserClient: ReturnType<typeof createClient<Database>> | undefined

export function getSupabase() {
  if (!browserClient) {
    browserClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
  }
  return browserClient
}
