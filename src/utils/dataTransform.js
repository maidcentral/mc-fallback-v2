/**
 * Data Transformation Utility
 * Transforms Format A (api/jobs/getall) to internal format
 * Handles null safety, team extraction, employee extraction, and metadata generation
 */

import { format, parseISO, min, max } from 'date-fns'
import { getPositionById } from '../constants/teamPositions'

/**
 * Main transformation function for Format A (api/jobs/getall)
 * @param {Object} jsonData - Raw JSON data from MaidCentral API
 * @returns {Object} - Transformed data in internal format
 */
export function transformFormatA(jsonData) {
  if (!jsonData || !jsonData.Result || !Array.isArray(jsonData.Result)) {
    throw new Error('Invalid Format A data: Missing Result array')
  }

  const jobs = jsonData.Result

  // Extract unique teams from all jobs
  const teams = extractTeams(jobs)

  // Transform jobs to internal format
  const transformedJobs = jobs.map(job => transformJob(job))

  // Extract employees from all jobs
  const employees = extractEmployees(jobs)

  // Calculate metadata
  const metadata = calculateMetadata(transformedJobs, teams, employees)

  return {
    metadata,
    teams,
    jobs: transformedJobs,
    employees
  }
}

/**
 * Extract unique teams from all jobs
 * @param {Array} jobs - Array of raw job objects
 * @returns {Array} - Array of unique team objects
 */
