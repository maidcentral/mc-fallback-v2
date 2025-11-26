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
import {
  User,
  Home,
  Calendar,
  Clock,
  Users,
  DollarSign,
  FileText,
  ChevronRight,
  ArrowLeft,
  Download,
  Image as ImageIcon,
  Phone,
  Mail,
  MapPin,
  Bed,
  Bath,
  Ruler,
  Building2,
  Bell
} from 'lucide-react'

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
    <div className="space-y-4 max-w-7xl mx-auto px-4 pb-8">
      {/* Header Controls */}
      <div className="flex items-center justify-between flex-wrap gap-4 pt-4">
        <Button
          onClick={() => navigate(-1)}
          variant="outline"
          className="flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>

        <div className="flex items-center gap-2">
          {/* Export Buttons - Style Guide Design */}
          <Button
            onClick={handleExportPDF}
            disabled={isExporting}
            className="flex items-center gap-2 bg-[#BF9F50] hover:bg-[#A88A43] text-white border-2 border-[#1A1A1A] rounded-full px-6 py-2 font-bold shadow-sm"
          >
            <Download className="w-4 h-4" />
            {isExporting ? 'Exporting...' : 'PDF'}
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            onClick={handleExportPNG}
            disabled={isExporting}
            className="flex items-center gap-2 bg-[#0382E5] hover:bg-[#005DA5] text-white border-2 border-[#1A1A1A] rounded-full px-6 py-2 font-bold shadow-sm"
          >
            <ImageIcon className="w-4 h-4" />
            {isExporting ? 'Exporting...' : 'PNG'}
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Job Details - Card Layout */}
      <div ref={contentRef} className="space-y-4">
        {/* Row 1: Customer & Home Info - Full Width */}
        <Card className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Customer Info Section */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 bg-[#005DA5] rounded-lg flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-lg font-bold text-gray-900">Customer Information</h2>
              </div>

              <div className="space-y-3 ml-12">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{job.customerName}</h1>
                  <p className="text-lg text-gray-600">{job.serviceType}</p>
                </div>

                {/* Contact Info */}
                {(
                  (!shouldHideField(viewMode, 'customerPhone', data.metadata?.featureToggles) && job.contactInfo?.phone) ||
                  (!shouldHideField(viewMode, 'customerEmail', data.metadata?.featureToggles) && job.contactInfo?.email)
                ) && (
                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-700">
                    {!shouldHideField(viewMode, 'customerPhone', data.metadata?.featureToggles) && job.contactInfo?.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-[#005DA5]" />
                        <span>{job.contactInfo.phone}</span>
                      </div>
                    )}
                    {!shouldHideField(viewMode, 'customerEmail', data.metadata?.featureToggles) && job.contactInfo?.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-[#005DA5]" />
                        <span>{job.contactInfo.email}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Customer Notifications */}
                {job.customerNotifications && job.customerNotifications.length > 0 && (
                  <div className="border-t border-gray-200 pt-3 mt-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Bell className="w-4 h-4 text-[#005DA5]" />
                      <h3 className="text-sm font-semibold text-gray-600">Customer Notifications</h3>
                    </div>
                    <ul className="space-y-1 text-sm text-gray-700">
                      {job.customerNotifications.map((notification, idx) => {
                        // Check if this is a phone notification
                        const isPhoneNotification = notification.ContactType === 'Cell Phone' || notification.ContactType === 'Home Phone'
                        // Check if this is an email notification
                        const isEmailNotification = notification.ContactType === 'Email'

                        // Determine if we should hide the contact info
                        const hideContactInfo =
                          (isPhoneNotification && shouldHideField(viewMode, 'customerPhone', data.metadata?.featureToggles)) ||
                          (isEmailNotification && shouldHideField(viewMode, 'customerEmail', data.metadata?.featureToggles))

                        return (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-[#005DA5] mt-0.5">•</span>
                            <span>
                              <strong>{notification.NotificationEvent}</strong>{hideContactInfo ? '' : ` → ${notification.ContactInfo}`} ({notification.NotificationType})
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}

                {/* All Tags - Unified Display */}
                {job.tags && job.tags.length > 0 && (
                  <div className="border-t border-gray-200 pt-3 mt-3">
                    <div className="flex flex-wrap gap-2 w-full">
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
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Home Info Section */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 bg-[#01726B] rounded-lg flex items-center justify-center">
                  <Home className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-lg font-bold text-gray-900">Home Information</h2>
              </div>

              <div className="space-y-3 ml-12">
                {/* Address */}
                <div className="flex items-start gap-2 text-sm text-gray-700">
                  <MapPin className="w-4 h-4 text-[#01726B] mt-0.5 flex-shrink-0" />
                  <span>{job.address}</span>
                </div>

                {/* Home Stats */}
                {job.homeStats && (
                  <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700 bg-gray-50 rounded-lg p-3 border border-gray-200">
                    {job.homeStats.bedrooms && (
                      <div className="flex items-center gap-1.5">
                        <Bed className="w-4 h-4 text-[#01726B]" />
                        <span>{job.homeStats.bedrooms} BR</span>
                      </div>
                    )}
                    {job.homeStats.bathrooms && (
                      <div className="flex items-center gap-1.5">
                        <Bath className="w-4 h-4 text-[#01726B]" />
                        <span>
                          {job.homeStats.bathrooms} BA
                          {job.homeStats.fullBath && job.homeStats.halfBath &&
                            ` (${job.homeStats.fullBath}F/${job.homeStats.halfBath}H)`}
                          {job.homeStats.fullBath && !job.homeStats.halfBath &&
                            ` (${job.homeStats.fullBath} full)`}
                          {!job.homeStats.fullBath && job.homeStats.halfBath &&
                            ` (${job.homeStats.halfBath} half)`}
                        </span>
                      </div>
                    )}
                    {job.homeStats.squareFootage && (
                      <div className="flex items-center gap-1.5">
                        <Ruler className="w-4 h-4 text-[#01726B]" />
                        <span>{parseInt(job.homeStats.squareFootage).toLocaleString()} sq ft</span>
                      </div>
                    )}
                    {job.homeStats.stories && (
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-[#01726B]" />
                        <span>{job.homeStats.stories} {job.homeStats.stories === '1' ? 'story' : 'stories'}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Access Information */}
                {!shouldHideField(viewMode, 'accessInformation', data.metadata?.featureToggles) && job.accessInformation && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                    <strong className="text-xs text-amber-800 uppercase font-semibold">Access Information</strong>
                    <div
                      className="mt-1 text-gray-700"
                      dangerouslySetInnerHTML={{ __html: job.accessInformation }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Row 2: Schedule & Pricing - Side by Side on Desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Card 2: Schedule */}
          <Card className="p-6">
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 bg-[#0382E5] rounded-lg flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-lg font-bold text-gray-900">Schedule</h2>
              </div>

              <div className="space-y-4 ml-12">
                {/* Date and Time */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-gray-700">
                    <Calendar className="w-4 h-4 text-[#0382E5]" />
                    <span className="font-semibold">
                      {format(new Date(job.schedule.date + 'T12:00:00'), 'EEEE, MMMM d, yyyy')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-700">
                    <Clock className="w-4 h-4 text-[#0382E5]" />
                    <span>
                      {job.schedule.startTime} - {job.schedule.endTime}
                      {job.allowedTime > 0 && ` (${job.allowedTime.toFixed(2)} hrs allowed)`}
                    </span>
                  </div>
                </div>

                {/* Assigned Teams */}
                {assignedTeams.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-600 mb-2">Assigned Teams</h3>
                    <div className="flex flex-wrap gap-2">
                      {assignedTeams.map(team => (
                        <Badge
                          key={team.id}
                          style={{
                            backgroundColor: team.color,
                            color: '#ffffff',
                            border: 'none'
                          }}
                          className="px-3 py-1"
                        >
                          {team.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Assigned Employees */}
                {assignedEmployees.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-4 h-4 text-[#01726B]" />
                      <h3 className="text-sm font-semibold text-gray-600">Assigned Employees</h3>
                    </div>
                    <ul className="space-y-2">
                      {assignedEmployees.map(emp => (
                        <li key={emp.id} className="text-sm flex items-center gap-2 ml-6">
                          <span className="font-medium text-gray-900">{emp.name}</span>
                          <span className="text-gray-500">({emp.position.name})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Card 3: Pricing */}
          {(
            !shouldHideField(viewMode, 'billRate', data.metadata?.featureToggles) ||
            !shouldHideField(viewMode, 'feeSplitRate', data.metadata?.featureToggles) ||
            job.baseFee ||
            job.serviceSetRateMods?.length > 0 ||
            job.jobRateMods?.length > 0
          ) && (
            <Card className="p-6">
              <div className="space-y-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-10 h-10 bg-[#BF9F50] rounded-lg flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">Pricing</h2>
                </div>

                <div className="space-y-4 ml-12">
                  {/* Rate Breakdown */}
                  {(job.baseFee || job.serviceSetRateMods?.length > 0 || job.jobRateMods?.length > 0) && (() => {
                    const showAmounts = !shouldHideField(viewMode, 'addOnRate', data.metadata?.featureToggles)
                    const showBillRate = !shouldHideField(viewMode, 'billRate', data.metadata?.featureToggles)
                    const showFeeSplitRate = !shouldHideField(viewMode, 'feeSplitRate', data.metadata?.featureToggles)
                    const hideDiscounts = shouldHideField(viewMode, 'discounts', data.metadata?.featureToggles)

                    // Calculate totals
                    let totalAmount = 0
                    let feeSplitAmount = 0

                    if (job.baseFee && showAmounts) {
                      totalAmount += job.baseFee.Amount || 0
                      if (job.baseFee.FeeSplit) {
                        feeSplitAmount += job.baseFee.Amount || 0
                      }
                    }

                    if (job.serviceSetRateMods) {
                      const visibleMods = hideDiscounts
                        ? job.serviceSetRateMods.filter(mod => mod.Amount >= 0)
                        : job.serviceSetRateMods

                      visibleMods.forEach(mod => {
                        if (showAmounts) {
                          totalAmount += mod.Amount || 0
                          if (mod.FeeSplit) {
                            feeSplitAmount += mod.Amount || 0
                          }
                        }
                      })
                    }

                    if (job.jobRateMods) {
                      const visibleMods = hideDiscounts
                        ? job.jobRateMods.filter(mod => mod.Amount >= 0)
                        : job.jobRateMods

                      visibleMods.forEach(mod => {
                        if (showAmounts) {
                          totalAmount += mod.Amount || 0
                          if (mod.FeeSplit) {
                            feeSplitAmount += mod.Amount || 0
                          }
                        }
                      })
                    }

                    return (
                      <div>
                        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                          {/* Base Fee - Always First */}
                          {job.baseFee && (
                            <div className={`grid ${showAmounts ? 'grid-cols-[1fr_auto_auto]' : 'grid-cols-1'} gap-4 px-4 py-2.5 border-b border-gray-200`}>
                              <span className="text-sm font-medium text-gray-900">{job.baseFee.Name}</span>
                              {showAmounts && (
                                <>
                                  <span className="text-sm font-semibold text-gray-900 text-right">${job.baseFee.Amount.toFixed(2)}</span>
                                  <span className="text-sm text-gray-900 text-center w-16">
                                    {job.baseFee.FeeSplit ? '✓' : '-'}
                                  </span>
                                </>
                              )}
                            </div>
                          )}

                          {/* Recurring Rate Mods */}
                          {job.serviceSetRateMods && job.serviceSetRateMods.length > 0 && (() => {
                            const visibleMods = hideDiscounts
                              ? job.serviceSetRateMods.filter(mod => mod.Amount >= 0)
                              : job.serviceSetRateMods

                            return visibleMods.map((mod, idx) => (
                              <div key={idx} className={`grid ${showAmounts ? 'grid-cols-[1fr_auto_auto]' : 'grid-cols-1'} gap-4 px-4 py-2.5 border-b border-gray-200`}>
                                <span className="text-sm text-gray-700">{mod.Name}</span>
                                {showAmounts && (
                                  <>
                                    <span className="text-sm text-gray-900 text-right">${mod.Amount.toFixed(2)}</span>
                                    <span className="text-sm text-gray-900 text-center w-16">
                                      {mod.FeeSplit ? '✓' : '-'}
                                    </span>
                                  </>
                                )}
                              </div>
                            ))
                          })()}

                          {/* One-Time Rate Mods */}
                          {(() => {
                            const visibleMods = job.jobRateMods && job.jobRateMods.length > 0
                              ? (hideDiscounts ? job.jobRateMods.filter(mod => mod.Amount >= 0) : job.jobRateMods)
                              : []

                            return visibleMods.map((mod, idx) => (
                              <div key={idx} className={`grid ${showAmounts ? 'grid-cols-[1fr_auto_auto]' : 'grid-cols-1'} gap-4 px-4 py-2.5 border-b border-gray-200`}>
                                <span className="text-sm text-gray-700">{mod.Name}</span>
                                {showAmounts && (
                                  <>
                                    <span className="text-sm text-gray-900 text-right">${mod.Amount.toFixed(2)}</span>
                                    <span className="text-sm text-gray-900 text-center w-16">
                                      {mod.FeeSplit ? '✓' : '-'}
                                    </span>
                                  </>
                                )}
                              </div>
                            ))
                          })()}

                          {/* Totals Footer */}
                          {showAmounts && (
                            <>
                              {showBillRate && (
                                <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-3 border-t-2 border-gray-900 bg-white">
                                  <span className="text-sm font-bold text-gray-900">Bill Rate</span>
                                  <span className="text-sm font-bold text-gray-900 text-right">${totalAmount.toFixed(2)}</span>
                                  <span className="w-16"></span>
                                </div>
                              )}
                              {showFeeSplitRate && feeSplitAmount > 0 && (
                                <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2.5 border-t border-gray-200 bg-white">
                                  <span className="text-sm font-semibold text-gray-700">Fee Split Total</span>
                                  <span className="text-sm font-semibold text-gray-900 text-right">${feeSplitAmount.toFixed(2)}</span>
                                  <span className="text-sm text-gray-900 text-center w-16">✓</span>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Row 3: Instructions & Rooms - Side by Side on Desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Card 4: Instructions */}
          <Card className="p-6">
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 bg-[#005DA5] rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-lg font-bold text-gray-900">Instructions</h2>
              </div>

              <div className="space-y-4 ml-12">
                {job.eventInstructions && (
                  <div className="border-l-4 border-[#0382E5] pl-4 py-2">
                    <strong className="text-xs text-gray-500 uppercase font-semibold block mb-1">
                      Event
                    </strong>
                    <div
                      className="text-sm text-gray-700"
                      dangerouslySetInnerHTML={{ __html: job.eventInstructions }}
                    />
                  </div>
                )}

                {job.specialInstructions && (
                  <div className="border-l-4 border-[#0382E5] pl-4 py-2">
                    <strong className="text-xs text-gray-500 uppercase font-semibold block mb-1">
                      Special
                    </strong>
                    <div
                      className="text-sm text-gray-700"
                      dangerouslySetInnerHTML={{ __html: job.specialInstructions }}
                    />
                  </div>
                )}

                {job.petInstructions && (
                  <div className="border-l-4 border-[#0382E5] pl-4 py-2">
                    <strong className="text-xs text-gray-500 uppercase font-semibold block mb-1">
                      Pets
                    </strong>
                    <div
                      className="text-sm text-gray-700"
                      dangerouslySetInnerHTML={{ __html: job.petInstructions }}
                    />
                  </div>
                )}

                {job.directions && (
                  <div className="border-l-4 border-[#0382E5] pl-4 py-2">
                    <strong className="text-xs text-gray-500 uppercase font-semibold block mb-1">
                      Directions
                    </strong>
                    <div
                      className="text-sm text-gray-700"
                      dangerouslySetInnerHTML={{ __html: job.directions }}
                    />
                  </div>
                )}

                {job.specialEquipment && (
                  <div className="border-l-4 border-[#0382E5] pl-4 py-2">
                    <strong className="text-xs text-gray-500 uppercase font-semibold block mb-1">
                      Special Equipment
                    </strong>
                    <div
                      className="text-sm text-gray-700"
                      dangerouslySetInnerHTML={{ __html: job.specialEquipment }}
                    />
                  </div>
                )}

                {job.wasteInfo && (
                  <div className="border-l-4 border-[#0382E5] pl-4 py-2">
                    <strong className="text-xs text-gray-500 uppercase font-semibold block mb-1">
                      Waste
                    </strong>
                    <div
                      className="text-sm text-gray-700"
                      dangerouslySetInnerHTML={{ __html: job.wasteInfo }}
                    />
                  </div>
                )}

                {/* Show message if no instructions */}
                {!job.eventInstructions && !job.specialInstructions && !job.petInstructions &&
                 !job.directions && !job.specialEquipment && !job.wasteInfo && (
                  <p className="text-sm text-gray-500 italic">No instructions available</p>
                )}
              </div>
            </div>
          </Card>

          {/* Card 5: Rooms */}
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

            // Find rooms needing DC
            const roomsNeedingDC = {}
            Object.keys(roomsByType).forEach(type => {
              const needsDC = []

              roomsByType[type].forEach(room => {
                const dcCode = room.deepCleanCode ? room.deepCleanCode.toLowerCase() : ''

                if (dcCode === 'always') {
                  needsDC.push(room)
                } else if (dcCode !== 'never' && room.lastDeepCleanDate) {
                  if (!needsDC.some(r => r.deepCleanCode && r.deepCleanCode.toLowerCase() === 'always')) {
                    if (needsDC.length === 0 || new Date(room.lastDeepCleanDate) < new Date(needsDC[0].lastDeepCleanDate)) {
                      needsDC.splice(0, needsDC.length, room)
                    }
                  }
                }
              })

              roomsNeedingDC[type] = needsDC
            })

            const typeOrder = ['Wet', 'Dry', 'Other']
            const sortedTypes = typeOrder.filter(type => roomsByType[type])

            return (
              <Card className="p-6">
                <div className="space-y-6">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-10 h-10 bg-[#01726B] rounded-lg flex items-center justify-center">
                      <Home className="w-5 h-5 text-white" />
                    </div>
                    <h2 className="text-lg font-bold text-gray-900">Rooms ({job.rooms.length})</h2>
                  </div>

                  <div className="space-y-4 ml-12">
                    {sortedTypes.map(type => {
                      const needsDCRooms = roomsNeedingDC[type] || []

                      return (
                        <div key={type}>
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
                                  className={`border-l-4 pl-4 py-2 rounded ${
                                    needsDC
                                      ? 'border-orange-500 bg-orange-50'
                                      : 'border-gray-300 bg-gray-50'
                                  }`}
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-2">
                                      <strong className="text-sm text-gray-900">{room.name}</strong>
                                      {needsDC && (
                                        <span className="text-xs bg-orange-500 text-white px-2 py-0.5 rounded font-semibold">
                                          NEEDS DC
                                        </span>
                                      )}
                                    </div>
                                    {!shouldHideField(viewMode, 'roomRate', data.metadata?.featureToggles) && room.fee > 0 && (
                                      <span className="text-sm text-gray-600 font-medium">${room.fee.toFixed(2)}</span>
                                    )}
                                  </div>
                                  {room.detailsOfWork && (
                                    <p className="text-sm text-gray-600 mt-1">{room.detailsOfWork}</p>
                                  )}
                                  {(room.lastDeepCleanDate || room.deepCleanCode) && (
                                    <div className="text-xs text-gray-500 mt-2 space-y-0.5">
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
                </div>
              </Card>
            )
          })()}
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t text-center text-sm text-gray-500">
          Generated from MaidCentral Backup System
        </div>
      </div>
    </div>
  )
}
