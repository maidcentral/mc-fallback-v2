/**
 * usePersistedData Hook
 * Custom React hook for managing persisted data in localStorage
 * Loads data on mount and provides save/clear functions
 */

import { useState, useEffect } from 'react'
import { DataStorage } from '../utils/storage'

export function usePersistedData() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Load data from localStorage on mount
  useEffect(() => {
    try {
      const stored = DataStorage.load()
      if (stored) {
        setData(stored)
      }
    } catch (err) {
      console.error('Error loading persisted data:', err)
      setError('Failed to load saved data')
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Save data to localStorage and update state
   * @param {Object} newData - The data to save
   * @returns {boolean} - Success status
   */
  const saveData = (newData) => {
    try {
      const success = DataStorage.save(newData)
      if (success) {
        setData(newData)
        setError(null)
        return true
      } else {
        setError('Failed to save data')
        return false
      }
    } catch (err) {
      console.error('Error saving data:', err)
      setError('Failed to save data: ' + err.message)
      return false
    }
  }

  /**
   * Clear data from localStorage and reset state
   * @returns {boolean} - Success status
   */
  const clearData = () => {
    try {
      const success = DataStorage.clear()
      if (success) {
        setData(null)
        setError(null)
        return true
      } else {
        setError('Failed to clear data')
        return false
      }
    } catch (err) {
      console.error('Error clearing data:', err)
      setError('Failed to clear data: ' + err.message)
      return false
    }
  }

  /**
   * Check if data exists
   * @returns {boolean} - True if data exists
   */
  const hasData = () => {
    return data !== null && data !== undefined
  }

  return {
    data,
    loading,
    error,
    saveData,
    clearData,
    hasData
  }
}
