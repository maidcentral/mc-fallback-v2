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

export default function EmployeeCalendar({ data, viewMode, hideInfo, setHideInfo, selectedDate, setSelectedDate, selectedCompany, setSelectedCompany, selectedTeam, setSelectedTeam }) {
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
        <h1 className="text-3xl font-bold tracking-tight">Employee Schedule</h1>
        <Alert>
          <AlertDescription>
            No data loaded. Please upload a JSON file on the Admin page.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // Prepare resources for timeline views (employees as rows)
  const employees = data.employees.filter(emp => {
    // Always exclude Team 0 (Unassigned)
    if (emp.teamId === '0') return false

    // Filter by team
    if (selectedTeam !== 'all' && emp.teamId !== selectedTeam) return false

    // Filter by company - employee must have at least one shift for a job in the selected company
    if (selectedCompany !== 'all') {
      const hasShiftInCompany = emp.shifts.some(shift => {
        const job = data.jobs.find(j => j.id === shift.jobId)
        return job && job.companyId === selectedCompany
      })
      if (!hasShiftInCompany) return false
    }

    return true
  })

  // Sort employees by team sortOrder, then alphabetically by name
  const sortedEmployees = [...employees].sort((a, b) => {
    const teamA = data.teams.find(t => t.id === a.teamId)
    const teamB = data.teams.find(t => t.id === b.teamId)

    // First, sort by team sortOrder
    const sortOrderA = teamA?.sortOrder ?? 999
    const sortOrderB = teamB?.sortOrder ?? 999
    if (sortOrderA !== sortOrderB) {
      return sortOrderA - sortOrderB
    }

    // Then, sort alphabetically by name within the same team
    return a.name.localeCompare(b.name)
  })

  const resources = sortedEmployees.map(emp => {
    const team = data.teams.find(t => t.id === emp.teamId)
    return {
      id: emp.id,
      title: `${emp.name} (${emp.position.name})`,
      eventColor: team?.color || '#CCCCCC',
      extendedProps: {
        teamName: team?.name || 'Unknown',
        position: emp.position.name
      }
    }
  })

  // Transform employee shifts to calendar events
  const events = sortedEmployees.flatMap(emp => {
    const team = data.teams.find(t => t.id === emp.teamId)
    const teamColor = team?.color || '#CCCCCC'
    const textColor = getContrastTextColor(teamColor)

    return emp.shifts
      .filter(shift => {
        // Filter shifts by company
        if (selectedCompany !== 'all') {
          const job = data.jobs.find(j => j.id === shift.jobId)
          return job && job.companyId === selectedCompany
        }
        return true
      })
      .map(shift => {
        // Find the job for this shift to get more details
        const job = data.jobs.find(j => j.id === shift.jobId)
        const customerName = job?.customerName || 'Unknown Customer'
        const addressShort = job?.address ? job.address.split(',')[0] : ''

        return {
          id: `${emp.id}-${shift.jobId}`,
          start: `${shift.date}T${shift.startTime}`,
          end: `${shift.date}T${shift.endTime}`,
          title: customerName,
          backgroundColor: teamColor,
          borderColor: teamColor,
          textColor: textColor,
          resourceId: emp.id,
          extendedProps: {
            employee: emp,
            shift,
            job,
            customerName,
            address: addressShort,
            timeRange: `${shift.startTime}-${shift.endTime}`,
            textColor
          }
        }
      })
  })

  // Handle event click - navigate to job details page
  const handleEventClick = (clickInfo) => {
    const job = clickInfo.event.extendedProps.job
    if (job) {
      navigate(`/jobs/${job.id}`)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Employee Schedule</h1>
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
              id="hide-info-emp"
              checked={hideInfo}
              onCheckedChange={setHideInfo}
            />
            <Label htmlFor="hide-info-emp">Hide sensitive info</Label>
          </div>
        </div>
      </Card>

      {/* Calendar */}
      <Card className="p-4">
        <FullCalendar
          key={`employee-calendar-${selectedDate}`}
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
            const { customerName, address, timeRange, textColor } = eventInfo.event.extendedProps
            return (
              <div style={{ fontSize: '11px', padding: '2px', overflow: 'hidden', color: textColor }}>
                <div style={{ fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {customerName}
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
          resourceAreaHeaderContent="Employees"
          resourceAreaWidth="250px"
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
