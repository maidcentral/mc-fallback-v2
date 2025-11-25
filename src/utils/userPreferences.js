/**
 * User Preferences Storage Utility
 * Manages user preferences separately from application data
 * Persists view mode to localStorage
 */

const PREFERENCES_KEY = 'mc_backup_user_prefs'

/**
 * Default preferences structure
 */
export const DEFAULT_PREFERENCES = {
  viewMode: 'office', // 'office' | 'technician'
  selectedDate: new Date().toISOString().split('T')[0], // ISO date string (YYYY-MM-DD)
  selectedCompany: 'all',
  selectedTeam: 'all'
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
 * Note: Some toggles use inverse logic (Hide* instead of Display*)
 */
const FIELD_TO_FEATURE_TOGGLE = {
  billRate: 'TechDashboard_DisplayBillRate',
  feeSplitRate: 'TechDashboard_DisplayFeeSplitRate',
  addOnRate: 'TechDashboard_DisplayAddOnRate',
  roomRate: 'TechDashboard_DisplayRoomRate',
  customerPhone: 'TechDashboard_DisplayCustomerPhoneNumbers',
  customerEmail: 'TechDashboard_DisplayCustomerEmails',
  discounts: 'TechDashboard_HideDiscounts', // Inverse logic: true = hide
  accessInformation: null, // Always respects hideInfo in Technician view (no specific toggle)
  internalMemo: null // Always respects hideInfo in Technician view (no specific toggle)
}

/**
 * Helper function to determine if a field should be hidden
 * Office view: Always show (ignore FeatureToggles)
 * Technician view: Check FeatureToggles only
 *
 * @param {string} viewMode - Current view mode ('office' | 'technician')
 * @param {string} fieldName - Name of the field (e.g., 'billRate', 'contactInfo')
 * @param {Object} featureToggles - FeatureToggles from uploaded data
 * @returns {boolean} - True if field should be hidden
 */
export function shouldHideField(viewMode, fieldName = null, featureToggles = null) {
  // Office view always shows everything
  if (viewMode === 'office') {
    return false
  }

  // Technician view - check FeatureToggles
  if (fieldName && featureToggles) {
    const featureToggleKey = FIELD_TO_FEATURE_TOGGLE[fieldName]

    if (featureToggleKey && featureToggleKey in featureToggles) {
      const toggleValue = featureToggles[featureToggleKey]

      // Handle inverse logic toggles (Hide* instead of Display*)
      const isInverseLogic = featureToggleKey.includes('Hide')

      if (isInverseLogic) {
        // For Hide* toggles: true = hide, false = show
        return toggleValue === true
      } else {
        // For Display* toggles: false = hide, true = show
        return toggleValue === false
      }
    }
  }

  // Default: hide in Technician view if no toggle defined (for accessInformation, internalMemo)
  return viewMode === 'technician'
}
