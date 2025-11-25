# MaidCentral Backup App - Project Plan

## Executive Summary

**Goal**: Build a standalone React web application with local storage for viewing and managing cleaning service schedules offline.

**Data Format**: Format A (api/jobs/getall) - Rich nested JSON structure
**Storage**: Browser LocalStorage (no database, no backend)
**Export**: PDF/PNG downloads (no email sending)

---

## Tech Stack

### Core
- React 18.2.0
- React Router DOM 6.11.1
- JavaScript (ES6+)

### UI Framework
- Material-UI 5.13.0
- @mui/icons-material 5.11.16
- @emotion/react & @emotion/styled

### Calendar
- FullCalendar 6.1.8 (react, daygrid, timegrid, interaction)

### Date Handling
- date-fns 2.30.0
- @mui/x-date-pickers 6.5.0

### Export
- html2canvas 1.4.1
- jspdf 2.5.1

---

## Project Structure

```
mc-fallback-v2/
├── public/
│   ├── index.html
│   └── sample-data/
│       └── chs-alljobs.json          # Sample Format A data
├── src/
│   ├── index.js                       # Entry point
│   ├── App.js                         # Root component with routing
│   ├── components/
│   │   ├── Dashboard.js               # Landing page with navigation
│   │   ├── Admin.js                   # Upload JSON data page
│   │   ├── JobCalendar.js             # Job calendar view
│   │   ├── EmployeeCalendar.js        # Employee schedule view
│   │   ├── ExportSchedule.js          # Export team schedule to PDF/PNG
│   │   ├── Header.js                  # Navigation bar
│   │   ├── Footer.js                  # Footer
│   │   └── Documentation.js           # Help/docs page
│   ├── utils/
│   │   ├── storage.js                 # LocalStorage wrapper
│   │   ├── dataTransform.js           # Format A transformation
│   │   └── exportHelpers.js           # PDF/PNG export functions
│   ├── hooks/
│   │   └── usePersistedData.js        # Custom hook for data management
│   ├── constants/
│   │   └── teamPositions.js           # Team position mappings
│   └── styles/
│       ├── index.css                  # Global styles
│       └── App.css                    # Component-specific styles
├── CLAUDE.md                          # Project status tracking (THIS FILE)
├── PROJECT-PLAN.md                    # This plan document
├── REBUILD-SPEC.md                    # Original specification
└── package.json
```

---

## Data Model

### Input Format (Format A - api/jobs/getall)

```json
{
  "Result": [
    {
      "JobInformationId": 106065559,
      "JobDate": "2025-10-20T00:00:00",
      "ScheduledStartTime": "2025-10-20T14:00:00",
      "ScheduledEndTime": "2025-10-20T16:00:00",
      "ScheduledTeams": [
        {
          "TeamListId": 7,
          "TeamListDescription": "Team 1 - Ruthie & Paula (#65)",
          "Color": "#ff008b",
          "SortOrder": 1
        }
      ],
      "CustomerInformation": { /* nested */ },
      "HomeInformation": { /* nested */ },
      "NotesAndMemos": { /* nested */ },
      "ContactInfos": [ /* array */ ],
      "EmployeeSchedules": [ /* array */ ],
      "JobTags": [ /* array */ ],
      "HomeTags": [ /* array */ ],
      "CustomerTags": [ /* array */ ]
    }
  ]
}
```

### Internal Format (After Transformation)

