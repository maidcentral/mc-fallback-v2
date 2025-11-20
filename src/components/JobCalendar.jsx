import { useState, useRef, useEffect } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import timelinePlugin from '@fullcalendar/timeline'
import resourceTimelinePlugin from '@fullcalendar/resource-timeline'
import interactionPlugin from '@fullcalendar/interaction'
import { Card } from './ui/card'
import { Alert, AlertDescription } from './ui/alert'
import { Select } from './ui/select'
import { Switch, Label } from './ui/switch'
import { Input } from './ui/input'
import { getContrastTextColor } from '../utils/colorHelpers'
import { shouldHideField } from '../utils/userPreferences'

export default function JobCalendar({ data, viewMode, hideInfo, setHideInfo, selectedDate, setSelectedDate, selectedCompany, setSelectedCompany, selectedTeam, setSelectedTeam }) {
  const calendarRef = useRef(null)
  const hasScrolledToToday = useRef(false)
  const isNavigatingProgrammatically = useRef(false)

  // Handle date picker change
  const handleDateChange = (e) => {
    const newDate = e.target.value
    if (newDate && calendarRef.current) {
      isNavigatingProgrammatically.current = true
      const calendarApi = calendarRef.current.getApi()
      calendarApi.gotoDate(newDate)
      setSelectedDate(newDate)
    }
  }

  // Navigate to selectedDate when component mounts or selectedDate changes
  useEffect(() => {
    if (calendarRef.current && selectedDate) {
      isNavigatingProgrammatically.current = true
      const calendarApi = calendarRef.current.getApi()
      calendarApi.gotoDate(selectedDate)
    }
  }, [selectedDate])

  // Auto-scroll to current time when calendar loads
  useEffect(() => {
    if (calendarRef.current && !hasScrolledToToday.current) {
      const calendarApi = calendarRef.current.getApi()
      const currentView = calendarApi.view.type

      // Only scroll for timeline views
      if (currentView.includes('timeline')) {
        // Small delay to ensure calendar is fully rendered
        setTimeout(() => {
          calendarApi.scrollToTime(new Date().toTimeString().slice(0, 8))
          hasScrolledToToday.current = true
        }, 100)
      }
    }
  }, [data])

  if (!data) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Job Calendar</h1>
        <Alert>
          <AlertDescription>
            No data loaded. Please upload a JSON file on the Admin page.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // Prepare resources for timeline views (teams as rows)
  const resources = data.teams
    .filter(t => t.id !== '0')
    .map(team => {
      // Get employees for this team working on the current date
      const teamEmployees = data.employees.filter(emp => {
        if (emp.teamId !== team.id) return false
        // Check if employee has any shifts on the current date
        return emp.shifts?.some(shift => shift.date === selectedDate)
      })

      return {
        id: team.id,
        title: team.name,
        eventColor: team.color,
        extendedProps: {
          employees: teamEmployees.map(emp => emp.name)
        }
      }
    })

  // Transform jobs to calendar events
  const events = data.jobs
    .filter(job => {
      // Filter by company
      if (selectedCompany !== 'all' && job.companyId !== selectedCompany) return false
      // Filter by selected team
      if (selectedTeam === 'all') return true
      return job.scheduledTeams.includes(selectedTeam)
    })
    .map(job => {
      // Get primary team color
      const primaryTeamId = job.scheduledTeams[0] || '0'
      const team = data.teams.find(t => t.id === primaryTeamId)
      const teamColor = team?.color || '#CCCCCC'

      // Build event start/end times
      const start = `${job.schedule.date}T${job.schedule.startTime}`
      const end = `${job.schedule.date}T${job.schedule.endTime}`

      // Build rich title with more info
      const timeRange = `${job.schedule.startTime} - ${job.schedule.endTime}`
      const addressShort = job.address.split(',')[0] // First part of address

      // Calculate optimal text color based on background
      const textColor = getContrastTextColor(teamColor)

      return {
        id: job.id,
        title: `${job.customerName}\n${job.serviceType}\n${addressShort}\n${timeRange}`,
        start,
        end,
        backgroundColor: teamColor,
        borderColor: teamColor,
        textColor: textColor, // FullCalendar will use this for text
        resourceId: primaryTeamId, // For timeline views
        extendedProps: {
          job,
          customerName: job.customerName,
          serviceType: job.serviceType,
          address: addressShort,
          timeRange: timeRange,
          textColor: textColor
        }
      }
    })

  // Handle event click
  const handleEventClick = (clickInfo) => {
    const job = clickInfo.event.extendedProps.job

    // Remove existing tooltips
    document.querySelectorAll('.job-tooltip').forEach(el => el.remove())

    // Create tooltip
    const tooltip = document.createElement('div')
    tooltip.className = 'job-tooltip'
    tooltip.style.cssText = `
      position: fixed;
      left: ${clickInfo.jsEvent.pageX + 10}px;
      top: ${clickInfo.jsEvent.pageY + 10}px;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      max-width: 400px;
      z-index: 1000;
      max-height: 80vh;
      overflow-y: auto;
    `

    tooltip.innerHTML = generateTooltipHTML(job, data.teams, hideInfo)

    document.body.appendChild(tooltip)

    // Add close button handler
    const closeBtn = tooltip.querySelector('.close-tooltip')
    if (closeBtn) {
      closeBtn.addEventListener('click', () => tooltip.remove())
    }

    // Auto-dismiss after 10 seconds
    setTimeout(() => {
      if (document.body.contains(tooltip)) {
        tooltip.remove()
      }
    }, 10000)

    // Close on outside click
    const handleClickOutside = (e) => {
      if (!tooltip.contains(e.target)) {
        tooltip.remove()
        document.removeEventListener('click', handleClickOutside)
      }
    }
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside)
    }, 100)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Job Calendar</h1>
      </div>

      {/* Controls */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Company Filter - only show if multiple companies */}
          {data.companies && data.companies.length > 1 && (
            <div className="flex items-center gap-2">
              <Label>Company:</Label>
              <Select
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value)}
                className="w-[200px]"
              >
                <option value="all">All Companies</option>
                {data.companies.map(company => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {/* Team Filter */}
          <div className="flex items-center gap-2">
            <Label>Team:</Label>
            <Select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="w-[200px]"
            >
              <option value="all">All Teams</option>
              {data.teams
                .filter(t => t.id !== '0')
                .map(team => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
            </Select>
          </div>

          {/* Date Picker */}
          <div className="flex items-center gap-2">
            <Label>Jump to date:</Label>
            <Input
              type="date"
              value={selectedDate}
              onChange={handleDateChange}
              className="w-[160px]"
            />
          </div>

          {/* Privacy Toggle */}
          <div className="flex items-center gap-2 ml-auto">
            <Switch
              id="hide-info"
              checked={hideInfo}
              onCheckedChange={setHideInfo}
            />
            <Label htmlFor="hide-info">Hide Sensitive Information</Label>
          </div>
        </div>
      </Card>

      {/* Calendar */}
      <Card className="p-4">
        <FullCalendar
          key={`job-calendar-${selectedDate}`}
          ref={calendarRef}
          plugins={[
            dayGridPlugin,
            timeGridPlugin,
            listPlugin,
            timelinePlugin,
            resourceTimelinePlugin,
            interactionPlugin
          ]}
          initialView="resourceTimelineDay"
          initialDate={selectedDate}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek,resourceTimelineDay'
          }}
          eventContent={(eventInfo) => {
            const { customerName, serviceType, address, timeRange, textColor } = eventInfo.event.extendedProps
            return (
              <div style={{ fontSize: '11px', padding: '2px', overflow: 'hidden', color: textColor }}>
                <div style={{ fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {customerName}
                </div>
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {serviceType}
                </div>
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.9 }}>
                  {address}
                </div>
                <div style={{ fontSize: '10px', opacity: 0.8 }}>
                  {timeRange}
                </div>
              </div>
            )
          }}
          slotMinTime="06:00:00"
          slotMaxTime="22:00:00"
          slotDuration="00:25:00"
          slotLabelInterval="00:50:00"
          allDaySlot={false}
          events={events}
          resources={resources}
          eventClick={handleEventClick}
          height="auto"
          nowIndicator={true}
          resourceAreaHeaderContent="Teams"
          resourceAreaWidth="200px"
          resourceLabelContent={(resourceInfo) => {
            const employees = resourceInfo.resource.extendedProps.employees || []
            return (
              <div style={{ padding: '4px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>
                  {resourceInfo.resource.title}
                </div>
                {employees.length > 0 && (
                  <div style={{ fontSize: '11px', color: '#666', lineHeight: '1.4' }}>
                    {employees.map((empName, idx) => (
                      <div key={idx}>{empName}</div>
                    ))}
                  </div>
                )}
              </div>
            )
          }}
          scrollTime={new Date().toTimeString().slice(0, 8)}
          datesSet={(dateInfo) => {
            // Reset scroll flag when view changes
            if (dateInfo.view.type.includes('timeline')) {
              hasScrolledToToday.current = false
            }
            // Only update selectedDate if user navigated manually (not programmatically)
            if (!isNavigatingProgrammatically.current) {
              const viewDate = dateInfo.start.toISOString().split('T')[0]
              setSelectedDate(viewDate)
            } else {
              // Reset flag after programmatic navigation completes
              isNavigatingProgrammatically.current = false
            }
          }}
        />
      </Card>
    </div>
  )
}

// Generate tooltip HTML for job details
function generateTooltipHTML(job, teams, hideInfo) {
  const teamNames = job.scheduledTeams
    .map(teamId => teams.find(t => t.id === teamId)?.name)
    .filter(Boolean)
    .join(', ')

  let html = `
    <div style="font-family: system-ui, -apple-system, sans-serif;">
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
        <h3 style="margin: 0; font-size: 16px; font-weight: 600;">${job.customerName}</h3>
        <button class="close-tooltip" style="border: none; background: none; cursor: pointer; font-size: 20px; line-height: 1; padding: 0; color: #64748b;">×</button>
      </div>

      <div style="display: grid; gap: 8px; font-size: 14px;">
        <div><strong>Service:</strong> ${job.serviceType}</div>
        <div><strong>Scope:</strong> ${job.scopeOfWork}</div>
        <div><strong>Team(s):</strong> ${teamNames}</div>
        <div><strong>Time:</strong> ${job.schedule.startTime} - ${job.schedule.endTime}</div>
        <div><strong>Address:</strong> ${job.address}</div>
  `

  // Get FeatureToggles from data
  const featureToggles = data?.metadata?.featureToggles

  // Add bill rate if not hidden
  if (!shouldHideField(viewMode, hideInfo, 'billRate', featureToggles) && job.billRate) {
    html += `<div><strong>Bill Rate:</strong> $${job.billRate.toFixed(2)}</div>`
  }

  // Add contact info if not hidden
  if (!shouldHideField(viewMode, hideInfo, 'contactInfo', featureToggles)) {
    if (job.contactInfo.phone) {
      html += `<div><strong>Phone:</strong> ${job.contactInfo.phone}</div>`
    }
    if (job.contactInfo.email) {
      html += `<div><strong>Email:</strong> ${job.contactInfo.email}</div>`
    }
  }

  // Add tags
  if (job.tags && job.tags.length > 0) {
    const tagHTML = job.tags.map(tag =>
      `<span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin-right: 4px; background-color: ${tag.color}20; color: ${tag.color};">
        ${tag.description}
      </span>`
    ).join('')
    html += `<div style="margin-top: 8px;"><strong>Tags:</strong><br/>${tagHTML}</div>`
  }

  // Add instructions (with HTML rendering)
  const instructions = [
    { label: 'Event Instructions', value: job.eventInstructions },
    { label: 'Special Instructions', value: job.specialInstructions },
    { label: 'Pet Instructions', value: job.petInstructions },
    { label: 'Directions', value: job.directions },
    { label: 'Special Equipment', value: job.specialEquipment },
    { label: 'Waste Info', value: job.wasteInfo },
  ]

  // Add sensitive instruction fields only if not hidden
  if (!shouldHideField(viewMode, hideInfo, null, featureToggles) && job.accessInformation) {
    instructions.push({ label: 'Access Information', value: job.accessInformation })
  }

  if (!shouldHideField(viewMode, hideInfo, null, featureToggles) && job.internalMemo) {
    instructions.push({ label: 'Internal Memo', value: job.internalMemo })
  }

  instructions.forEach(({ label, value }) => {
    if (value && value.trim()) {
      html += `
        <div style="margin-top: 8px;">
          <strong>${label}:</strong>
          <div style="margin-top: 4px; padding: 8px; background-color: #f8fafc; border-radius: 4px; font-size: 13px;">
            ${value}
          </div>
        </div>
      `
    }
  })

  html += `</div></div>`

  return html
}
