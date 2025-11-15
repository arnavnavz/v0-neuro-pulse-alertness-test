// Storage utility for persisting test results
import { supabase, DatabaseTestResult } from './supabase'

export interface StoredTestResult {
  id: string
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
    } | null
  }
  combinedScore: number
}

const STORAGE_KEY = 'neuropulse_test_history'
const MAX_HISTORY_ITEMS = 100 // Keep last 100 tests

export const storage = {
  // Save a complete test session (all 3 tests required)
  saveTestSession: async (results: {
    simple: any
    dotgrid: any
    flash: any
  }, combinedScore: number): Promise<void> => {
    try {
      const newResult: StoredTestResult = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        results: {
          simple: results.simple,
          dotgrid: results.dotgrid,
          flash: results.flash
        },
        combinedScore
      }
      
      // Try to save to Supabase first
      if (supabase && process.env.NEXT_PUBLIC_SUPABASE_URL) {
        try {
          const { error } = await supabase
            .from('test_results')
            .insert([{
              timestamp: newResult.timestamp,
              results: newResult.results,
              combined_score: newResult.combinedScore
            }])
          
          if (error) {
            console.warn('Failed to save to database, falling back to localStorage:', error)
            // Fall through to localStorage
          } else {
            // Successfully saved to database, also save to localStorage as backup
            const history = await storage.getTestHistory()
            history.unshift(newResult)
            const trimmedHistory = history.slice(0, MAX_HISTORY_ITEMS)
            localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedHistory))
            return
          }
        } catch (dbError) {
          console.warn('Database error, falling back to localStorage:', dbError)
          // Fall through to localStorage
        }
      }
      
      // Fallback to localStorage
      const history = await storage.getTestHistory()
      history.unshift(newResult) // Add to beginning
      
      // Keep only last MAX_HISTORY_ITEMS
      const trimmedHistory = history.slice(0, MAX_HISTORY_ITEMS)
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedHistory))
    } catch (error) {
      console.error('Error saving test session:', error)
    }
  },

  // Get all test history
  getTestHistory: async (): Promise<StoredTestResult[]> => {
    try {
      // Try to load from Supabase first
      if (supabase && process.env.NEXT_PUBLIC_SUPABASE_URL) {
        try {
          const { data, error } = await supabase
            .from('test_results')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(MAX_HISTORY_ITEMS)
          
          if (!error && data) {
            // Convert database format to StoredTestResult format
            const results: StoredTestResult[] = data.map((row: any) => ({
              id: row.id,
              timestamp: row.timestamp,
              results: row.results,
              combinedScore: row.combined_score
            }))
            
            // Also sync to localStorage as backup
            localStorage.setItem(STORAGE_KEY, JSON.stringify(results))
            return results
          }
        } catch (dbError) {
          console.warn('Database error, falling back to localStorage:', dbError)
          // Fall through to localStorage
        }
      }
      
      // Fallback to localStorage
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) return []
      return JSON.parse(stored)
    } catch (error) {
      console.error('Error loading test history:', error)
      return []
    }
  },


  // Get recent tests (last N)
  getRecentTests: async (count: number = 10): Promise<StoredTestResult[]> => {
    const history = await storage.getTestHistory()
    return history.slice(0, count)
  },

  // Clear all history
  clearHistory: async (): Promise<void> => {
    // Try to clear from database
    if (supabase && process.env.NEXT_PUBLIC_SUPABASE_URL) {
      try {
        await supabase.from('test_results').delete().neq('id', '')
      } catch (error) {
        console.warn('Failed to clear database:', error)
      }
    }
    // Always clear localStorage
    localStorage.removeItem(STORAGE_KEY)
  },

  // Delete a specific test
  deleteTest: async (id: string): Promise<void> => {
    // Try to delete from database
    if (supabase && process.env.NEXT_PUBLIC_SUPABASE_URL) {
      try {
        await supabase.from('test_results').delete().eq('id', id)
      } catch (error) {
        console.warn('Failed to delete from database:', error)
      }
    }
    // Also delete from localStorage
    const history = await storage.getTestHistory()
    const filtered = history.filter(test => test.id !== id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
  }
}