```json
{
  "metadata": {
    "companyName": "MaidCentral",
    "lastUpdated": "2025-10-21T10:30:00Z",
    "dataFormat": "getall",
    "dataRange": {
      "startDate": "2025-10-20",
      "endDate": "2025-11-20"
    },
    "stats": {
      "totalJobs": 150,
      "totalTeams": 8,
      "totalEmployees": 25
    }
  },
  "teams": [
    {
      "id": "7",
      "name": "Team 1 - Ruthie & Paula (#65)",
      "color": "#ff008b",
      "sortOrder": 1
    }
  ],
  "jobs": [
    {
      "id": "106065559",
      "customerName": "Chet Godrick",
      "serviceType": "Full clean",
      "scopeOfWork": "Routine",
      "address": "32 Hidden Green Ln, Isle of Palms, SC 29451",
      "eventInstructions": "",
      "specialInstructions": "<p>Credit card...</p>",
      "petInstructions": "<p>none</p>",
      "directions": null,
      "specialEquipment": "<p>Chem free</p>",
      "wasteInfo": "<p>side of home</p>",
      "accessInformation": "<p>Key / home...</p>",
      "internalMemo": "<p>Would like Ruthie...</p>",
      "tags": [
        { "type": "home", "description": "Key", "icon": "fa fa-key", "color": "#cac542" }
      ],
      "scheduledTeams": ["7"],
      "schedule": {
        "date": "2025-10-20",
        "startTime": "14:00",
        "endTime": "16:00"
      },
      "billRate": 167.55,
      "contactInfo": {
        "phone": "443-831-8129",
        "email": "cgodrick1@gmail.com"
      }
    }
  ],
  "employees": [
    {
      "id": "1486",
      "firstName": "Paula",
      "lastName": "Burdette",
      "name": "Paula Burdette",
      "teamId": "7",
      "position": {
        "id": 2,
        "name": "Team Member",
        "color": "#3498DB"
      },
      "shifts": [
        {
          "jobId": "106065559",
          "date": "2025-10-20",
          "startTime": "14:00",
          "endTime": "16:00"
        }
      ]
    }
  ]
}
```

### LocalStorage Schema

```javascript
// Key: 'mc_backup_data'
{
  metadata: { /* as above */ },
  teams: [ /* array */ ],
  jobs: [ /* array */ ],
  employees: [ /* array */ ]
}
```

---

## Implementation Phases

### Phase 1: Setup (30 mins)
**Goal**: Bootstrap React app with dependencies and folder structure

- [ ] Run `npx create-react-app mc-fallback-v2` (or use existing directory)
- [ ] Install dependencies:
  ```bash
  npm install @mui/material @mui/icons-material @emotion/react @emotion/styled
  npm install @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction
  npm install react-router-dom @mui/x-date-pickers date-fns
  npm install html2canvas jspdf
  ```
- [ ] Create folder structure (components, utils, hooks, constants, styles)
- [ ] Set up basic App.js with React Router
- [ ] Create placeholder components

**Deliverable**: Running React app with routing skeleton

---

### Phase 2: Data Layer (1-2 hours)
**Goal**: Build data transformation and storage utilities

#### 2.1 Storage Utility (`src/utils/storage.js`)
```javascript
const STORAGE_KEY = 'mc_backup_data';

export const DataStorage = {
  save(data) { /* localStorage.setItem */ },
  load() { /* localStorage.getItem + JSON.parse */ },
  clear() { /* localStorage.removeItem */ },
  exists() { /* check if key exists */ }
};
```

#### 2.2 Team Positions (`src/constants/teamPositions.js`)
```javascript
export const TEAM_POSITIONS = {
  0: { name: "Unassigned", color: "#999999" },
  1: { name: "Team Leader", color: "#E74C3C" },
  2: { name: "Team Member", color: "#3498DB" },
  // ...
};
```

#### 2.3 Data Transformation (`src/utils/dataTransform.js`)
- [ ] Implement `transformFormatA(json)` function
- [ ] Extract teams from `ScheduledTeams[]` arrays
- [ ] Transform jobs with all nested objects
- [ ] Extract employees from `EmployeeSchedules[]`
- [ ] Handle null/undefined values
- [ ] Calculate metadata (date range, stats)

#### 2.4 Custom Hook (`src/hooks/usePersistedData.js`)
```javascript
export function usePersistedData() {
  const [data, setData] = useState(null);

  useEffect(() => {
    // Load on mount
    const stored = DataStorage.load();
    if (stored) setData(stored);
  }, []);

  const saveData = (newData) => { /* save + setState */ };
  const clearData = () => { /* clear + setState */ };

  return { data, saveData, clearData };
}
```

