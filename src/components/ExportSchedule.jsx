import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { Card } from './ui/card'
import { Alert, AlertDescription } from './ui/alert'
import { Select } from './ui/select'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import { Switch, Label } from './ui/switch'
import { shouldHideField } from '../utils/userPreferences'

export default function ExportSchedule({ data, viewMode, hideInfo, setHideInfo, selectedDate, setSelectedDate, selectedCompany, setSelectedCompany }) {
  const navigate = useNavigate()
  const [selectedTeam, setSelectedTeam] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const previewRef = useRef(null)

  if (!data) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Export Schedule</h1>
        <Alert>
          <AlertDescription>
            No data loaded. Please upload a JSON file on the Admin page.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // Get team data
  const teams = data.teams.filter(t => t.id !== '0')
  const selectedTeamData = teams.find(t => t.id === selectedTeam)

  // Filter employees for selected team and date
  const teamEmployees = selectedTeam ? data.employees.filter(emp => {
    if (emp.teamId !== selectedTeam) return false

    // Filter by company - employee must have at least one shift for a job in the selected company
    if (selectedCompany !== 'all') {
      const hasShiftInCompany = emp.shifts.some(shift => {
        const job = data.jobs.find(j => j.id === shift.jobId)
        return job && job.companyId === selectedCompany && shift.date === selectedDate
      })
      if (!hasShiftInCompany) return false
    }

    return emp.shifts?.some(shift => shift.date === selectedDate)
  }) : []

  // Filter jobs for selected team and date
  const teamJobs = selectedTeam ? data.jobs.filter(job => {
    if (job.schedule.date !== selectedDate) return false
    if (!job.scheduledTeams.includes(selectedTeam)) return false

    // Filter by company
    if (selectedCompany !== 'all' && job.companyId !== selectedCompany) return false

    return true
  }) : []

  // Calculate total hours for an employee
  const calculateHours = (employee) => {
    const shiftsToday = employee.shifts.filter(shift => shift.date === selectedDate)
    let totalHours = 0
    shiftsToday.forEach(shift => {
      const [startHour, startMin] = shift.startTime.split(':').map(Number)
      const [endHour, endMin] = shift.endTime.split(':').map(Number)
      const hours = (endHour - startHour) + (endMin - startMin) / 60
      totalHours += hours
    })
    return totalHours.toFixed(2)
  }

  // Export as PDF
  const handleExportPDF = async () => {
    if (!previewRef.current || !selectedTeamData) return

    setIsExporting(true)
    try {
      // Capture the preview div as canvas
      const canvas = await html2canvas(previewRef.current, {
        scale: 2,
        logging: false,
        useCORS: true
      })

      // Convert canvas to image
      const imgData = canvas.toDataURL('image/png')

      // Create PDF
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      })

      const imgWidth = 210 // A4 width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight)

      // Generate filename
      const filename = `${selectedTeamData.name.replace(/\s+/g, '_')}_Schedule_${selectedDate}.pdf`
      pdf.save(filename)
    } catch (error) {
      console.error('Error generating PDF:', error)
      alert('Error generating PDF. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  // Export as PNG
  const handleExportPNG = async () => {
    if (!previewRef.current || !selectedTeamData) return

    setIsExporting(true)
    try {
      // Capture the preview div as canvas
      const canvas = await html2canvas(previewRef.current, {
        scale: 2,
        logging: false,
        useCORS: true
      })

      // Convert canvas to blob and download
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `${selectedTeamData.name.replace(/\s+/g, '_')}_Schedule_${selectedDate}.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
        setIsExporting(false)
      })
    } catch (error) {
      console.error('Error generating PNG:', error)
      alert('Error generating PNG. Please try again.')
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Export Schedule</h1>
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

          {/* Team Selection */}
          <div className="flex items-center gap-2">
            <Label>Team:</Label>
            <Select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="w-[200px]"
            >
              <option value="">Select Team</option>
              {teams.map(team => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </Select>
          </div>

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

          {/* Privacy Toggle */}
          <div className="flex items-center gap-2">
            <Switch
              id="hide-info-export"
              checked={hideInfo}
              onCheckedChange={setHideInfo}
            />
            <Label htmlFor="hide-info-export">Hide Sensitive Information</Label>
          </div>

          {/* Export Buttons */}
          {selectedTeam && (
            <div className="flex gap-2 ml-auto">
              <Button
                onClick={handleExportPDF}
                disabled={isExporting || teamEmployees.length === 0}
              >
                {isExporting ? 'Exporting...' : 'Export PDF'}
              </Button>
              <Button
                onClick={handleExportPNG}
                disabled={isExporting || teamEmployees.length === 0}
                variant="outline"
              >
                {isExporting ? 'Exporting...' : 'Export PNG'}
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Preview */}
      {selectedTeam && selectedTeamData ? (
        <Card className="p-6">
          <div ref={previewRef} className="bg-white p-8">
            {/* Header */}
            <div className="mb-6 pb-4 border-b-2">
              <h2 className="text-2xl font-bold" style={{ color: selectedTeamData.color }}>
                {selectedTeamData.name}
              </h2>
              <p className="text-lg text-gray-600 mt-1">
                Schedule for {format(new Date(selectedDate + 'T12:00:00'), 'EEEE, MMMM d, yyyy')}
              </p>
            </div>

            {/* Team Members */}
            {teamEmployees.length > 0 ? (
              <div className="mb-6">
                <h3 className="text-xl font-semibold mb-3">Team Members</h3>
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border p-2 text-left">Name</th>
                      <th className="border p-2 text-left">Position</th>
                      <th className="border p-2 text-center">Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamEmployees.map(emp => (
                      <tr key={emp.id}>
                        <td className="border p-2">{emp.name}</td>
                        <td className="border p-2">{emp.position.name}</td>
                        <td className="border p-2 text-center">{calculateHours(emp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mb-6">
                <Alert>
                  <AlertDescription>
                    No employees scheduled for this team on this date.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {/* Jobs */}
            {teamJobs.length > 0 ? (
              <div className="mb-6">
                <h3 className="text-xl font-semibold mb-3">
                  Jobs ({teamJobs.length})
                </h3>
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

                        {!shouldHideField(viewMode, hideInfo, 'contactInfo', data.metadata?.featureToggles) && job.contactInfo && (job.contactInfo.phone || job.contactInfo.email) && (
                          <p>
                            <strong>Contact:</strong>{' '}
                            {job.contactInfo.phone && `Phone: ${job.contactInfo.phone}`}
                            {job.contactInfo.phone && job.contactInfo.email && ', '}
                            {job.contactInfo.email && `Email: ${job.contactInfo.email}`}
                          </p>
                        )}

                        {!shouldHideField(viewMode, hideInfo, 'billRate', data.metadata?.featureToggles) && job.billRate && (
                          <p><strong>Rate:</strong> ${job.billRate}</p>
                        )}

                        {job.tags && job.tags.length > 0 && (
                          <p><strong>Tags:</strong> {job.tags.map(tag => tag.description || tag).join(', ')}</p>
                        )}

                        {renderJobInstructions(job, viewMode, hideInfo, data.metadata?.featureToggles)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mb-6">
                <Alert>
                  <AlertDescription>
                    No jobs scheduled for this team on this date.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {/* Footer */}
            <div className="mt-8 pt-4 border-t text-center text-sm text-gray-500">
              Generated from MaidCentral Backup System
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-6">
          <Alert>
            <AlertDescription>
              Please select a team and date to preview the schedule.
            </AlertDescription>
          </Alert>
        </Card>
      )}
    </div>
  )
}

// Helper function to render job instructions with privacy filtering
function renderJobInstructions(job, viewMode, hideInfo, featureToggles) {
  const hideField = shouldHideField(viewMode, hideInfo, null, featureToggles)

  // Build instructions array with all non-sensitive instructions
  const instructions = []

  if (job.eventInstructions) {
    instructions.push({ label: 'Event', content: job.eventInstructions })
  }
  if (job.specialInstructions) {
    instructions.push({ label: 'Special', content: job.specialInstructions })
  }
  if (job.petInstructions) {
    instructions.push({ label: 'Pets', content: job.petInstructions })
  }
  if (job.directions) {
    instructions.push({ label: 'Directions', content: job.directions })
  }
  if (job.specialEquipment) {
    instructions.push({ label: 'Equipment', content: job.specialEquipment })
  }
  if (job.wasteInfo) {
    instructions.push({ label: 'Waste', content: job.wasteInfo })
  }

  // Add sensitive instructions only in office view
  if (!hideField) {
    if (job.accessInformation) {
      instructions.push({ label: 'Access', content: job.accessInformation })
    }
    if (job.internalMemo) {
      instructions.push({ label: 'Internal Memo', content: job.internalMemo })
    }
  }

  if (instructions.length === 0) {
    return null
  }

  return (
    <div className="mt-2 pt-2 border-t">
      <strong>Instructions:</strong>
      <div className="text-sm mt-1 text-gray-700 space-y-1">
        {instructions.map((inst, idx) => (
          <div key={idx}>
            <strong className="text-xs text-gray-500">{inst.label}:</strong>{' '}
            <span dangerouslySetInnerHTML={{ __html: inst.content }} />
          </div>
        ))}
      </div>
    </div>
  )
}
