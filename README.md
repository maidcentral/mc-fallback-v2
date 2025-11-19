# MaidCentral Backup Application

A standalone, client-side React web application for viewing and managing cleaning service schedules offline when the main MaidCentral system is unavailable.

## Overview

This application provides a fallback solution for accessing schedule data during system outages or internet connectivity issues. It runs entirely in the browser with no backend dependencies, storing all data in browser localStorage.

## Features

- **Offline-First Design**: Works completely offline after data is loaded
- **Multiple Data Format Support**: Automatically detects and processes both Format A (api/jobs/getall) and DR All Data formats
- **Job Calendar View**: Interactive calendar showing jobs by team with filtering
- **Employee Calendar View**: Schedule view showing employee shifts and assignments
- **PDF/PNG Export**: Generate printable schedules for manual distribution
- **Privacy Controls**: Global toggle to hide sensitive information (bill rates, contact info)
- **Drag & Drop Upload**: Easy data import via drag-and-drop interface
- **Responsive Design**: Works on desktop and tablet devices

## Technology Stack

- **Framework**: React 18 with Vite
- **Routing**: React Router DOM
- **UI Components**: Custom components with Tailwind CSS
- **Calendar**: FullCalendar with multiple view types
- **Date Handling**: date-fns
- **Export**: html2canvas + jsPDF
- **Storage**: Browser localStorage (no backend required)

## Quick Start

### Prerequisites

- Node.js 18+ (not required on Mac due to compilation limitations)
- npm or yarn
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd mc-fallback-v2

# Install dependencies
npm install
```

### Development

```bash
# Start development server
npm run dev

# Application will be available at http://localhost:5173
```

### Build for Production

```bash
# Build optimized production bundle
npm run build

