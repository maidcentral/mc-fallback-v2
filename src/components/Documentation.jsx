import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card'

export default function Documentation() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Documentation</h1>
        <p className="text-muted-foreground mt-2">
          Learn how to use the MaidCentral Backup application
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Getting Started</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none">
          <h3>1. Upload Data</h3>
          <p>
            Navigate to the Admin page and upload a JSON file from the MaidCentral API.
            The system supports Format A (api/jobs/getall) data structure.
          </p>

          <h3>2. View Schedules</h3>
          <p>
            Once data is loaded, you can:
          </p>
          <ul>
            <li>View jobs on the Job Calendar</li>
            <li>View employee schedules on the Employee Calendar</li>
            <li>Filter by team to see specific schedules</li>
          </ul>

          <h3>3. Export Schedules</h3>
          <p>
            Use the Export page to generate PDF or PNG files of team schedules for distribution.
          </p>

          <h3>4. Privacy Controls</h3>
          <p>
            Use the "Hide Sensitive Information" toggle to hide bill rates and contact information
            when sharing your screen.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data Format</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none">
          <p>
            This application expects JSON data in Format A structure with:
          </p>
          <ul>
            <li>Result array containing job objects</li>
            <li>Nested CustomerInformation, HomeInformation, ServiceSet objects</li>
            <li>ScheduledTeams array with team details and colors</li>
            <li>EmployeeSchedules array for employee shift data</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Troubleshooting</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none">
          <h4>Data won't upload</h4>
          <p>
            Ensure your file is a valid .json file in the correct format. Check the browser console for detailed error messages.
          </p>

          <h4>Data not persisting</h4>
          <p>
            This application uses localStorage. Ensure your browser allows localStorage and you're not in incognito/private mode.
          </p>

          <h4>Missing jobs or teams</h4>
          <p>
            Verify the source JSON file contains all expected data. Jobs without teams will be assigned to "Unassigned".
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
