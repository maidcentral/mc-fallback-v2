import { Link } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card'
import { Button } from './ui/button'
import { Alert, AlertDescription } from './ui/alert'
import { Badge } from './ui/badge'

export default function Dashboard({ data }) {
  if (!data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome to MaidCentral Backup</h1>
          <p className="text-muted-foreground mt-2">
            Offline schedule viewer for emergency use when the main system is unavailable.
          </p>
        </div>

        <Alert>
          <AlertDescription>
            No data loaded. Please upload a JSON file to get started.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>Get Started</CardTitle>
            <CardDescription>
              Upload schedule data to view jobs, employee schedules, and generate exports
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/admin">
              <Button size="lg">Upload Data</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { metadata } = data

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Schedule data loaded. Select an option below to get started.
        </p>
      </div>

      {/* Data Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metadata?.stats?.totalJobs || 0}</div>
            <p className="text-xs text-muted-foreground">
              {metadata?.dataRange?.startDate && metadata?.dataRange?.endDate
                ? `${metadata.dataRange.startDate} to ${metadata.dataRange.endDate}`
                : 'No date range'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Teams</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metadata?.stats?.totalTeams || 0}</div>
            <p className="text-xs text-muted-foreground">Active teams</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metadata?.stats?.totalEmployees || 0}</div>
            <p className="text-xs text-muted-foreground">Scheduled employees</p>
          </CardContent>
        </Card>
      </div>

      {/* Navigation Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="hover:bg-accent/50 transition-colors">
          <CardHeader>
            <CardTitle>Job Calendar</CardTitle>
            <CardDescription>
              View all scheduled jobs on a calendar with team filtering
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/jobs">
              <Button className="w-full">View Jobs</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:bg-accent/50 transition-colors">
          <CardHeader>
            <CardTitle>Employee Schedule</CardTitle>
            <CardDescription>
              View employee work schedules and shifts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/employees">
              <Button className="w-full">View Employees</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:bg-accent/50 transition-colors">
          <CardHeader>
            <CardTitle>Export Schedule</CardTitle>
            <CardDescription>
              Generate PDF/PNG exports of team schedules
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/export">
              <Button className="w-full">Export</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:bg-accent/50 transition-colors">
          <CardHeader>
            <CardTitle>Upload New Data</CardTitle>
            <CardDescription>
              Replace current data with a new JSON file
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/admin">
              <Button variant="outline" className="w-full">Manage Data</Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:bg-accent/50 transition-colors">
          <CardHeader>
            <CardTitle>Documentation</CardTitle>
            <CardDescription>
              Learn how to use this application
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/docs">
              <Button variant="outline" className="w-full">View Docs</Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Last Updated Info */}
      {metadata?.lastUpdated && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">Last Updated</Badge>
          <span>{new Date(metadata.lastUpdated).toLocaleString()}</span>
        </div>
      )}
    </div>
  )
}
