/**
 * Color Helper Functions
 * Utilities for calculating color brightness and determining optimal text colors
 */

/**
 * Convert hex color to RGB values
 * @param {string} hex - Hex color code (e.g., "#FF5733" or "#F57")
 * @returns {Object} - Object with r, g, b values (0-255)
 */
export function hexToRgb(hex) {
  // Remove # if present
  hex = hex.replace('#', '')

  // Handle 3-character hex codes (e.g., "#F57")
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  }

  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)

  return { r, g, b }
}

/**
 * Calculate relative luminance of a color using WCAG formula
 * @param {Object} rgb - Object with r, g, b values (0-255)
 * @returns {number} - Luminance value (0-1)
 */
export function calculateLuminance(rgb) {
  // Normalize RGB values to 0-1
  const rsRGB = rgb.r / 255
  const gsRGB = rgb.g / 255
  const bsRGB = rgb.b / 255

  // Apply gamma correction
  const r = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4)
  const g = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4)
  const b = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4)

  // Calculate luminance
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Determine if a color is light or dark
 * @param {string} hexColor - Hex color code
 * @returns {boolean} - True if the color is light, false if dark
 */
export function isLightColor(hexColor) {
  const rgb = hexToRgb(hexColor)
  const luminance = calculateLuminance(rgb)

  // Threshold of 0.5 works well for most cases
  // Colors with luminance > 0.5 are considered light
  return luminance > 0.5
}

/**
 * Get the optimal text color (black or white) for a given background color
 * @param {string} backgroundColor - Hex color code for background
 * @returns {string} - Either '#000000' (black) or '#FFFFFF' (white)
 */
export function getContrastTextColor(backgroundColor) {
  if (!backgroundColor) return '#000000' // Default to black for undefined colors

  try {
    return isLightColor(backgroundColor) ? '#000000' : '#FFFFFF'
  } catch (error) {
    console.warn('Invalid color format:', backgroundColor)
    return '#000000' // Default to black on error
  }
}

/**
 * Get a slightly darker or lighter shade of a color for borders
 * @param {string} hexColor - Hex color code
 * @param {number} amount - Amount to adjust (-255 to 255, negative = darker, positive = lighter)
 * @returns {string} - Adjusted hex color
 */
export function adjustColorBrightness(hexColor, amount) {
  const rgb = hexToRgb(hexColor)

  const adjust = (value) => {
    const adjusted = value + amount
    return Math.max(0, Math.min(255, adjusted))
  }

  const r = adjust(rgb.r).toString(16).padStart(2, '0')
  const g = adjust(rgb.g).toString(16).padStart(2, '0')
  const b = adjust(rgb.b).toString(16).padStart(2, '0')

  return `#${r}${g}${b}`
}

/**
 * Calculate contrast ratio between two colors (WCAG standard)
 * @param {string} color1 - First hex color
 * @param {string} color2 - Second hex color
 * @returns {number} - Contrast ratio (1-21)
 */
export function calculateContrastRatio(color1, color2) {
  const lum1 = calculateLuminance(hexToRgb(color1))
  const lum2 = calculateLuminance(hexToRgb(color2))

  const lighter = Math.max(lum1, lum2)
  const darker = Math.min(lum1, lum2)

  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Check if color contrast meets WCAG AA standard (4.5:1 for normal text)
 * @param {string} foreground - Foreground color (text)
 * @param {string} background - Background color
 * @returns {boolean} - True if contrast is sufficient
 */
export function meetsWCAGAA(foreground, background) {
  return calculateContrastRatio(foreground, background) >= 4.5
}