**Tasks**:
- [ ] Create storage.js
- [ ] Create teamPositions.js
- [ ] Create dataTransform.js with full transformation logic
- [ ] Create usePersistedData.js hook
- [ ] Test transformation with chs-alljobs.json

**Deliverable**: Working data transformation and storage layer

---

### Phase 3: Core UI (1 hour)
**Goal**: Header, Footer, and Dashboard

#### 3.1 Header (`src/components/Header.js`)
- [ ] Material-UI AppBar
- [ ] Navigation links: Dashboard, Jobs, Employees, Export, Admin, Docs
- [ ] Highlight active route
- [ ] Responsive design

#### 3.2 Footer (`src/components/Footer.js`)
- [ ] Simple footer with copyright
- [ ] "Emergency use only" message

#### 3.3 Dashboard (`src/components/Dashboard.js`)
- [ ] Check if data exists in localStorage
- [ ] If no data: Show "Upload data" message + button → /admin
- [ ] If data exists: Show navigation cards:
  - View Job Calendar
  - View Employee Calendar
  - Export Team Schedule
  - Upload New Data
  - Documentation
- [ ] Material-UI Cards with icons

**Tasks**:
- [ ] Create Header with navigation
- [ ] Create Footer
- [ ] Create Dashboard with conditional rendering
- [ ] Style with Material-UI theme

**Deliverable**: Functional navigation and landing page

---

### Phase 4: Admin Page (1 hour)
**Goal**: Upload and manage JSON data

#### 4.1 Admin Component (`src/components/Admin.js`)
- [ ] File upload UI (drag & drop + click to browse)
- [ ] File type validation (.json only)
- [ ] JSON parsing with try/catch
- [ ] Call dataTransform.transformFormatA()
- [ ] Save to localStorage via usePersistedData hook
- [ ] Show success message + redirect to Dashboard or Jobs
- [ ] "Clear All Data" button with confirmation
- [ ] Display current data info (if exists):
  - Last updated timestamp
  - Number of jobs, teams, employees

**Tasks**:
- [ ] Create upload interface with Material-UI
- [ ] Implement drag & drop functionality
- [ ] Add file validation
- [ ] Connect to dataTransform utility
- [ ] Save to localStorage
- [ ] Add Clear Data functionality
- [ ] Show success/error alerts

**Deliverable**: Working admin page for data upload

---

### Phase 5: Job Calendar (2-3 hours)
**Goal**: Display jobs on calendar with team filtering

#### 5.1 Job Calendar Component (`src/components/JobCalendar.js`)
- [ ] Load data from usePersistedData hook
- [ ] Show "No data" message if empty → link to Admin
- [ ] FullCalendar setup:
  - [ ] timeGridWeek and timeGridDay views
  - [ ] Time range: 6:00 AM - 10:00 PM
  - [ ] Day/Week toggle buttons
  - [ ] Today/Prev/Next navigation
- [ ] Transform jobs to calendar events:
  - [ ] title: customer name
  - [ ] start/end: schedule date + times
  - [ ] backgroundColor: team color
  - [ ] Display: customer, service, address
- [ ] Team filter dropdown:
  - [ ] "All Teams" option
  - [ ] List all teams
  - [ ] Filter events by selected team
  - [ ] Handle multi-team jobs
- [ ] Privacy toggle: "Hide Sensitive Information"
- [ ] Event click handler:
  - [ ] Create tooltip DOM element
  - [ ] Position near click point
  - [ ] Show all job details (respect privacy toggle)
  - [ ] Close button (X)
  - [ ] Auto-dismiss after 10 seconds
  - [ ] Click outside to close

**Tasks**:
- [ ] Set up FullCalendar with plugins
- [ ] Implement event transformation
- [ ] Add team color coding
- [ ] Create team filter dropdown
- [ ] Add view toggles (day/week)
- [ ] Implement event click tooltip
- [ ] Add privacy toggle
- [ ] Style tooltip with CSS

**Deliverable**: Fully functional job calendar

---

### Phase 6: Employee Calendar (1-2 hours)
**Goal**: Display employee schedules

