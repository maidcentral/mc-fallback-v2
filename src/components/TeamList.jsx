import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Card } from './ui/card'
import { Alert, AlertDescription } from './ui/alert'
import { Select } from './ui/select'
import { Input } from './ui/input'
import { Label } from './ui/switch'

export default function TeamList({ data, selectedDate, setSelectedDate, selectedCompany, setSelectedCompany }) {
  const navigate = useNavigate()

  if (!data) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Teams</h1>
        <Alert>
          <AlertDescription>
            No data loaded. Please upload a JSON file on the Admin page.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // Get teams (exclude Unassigned)
  const teams = data.teams.filter(t => t.id !== '0')

  // Calculate stats for each team
  const getTeamStats = (teamId) => {
    // Get employees for this team
    const teamEmployees = data.employees.filter(emp => {
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

    // Get jobs for this team
    const teamJobs = data.jobs.filter(job => {
      if (job.schedule.date !== selectedDate) return false
      if (!job.scheduledTeams.includes(teamId)) return false
      if (selectedCompany !== 'all' && job.companyId !== selectedCompany) return false
      return true
    })

    // Calculate total hours
    let totalHours = 0
    teamEmployees.forEach(emp => {
      const shiftsToday = emp.shifts.filter(shift => shift.date === selectedDate)
      shiftsToday.forEach(shift => {
        const [startHour, startMin] = shift.startTime.split(':').map(Number)
        const [endHour, endMin] = shift.endTime.split(':').map(Number)
        const hours = (endHour - startHour) + (endMin - startMin) / 60
        totalHours += hours
      })
    })

    return {
      memberCount: teamEmployees.length,
      jobCount: teamJobs.length,
      totalHours: totalHours.toFixed(1)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Teams</h1>
      </div>

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

      {/* Teams Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {teams.map(team => {
          const stats = getTeamStats(team.id)
          return (
            <Card
              key={team.id}
              className="p-6 hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => navigate(`/teams/${team.id}`)}
            >
              {/* Team Name with Color Bar */}
              <div className="mb-4">
                <div
                  className="h-1 w-full rounded-full mb-3"
                  style={{ backgroundColor: team.color }}
                />
                <h3 className="text-xl font-bold" style={{ color: team.color }}>
                  {team.name}
                </h3>
              </div>

              {/* Stats */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Members:</span>
                  <span className="font-semibold">{stats.memberCount}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Jobs:</span>
                  <span className="font-semibold">{stats.jobCount}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Total Hours:</span>
                  <span className="font-semibold">{stats.totalHours}</span>
                </div>
              </div>

              {/* Date Display */}
              <div className="mt-4 pt-4 border-t text-xs text-gray-500 text-center">
                {format(new Date(selectedDate + 'T12:00:00'), 'MMM d, yyyy')}
              </div>
            </Card>
          )
        })}
      </div>

      {teams.length === 0 && (
        <Alert>
          <AlertDescription>
            No teams found in the loaded data.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
