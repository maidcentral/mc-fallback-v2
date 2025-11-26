/**
 * Data Transformation Utility
 * Transforms Format A (api/jobs/getall) and DR All Data format to internal format
 * Handles null safety, team extraction, employee extraction, and metadata generation
 */

import { format, parseISO, min, max } from 'date-fns'
import { getPositionById } from '../constants/teamPositions'

/**
 * Detect which data format is being used
 * @param {Object} jsonData - Raw JSON data
 * @returns {string} - 'formatA' or 'drAllData'
 */
function detectFormat(jsonData) {
  if (!jsonData || !jsonData.Result) {
    throw new Error('Invalid data: Missing Result')
  }

  // Format A: Result is an array of jobs
  if (Array.isArray(jsonData.Result)) {
    return 'formatA'
  }

  // DR All Data: Result is an object with ServiceCompanyGroups
  if (jsonData.Result.ServiceCompanyGroups && Array.isArray(jsonData.Result.ServiceCompanyGroups)) {
    return 'drAllData'
  }

  throw new Error('Unknown data format: Unable to detect format')
}

/**
 * Main transformation function - auto-detects format
 * @param {Object} jsonData - Raw JSON data from MaidCentral API
 * @returns {Object} - Transformed data in internal format
 */
export function transformData(jsonData) {
  const format = detectFormat(jsonData)

  if (format === 'formatA') {
    return transformFormatA(jsonData)
  } else {
    return transformDRAllData(jsonData)
  }
}

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

  // Extract list of companies (Format A doesn't have explicit company structure, so create a default)
  const companies = []

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
    companies,
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

  // Extract home stats
  const homeStats = extractHomeStats(job.HomeInformation)

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

  // Extract customer notifications (service-related only)
  const customerNotifications = extractCustomerNotifications(job.CustomerNotifications)

  return {
    id: String(job.JobInformationId),
    customerName,
    serviceType,
    scopeOfWork,
    address,
    homeStats,
    ...instructions,
    tags,
    scheduledTeams,
    schedule,
    allowedTime: job.AllowedTime || 0,
    billRate: job.BillRate || 0,
    feeSplitRate: job.FeeSplitRate || 0,
    contactInfo,
    customerNotifications
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
 * Extract home statistics from HomeInformation object
 * @param {Object} homeInfo - HomeInformation object
 * @returns {Object} - Home statistics
 */
function extractHomeStats(homeInfo) {
  if (!homeInfo) return null

  return {
    bedrooms: homeInfo.HomeBedrooms || null,
    bathrooms: homeInfo.HomeBathrooms || null,
    fullBath: homeInfo.HomeFullBath || null,
    halfBath: homeInfo.HomeHalfBath || null,
    squareFootage: homeInfo.HomeFinishedSquareFootage || null,
    stories: homeInfo.HomeStories || null
  }
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
 * Extract customer notifications (service-related only, excludes Invoice and Scorecard)
 * @param {Array} customerNotifications - Array of notification objects
 * @returns {Array} - Filtered array of service-related notifications
 */
function extractCustomerNotifications(customerNotifications) {
  if (!Array.isArray(customerNotifications) || customerNotifications.length === 0) {
    return []
  }

  // Filter to only service-related notifications
  const serviceRelatedEvents = ['Three Days Before', 'One Day Before', 'On The Way']

  return customerNotifications.filter(notification =>
    serviceRelatedEvents.includes(notification.NotificationEvent)
  )
}

/**
 * Extract and combine tags from job, service set, home, and customer
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

  // Service Set tags
  if (Array.isArray(job.ServiceSetTags)) {
    job.ServiceSetTags.forEach(tag => {
      allTags.push({
        type: 'serviceSet',
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
 * Extract and transform rooms from job
 * @param {Array} roomsArray - Array of room objects
 * @returns {Array} - Array of transformed room objects
 */
function extractRooms(roomsArray) {
  if (!Array.isArray(roomsArray) || roomsArray.length === 0) {
    return []
  }

  return roomsArray.map(room => ({
    name: room.RoomName || '',
    location: room.LocationInHome || '',
    type: room.RoomTypeName || 'Other',
    deepCleanCode: room.DCCodeDescription || '',
    lastDeepCleanDate: room.LastDCDate || '',
    detailsOfWork: room.DetailsOfWork || '',
    fee: room.RoomFee || 0
  }))
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

/**
 * Main transformation function for DR All Data format
 * @param {Object} jsonData - Raw JSON data from DR All Data API
 * @returns {Object} - Transformed data in internal format
 */
export function transformDRAllData(jsonData) {
  if (!jsonData || !jsonData.Result || !jsonData.Result.ServiceCompanyGroups) {
    throw new Error('Invalid DR All Data format: Missing Result.ServiceCompanyGroups')
  }

  // Extract list of companies
  const companies = extractCompanies(jsonData.Result.ServiceCompanyGroups)

  // Extract FeatureToggles from companies
  const featureToggles = extractFeatureToggles(jsonData.Result.ServiceCompanyGroups)

  // Flatten the hierarchical structure to get all jobs
  const jobs = flattenDRAllDataJobs(jsonData.Result.ServiceCompanyGroups)

  // Extract company name from first company (if available)
  const companyName = extractCompanyName(jsonData.Result.ServiceCompanyGroups)

  // Extract unique teams from all jobs (using DR format fields)
  const teams = extractTeamsDR(jobs)

  // Transform jobs to internal format (using DR format fields)
  const transformedJobs = jobs.map(job => transformJobDR(job))

  // Extract employees from all jobs
  const employees = extractEmployees(jobs)

  // Calculate metadata (with DR-specific data)
  const metadata = calculateMetadataDR(transformedJobs, teams, employees, jsonData.Result, companyName, featureToggles)

  return {
    metadata,
    companies,
    teams,
    jobs: transformedJobs,
    employees
  }
}

/**
 * Flatten DR All Data hierarchical structure to get all jobs
 * Adds ServiceCompanyId and ServiceCompanyName to each job
 * @param {Array} serviceCompanyGroups - Array of service company group objects
 * @returns {Array} - Flat array of all jobs with company info added
 */
function flattenDRAllDataJobs(serviceCompanyGroups) {
  const allJobs = []

  serviceCompanyGroups.forEach(group => {
    if (Array.isArray(group.ServiceCompanies)) {
      group.ServiceCompanies.forEach(company => {
        if (Array.isArray(company.Jobs)) {
          // Add company info to each job
          const jobsWithCompanyInfo = company.Jobs.map(job => ({
            ...job,
            ServiceCompanyId: company.ServiceCompanyId,
            ServiceCompanyName: company.Name
          }))
          allJobs.push(...jobsWithCompanyInfo)
        }
      })
    }
  })

  return allJobs
}

/**
 * Extract list of companies from service company groups
 * @param {Array} serviceCompanyGroups - Array of service company group objects
 * @returns {Array} - Array of company objects with id and name
 */
function extractCompanies(serviceCompanyGroups) {
  const companies = []

  serviceCompanyGroups.forEach(group => {
    if (Array.isArray(group.ServiceCompanies)) {
      group.ServiceCompanies.forEach(company => {
        companies.push({
          id: String(company.ServiceCompanyId),
          name: company.Name
        })
      })
    }
  })

  return companies
}

/**
 * Extract FeatureToggles from service company groups
 * Merges FeatureToggles from all companies, using first company's values for conflicts
 * @param {Array} serviceCompanyGroups - Array of service company group objects
 * @returns {Object} - Merged FeatureToggles object
 */
function extractFeatureToggles(serviceCompanyGroups) {
  const featureToggles = {}

  serviceCompanyGroups.forEach(group => {
    if (Array.isArray(group.ServiceCompanies)) {
      group.ServiceCompanies.forEach(company => {
        if (company.FeatureToggles) {
          // Merge feature toggles, first company wins for conflicts
          Object.assign(featureToggles, company.FeatureToggles)
        }
      })
    }
  })

  return featureToggles
}

/**
 * Extract company name from service company groups
 * @param {Array} serviceCompanyGroups - Array of service company group objects
 * @returns {string} - Company name
 */
function extractCompanyName(serviceCompanyGroups) {
  if (!serviceCompanyGroups || serviceCompanyGroups.length === 0) {
    return 'MaidCentral'
  }

  // Try to get from first company
  const firstGroup = serviceCompanyGroups[0]
  if (firstGroup.ServiceCompanies && firstGroup.ServiceCompanies.length > 0) {
    return firstGroup.ServiceCompanies[0].Name || firstGroup.Name || 'MaidCentral'
  }

  return firstGroup.Name || 'MaidCentral'
}

/**
 * Extract unique teams from jobs in DR format
 * @param {Array} jobs - Array of raw job objects from DR format
 * @returns {Array} - Array of unique team objects
 */
function extractTeamsDR(jobs) {
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
          // Use SortOrder if available, fallback to TeamListId
          sortOrder: team.SortOrder || team.TeamListId || 0
        })
      }
    })
  })

  // Convert map to array and sort by sortOrder
  return Array.from(teamMap.values()).sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * Transform a single job from DR format to internal format
 * @param {Object} job - Raw job object from DR format
 * @returns {Object} - Transformed job object
 */
