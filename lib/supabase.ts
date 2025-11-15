// Supabase client setup
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Create client with dummy values if env vars are not set (will fail gracefully)
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
)

// Database types
export interface DatabaseTestResult {
  id?: string
  user_id?: string
  timestamp: number
  results: {
    simple: {
      reactionTime: number
      movementIndex: number
      neuroScore: number
      alertLevel: string
      fatigueMetrics: {
        averageReactionTime: number
        reactionTimeVariability: number
        standardDeviation: number
        lapses: number
        falseStarts: number
        errorRate: number
        interpretation: string
      }
    }
    dotgrid: {
      averageReactionTime: number
      hits: number
      misses: number
      errors: number
      dotScore: number
      fatigueMetrics: {
        averageReactionTime: number
        reactionTimeVariability: number
        standardDeviation: number
        lapses: number
        falseStarts: number
        errorRate: number
        interpretation: string
      }
    }
    flash: {
      reactionTimeMs: number
      blinkLatencyMs: number
      blinkCount: number
      stabilityScore: number
      fatigueLevel: string
      fatigueScore: number
      fatigueMetrics: {
        averageReactionTime: number
        reactionTimeVariability: number
        standardDeviation: number
        lapses: number
        falseStarts: number
        errorRate: number
        interpretation: string
      }
    }
  }
  combinedScore: number
  created_at?: string
}

