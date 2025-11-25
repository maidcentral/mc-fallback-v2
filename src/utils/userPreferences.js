/**
 * User Preferences Storage Utility
 * Manages user preferences separately from application data
 * Persists view mode and privacy settings to localStorage
 */

const PREFERENCES_KEY = 'mc_backup_user_prefs'

/**
 * Default preferences structure
 */
export const DEFAULT_PREFERENCES = {
  viewMode: 'office', // 'office' | 'technician'
  hideInfo: false
}

/**
 * Save user preferences to localStorage
 * @param {Object} preferences - Preferences object to save
 * @returns {boolean} - Success status
 */
export function savePreferences(preferences) {
  try {
    const prefsToSave = { ...DEFAULT_PREFERENCES, ...preferences }
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefsToSave))
    return true
  } catch (error) {
    console.error('Error saving preferences:', error)
    return false
  }
}

/**
 * Load user preferences from localStorage
 * @returns {Object} - Preferences object or defaults if not found
 */
export function loadPreferences() {
  try {
    const stored = localStorage.getItem(PREFERENCES_KEY)
    if (!stored) {
      return DEFAULT_PREFERENCES
    }
    const parsed = JSON.parse(stored)
    return { ...DEFAULT_PREFERENCES, ...parsed }
  } catch (error) {
    console.error('Error loading preferences:', error)
    return DEFAULT_PREFERENCES
  }
}

/**
 * Clear user preferences from localStorage
 * @returns {boolean} - Success status
 */
export function clearPreferences() {
  try {
    localStorage.removeItem(PREFERENCES_KEY)
    return true
  } catch (error) {
    console.error('Error clearing preferences:', error)
    return false
  }
}

/**
 * Check if preferences exist in localStorage
 * @returns {boolean} - True if preferences exist
 */
export function preferencesExist() {
  return localStorage.getItem(PREFERENCES_KEY) !== null
}

/**
 * Mapping of field names to their corresponding FeatureToggle keys
 */
const FIELD_TO_FEATURE_TOGGLE = {
  billRate: 'TechDashboard_DisplayBillRate',
  feeSplitRate: 'TechDashboard_DisplayFeeSplitRate',
  addOnRate: 'TechDashboard_DisplayAddOnRate',
  roomRate: 'TechDashboard_DisplayRoomRate',
  customerPhone: 'TechDashboard_DisplayCustomerPhoneNumbers',
  customerEmail: 'TechDashboard_DisplayCustomerEmails'
}

/**
 * Helper function to determine if a field should be hidden
 * Office view: Always show (ignore hideInfo and FeatureToggles)
 * Technician view: Check FeatureToggles first, then fallback to hideInfo
 *
 * @param {string} viewMode - Current view mode ('office' | 'technician')
 * @param {boolean} hideInfo - Privacy toggle state
 * @param {string} fieldName - Name of the field (e.g., 'billRate', 'contactInfo')
 * @param {Object} featureToggles - FeatureToggles from uploaded data
 * @returns {boolean} - True if field should be hidden
 */
export function shouldHideField(viewMode, hideInfo, fieldName = null, featureToggles = null) {
  // Office view always shows everything
  if (viewMode === 'office') {
    return false
  }

  // Technician view - check FeatureToggles first if fieldName is provided
  if (fieldName && featureToggles) {
    const featureToggleKey = FIELD_TO_FEATURE_TOGGLE[fieldName]

    if (featureToggleKey && featureToggleKey in featureToggles) {
      // If FeatureToggle says "don't display" (false), hide the field
      // If FeatureToggle says "display" (true), still respect manual hideInfo toggle
      const shouldDisplay = featureToggles[featureToggleKey]

      if (!shouldDisplay) {
        // FeatureToggle says don't display - always hide in Technician view
        return true
      }
      // FeatureToggle allows display - fall through to hideInfo check
    }
  }

  // Fallback to manual hideInfo toggle
  return hideInfo
}
