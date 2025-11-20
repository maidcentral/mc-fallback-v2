import { useParams, useNavigate } from 'react-router-dom'
import { useRef, useState } from 'react'
import { format } from 'date-fns'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { Card } from './ui/card'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Switch, Label } from './ui/switch'
import { shouldHideField } from '../utils/userPreferences'

export default function JobView({ data, viewMode, hideInfo, setHideInfo }) {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [isExporting, setIsExporting] = useState(false)
  const contentRef = useRef(null)

  if (!data) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Job Details</h1>
        <Alert>
          <AlertDescription>
            No data loaded. Please upload a JSON file on the Admin page.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // Find the job
  const job = data.jobs.find(j => j.id === jobId)

  if (!job) {
    return (
      <div className="space-y-6">
        <Button onClick={() => navigate(-1)} variant="outline">
          ← Back
        </Button>
        <Alert>
          <AlertDescription>
            Job not found.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  // Get assigned teams
  const assignedTeams = data.teams.filter(t => job.scheduledTeams.includes(t.id))

  // Get assigned employees
  const assignedEmployees = data.employees.filter(emp =>
    emp.shifts.some(shift => shift.jobId === job.id)
  )

  // Export as PDF
  const handleExportPDF = async () => {
    if (!contentRef.current) return

    setIsExporting(true)
    try {
      const canvas = await html2canvas(contentRef.current, {
        scale: 2,
        logging: false,
        useCORS: true
      })

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      })

      const imgWidth = 210
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight)

      const filename = `Job_${job.customerName.replace(/\s+/g, '_')}_${job.schedule.date}.pdf`
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
    if (!contentRef.current) return

    setIsExporting(true)
    try {
      const canvas = await html2canvas(contentRef.current, {
        scale: 2,
        logging: false,
        useCORS: true
      })

      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `Job_${job.customerName.replace(/\s+/g, '_')}_${job.schedule.date}.png`
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
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <Button onClick={() => navigate(-1)} variant="outline">
          ← Back
        </Button>

        <div className="flex items-center gap-4">
          {/* Privacy Toggle */}
          <div className="flex items-center gap-2">
            <Switch
              id="hide-info-job"
              checked={hideInfo}
              onCheckedChange={setHideInfo}
            />
            <Label htmlFor="hide-info-job">Hide Sensitive Information</Label>
          </div>

          {/* Export Buttons */}
          <div className="flex gap-2">
            <Button
              onClick={handleExportPDF}
              disabled={isExporting}
              size="sm"
            >
              {isExporting ? 'Exporting...' : 'Export PDF'}
            </Button>
            <Button
              onClick={handleExportPNG}
              disabled={isExporting}
              variant="outline"
              size="sm"
            >
              {isExporting ? 'Exporting...' : 'Export PNG'}
            </Button>
          </div>
        </div>
      </div>

      {/* Job Details */}
      <Card className="p-6">
        <div ref={contentRef} className="bg-white p-6">
          {/* Customer & Service Type */}
          <div className="mb-6 pb-4 border-b">
            <h1 className="text-3xl font-bold mb-2">{job.customerName}</h1>
            <p className="text-xl text-gray-600">{job.serviceType}</p>

            {/* Team Badges */}
            {assignedTeams.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {assignedTeams.map(team => (
                  <Badge
                    key={team.id}
                    style={{
                      backgroundColor: team.color,
                      color: '#ffffff'
                    }}
                  >
                    {team.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Schedule Section */}
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
              📅 Schedule
            </h2>
            <div className="space-y-2 text-sm">
              <p>
                <strong>Date:</strong>{' '}
                {format(new Date(job.schedule.date + 'T12:00:00'), 'EEEE, MMMM d, yyyy')}
              </p>
              <p>
                <strong>Time:</strong> {job.schedule.startTime} - {job.schedule.endTime}
              </p>
            </div>
          </div>

          {/* Address Section */}
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
              📍 Address
            </h2>
            <p className="text-sm">{job.address}</p>
          </div>

          {/* Assigned Employees Section */}
          {assignedEmployees.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
                👥 Assigned Employees
              </h2>
              <ul className="space-y-2">
                {assignedEmployees.map(emp => (
                  <li key={emp.id} className="text-sm flex items-center gap-2">
                    <span className="font-medium">{emp.name}</span>
                    <span className="text-gray-600">({emp.position.name})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Instructions Section */}
          {renderJobInstructions(job, viewMode, hideInfo, data.metadata?.featureToggles)}

          {/* Tags Section */}
          {job.tags && job.tags.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
                🏷️ Tags
              </h2>
              <div className="flex flex-wrap gap-2">
                {job.tags.map((tag, idx) => (
                  <Badge key={idx} variant="outline">
                    {tag.description || tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Contact Information Section */}
          {!shouldHideField(viewMode, hideInfo, 'contactInfo', data.metadata?.featureToggles) && job.contactInfo && (job.contactInfo.phone || job.contactInfo.email) && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
                📞 Contact Information
              </h2>
              <div className="space-y-1 text-sm">
                {job.contactInfo.phone && (
                  <p><strong>Phone:</strong> {job.contactInfo.phone}</p>
                )}
                {job.contactInfo.email && (
                  <p><strong>Email:</strong> {job.contactInfo.email}</p>
                )}
              </div>
            </div>
          )}

          {/* Bill Rate Section */}
          {!shouldHideField(viewMode, hideInfo, 'billRate', data.metadata?.featureToggles) && job.billRate && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
                💰 Bill Rate
              </h2>
              <p className="text-sm">${job.billRate}</p>
            </div>
          )}

          {/* Footer */}
          <div className="mt-8 pt-4 border-t text-center text-sm text-gray-500">
            Generated from MaidCentral Backup System
          </div>
        </div>
      </Card>
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
    <div className="mb-6">
      <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
        📋 Instructions
      </h2>
      <div className="space-y-3 text-sm">
        {instructions.map((inst, idx) => (
          <div key={idx} className="border-l-2 border-gray-300 pl-3">
            <strong className="text-xs text-gray-500 uppercase">{inst.label}</strong>
            <div
              className="mt-1 text-gray-700"
              dangerouslySetInnerHTML={{ __html: inst.content }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
