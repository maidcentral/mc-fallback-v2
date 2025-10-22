/**
 * LocalStorage wrapper for MaidCentral Backup data
 * Provides simple save/load/clear/exists functionality
 */

const STORAGE_KEY = 'mc_backup_data'

export const DataStorage = {
  /**
   * Save data to localStorage
   * @param {Object} data - The data object to store
   * @returns {boolean} - Success status
   */
  save(data) {
    try {
      const jsonString = JSON.stringify(data)
      localStorage.setItem(STORAGE_KEY, jsonString)
      return true
    } catch (error) {
      console.error('Error saving to localStorage:', error)
      return false
    }
  },

  /**
   * Load data from localStorage
   * @returns {Object|null} - Parsed data object or null if not found/invalid
   */
  load() {
    try {
      const jsonString = localStorage.getItem(STORAGE_KEY)
      if (!jsonString) {
        return null
      }
      return JSON.parse(jsonString)
    } catch (error) {
      console.error('Error loading from localStorage:', error)
      return null
    }
  },

  /**
   * Clear data from localStorage
   * @returns {boolean} - Success status
   */
  clear() {
    try {
      localStorage.removeItem(STORAGE_KEY)
      return true
    } catch (error) {
      console.error('Error clearing localStorage:', error)
      return false
    }
  },

  /**
   * Check if data exists in localStorage
   * @returns {boolean} - True if data exists
   */
  exists() {
    try {
      return localStorage.getItem(STORAGE_KEY) !== null
    } catch (error) {
      console.error('Error checking localStorage:', error)
      return false
    }
  },

  /**
   * Get the storage key (useful for debugging)
   * @returns {string} - The storage key
   */
  getKey() {
    return STORAGE_KEY
  }
}
