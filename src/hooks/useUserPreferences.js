/**
 * useUserPreferences Hook
 * Manages user preferences with localStorage persistence
 * Similar pattern to usePersistedData.js
 */

import { useState, useEffect } from 'react'
import { loadPreferences, savePreferences, DEFAULT_PREFERENCES } from '../utils/userPreferences'

export function useUserPreferences() {
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES)

  // Load preferences from localStorage on mount
  useEffect(() => {
    const loaded = loadPreferences()
    setPreferences(loaded)
  }, [])

  /**
   * Update preferences and save to localStorage
   * @param {Object} updates - Partial preferences object to update
   * @returns {boolean} - Success status
   */
  const updatePreferences = (updates) => {
    const newPreferences = { ...preferences, ...updates }
    setPreferences(newPreferences)
    return savePreferences(newPreferences)
  }

  /**
   * Update view mode specifically
   * @param {string} viewMode - 'office' | 'technician'
   * @returns {boolean} - Success status
   */
  const setViewMode = (viewMode) => {
    return updatePreferences({ viewMode })
  }

  /**
   * Update hideInfo toggle specifically
   * @param {boolean} hideInfo - True to hide sensitive info
   * @returns {boolean} - Success status
   */
  const setHideInfo = (hideInfo) => {
    return updatePreferences({ hideInfo })
  }

  return {
    preferences,
    viewMode: preferences.viewMode,
    hideInfo: preferences.hideInfo,
    updatePreferences,
    setViewMode,
    setHideInfo
  }
}