function extractTeams(jobs) {
  const teamMap = new Map()

  // Always add "Unassigned" team
  teamMap.set('0', {
    id: '0',
    name: 'Unassigned',
    color: '#999999',
    sortOrder: 999
  })

  jobs.forEach(job => {
    const scheduledTeams = job.ScheduledTeams || []

    scheduledTeams.forEach(team => {
      if (team.TeamListId && !teamMap.has(String(team.TeamListId))) {
        teamMap.set(String(team.TeamListId), {
          id: String(team.TeamListId),
          name: team.TeamListDescription || 'Unknown Team',
          color: team.Color || '#CCCCCC',
          sortOrder: team.SortOrder || 0
        })
      }
    })
  })

  // Convert map to array and sort by sortOrder
  return Array.from(teamMap.values()).sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * Transform a single job to internal format
 * @param {Object} job - Raw job object
 * @returns {Object} - Transformed job object
 */
function transformJob(job) {
  // Extract customer name
  const customerName = job.CustomerInformation
    ? `${job.CustomerInformation.CustomerFirstName || ''} ${job.CustomerInformation.CustomerLastName || ''}`.trim()
    : 'Unknown Customer'

  // Extract address
  const address = buildAddress(job.HomeInformation)

  // Extract service type and scope
  const serviceType = job.ServiceSet?.ServiceSetDescription || job.ServiceSetDescription || 'Unknown Service'
  const scopeOfWork = job.ServiceSet?.ServiceSetTypeDescription || job.ServiceSetTypeDescription || 'Unknown'

  // Extract all instructions from NotesAndMemos
  const instructions = extractInstructions(job)

  // Extract contact info
  const contactInfo = extractContactInfo(job.ContactInfos)

  // Extract tags
  const tags = extractTags(job)

  // Extract scheduled teams
  const scheduledTeams = extractScheduledTeams(job.ScheduledTeams)

  // Extract schedule
  const schedule = extractSchedule(job)

  return {
    id: String(job.JobInformationId),
    customerName,
    serviceType,
    scopeOfWork,
    address,
    ...instructions,
    tags,
    scheduledTeams,
    schedule,
    billRate: job.BillRate || 0,
    contactInfo
  }
}

/**
 * Build address string from HomeInformation object
 * @param {Object} homeInfo - HomeInformation object
 * @returns {string} - Formatted address
 */
function buildAddress(homeInfo) {
  if (!homeInfo) return 'Unknown Address'

  const parts = []

  if (homeInfo.HomeAddress1) parts.push(homeInfo.HomeAddress1)
  if (homeInfo.HomeAddress2) parts.push(homeInfo.HomeAddress2)

  const cityStateZip = [
    homeInfo.HomeCity,
    homeInfo.HomeRegion,
    homeInfo.HomePostalCode
  ].filter(Boolean).join(' ')

  if (cityStateZip) parts.push(cityStateZip)

  return parts.join(', ') || 'Unknown Address'
}

/**
 * Extract all instruction fields
 * @param {Object} job - Raw job object
 * @returns {Object} - Object with all instruction fields
 */
function extractInstructions(job) {
  const notes = job.NotesAndMemos || {}

  return {
    eventInstructions: notes.EventInstructions || '',
    specialInstructions: notes.HomeSpecialInstructions || '',
    petInstructions: notes.HomePetInstructions || '',
    directions: notes.HomeDirections || '',
    specialEquipment: notes.HomeSpecialEquipment || '',
    wasteInfo: notes.HomeWasteDisposal || '',
    accessInformation: notes.HomeAccessInformation || notes.HomeAcessInformation || '', // Handle typo in API
    internalMemo: notes.HomeInternalMemo || ''
  }
}

/**
 * Extract contact information
 * @param {Array} contactInfos - Array of contact info objects
 * @returns {Object} - Object with phone and email
 */
function extractContactInfo(contactInfos) {
  if (!Array.isArray(contactInfos) || contactInfos.length === 0) {
    return { phone: '', email: '' }
  }

  // ContactTypeId: 1 = Home Phone, 2 = Cell Phone, 3 = Email
  const cellPhone = contactInfos.find(c => c.ContactTypeId === 2)
  const homePhone = contactInfos.find(c => c.ContactTypeId === 1)
  const email = contactInfos.find(c => c.ContactTypeId === 3)

  return {
    phone: cellPhone?.ContactInfo || homePhone?.ContactInfo || '',
    email: email?.ContactInfo || ''
  }
}

/**
 * Extract and combine tags from job, home, and customer
 * @param {Object} job - Raw job object
 * @returns {Array} - Array of tag objects
 */
function extractTags(job) {
  const allTags = []

  // Job tags
  if (Array.isArray(job.JobTags)) {
    job.JobTags.forEach(tag => {
      allTags.push({
        type: 'job',
        description: tag.Description || '',
        icon: tag.IconPath || '',
        color: tag.Color || '#999999'
      })
    })
  }

  // Home tags
  if (Array.isArray(job.HomeTags)) {
    job.HomeTags.forEach(tag => {
      allTags.push({
        type: 'home',
        description: tag.Description || '',
        icon: tag.IconPath || '',
        color: tag.Color || '#999999'
      })
    })
  }

  // Customer tags
  if (Array.isArray(job.CustomerTags)) {
    job.CustomerTags.forEach(tag => {
      allTags.push({
        type: 'customer',
        description: tag.Description || '',
        icon: tag.IconPath || '',
        color: tag.Color || '#999999'
      })
    })
  }

  return allTags
}

/**
 * Extract scheduled teams array
 * @param {Array} scheduledTeams - Array of scheduled team objects
 * @returns {Array} - Array of team IDs
 */
function extractScheduledTeams(scheduledTeams) {
  if (!Array.isArray(scheduledTeams) || scheduledTeams.length === 0) {
    return ['0'] // Assign to "Unassigned" team
  }

  return scheduledTeams
    .filter(team => team.TeamListId)
    .map(team => String(team.TeamListId))
}

/**
 * Extract schedule information
 * @param {Object} job - Raw job object
 * @returns {Object} - Schedule object with date and times
 */
function extractSchedule(job) {
  try {
    const date = job.JobDate ? format(parseISO(job.JobDate), 'yyyy-MM-dd') : ''
    const startTime = job.ScheduledStartTime ? format(parseISO(job.ScheduledStartTime), 'HH:mm') : ''
    const endTime = job.ScheduledEndTime ? format(parseISO(job.ScheduledEndTime), 'HH:mm') : ''

    return { date, startTime, endTime }
  } catch (error) {
    console.error('Error parsing schedule:', error)
    return { date: '', startTime: '', endTime: '' }
  }
}

/**
 * Extract employees from all jobs
 * @param {Array} jobs - Array of raw job objects
 * @returns {Array} - Array of employee objects with shifts
 */
function extractEmployees(jobs) {
  const employeeMap = new Map()

  jobs.forEach(job => {
    const employeeSchedules = job.EmployeeSchedules || []

    employeeSchedules.forEach(empSchedule => {
      const empId = String(empSchedule.EmployeeInformationId)

      if (!empId || empId === '0') return

      // If employee doesn't exist, create entry
      if (!employeeMap.has(empId)) {
        const position = getPositionById(empSchedule.TeamPosition || 0)

        employeeMap.set(empId, {
          id: empId,
          firstName: empSchedule.FirstName || '',
          lastName: empSchedule.LastName || '',
          name: `${empSchedule.FirstName || ''} ${empSchedule.LastName || ''}`.trim(),
          teamId: String(empSchedule.TeamListId || '0'),
          position: {
            id: position.id,
            name: position.name,
            color: position.color
          },
          shifts: []
        })
      }

      // Add shift for this job
      const employee = employeeMap.get(empId)
      const schedule = extractSchedule(job)

      if (schedule.date) {
        employee.shifts.push({
          jobId: String(job.JobInformationId),
          date: schedule.date,
          startTime: schedule.startTime,
          endTime: schedule.endTime
        })
      }
    })
  })

  return Array.from(employeeMap.values())
}

/**
 * Calculate metadata from transformed data
 * @param {Array} jobs - Transformed jobs array
 * @param {Array} teams - Teams array
 * @param {Array} employees - Employees array
 * @returns {Object} - Metadata object
 */
function calculateMetadata(jobs, teams, employees) {
  // Calculate date range
  const dates = jobs
    .map(job => job.schedule.date)
    .filter(Boolean)
    .map(dateStr => parseISO(dateStr))

  const startDate = dates.length > 0 ? format(min(dates), 'yyyy-MM-dd') : ''
  const endDate = dates.length > 0 ? format(max(dates), 'yyyy-MM-dd') : ''

  return {
    companyName: 'MaidCentral',
    lastUpdated: new Date().toISOString(),
    dataFormat: 'getall',
    dataRange: {
      startDate,
      endDate
    },
    stats: {
      totalJobs: jobs.length,
      totalTeams: teams.length - 1, // Exclude "Unassigned" team from count
      totalEmployees: employees.length
    }
  }
}