function transformJobDR(job) {
  // Extract customer name (fields are flattened at job level in DR format)
  const customerName = job.CustomerFullName ||
    `${job.CustomerFirstName || ''} ${job.CustomerLastName || ''}`.trim() ||
    'Unknown Customer'

  // Extract address (fields are flattened at job level in DR format)
  const address = buildAddressDR(job)

  // Extract home stats (fields are flattened at job level in DR format)
  const homeStats = extractHomeStatsDR(job)

  // Extract service type and scope (fields are flattened at job level)
  const serviceType = job.ServiceSetDescription || 'Unknown Service'
  const scopeOfWork = job.ServiceSetTypeDescription || 'Unknown'

  // Extract all instructions (fields are flattened at job level in DR format)
  const instructions = extractInstructionsDR(job)

  // Extract contact info
  const contactInfo = extractContactInfo(job.ContactInfos)

  // Extract tags
  const tags = extractTags(job)

  // Extract rooms
  const rooms = extractRooms(job.Rooms)

  // Extract scheduled teams
  const scheduledTeams = extractScheduledTeams(job.ScheduledTeams)

  // Extract schedule
  const schedule = extractSchedule(job)

  // Extract customer notifications (service-related only)
  const customerNotifications = extractCustomerNotifications(job.CustomerNotifications)

  return {
    id: String(job.JobInformationId),
    companyId: String(job.ServiceCompanyId),
    companyName: job.ServiceCompanyName || '',
    customerName,
    serviceType,
    scopeOfWork,
    address,
    homeStats,
    ...instructions,
    tags,
    rooms,
    scheduledTeams,
    schedule,
    allowedTime: job.AllowedTime || 0,
    // Use BillRate if available, fallback to BaseFeeLog.Amount
    billRate: job.BillRate || job.BaseFeeLog?.Amount || 0,
    feeSplitRate: job.FeeSplitRate || 0,
    contactInfo,
    customerNotifications,
    // Rate breakdown fields
    baseFee: job.BaseFeeLog || null,
    serviceSetRateMods: job.ServiceSetRateMods || [],
    jobRateMods: job.JobRateMods || []
  }
}

