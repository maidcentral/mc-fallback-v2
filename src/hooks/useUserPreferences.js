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
   * Update selected date specifically
   * @param {string} selectedDate - ISO date string (YYYY-MM-DD)
   * @returns {boolean} - Success status
   */
  const setSelectedDate = (selectedDate) => {
    return updatePreferences({ selectedDate })
  }

  /**
   * Update selected company specifically
   * @param {string} selectedCompany - Company ID or 'all'
   * @returns {boolean} - Success status
   */
  const setSelectedCompany = (selectedCompany) => {
    return updatePreferences({ selectedCompany })
  }

  /**
   * Update selected team specifically
   * @param {string} selectedTeam - Team ID or 'all'
   * @returns {boolean} - Success status
   */
  const setSelectedTeam = (selectedTeam) => {
    return updatePreferences({ selectedTeam })
  }

  return {
    preferences,
    viewMode: preferences.viewMode,
    selectedDate: preferences.selectedDate,
    selectedCompany: preferences.selectedCompany,
    selectedTeam: preferences.selectedTeam,
    updatePreferences,
    setViewMode,
    setSelectedDate,
    setSelectedCompany,
    setSelectedTeam
  }
}
