// Storage utility for persisting test results

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
    flash?: {
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
}

const STORAGE_KEY = 'neuropulse_test_history'
const MAX_HISTORY_ITEMS = 100 // Keep last 100 tests

export const storage = {
  // Save a complete test session (Simple and Dot Grid required, Flash optional)
  saveTestSession: (results: {
    simple: any
    dotgrid: any
    flash?: any
  }, combinedScore: number): void => {
    try {
      const history = storage.getTestHistory()
      const newResult: StoredTestResult = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        results: {
          simple: results.simple,
          dotgrid: results.dotgrid,
          ...(results.flash && { flash: results.flash })
        },
        combinedScore
      }
      
      history.unshift(newResult) // Add to beginning
      
      // Keep only last MAX_HISTORY_ITEMS
      const trimmedHistory = history.slice(0, MAX_HISTORY_ITEMS)
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedHistory))
    } catch (error) {
      console.error('Error saving test session:', error)
    }
  },

  // Get all test history
  getTestHistory: (): StoredTestResult[] => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) return []
      return JSON.parse(stored)
    } catch (error) {
      console.error('Error loading test history:', error)
      return []
    }
  },


  // Get recent tests (last N)
  getRecentTests: (count: number = 10): StoredTestResult[] => {
    return storage.getTestHistory().slice(0, count)
  },

  // Clear all history
  clearHistory: (): void => {
    localStorage.removeItem(STORAGE_KEY)
  },

  // Delete a specific test
  deleteTest: (id: string): void => {
    const history = storage.getTestHistory()
    const filtered = history.filter(test => test.id !== id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
  }
}

