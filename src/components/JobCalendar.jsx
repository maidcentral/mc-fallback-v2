import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
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

export default function JobCalendar({ data, viewMode, hideInfo, setHideInfo, selectedDate, setSelectedDate, selectedCompany, setSelectedCompany, selectedTeam, setSelectedTeam }) {
  const navigate = useNavigate()
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

  // Handle event click - navigate to job details page
  const handleEventClick = (clickInfo) => {
    const job = clickInfo.event.extendedProps.job
    navigate(`/jobs/${job.id}`)
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
