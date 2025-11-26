import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload as UploadIcon, CheckCircle2, XCircle, Loader2, Database, Calendar, Users, Briefcase, Trash2, AlertCircle } from 'lucide-react'
import { transformData } from '../utils/dataTransform'

export default function Admin({ data, saveData, clearData }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef(null)
  const navigate = useNavigate()

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  const handleChange = (e) => {
    e.preventDefault()
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }

  const handleFile = async (file) => {
    setError(null)
    setSuccess(null)

    // Validate file type
    if (!file.name.endsWith('.json')) {
      setError('Please upload a .json file')
      return
    }

    setUploading(true)

    try {
      // Read file
      const fileText = await file.text()

      // Parse JSON
      let jsonData
      try {
        jsonData = JSON.parse(fileText)
      } catch (parseError) {
        throw new Error('Invalid JSON file. Please check the file format.')
      }

      // Transform data (auto-detects format)
      let transformedData
      try {
        transformedData = transformData(jsonData)
      } catch (transformError) {
        throw new Error(`Data transformation failed: ${transformError.message}`)
      }

      // Save to localStorage
      const saved = saveData(transformedData)

      if (saved) {
        const formatName = transformedData.metadata?.dataFormat === 'dr-all-data' ? 'DR All Data' : 'Format A'
        setSuccess(`Successfully loaded ${transformedData.jobs.length} jobs, ${transformedData.teams.length - 1} teams, and ${transformedData.employees.length} employees using ${formatName} format.`)

        // Navigate to dashboard after 2 seconds
        setTimeout(() => {
          navigate('/')
        }, 2000)
      } else {
        throw new Error('Failed to save data to localStorage')
      }
    } catch (err) {
      console.error('Error processing file:', err)
      setError(err.message || 'An unknown error occurred')
    } finally {
      setUploading(false)
    }
  }

  const handleClearData = () => {
    if (window.confirm('Are you sure you want to clear all data? This cannot be undone.')) {
      const cleared = clearData()
      if (cleared) {
        setSuccess('Data cleared successfully')
        setTimeout(() => {
          setSuccess(null)
        }, 3000)
      } else {
        setError('Failed to clear data')
      }
    }
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">Admin</h1>
        <p className="text-gray-600 text-lg">
          Upload and manage schedule data
        </p>
      </div>

      {/* Upload Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-[#005DA5] rounded-lg flex items-center justify-center">
              <UploadIcon className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-2xl font-bold">Upload JSON Data</h2>
          </div>
          <p className="text-gray-600 mb-6">
            Upload a JSON file from MaidCentral API (supports Format A and DR All Data formats)
          </p>

          {/* Drag & Drop Area */}
          <div
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
              dragActive
                ? 'border-[#005DA5] bg-[#005DA5]/5 scale-[1.02]'
                : 'border-gray-300 hover:border-[#005DA5]/50 hover:bg-gray-50'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="flex flex-col items-center gap-4">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${
                dragActive ? 'bg-[#005DA5]/10' : 'bg-gray-100'
              }`}>
                <UploadIcon className={`w-8 h-8 transition-colors ${
                  dragActive ? 'text-[#005DA5]' : 'text-gray-400'
                }`} />
              </div>
              <div>
                <p className="text-base font-semibold text-gray-900 mb-1">
                  {dragActive ? 'Drop file here' : 'Drag and drop file here'}
                </p>
                <p className="text-sm text-gray-500">
                  or click to browse (.json files only)
                </p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleChange}
              className="hidden"
            />
          </div>

          {/* Status Messages */}
          {uploading && (
            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
              <span className="text-sm font-medium text-blue-900">
                Processing file... Please wait.
              </span>
            </div>
          )}

          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-red-900 mb-1">Error</h3>
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              </div>
            </div>
          )}

          {success && (
            <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-green-900 mb-1">Success!</h3>
                  <p className="text-sm text-green-800">{success}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Current Data Info */}
      {data && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-[#01726B] rounded-lg flex items-center justify-center">
                <Database className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Current Data</h2>
                <p className="text-sm text-gray-600">Information about the currently loaded schedule data</p>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                <div className="flex items-center gap-3 mb-2">
                  <Calendar className="w-5 h-5 text-blue-600" />
                  <span className="text-sm font-medium text-blue-900">Jobs</span>
                </div>
                <div className="text-2xl font-bold text-blue-900">
                  {data.metadata?.stats?.totalJobs || 0}
                </div>
              </div>

              <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
                <div className="flex items-center gap-3 mb-2">
                  <Briefcase className="w-5 h-5 text-purple-600" />
                  <span className="text-sm font-medium text-purple-900">Teams</span>
                </div>
                <div className="text-2xl font-bold text-purple-900">
                  {data.metadata?.stats?.totalTeams || 0}
                </div>
              </div>

              <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                <div className="flex items-center gap-3 mb-2">
                  <Users className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-medium text-green-900">Employees</span>
                </div>
                <div className="text-2xl font-bold text-green-900">
                  {data.metadata?.stats?.totalEmployees || 0}
                </div>
              </div>

              <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
                <div className="flex items-center gap-3 mb-2">
                  <Database className="w-5 h-5 text-amber-600" />
                  <span className="text-sm font-medium text-amber-900">Format</span>
                </div>
                <div className="text-sm font-semibold text-amber-900">
                  {data.metadata?.dataFormat === 'dr-all-data' ? 'DR All Data' : 'Format A'}
                </div>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-3 mb-6">
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm font-medium text-gray-700">Company</span>
                <span className="text-sm text-gray-900 font-medium">
                  {data.metadata?.companyName || 'MaidCentral'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm font-medium text-gray-700">Date Range</span>
                <span className="text-sm text-gray-900 font-medium">
                  {data.metadata?.dataRange?.startDate} to {data.metadata?.dataRange?.endDate}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-medium text-gray-700">Last Updated</span>
                <span className="text-sm text-gray-900 font-medium">
                  {data.metadata?.lastUpdated
                    ? new Date(data.metadata.lastUpdated).toLocaleString()
                    : 'Unknown'}
                </span>
              </div>
            </div>

            {/* Clear Data Button */}
            <div className="pt-6 border-t">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-red-900 mb-1">Danger Zone</h3>
                  <p className="text-sm text-red-800">
                    Clearing data will permanently remove all loaded schedules. This action cannot be undone.
                  </p>
                </div>
              </div>
              <button
                onClick={handleClearData}
                className="w-full px-6 py-3 border-2 border-red-600 text-red-600 hover:bg-red-50 active:bg-red-600 active:text-white rounded-full font-bold transition-all flex items-center justify-center gap-2"
              >
                <Trash2 className="w-5 h-5" />
                Clear All Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