# Preview production build
npm run preview
```

### Deployment

The built application is static HTML/CSS/JS and can be deployed to any web server or hosting service:
- Netlify
- Vercel
- GitHub Pages
- AWS S3 + CloudFront
- Any static file server

## Usage

### 1. Upload Data

1. Navigate to the **Admin** page
2. Upload a JSON file from MaidCentral API:
   - **Format A**: `api/jobs/getall` structure
   - **DR All Data**: Hierarchical company/group structure
3. The application automatically detects the format and transforms the data
4. Data is stored in browser localStorage for offline access

### 2. View Schedules

- **Dashboard**: Overview and quick navigation
- **Job Calendar**: See all jobs by date, filter by team
- **Employee Calendar**: View employee schedules and shifts

### 3. Export Schedules

1. Navigate to **Export Schedule**
2. Select team and date range
3. Generate PDF or PNG for printing/distribution
4. Manually share with team members (no automated email sending)

### 4. Clear Data

- Use the **Clear All Data** button in Admin page
- Useful before loading new data or for privacy

## Data Formats

### Format A (api/jobs/getall)

Simple flat structure with jobs array:
```json
{
  "Result": [
    {
      "JobInformationId": 123,
      "CustomerInformation": { ... },
      "HomeInformation": { ... },
      "ScheduledTeams": [ ... ],
      "EmployeeSchedules": [ ... ]
    }
  ]
}
```

### DR All Data Format

Hierarchical structure with company groups:
```json
{
  "Result": {
    "GeneratedAt": "2025-11-19T15:13:33Z",
    "DataVersion": "1.0",
    "DateRange": { ... },
    "ServiceCompanyGroups": [
      {
        "ServiceCompanies": [
          {
            "Jobs": [ ... ]
          }
        ]
      }
    ]
  }
}
```

**Key Differences**:
- DR All Data has flattened customer/home fields at job level
- Includes `BillRate`, `SortOrder`, `HomeDirections` fields
- Uses empty strings instead of null values
- Provides metadata like `GeneratedAt` and `DateRange`

## Architecture

### Data Flow

```
JSON Upload → Format Detection → Transformation → LocalStorage → React Components
```

1. **Input**: User uploads JSON file
2. **Detection**: `detectFormat()` identifies data structure
3. **Transformation**: Converts to internal format
4. **Storage**: Saves to localStorage
5. **Display**: React components read from storage
6. **Export**: Generate PDF/PNG on demand

### Key Files

- **src/utils/dataTransform.js**: Core transformation logic for both formats
- **src/utils/storage.js**: LocalStorage wrapper
- **src/hooks/usePersistedData.js**: Data persistence hook
- **src/components/Admin.jsx**: Data upload and management
- **src/components/JobCalendar.jsx**: Job calendar view
- **src/components/EmployeeCalendar.jsx**: Employee schedule view
- **src/components/ExportSchedule.jsx**: PDF/PNG generation

### Internal Data Structure

```javascript
{
  metadata: {
    companyName: "Charleston",
    lastUpdated: "2025-11-19T15:13:33Z",
    dataFormat: "dr-all-data",
    dataRange: { startDate, endDate },
    stats: { totalJobs, totalTeams, totalEmployees }
  },
  teams: [
    { id, name, color, sortOrder }
  ],
  jobs: [
    {
      id, customerName, address, serviceType,
      scheduledTeams, schedule, billRate,
      eventInstructions, contactInfo, ...
    }
  ],
  employees: [
    {
      id, name, teamId, position,
      shifts: [{ jobId, date, startTime, endTime }]
    }
  ]
}
```

## API Requirements

When creating the API endpoint for DR All Data format, ensure these fields are populated:

### Critical Fields

✅ **Required** (must be present):
- `Result.GeneratedAt` (ISO 8601 timestamp)
- `Result.DateRange.StartDate` and `EndDate`
- `ScheduledTeams[].SortOrder` (integer for team ordering)
- `BillRate` at job level (decimal, total billable amount)
- `HomeDirections` field

✅ **Recommended** (use empty strings instead of null):
- All instruction fields: `EventInstructions`, `HomeSpecialInstructions`, etc.
- All address fields: `HomeAddress2`, `CustomerCompanyName`
- All contact fields: `ContactNotes`

### Sample API Response

See [data-ex/dr-all-data.json](data-ex/dr-all-data.json) for a complete example.

## Development Notes

### Mac Compatibility

**Note**: This project cannot be compiled on Mac due to environment constraints. To develop:
- Use Windows or Linux machine
- Use Docker container
- Deploy to cloud build service (Netlify, Vercel)

### Testing

Test with sample data files in `data-ex/`:
- `dr-all-data.json` - DR All Data format example
- `chs-alljobs.json` - Format A example (if available)

### Key Test Scenarios

1. ✅ Upload dr-all-data.json → verify teams display in correct order
2. ✅ Refresh page → verify data persists from localStorage
3. ✅ Filter by team → verify multi-team jobs appear correctly
4. ✅ Toggle privacy → verify billRate/contactInfo hidden
5. ✅ Export PDF → verify all data renders correctly
6. ✅ Clear data → verify localStorage empty

## Troubleshooting

### Data Not Loading
- Check JSON format matches expected structure
- Open browser console for detailed error messages
- Verify file is valid JSON (use jsonlint.com)

### Teams Not Sorting Correctly
- Ensure `SortOrder` field is present in `ScheduledTeams[]`
- Fallback uses `TeamListId` if `SortOrder` missing

### Bill Rates Showing $0
- Ensure `BillRate` field is present at job level
- Fallback uses `BaseFeeLog.Amount` if `BillRate` missing

### Export Not Working
- Ensure browser allows downloads
- Check browser console for errors
- Try different export format (PDF vs PNG)

### LocalStorage Full
- Clear old data using "Clear All Data" button
- Each browser has ~5-10MB localStorage limit
- Consider uploading smaller date ranges

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Security & Privacy

- All data processed client-side only
- No data sent to external servers
- LocalStorage is browser-specific and domain-isolated
- Privacy toggle hides sensitive information
- Recommend clearing data when done using application

## Contributing

### Code Style
- Use functional React components
- Implement null safety with optional chaining
- Follow existing naming conventions
- Add JSDoc comments for functions

### Adding New Features
1. Update `CLAUDE.md` with feature description
2. Implement feature following existing patterns
3. Test with both data formats
4. Update this README if user-facing

## Project Status

**Current Status**: ✅ Production Ready

### Recent Updates
- ✅ Added DR All Data format support
- ✅ Implemented auto-format detection
- ✅ Added `BillRate`, `SortOrder`, `HomeDirections` field support
- ✅ Improved null handling (empty strings vs null)
- ✅ Enhanced company name extraction

### Roadmap
- Multi-company support (if multiple companies in single upload)
- Advanced filtering options
- Custom export templates
- Print optimization
- Mobile app wrapper

## License

[Specify License]

## Support

For issues or questions:
1. Check this README
2. Review `CLAUDE.md` for detailed technical documentation
3. Check browser console for error messages
4. Contact development team

## Additional Documentation

- **CLAUDE.md**: Detailed technical documentation for developers
- **PROJECT-PLAN.md**: Implementation plan and phases
- **REBUILD-SPEC.md**: Original specification document
