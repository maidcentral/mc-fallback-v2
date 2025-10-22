/**
 * Team Position Mappings
 * Maps TeamPosition IDs (from EmployeeSchedules) to position names and colors
 * Based on MaidCentral data structure
 */

export const TEAM_POSITIONS = {
  0: {
    id: 0,
    name: 'Unassigned',
    color: '#999999',
    description: 'No position assigned'
  },
  1: {
    id: 1,
    name: 'Team Leader',
    color: '#E74C3C',
    description: 'Lead position - responsible for team coordination'
  },
  2: {
    id: 2,
    name: 'Team Member',
    color: '#3498DB',
    description: 'Regular team member'
  },
  3: {
    id: 3,
    name: 'Trainee',
    color: '#F39C12',
    description: 'Employee in training'
  },
  4: {
    id: 4,
    name: 'Supervisor',
    color: '#9B59B6',
    description: 'Supervisory role'
  },
  5: {
    id: 5,
    name: 'Assistant',
    color: '#1ABC9C',
    description: 'Assistant position'
  }
}

/**
 * Get position info by ID
 * @param {number} positionId - The position ID
 * @returns {Object} - Position object with name, color, description
 */
export function getPositionById(positionId) {
  return TEAM_POSITIONS[positionId] || TEAM_POSITIONS[0]
}

/**
 * Get all position IDs
 * @returns {number[]} - Array of position IDs
 */
export function getAllPositionIds() {
  return Object.keys(TEAM_POSITIONS).map(Number)
}

/**
 * Get all positions as array
 * @returns {Object[]} - Array of position objects
 */
export function getAllPositions() {
  return Object.values(TEAM_POSITIONS)
}
