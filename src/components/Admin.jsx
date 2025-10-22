import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card'
import { Button } from './ui/button'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { Badge } from './ui/badge'
import { transformFormatA } from '../utils/dataTransform'

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

      // Transform data
      let transformedData
      try {
        transformedData = transformFormatA(jsonData)
      } catch (transformError) {
        throw new Error(`Data transformation failed: ${transformError.message}`)
      }

      // Save to localStorage
      const saved = saveData(transformedData)

      if (saved) {
        setSuccess(`Successfully loaded ${transformedData.jobs.length} jobs, ${transformedData.teams.length - 1} teams, and ${transformedData.employees.length} employees.`)

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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
        <p className="text-muted-foreground mt-2">
          Upload and manage schedule data
        </p>
      </div>

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle>Upload JSON Data</CardTitle>
          <CardDescription>
            Upload a JSON file from MaidCentral API (Format A - api/jobs/getall)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Drag & Drop Area */}
          <div
            className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
              dragActive
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-accent/50'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="flex flex-col items-center gap-2">
              <svg
                className="w-12 h-12 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <div>
                <p className="text-sm font-medium">
                  {dragActive ? 'Drop file here' : 'Drag and drop file here'}
                </p>
                <p className="text-xs text-muted-foreground">
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
            <Alert>
              <AlertDescription>
                Processing file... Please wait.
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="border-green-500 text-green-700 dark:text-green-400">
              <AlertTitle>Success!</AlertTitle>
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Current Data Info */}
      {data && (
        <Card>
          <CardHeader>
            <CardTitle>Current Data</CardTitle>
            <CardDescription>
              Information about the currently loaded schedule data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Total Jobs:</span>
                <Badge>{data.metadata?.stats?.totalJobs || 0}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Total Teams:</span>
                <Badge>{data.metadata?.stats?.totalTeams || 0}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Total Employees:</span>
                <Badge>{data.metadata?.stats?.totalEmployees || 0}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Date Range:</span>
                <span className="text-sm text-muted-foreground">
                  {data.metadata?.dataRange?.startDate} to {data.metadata?.dataRange?.endDate}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Last Updated:</span>
                <span className="text-sm text-muted-foreground">
                  {data.metadata?.lastUpdated
                    ? new Date(data.metadata.lastUpdated).toLocaleString()
                    : 'Unknown'}
                </span>
              </div>
            </div>

            <div className="pt-4 border-t">
              <Button
                variant="destructive"
                onClick={handleClearData}
                className="w-full"
              >
                Clear All Data
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
