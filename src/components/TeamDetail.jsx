import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Card } from './ui/card'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import { Select } from './ui/select'
import { Label } from './ui/switch'
import { shouldHideField } from '../utils/userPreferences'

export default function TeamDetail({ data, viewMode, hideInfo, selectedDate, setSelectedDate, selectedCompany, setSelectedCompany }) {
  const { teamId } = useParams()
  const navigate = useNavigate()

  if (!data) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Team Details</h1>
        <Alert>
          <AlertDescription>
            No data loaded. Please upload a JSON file on the Admin page.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // Find the team
  const team = data.teams.find(t => t.id === teamId)

  if (!team) {
    return (
      <div className="space-y-6">
        <Button onClick={() => navigate('/teams')} variant="outline">
          ← Back to Teams
        </Button>
        <Alert>
          <AlertDescription>
            Team not found.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // Get team members
  const teamMembers = data.employees.filter(emp => {
    if (emp.teamId !== teamId) return false

    // Filter by company
    if (selectedCompany !== 'all') {
      const hasShiftInCompany = emp.shifts.some(shift => {
        const job = data.jobs.find(j => j.id === shift.jobId)
        return job && job.companyId === selectedCompany && shift.date === selectedDate
      })
      if (!hasShiftInCompany) return false
    }

    return emp.shifts?.some(shift => shift.date === selectedDate)
  })

  // Get team jobs
  const teamJobs = data.jobs.filter(job => {
    if (job.schedule.date !== selectedDate) return false
    if (!job.scheduledTeams.includes(teamId)) return false
    if (selectedCompany !== 'all' && job.companyId !== selectedCompany) return false
    return true
  })

  // Calculate total hours
  let totalHours = 0
  teamMembers.forEach(emp => {
    const shiftsToday = emp.shifts.filter(shift => shift.date === selectedDate)
    shiftsToday.forEach(shift => {
      const [startHour, startMin] = shift.startTime.split(':').map(Number)
      const [endHour, endMin] = shift.endTime.split(':').map(Number)
      const hours = (endHour - startHour) + (endMin - startMin) / 60
      totalHours += hours
    })
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button onClick={() => navigate('/teams')} variant="outline">
          ← Back to Teams
        </Button>
      </div>

      {/* Team Header Card */}
      <Card className="p-6">
        <div className="flex items-center gap-4 mb-4">
          <div
            className="w-2 h-16 rounded-full"
            style={{ backgroundColor: team.color }}
          />
          <div>
            <h1 className="text-3xl font-bold" style={{ color: team.color }}>
              {team.name}
            </h1>
            <p className="text-gray-600 mt-1">
              {format(new Date(selectedDate + 'T12:00:00'), 'EEEE, MMMM d, yyyy')}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t">
          <div className="text-center">
            <p className="text-2xl font-bold">{teamMembers.length}</p>
            <p className="text-sm text-gray-600">Members</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{teamJobs.length}</p>
            <p className="text-sm text-gray-600">Jobs</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{totalHours.toFixed(1)}</p>
            <p className="text-sm text-gray-600">Total Hours</p>
          </div>
        </div>
      </Card>

      {/* Filters */}
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

          {/* Date Selection */}
          <div className="flex items-center gap-2">
            <Label>Date:</Label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-[160px]"
            />
          </div>
        </div>
      </Card>

      {/* Team Members */}
      {teamMembers.length > 0 ? (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Team Members</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {teamMembers.map(emp => {
              const shiftsToday = emp.shifts.filter(shift => shift.date === selectedDate)
              let empHours = 0
              shiftsToday.forEach(shift => {
                const [startHour, startMin] = shift.startTime.split(':').map(Number)
                const [endHour, endMin] = shift.endTime.split(':').map(Number)
                const hours = (endHour - startHour) + (endMin - startMin) / 60
                empHours += hours
              })

              return (
                <div key={emp.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{emp.name}</p>
                    <p className="text-sm text-gray-600">{emp.position.name}</p>
                  </div>
                  <Badge variant="outline">{empHours.toFixed(1)}h</Badge>
                </div>
              )
            })}
          </div>
        </Card>
      ) : (
        <Alert>
          <AlertDescription>
            No team members scheduled for this date.
          </AlertDescription>
        </Alert>
      )}

      {/* Jobs */}
      {teamJobs.length > 0 ? (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Jobs ({teamJobs.length})</h2>
          <div className="space-y-4">
            {teamJobs.map(job => (
              <div
                key={job.id}
                className="border rounded-lg p-4 hover:shadow-md hover:border-gray-400 transition-all cursor-pointer"
                onClick={() => navigate(`/jobs/${job.id}`)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="font-semibold text-lg hover:text-blue-600">{job.customerName}</h4>
                    <p className="text-sm text-gray-600">{job.serviceType}</p>
                  </div>
                  <Badge>{job.schedule.startTime} - {job.schedule.endTime}</Badge>
                </div>

                <div className="text-sm space-y-1">
                  <p><strong>Address:</strong> {job.address}</p>

                  {job.contactInfo && (
                    (!shouldHideField(viewMode, hideInfo, 'customerPhone', data.metadata?.featureToggles) && job.contactInfo.phone) ||
                    (!shouldHideField(viewMode, hideInfo, 'customerEmail', data.metadata?.featureToggles) && job.contactInfo.email)
                  ) && (
                    <p>
                      <strong>Contact:</strong>{' '}
                      {!shouldHideField(viewMode, hideInfo, 'customerPhone', data.metadata?.featureToggles) && job.contactInfo.phone && `Phone: ${job.contactInfo.phone}`}
                      {!shouldHideField(viewMode, hideInfo, 'customerPhone', data.metadata?.featureToggles) && job.contactInfo.phone &&
                       !shouldHideField(viewMode, hideInfo, 'customerEmail', data.metadata?.featureToggles) && job.contactInfo.email && ', '}
                      {!shouldHideField(viewMode, hideInfo, 'customerEmail', data.metadata?.featureToggles) && job.contactInfo.email && `Email: ${job.contactInfo.email}`}
                    </p>
                  )}

                  {!shouldHideField(viewMode, hideInfo, 'billRate', data.metadata?.featureToggles) && job.billRate && (
                    <p><strong>Rate:</strong> ${job.billRate}</p>
                  )}

                  {job.tags && job.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {job.tags.map((tag, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {tag.description || tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Alert>
          <AlertDescription>
            No jobs scheduled for this team on this date.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
