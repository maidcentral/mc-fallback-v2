import { useParams, useNavigate } from 'react-router-dom'
import { useRef, useState } from 'react'
import { format } from 'date-fns'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { Card } from './ui/card'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { shouldHideField } from '../utils/userPreferences'

export default function JobView({ data, viewMode }) {
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
          {renderJobInstructions(job, viewMode, data.metadata?.featureToggles)}

          {/* Tags Section */}
          {job.tags && job.tags.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
                🏷️ Tags
              </h2>
              <div className="flex flex-wrap gap-2">
                {job.tags.map((tag, idx) => (
                  <Badge
                    key={idx}
                    variant="outline"
                    style={{
                      borderColor: tag.color || '#999999',
                      color: tag.color || '#999999'
                    }}
                  >
                    {tag.description || tag}
                    {tag.type && (
                      <span className="ml-1 text-[10px] opacity-60">
                        ({tag.type})
                      </span>
                    )}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Rooms Section - Grouped by Type */}
          {job.rooms && job.rooms.length > 0 && (() => {
            // Group rooms by type
            const roomsByType = job.rooms.reduce((acc, room) => {
              const type = room.type || 'Other'
              if (!acc[type]) {
                acc[type] = []
              }
              acc[type].push(room)
              return acc
            }, {})

            // Find rooms needing DC based on DC code logic:
            // - "always" → always highlight
            // - "never" → never highlight
            // - "rotate" or other → highlight oldest by date
            const roomsNeedingDC = {}
            Object.keys(roomsByType).forEach(type => {
              const needsDC = []

              roomsByType[type].forEach(room => {
                const dcCode = room.deepCleanCode ? room.deepCleanCode.toLowerCase() : ''

                // DC Code "always" - always highlight
                if (dcCode === 'always') {
                  needsDC.push(room)
                }
                // DC Code "never" - never highlight (skip)
                else if (dcCode === 'never') {
                  // Do nothing
                }
                // DC Code "rotate" or other - use oldest date logic
                else if (room.lastDeepCleanDate) {
                  // Add to candidate list for oldest check
                  if (!needsDC.some(r => r.deepCleanCode && r.deepCleanCode.toLowerCase() === 'always')) {
                    // Only track oldest if we haven't already found an "always" room
                    if (needsDC.length === 0 || new Date(room.lastDeepCleanDate) < new Date(needsDC[0].lastDeepCleanDate)) {
                      needsDC.splice(0, needsDC.length, room) // Replace with older room
                    }
                  }
                }
              })

              roomsNeedingDC[type] = needsDC
            })

            // Define order for room types
            const typeOrder = ['Wet', 'Dry', 'Other']
            const sortedTypes = typeOrder.filter(type => roomsByType[type])

            return (
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
                  🏠 Rooms ({job.rooms.length})
                </h2>

                {sortedTypes.map(type => {
                  const needsDCRooms = roomsNeedingDC[type] || []

                  return (
                    <div key={type} className="mb-4">
                      <h3 className="text-sm font-semibold text-gray-600 mb-2">{type} Rooms</h3>
                      <div className="space-y-2">
                        {roomsByType[type].map((room, idx) => {
                          const needsDC = needsDCRooms.some(r =>
                            r.name === room.name &&
                            r.lastDeepCleanDate === room.lastDeepCleanDate &&
                            r.deepCleanCode === room.deepCleanCode
                          )

                          return (
                            <div
                              key={idx}
                              className={`border-l-2 pl-3 text-sm ${
                                needsDC
                                  ? 'border-orange-500 bg-orange-50'
                                  : 'border-gray-300'
                              }`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex items-center gap-2">
                                  <strong className="text-gray-700">{room.name}</strong>
                                  {needsDC && (
                                    <span className="text-xs bg-orange-500 text-white px-2 py-0.5 rounded font-semibold">
                                      NEEDS DC
                                    </span>
                                  )}
                                </div>
                                {!shouldHideField(viewMode, 'roomRate', data.metadata?.featureToggles) && room.fee > 0 && (
                                  <span className="text-gray-600 font-medium">${room.fee.toFixed(2)}</span>
                                )}
                              </div>
                              {room.detailsOfWork && (
                                <p className="text-gray-600 mt-1">{room.detailsOfWork}</p>
                              )}
                              {(room.lastDeepCleanDate || room.deepCleanCode) && (
                                <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                                  {room.lastDeepCleanDate && (
                                    <p>
                                      <strong>Last DC:</strong> {format(new Date(room.lastDeepCleanDate), 'MMM d, yyyy')}
                                    </p>
                                  )}
                                  {room.deepCleanCode && (
                                    <p>
                                      <strong>DC Code:</strong> {room.deepCleanCode}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}

          {/* Contact Information Section */}
          {job.contactInfo && (
            (!shouldHideField(viewMode, 'customerPhone', data.metadata?.featureToggles) && job.contactInfo.phone) ||
            (!shouldHideField(viewMode, 'customerEmail', data.metadata?.featureToggles) && job.contactInfo.email)
          ) && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
                📞 Contact Information
              </h2>
              <div className="space-y-1 text-sm">
                {!shouldHideField(viewMode, 'customerPhone', data.metadata?.featureToggles) && job.contactInfo.phone && (
                  <p><strong>Phone:</strong> {job.contactInfo.phone}</p>
                )}
                {!shouldHideField(viewMode, 'customerEmail', data.metadata?.featureToggles) && job.contactInfo.email && (
                  <p><strong>Email:</strong> {job.contactInfo.email}</p>
                )}
              </div>
            </div>
          )}

          {/* Bill Rate Section */}
          {!shouldHideField(viewMode, 'billRate', data.metadata?.featureToggles) && job.billRate && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
                💰 Bill Rate
              </h2>
              <p className="text-sm">${job.billRate.toFixed(2)}</p>
            </div>
          )}

          {/* Fee Split Rate Section */}
          {!shouldHideField(viewMode, 'feeSplitRate', data.metadata?.featureToggles) && (job.baseFee || job.serviceSetRateMods?.length > 0 || job.jobRateMods?.length > 0) && (() => {
            // Calculate fee split rate (sum of amounts where FeeSplit is true)
            let feeSplitTotal = 0
            if (job.baseFee?.FeeSplit) {
              feeSplitTotal += job.baseFee.Amount || 0
            }
            if (job.serviceSetRateMods) {
              job.serviceSetRateMods.forEach(mod => {
                if (mod.FeeSplit) {
                  feeSplitTotal += mod.Amount || 0
                }
              })
            }
            if (job.jobRateMods) {
              job.jobRateMods.forEach(mod => {
                if (mod.FeeSplit) {
                  feeSplitTotal += mod.Amount || 0
                }
              })
            }
            return feeSplitTotal > 0 ? (
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
                  🤝 Fee Split Rate
                </h2>
                <p className="text-sm">${feeSplitTotal.toFixed(2)}</p>
              </div>
            ) : null
          })()}

          {/* Rate Breakdown Section */}
          {(job.baseFee || job.serviceSetRateMods?.length > 0 || job.jobRateMods?.length > 0) && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-3 flex items-center gap-2">
                📋 Rate Breakdown
              </h2>

              {/* Base Fee */}
              {job.baseFee && (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-gray-600 mb-2">Base Fee</h3>
                  <div className="text-sm ml-2">
                    • {job.baseFee.Name}
                    {!shouldHideField(viewMode, 'addOnRate', data.metadata?.featureToggles) && (
                      <span>: ${job.baseFee.Amount.toFixed(2)}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Recurring Modifiers (ServiceSetRateMods) */}
              {job.serviceSetRateMods && job.serviceSetRateMods.length > 0 && (() => {
                // Filter out discounts (negative amounts) if TechDashboard_HideDiscounts is true
                const hideDiscounts = shouldHideField(viewMode, 'discounts', data.metadata?.featureToggles)
                const visibleMods = hideDiscounts
                  ? job.serviceSetRateMods.filter(mod => mod.Amount >= 0)
                  : job.serviceSetRateMods

                return visibleMods.length > 0 ? (
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-gray-600 mb-2">Recurring Modifiers</h3>
                    <div className="text-sm ml-2 space-y-1">
                      {visibleMods.map((mod, idx) => (
                        <div key={idx}>
                          • {mod.Name}
                          {!shouldHideField(viewMode, 'addOnRate', data.metadata?.featureToggles) && (
                            <span>: ${mod.Amount.toFixed(2)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null
              })()}

              {/* One-Time Modifiers (JobRateMods) */}
              {(() => {
                // Filter out discounts (negative amounts) if TechDashboard_HideDiscounts is true
                const hideDiscounts = shouldHideField(viewMode, 'discounts', data.metadata?.featureToggles)
                const visibleMods = job.jobRateMods && job.jobRateMods.length > 0
                  ? (hideDiscounts ? job.jobRateMods.filter(mod => mod.Amount >= 0) : job.jobRateMods)
                  : []

                return visibleMods.length > 0 ? (
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-gray-600 mb-2">One-Time Modifiers</h3>
                    <div className="text-sm ml-2 space-y-1">
                      {visibleMods.map((mod, idx) => (
                        <div key={idx}>
                          • {mod.Name}
                          {!shouldHideField(viewMode, 'addOnRate', data.metadata?.featureToggles) && (
                            <span>: ${mod.Amount.toFixed(2)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-gray-600 mb-2">One-Time Modifiers</h3>
                    <div className="text-sm ml-2 text-gray-400 italic">
                      (No one-time modifiers)
                    </div>
                  </div>
                )
              })()}
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
function renderJobInstructions(job, viewMode, featureToggles) {
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

  // Add sensitive instructions with named field privacy checks
  if (!shouldHideField(viewMode, 'accessInformation', featureToggles)) {
    if (job.accessInformation) {
      instructions.push({ label: 'Access', content: job.accessInformation })
    }
  }
  if (!shouldHideField(viewMode, 'internalMemo', featureToggles)) {
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