#### 6.1 Employee Calendar Component (`src/components/EmployeeCalendar.js`)
- [ ] Load data from usePersistedData hook
- [ ] Show "No data" message if empty
- [ ] Same FullCalendar setup as Job Calendar
- [ ] Transform employee shifts to events:
  - [ ] title: employee name + position
  - [ ] start/end: shift date + times
  - [ ] backgroundColor: team color
- [ ] Team filter dropdown
- [ ] Event click handler:
  - [ ] Show employee details
  - [ ] Name, position, team
  - [ ] Shift date and hours
- [ ] Privacy toggle (if needed)

**Tasks**:
- [ ] Clone JobCalendar structure
- [ ] Transform employee shifts to events
- [ ] Add team filtering
- [ ] Implement shift details tooltip
- [ ] Style consistently with Job Calendar

**Deliverable**: Fully functional employee calendar

---

### Phase 7: Export Schedule (2-3 hours)
**Goal**: Generate downloadable PDF/PNG of team schedules

#### 7.1 Export Schedule Component (`src/components/ExportSchedule.js`)
- [ ] Form UI:
  - [ ] Team selection dropdown (required)
  - [ ] Date picker (required)
  - [ ] Additional notes field (optional, multiline)
  - [ ] Privacy toggle: "Hide Confidential Information"
- [ ] Preview generation:
  - [ ] Filter employees by team + date
  - [ ] Filter jobs by team + date
  - [ ] Generate HTML with:
    - Team name + date header
    - Team members table (name, position, hours)
    - Jobs section (each job in styled box)
    - Footer
  - [ ] "Show Preview" / "Hide Preview" button
  - [ ] Render with dangerouslySetInnerHTML
- [ ] Export buttons:
  - [ ] Download as PDF (html2canvas + jsPDF)
  - [ ] Download as Image (PNG)
  - [ ] Print (browser print dialog)
  - [ ] Auto-generate filename: `TeamName_Schedule_YYYY-MM-DD.pdf`
- [ ] Validation: all required fields
- [ ] Style for print/export

**Tasks**:
- [ ] Create form with Material-UI components
- [ ] Implement schedule HTML generation
- [ ] Add preview functionality
- [ ] Implement PDF export (html2canvas + jsPDF)
- [ ] Implement PNG export
- [ ] Add print functionality
- [ ] Style schedule layout for export
- [ ] Add validation and error handling

**Deliverable**: Working export feature

---

### Phase 8: Polish & Documentation (1-2 hours)
**Goal**: Final touches and documentation

#### 8.1 Documentation Component (`src/components/Documentation.js`)
- [ ] User guide:
  - [ ] How to upload data
  - [ ] How to use calendars
  - [ ] How to export schedules
  - [ ] Privacy features
- [ ] Data format information
- [ ] Troubleshooting tips

#### 8.2 Polish
- [ ] Responsive design (mobile/tablet)
- [ ] Loading states
- [ ] Error boundaries
- [ ] Empty states
- [ ] Consistent styling
- [ ] Accessibility (ARIA labels, keyboard navigation)
- [ ] Cross-browser testing (Chrome, Firefox, Safari, Edge)

#### 8.3 Testing
- [ ] Test with sample data (chs-alljobs.json)
- [ ] Test with no data (first-time user)
- [ ] Test localStorage persistence
- [ ] Test data clearing
- [ ] Test all calendar features
- [ ] Test export functionality
- [ ] Test on different screen sizes
- [ ] Test with large datasets

**Tasks**:
- [ ] Create documentation page
- [ ] Add loading states throughout app
- [ ] Ensure responsive design
- [ ] Add error handling everywhere
- [ ] Manual testing with checklist
- [ ] Fix any bugs found

**Deliverable**: Production-ready application

---

## Key Technical Decisions

### 1. Team Colors
- **Source**: Use `ScheduledTeams[].Color` from Format A data
- **Fallback**: Generate from team name hash if missing
- **Usage**: Calendar event background color, team filter legend

### 2. Employee Shift Times
- **Problem**: `EmployeeSchedules[]` doesn't have shift start/end times
- **Solution**: Use job's `ScheduledStartTime` and `ScheduledEndTime` as employee shift times
- **Assumption**: Employees work the entire job duration