/**
 * Build address string from flattened DR format job fields
 * @param {Object} job - Job object with flattened address fields
 * @returns {string} - Formatted address
 */
function buildAddressDR(job) {
  const parts = []

  if (job.HomeAddress1) parts.push(job.HomeAddress1)
  if (job.HomeAddress2) parts.push(job.HomeAddress2)

  const cityStateZip = [
    job.HomeCity,
    job.HomeRegion,
    job.HomePostalCode
  ].filter(Boolean).join(' ')

  if (cityStateZip) parts.push(cityStateZip)

  return parts.join(', ') || 'Unknown Address'
}

/**
 * Extract home statistics from flattened DR format job fields
 * @param {Object} job - Job object with flattened home stat fields
 * @returns {Object} - Home statistics
 */
function extractHomeStatsDR(job) {
  if (!job) return null

  return {
    bedrooms: job.HomeBedrooms || null,
    bathrooms: job.HomeBathrooms || null,
    fullBath: job.HomeFullBath || null,
    halfBath: job.HomeHalfBath || null,
    squareFootage: job.HomeFinishedSquareFootage || null,
    stories: job.HomeStories || null
  }
}

/**
 * Extract all instruction fields from flattened DR format
 * @param {Object} job - Raw job object with flattened instruction fields
 * @returns {Object} - Object with all instruction fields
 */
function extractInstructionsDR(job) {
  return {
    eventInstructions: job.EventInstructions || '',
    specialInstructions: job.HomeSpecialInstructions || job.ServiceSetSpecialInstructions || '',
    petInstructions: job.HomePetInstructions || '',
    directions: job.HomeDirections || '', // Now available in DR format
    specialEquipment: job.HomeSpecialEquipment || job.ServiceSetSpecialEquipment || '',
    wasteInfo: job.HomeWasteDisposal || '',
    accessInformation: job.HomeAccessInformation || '',
    internalMemo: job.HomeInternalMemo || ''
  }
}

/**
 * Calculate metadata from DR format transformed data
 * @param {Array} jobs - Transformed jobs array
 * @param {Array} teams - Teams array
 * @param {Array} employees - Employees array
 * @param {Object} resultData - Original Result object from DR format
 * @param {string} companyName - Extracted company name
 * @param {Object} featureToggles - Extracted FeatureToggles
 * @returns {Object} - Metadata object
 */
function calculateMetadataDR(jobs, teams, employees, resultData, companyName, featureToggles) {
  // Use provided date range if available
  let startDate = ''
  let endDate = ''

  if (resultData.DateRange) {
    try {
      startDate = format(parseISO(resultData.DateRange.StartDate), 'yyyy-MM-dd')
      endDate = format(parseISO(resultData.DateRange.EndDate), 'yyyy-MM-dd')
    } catch (error) {
      console.error('Error parsing DateRange:', error)
    }
  }

  // Fallback to calculating from jobs if no DateRange provided
  if (!startDate || !endDate) {
    const dates = jobs
      .map(job => job.schedule.date)
      .filter(Boolean)
      .map(dateStr => parseISO(dateStr))

    startDate = dates.length > 0 ? format(min(dates), 'yyyy-MM-dd') : ''
    endDate = dates.length > 0 ? format(max(dates), 'yyyy-MM-dd') : ''
  }

  return {
    companyName: companyName,
    lastUpdated: resultData.GeneratedAt || new Date().toISOString(),
    dataFormat: 'dr-all-data',
    dataVersion: resultData.DataVersion || '1.0',
    dataRange: {
      startDate,
      endDate
    },
    stats: {
      totalJobs: jobs.length,
      totalTeams: teams.length - 1, // Exclude "Unassigned" team from count
      totalEmployees: employees.length
    },
    featureToggles: featureToggles || {}
  }
}
