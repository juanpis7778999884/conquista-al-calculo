import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type CreateRoomResult = {
  room_id: string
  code: string
  team_id: string
  team_token: string
  host_token: string
  color: string
  server_now: string
}

export type JoinRoomResult = {
  room_id: string
  code: string
  team_id: string
  team_token: string
  color: string
  server_now: string
}

export type RejoinResult = {
  team_id: string
  room_id: string
  code: string
  status: string
  color: string
  name: string
  started_at: string | null
  finished_at: string | null
  host_team_id: string | null
  server_now: string
}

export type StartGameResult = {
  status: string
  started_at: string
  server_now: string
}

export type SubmitAnswerResult = {
  correct: boolean
  errors: number
  current_step: number
  zone_status: string
  team_finished: boolean
  room_finished: boolean
}

export type FinishGameResult = {
  status: string
  server_now: string
}

export type Database = {
  public: {
    Tables: {
      rooms: {
        Row: {
          id: string
          code: string
          status: string
          started_at: string | null
          finished_at: string | null
          created_at: string
          host_team_id: string | null
          current_step: number
        }
        Insert: {
          id?: string
          code: string
          status?: string
          started_at?: string | null
          finished_at?: string | null
          created_at?: string
          host_team_id?: string | null
          current_step?: number
        }
        Update: Partial<{
          code: string
          status: string
          started_at: string | null
          finished_at: string | null
          host_team_id: string | null
          current_step: number
        }>
        Relationships: []
      }
      teams: {
        Row: {
          id: string
          room_id: string
          name: string
          color: string
          created_at: string
          finished_at: string | null
        }
        Insert: {
          id?: string
          room_id: string
          name: string
          color: string
          created_at?: string
          finished_at?: string | null
        }
        Update: Partial<{
          room_id: string
          name: string
          color: string
          finished_at: string | null
        }>
        Relationships: []
      }
      progress: {
        Row: {
          id: string
          team_id: string
          room_id: string
          zone: string
          status: string
          errors: number
          conquered_at: string | null
          current_step: number
        }
        Insert: {
          id?: string
          team_id: string
          room_id: string
          zone: string
          status?: string
          errors?: number
          conquered_at?: string | null
          current_step?: number
        }
        Update: Partial<{
          team_id: string
          room_id: string
          zone: string
          status: string
          errors: number
          conquered_at: string | null
          current_step: number
        }>
        Relationships: []
      }
      attempts: {
        Row: {
          id: string
          team_id: string
          zone: string
          step: number
          correct: boolean
          created_at: string
          room_id: string | null
          response_index: number | null
        }
        Insert: {
          id?: string
          team_id: string
          zone: string
          step: number
          correct: boolean
          created_at?: string
          room_id?: string | null
          response_index?: number | null
        }
        Update: Partial<{
          team_id: string
          zone: string
          step: number
          correct: boolean
          room_id: string | null
          response_index: number | null
        }>
        Relationships: []
      }
      answers: {
        Row: { zone: string; step: number; answer: number }
        Insert: { zone: string; step: number; answer: number }
        Update: Partial<{ zone: string; step: number; answer: number }>
        Relationships: []
      }
      room_secrets: {
        Row: { room_id: string; host_token: string }
        Insert: { room_id: string; host_token: string }
        Update: Partial<{ room_id: string; host_token: string }>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      create_room: {
        Args: { p_team_name: string }
        Returns: CreateRoomResult
      }
      join_room: {
        Args: { p_code: string; p_team_name: string }
        Returns: JoinRoomResult
      }
      rejoin: {
        Args: { p_room_id: string; p_team_id: string; p_team_token: string }
        Returns: RejoinResult
      }
      start_game: {
        Args: { p_room_id: string; p_host_token: string }
        Returns: StartGameResult
      }
      submit_answer: {
        Args: {
          p_room_id: string
          p_team_id: string
          p_team_token: string
          p_zone: string
          p_step: number
          p_response: number
        }
        Returns: SubmitAnswerResult
      }
      finish_game: {
        Args: { p_room_id: string; p_host_token: string }
        Returns: FinishGameResult
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type RoomRow = Database['public']['Tables']['rooms']['Row']
export type TeamRow = Database['public']['Tables']['teams']['Row']
export type ProgressRow = Database['public']['Tables']['progress']['Row']

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY)
}

let browserClient: SupabaseClient<Database> | undefined

export function getSupabase(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured()) {
    return null
  }
  if (!browserClient) {
    browserClient = createClient<Database>(SUPABASE_URL as string, SUPABASE_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return browserClient
}