### 3. Team Position Mapping
- **Source**: `EmployeeSchedules[].TeamPosition` (number)
- **Mapping**: Use `constants/teamPositions.js` to map ID → name + color
- **Expandable**: Add more positions as discovered in data

### 4. HTML Content Handling
- **Issue**: Many instruction fields contain HTML tags (`<p>`, `<span>`, etc.)
- **Solution**: Render with `dangerouslySetInnerHTML` in tooltips and exports
- **Benefit**: Preserves formatting from source system

### 5. Contact Info Priority
- **Phone**: Prefer Cell Phone (ContactTypeId=2), fallback to Home Phone (ContactTypeId=1)
- **Email**: Use Email Address (ContactTypeId=3)
- **Multiple**: Use first found of each type

### 6. Multi-Team Jobs
- **Handling**: Job can belong to multiple teams (`ScheduledTeams[]` array)
- **Display**: Job appears in calendar when any of its teams is selected
- **Filter**: "All Teams" shows jobs from all teams

### 7. Unassigned Jobs
- **Issue**: Some jobs have empty `ScheduledTeams[]` array
- **Solution**: Assign to "Unassigned" team (id: "0", color: "#999999")
- **Display**: Shows in "Unassigned" filter option

---

## Testing Checklist

### Data Upload
- [ ] Upload valid Format A JSON → success
- [ ] Upload invalid JSON → error message
- [ ] Upload non-JSON file → error message
- [ ] Drag and drop file → success
- [ ] Click to browse file → success
- [ ] Clear data → localStorage empty

### Job Calendar
- [ ] Jobs render in correct time slots
- [ ] Team colors display correctly
- [ ] Team filter works (all teams + individual)
- [ ] Day/Week view toggle works
- [ ] Navigate prev/next/today
- [ ] Click event shows tooltip
- [ ] Tooltip displays all details
- [ ] Tooltip respects privacy toggle
- [ ] Tooltip closes on X, outside click, 10s timer
- [ ] Multi-team jobs appear correctly

### Employee Calendar
- [ ] Employee shifts render correctly
- [ ] Team filter works
- [ ] Click shift shows details
- [ ] Colors match team colors

### Export Schedule
- [ ] Form validation works
- [ ] Preview generates correctly
- [ ] Privacy toggle hides sensitive data
- [ ] Download PDF works
- [ ] Download PNG works
- [ ] Print dialog opens
- [ ] Filename auto-generated correctly

### Persistence
- [ ] Data persists after page refresh
- [ ] Data persists after browser close/reopen
- [ ] Clear data removes from localStorage
- [ ] New upload replaces old data

### Navigation
- [ ] All nav links work
- [ ] Active route highlights
- [ ] Back/forward browser buttons work
- [ ] Direct URL navigation works

---

## Timeline Estimate

| Phase | Description | Time Estimate |
|-------|-------------|---------------|
| 1 | Setup | 30 mins |
| 2 | Data Layer | 1-2 hours |
| 3 | Core UI | 1 hour |
| 4 | Admin Page | 1 hour |
| 5 | Job Calendar | 2-3 hours |
| 6 | Employee Calendar | 1-2 hours |
| 7 | Export Schedule | 2-3 hours |
| 8 | Polish & Documentation | 1-2 hours |
| **TOTAL** | | **10-15 hours** |

---

## Next Steps

1. Update CLAUDE.md with current status
2. Begin Phase 1: Setup
3. Work through phases sequentially
4. Update CLAUDE.md after each phase completion
5. Test thoroughly before considering complete

---

## Success Criteria

✅ Uploads Format A JSON data
✅ Transforms and stores in localStorage
✅ Displays jobs on calendar with team colors
✅ Filters by team
✅ Shows detailed job information
✅ Displays employee schedules
✅ Exports team schedules as PDF/PNG
✅ Hides sensitive data on toggle
✅ Works entirely client-side (no backend)
✅ Data persists between sessions
✅ Responsive and accessible UI
