# MaidCentral Backup Application - Rebuild Specification

> **⚠️ HISTORICAL REFERENCE DOCUMENT**
>
> This document is from an older repository iteration and is kept for reference purposes only.
>
> **For current implementation, refer to:**
> - **[CLAUDE.md](./CLAUDE.md)** - Current project status and instructions (PRIMARY SOURCE)
> - **[PROJECT-PLAN.md](./PROJECT-PLAN.md)** - Detailed implementation plan
>
> **Key Differences from Current Implementation:**
> - This spec mentions Format B (dispatch board) - **NOT USED in current version**
> - Current version uses **Format A ONLY** (api/jobs/getall structure)
> - Current version uses **shadcn/ui + Tailwind CSS** (not Material-UI as mentioned here)
> - Current version focuses on **PDF/PNG export** (not email sending)

---

## Executive Summary

Build a standalone, client-side web application that allows viewing and managing cleaning service job schedules when the main MaidCentral system is offline. The app processes JSON data exports from the MaidCentral API to display job schedules, team assignments, and employee schedules in calendar views with privacy controls and email capabilities.

---

## Core Requirements

### 1. File Upload & Data Processing
**Requirement:** Users upload a JSON file containing job/schedule data, which is processed entirely in the browser (no backend).

**Functionality:**
- Drag-and-drop file upload interface
- JSON file validation and parsing
- Support for **two distinct JSON formats:**
  - **Format A (getall.json):** Nested object structure with `CustomerInformation`, `HomeInformation`, `ServiceSet`, `NotesAndMemos`, `ContactInfos` arrays, and `ScheduledTeams` array of objects
  - **Format B (Dispatch Board):** Flattened structure with direct properties like `CustomerFirstName`, `HomeAddress1`, `ScheduledTeamListIds` array of numbers
- Auto-detection of format type
- Transformation to internal unified data structure
- Error handling with user-friendly messages
- File type validation (JSON only)

**Technical Notes:**
- Use FileReader API
- Parse with try/catch for JSON.parse()
- Navigate to calendar view after successful upload
- Store data in React state (no persistence)

---

### 2. Job Calendar View
**Requirement:** Display all jobs on a calendar/timeline view with team-based color coding and detailed job information.

**Functionality:**
- **Calendar Views:**
  - Day view (timeGridDay) - hourly schedule for single day
  - Week view (timeGridWeek) - full week with time slots
  - View toggle buttons
- **Time Range:** 6:00 AM to 10:00 PM
- **Event Display:**
  - Customer name as title
  - Service type
  - Address (street on line 1, city/state on line 2)
  - Time range
  - Color-coded by team assignment
- **Team Filtering:**
  - Dropdown to filter by specific team or "All Teams"
  - Multi-team job support (jobs can belong to multiple teams)
- **Event Details Tooltip:**
  - Click event to show popup with full details:
    - Customer name, address
    - Service type, scope of work
    - Team assignment
    - Schedule (date, start/end time)
    - Add-ons/job tags
    - Event instructions
    - Special instructions (home, pet, directions, equipment, waste, access)
    - Internal memo
    - Bill rate (conditionally hidden)
    - Contact info: phone, email (conditionally hidden)
  - Tooltip positioning: fixed position near click point
  - Auto-dismiss after 10 seconds
  - Manual close button (X)
  - Click outside to close
- **Navigation Controls:**
  - Previous/Next day or week
  - Today button
  - Date title display

**UI Components:**
- FullCalendar library (@fullcalendar/react with dayGrid, timeGrid, interaction plugins)
- Material-UI controls (Switch, Select, Button, ButtonGroup)
- Paper container with elevation
- Alert for "no data" state

---

### 3. Employee Schedule Calendar
**Requirement:** Display employee work schedules on a calendar view, filtered by team.

**Functionality:**
- Same calendar views as Job Calendar (day/week)
- Display employee shifts with:
  - Employee name
  - Position/role
  - Shift time range
  - Team color coding
- Team filtering dropdown
- Click to view shift details:
  - Employee name, position
  - Team assignment
  - Shift date and hours
- "No data" state handling

**Technical Notes:**
- Currently returns empty employees array in transformation
- Structure prepared for future employee data extraction
- Uses same FullCalendar setup as Job Calendar

---

### 4. Privacy Controls
**Requirement:** Toggle visibility of sensitive information (bill rates, contact details) for screen sharing scenarios.

**Functionality:**
- Global toggle switch: "Hide Sensitive Information"
- State shared across Job Calendar and Email features
- When enabled, hide:
  - Bill rates
  - Customer contact information (phone, email)
  - Internal memos
- Toggle appears on:
  - Job Calendar view (top right)
  - Employee Calendar view (top right)
  - Email Teams form

**UI:**
- Material-UI Switch component
- Label: "Hide Sensitive Information" or "Hide Confidential Information"
- Positioned in calendar controls area

---

### 5. Email Team Schedule
**Requirement:** Generate and preview formatted email content with team schedules for a specific date.

**Functionality:**
- **Form Inputs:**
  - Team selection dropdown (required)
  - Date picker for schedule date (required)
  - Recipient email address (required)
  - Subject line (auto-generated, editable)
  - Additional message (optional, multiline)
  - Privacy toggle: "Hide Confidential Information"
- **Auto-Generation:**
  - Subject: "[Team Name] Schedule for [Formatted Date]"
  - Updates when team or date changes
- **Email Content Structure:**
  - Title: Team name and date
  - **Team Members Section:**
    - Table with columns: Name, Position, Hours
    - Sorted by shift start time
    - Shows members working on selected date
  - **Jobs Section:**
    - Separate styled box for each job
    - Header with job number, customer, time range (colored by team)
    - Table with job details:
      - Time, Customer, Service, Scope, Address
      - Add-ons (if any)
      - All instruction types (event, special, pet, directions, equipment, waste, access, internal memo)
      - Bill rate and contact info (conditional on privacy toggle)
  - Footer: "Sent from MaidCentral Backup System"
- **Preview:**
  - "Show Preview" / "Hide Preview" button
  - Renders HTML email in preview div
  - Uses `dangerouslySetInnerHTML` for rendering
- **Send Functionality:**
  - Validation: all required fields must be filled
  - Currently shows success message (demo mode)
  - Ready for EmailJS or API integration
- **Styling:**
  - HTML tables with borders
  - Team color in job headers
  - Responsive design for email clients

**Technical Stack:**
- Material-UI form components
- @mui/x-date-pickers for DatePicker
- AdapterDateFns for date formatting
- Alert component for validation errors and success messages

---

## Data Structure Specification

### Internal Format (Post-Transformation)

```json
{
  "metadata": {
    "companyName": "String",
    "generatedDate": "ISO 8601 timestamp",
    "dataRange": {
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD"
    }
  },
  "teams": [
    {
      "id": "String",
      "name": "String",
      "color": "#RRGGBB",
      "sortOrder": "Number (optional)"
    }
  ],
  "employees": [
    {
      "id": "String",
      "name": "String",
      "position": "String",
      "teamId": "String (references teams[].id)",
      "schedule": [
        {
          "date": "YYYY-MM-DD",
          "startTime": "HH:MM (24-hour)",
          "endTime": "HH:MM (24-hour)"
        }
      ]
    }
  ],
  "jobs": [
    {
      "id": "String",
      "customerName": "String",
      "serviceType": "String",
      "scopeOfWork": "String",
      "address": "String",
      "eventInstructions": "String",
      "specialInstructions": "String",
      "petInstructions": "String",
      "directions": "String",
      "specialEquipment": "String",
      "wasteInfo": "String",
      "accessInformation": "String",
      "internalMemo": "String",
      "addOns": ["String"],
      "scheduledTeamId": "String (primary team)",
      "scheduledTeams": ["String"] (all assigned teams),
      "schedule": {
        "date": "YYYY-MM-DD",
        "startTime": "HH:MM",
        "endTime": "HH:MM"
      },
      "billRate": "Number",
      "contactInfo": {
        "phone": "String",
        "email": "String"
      }
    }
  ]
}
```

### Input Format A: getall.json (Nested Structure)

```json
{
  "Result": [
    {
      "JobInformationId": 12345,
      "JobDate": "2025-10-20T00:00:00",
      "ScheduledStartTime": "2025-10-20T09:00:00",
      "ScheduledEndTime": "2025-10-20T11:00:00",
      "BillRate": 150.00,
      "ScheduledTeams": [
        {
          "TeamListId": 101,
          "TeamListDescription": "Team Alpha",
          "Color": "#FF5733",
          "SortOrder": 1
        }
      ],
      "CustomerInformation": {
        "CustomerFirstName": "John",
        "CustomerLastName": "Doe"
      },
      "HomeInformation": {
        "HomeAddress1": "123 Main St",
        "HomeCity": "Charleston",
        "HomeRegion": "SC",
        "HomePostalCode": "29401"
      },
      "ServiceSet": {
        "ServiceSetDescription": "Deep Clean",
        "ServiceSetTypeDescription": "One-Time Service"
      },
      "NotesAndMemos": {
        "EventInstructions": "...",
        "HomeSpecialInstructions": "...",
        "HomePetInstructions": "...",
        "HomeDirections": "...",
        "HomeSpecialEquipment": "...",
        "HomeWasteDisposal": "...",
        "HomeAccessInformation": "...",
        "HomeInternalMemo": "..."
      },
      "ContactInfos": [
        {
          "ContactTypeId": 2,
          "ContactInfo": "843-555-1234",
          "ContactType": "Cell Phone"
        },
        {
          "ContactTypeId": 3,
          "ContactInfo": "john@example.com",
          "ContactType": "Email"
        }
      ],
      "JobTags": [
        {
          "Description": "Window Cleaning"
        }
      ]
    }
  ]
}
```

### Input Format B: Dispatch Board (Flattened Structure)

```json
{
  "IsSuccess": true,
  "Message": "Operation successful.",
  "Result": [
    {
      "JobInformationId": 55062795,
      "JobDate": "2025-10-20T00:00:00",
      "ScheduledStartTime": "2025-10-20T09:00:00",
      "ScheduledEndTime": "2025-10-20T13:26:00",
      "BillRate": 249.0000,
      "ScheduledTeamListIds": [4735],
      "ScheduledTeamListDescription": "⭐ S2 - Natasha 🥇🫧",
      "CustomerFirstName": "Kathryn",
      "CustomerLastName": "Pearson",
      "HomeAddress1": "514 Yellow Tower Terrace",
      "HomeCity": "Charleston",
      "HomeRegion": "SC",
      "HomePostalCode": "29412",
      "ServiceSetDescription": "Recurring Service",
      "ServiceSetTypeDescription": "Recurring Service",
      "EventInstructions": null,
      "HomeSpecialInstructions": "<p>Our wood floors scratch...</p>",
      "HomePetInstructions": "<p>no pets</p>",
      "HomeDirections": null,
      "HomeSpecialEquipment": null,
      "HomeWasteDisposal": null,
      "HomeAcessInformation": "<p>We will be home.</p>",
      "HomeInternalMemo": "<p><span>PLease call...</span></p>",
      "CellPhone": "203-609-1837",
      "PreferredPhone": "203-609-1837",
      "EmailAddressScorecard": "kathryn.tayloe@gmail.com",
      "TagsString": "",
      "Frequency": "Every Four Weeks",
      "FrequencyColor": "#578CAC"
    }
  ]
}
```

---

## Technical Architecture

### Technology Stack

**Core:**
- React 18.2.0
- React Router DOM 6.11.1 (client-side routing)
- JavaScript (ES6+)

**UI Framework:**
- Material-UI (@mui/material 5.13.0)
- @mui/icons-material 5.11.16
- @emotion/react & @emotion/styled for styling

**Calendar:**
- FullCalendar 6.1.8
  - @fullcalendar/react
  - @fullcalendar/daygrid
  - @fullcalendar/timegrid
  - @fullcalendar/interaction

**Date Handling:**
- date-fns 2.30.0
- @mui/x-date-pickers 6.5.0

**Optional (for email):**
- emailjs-com 3.2.0 (currently included but not actively used)

**Build Tool:**
- Create React App (react-scripts 5.0.1)

### Project Structure

```
src/
├── index.js                    # Entry point, renders App
├── App.js                      # Root component with routing and global state
├── components/
│   ├── Home.js                 # File upload, validation, transformation
│   ├── Header.js               # Navigation bar
│   ├── Footer.js               # Footer with copyright and links
│   ├── JobCalendar.js          # Job calendar view with FullCalendar
│   ├── EmployeeCalendar.js     # Employee schedule view
│   ├── EmailTeam.js            # Email generation and preview
│   └── Documentation.js        # Help/docs page
├── styles/
│   ├── index.css               # Global styles
│   └── App.css                 # Component-specific styles
└── [other CRA files]

public/
├── index.html                  # HTML template
├── sample-data.json            # Sample file in Format A
├── getall-sample.json          # Sample file in Format A (detailed)
└── getall.json                 # Sample file

docs/
├── data-structure.md           # Detailed data format documentation
├── deployment.md               # Deployment instructions
├── developer-guide.md          # Developer documentation
└── user-guide.md               # End-user instructions
```

### State Management

**Global State (App.js):**
- `data` - Uploaded and transformed JSON data
- `hideInfo` - Boolean flag for privacy mode
- `selectedTeam` - Currently selected team filter (string ID or "all")

**State Flow:**
1. User uploads file in Home component
2. Home validates, transforms, calls `onFileUpload(transformedData)`
3. App stores in `data` state
4. App passes `data` as prop to all child components
5. Calendar components render based on `data`, `hideInfo`, `selectedTeam`

**Local State:**
- Calendar components: `viewType` (day/week)
- Email component: form fields (team, date, recipient, subject, message, preview visibility)

### Routing

```javascript
/ - Home (upload)
/jobs - Job Calendar
/employees - Employee Calendar
/email - Email Teams
/docs - Documentation
```

- Uses React Router's BrowserRouter
- Header highlights active route
- No authentication/protected routes

---

## Key Features & Implementation Details

### 1. Data Transformation Logic

**Format Detection:**
```javascript
// Check for Format A (nested)
if (data.metadata && data.teams && Array.isArray(data.teams) &&
    data.jobs && Array.isArray(data.jobs)) {
  return data; // Already in internal format
}

// Check for Format B (dispatch board)
if (data.Result && Array.isArray(data.Result)) {
  return transformDispatchBoard(data.Result);
}

// Check for Format A (getall.json)
if (data.Result && Array.isArray(data.Result) &&
    data.Result[0].CustomerInformation) {
  return transformGetAllFormat(data.Result);
}

throw new Error('Invalid data format');
```

**Team Extraction (Format A):**
- Iterate through all jobs
- Extract unique teams from `ScheduledTeams` arrays
- Use `TeamListId` as unique key
- Capture `TeamListDescription`, `Color`, `SortOrder`
- Add default "Unassigned" team (#999999)
- Sort teams by `SortOrder` ascending

**Team Extraction (Format B - CRITICAL ISSUE):**
- Only have `ScheduledTeamListIds` (number array) and `ScheduledTeamListDescription` (single string)
- **No color or sort order available**
- Must generate team colors using hash function
- Cannot determine individual team names for multi-team jobs
- Must handle gracefully with default colors

**Null Safety:**
- Use optional chaining (`?.`) for all nested object access
- Provide fallback values (`|| ''`, `|| []`)
- Check array existence before `.map()` operations
- Handle HTML entities in text fields (some fields contain `<p>` tags)

### 2. Team Color Generation

```javascript
function getRandomColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
  return "#" + "00000".substring(0, 6 - c.length) + c;
}
```

Used when:
- Team has no `Color` property
- Dispatch board format (no color data)

### 3. Calendar Event Click Handler

**Implementation:**
```javascript
handleEventClick = (clickInfo) => {
  // Remove existing tooltips
  document.querySelectorAll('.event-tooltip-container').forEach(el =>
    document.body.removeChild(el)
  );

  // Create tooltip DOM element
  const tooltip = document.createElement('div');
  tooltip.className = 'event-tooltip-container';
  tooltip.innerHTML = generateTooltipHTML(job, hideInfo);

  // Position near click point
  tooltip.style.left = `${clickInfo.jsEvent.pageX + 10}px`;
  tooltip.style.top = `${clickInfo.jsEvent.pageY + 10}px`;

  document.body.appendChild(tooltip);

  // Auto-dismiss after 10 seconds
  setTimeout(() => { /* remove tooltip */ }, 10000);

  // Add close button and outside-click listener
  // ...
}
```

**Why DOM manipulation instead of React state?**
- FullCalendar operates outside React's virtual DOM
- Direct DOM manipulation for positioning relative to click
- Simpler than managing portal/modal state

### 4. Email HTML Generation

**Table Structure:**
```html
<h2>[Team Name] Schedule for [Date]</h2>

<h3>Team Members</h3>
<table border="1" cellpadding="5" cellspacing="0">
  <tr><th>Name</th><th>Position</th><th>Hours</th></tr>
  <!-- Employee rows -->
</table>

<h3>Jobs</h3>
<div> <!-- Per job -->
  <h4 style="background-color: [team.color]">
    Job #[N]: [Customer] ([time range])
  </h4>
  <table border="1">
    <tr><th>Field</th><th>Details</th></tr>
    <tr><td>Time</td><td>[start] - [end]</td></tr>
    <tr><td>Customer</td><td>[name]</td></tr>
    <!-- More rows -->
  </table>
</div>
```

**Conditional Rendering:**
- Each instruction type only shows if value exists
- Bill rate and contact info hidden if `hideInfo === true`
- Uses template literals for clean HTML generation

---

## User Interface Specifications

### Layout
- **Header:** Fixed AppBar with navigation links, active route highlighted
- **Main Content:** Centered container, max-width 1200px, padding 20px
- **Footer:** Sticky footer with copyright and emergency use notice

### Color Scheme
- **Primary:** #1976d2 (Material-UI blue)
- **Secondary:** #dc004e (Material-UI pink)
- **Team Colors:** Assigned from API or generated via hash
- **Backgrounds:**
  - Upload area: #f9f9f9, hover: #f0f7ff
  - Email preview: #f9f9f9
  - Footer: Grey 200/800 (light/dark mode)

### Responsive Design
- Mobile breakpoint: 768px
- Calendar controls stack vertically on mobile
- Team filter expands to full width
- Calendar adjusts to smaller screens (FullCalendar responsive)

### Typography
- Font: System font stack (default Material-UI)
- Headers: Material-UI Typography variants (h4, h6)
- Body: body1, body2
- Code/JSON: monospace in documentation

---

## Critical Bugs & Issues to Fix

### 🐛 Bug 1: Null Safety in Transformation
**Severity:** HIGH - Will crash on real data

**Location:** Home.js lines 103-127

**Issue:** Assumes all nested objects exist:
```javascript
// CRASHES if CustomerInformation is null
customerName: `${job.CustomerInformation.CustomerFirstName} ${job.CustomerInformation.CustomerLastName}`
```

**Fix:** Add optional chaining and fallbacks:
```javascript
customerName: job.CustomerInformation
  ? `${job.CustomerInformation.CustomerFirstName || ''} ${job.CustomerInformation.CustomerLastName || ''}`
  : 'Unknown Customer'
```

Apply to: `ServiceSet`, `NotesAndMemos`, `HomeInformation`, `ContactInfos`, `JobTags`

---

### 🐛 Bug 2: ContactTypeId Mismatch
**Severity:** MEDIUM - Will miss phone numbers

**Location:** Home.js line 125

**Issue:** Code expects `ContactTypeId === 2` for phone, but actual data shows `1`

**Evidence:**
```json
// Actual data from getall-sample.json
{"ContactTypeId": 1, "ContactType": "Home Phone"},
{"ContactTypeId": 2, "ContactType": "Cell Phone"},  // Sometimes
{"ContactTypeId": 3, "ContactType": "Email"}
```

**Fix:** Check for both 1 and 2:
```javascript
phone: job.ContactInfos?.find(c => c.ContactTypeId === 1 || c.ContactTypeId === 2)?.ContactInfo || ''
```

---

### 🐛 Bug 3: Dispatch Board Format Not Supported
**Severity:** CRITICAL - Current file format will not work

**Location:** Home.js validateData function

**Issue:** Current transformation only handles Format A (nested objects). The actual dispatch board data (Format B) has:
- Flat structure (no `CustomerInformation` object)
- `ScheduledTeamListIds` (number array) instead of `ScheduledTeams` (object array)
- No team colors or sort order
- Different contact info structure

**Fix:** Add format detection and separate transformation:
```javascript
function transformDispatchBoard(jobs) {
  // Extract teams from ScheduledTeamListIds and descriptions
  // Map flat fields to internal structure
  // Generate colors via hash function
  // Handle null/undefined fields
}
```

---

### 🐛 Bug 4: HTML Tags in Text Fields
**Severity:** LOW - Formatting issues

**Issue:** Some instruction fields contain HTML tags like `<p>`, `<span style="...">`

**Fix Options:**
1. Strip HTML: Use regex or DOMParser
2. Render as HTML: Use `dangerouslySetInnerHTML` in tooltips/emails
3. Sanitize: Use library like DOMPurify

**Recommended:** Render as HTML in tooltips and emails (already done in email preview)

---

### 🐛 Bug 5: Employee Data Not Extracted
**Severity:** LOW - Feature incomplete

**Issue:** `extractEmployees()` returns empty array

**Fix:** Extract from `EmployeeSchedules` array in job data:
```json
"EmployeeSchedules": [
  {
    "EmployeeInformationId": 16013,
    "FirstName": "Angela",
    "LastName": "Johnson",
    "TeamListId": 3221
  }
]
```

---

## Non-Functional Requirements

### Performance
- Client-side only, no server dependencies
- Process files up to 1MB within 2 seconds
- Calendar renders 100+ events without lag
- Smooth scrolling and interactions

### Compatibility
- Modern browsers: Chrome, Firefox, Safari, Edge (last 2 versions)
- No IE11 support needed
- Responsive design for tablets and desktop (mobile view optional)

### Accessibility
- Semantic HTML
- ARIA labels on interactive elements
- Keyboard navigation support
- Color contrast WCAG AA compliant
- Screen reader friendly

### Security
- No data persistence (privacy by design)
- No external API calls (except optional EmailJS)
- Client-side only processing
- No authentication required

### Deployment
- Static hosting compatible (Netlify, Vercel, GitHub Pages, S3)
- Build with `npm run build`
- No environment variables required
- Works offline after initial load (if using service worker)

---

## Testing Requirements

### Manual Testing Checklist

**File Upload:**
- [ ] Upload valid Format A JSON - success
- [ ] Upload valid Format B JSON - success
- [ ] Upload invalid JSON - error message
- [ ] Upload non-JSON file - error message
- [ ] Drag and drop file - success
- [ ] Click to browse file - success
- [ ] Empty file - error message
- [ ] Large file (>5MB) - performance acceptable

**Job Calendar:**
- [ ] Jobs render in correct time slots
- [ ] Team colors display correctly
- [ ] Team filter shows all teams
- [ ] Filtering by team works
- [ ] Day/Week view toggle works
- [ ] Navigate prev/next/today works
- [ ] Click event shows tooltip
- [ ] Tooltip displays all non-sensitive data
- [ ] Tooltip closes on X click
- [ ] Tooltip closes on outside click
- [ ] Tooltip auto-dismisses after 10s
- [ ] Hide sensitive info toggle works
- [ ] Multi-team jobs appear in correct team filters

**Email Teams:**
- [ ] Form validation prevents empty submission
- [ ] Subject auto-generates correctly
- [ ] Date picker works
- [ ] Team dropdown populated
- [ ] Preview shows/hides on button click
- [ ] Preview HTML renders correctly
- [ ] Privacy toggle hides sensitive data in preview
- [ ] Email includes all job details
- [ ] Email formatting is clean

**Navigation:**
- [ ] All nav links work
- [ ] Active route highlights in header
- [ ] Back/forward browser buttons work
- [ ] Direct URL navigation works

### Data Format Testing

**Test Files Needed:**
1. Format A (getall.json) - nested structure
2. Format B (dispatch board) - flat structure
3. Minimal valid JSON - single job
4. Complex JSON - 100+ jobs, multiple teams
5. Edge cases:
   - Jobs with null instruction fields
   - Jobs with no contact info
   - Jobs with no team assignment
   - Jobs with HTML in instruction fields
   - Multi-team jobs
   - Jobs with empty ScheduledTeams array

---

## Future Enhancement Ideas

### Phase 2 Features
1. **Data Persistence:**
   - Save uploaded data to localStorage
   - Remember user preferences (team filter, view type, privacy mode)
   - Recent files list

2. **Advanced Filtering:**
   - Filter by date range
   - Filter by service type
   - Filter by zone/region
   - Search jobs by customer name or address

3. **Export Features:**
   - Export filtered jobs to CSV
   - Print-friendly job lists
   - Generate PDF schedules

4. **Email Integration:**
   - Actually send emails via EmailJS
   - Email templates with customizable branding
   - Batch email to multiple teams
   - Email scheduling

5. **Map View:**
   - Display jobs on Google Maps
   - Route optimization
   - Distance calculations

6. **Mobile App:**
   - React Native version
   - Offline support
   - Push notifications for schedule changes

7. **Analytics:**
   - Jobs per team
   - Revenue by team/service type
   - Schedule utilization

### Technical Improvements
- TypeScript for type safety
- Unit tests (Jest + React Testing Library)
- E2E tests (Cypress or Playwright)
- Error boundary components
- Loading states and skeletons
- Internationalization (i18n)
- Dark mode support
- PWA features (offline, install prompt)
- Chunked file reading for large files
- Web Worker for data processing

---

## Rebuild Checklist

### Phase 1: Setup & Scaffolding
- [ ] Create new React app (`npx create-react-app`)
- [ ] Install dependencies (Material-UI, FullCalendar, date-fns, react-router-dom)
- [ ] Set up folder structure (components, styles, docs)
- [ ] Create basic routing structure
- [ ] Implement Header and Footer components

### Phase 2: Core Data Flow
- [ ] Implement Home component with file upload UI
- [ ] Add FileReader and JSON parsing
- [ ] Create data validation function
- [ ] Implement Format A transformation
- [ ] Implement Format B transformation
- [ ] Add format auto-detection
- [ ] Create team extraction logic (both formats)
- [ ] Add team color generation fallback
- [ ] Implement error handling and user feedback
- [ ] Test with both sample data formats

### Phase 3: Job Calendar
- [ ] Set up FullCalendar with timeGrid plugins
- [ ] Transform jobs to calendar events
- [ ] Implement team color coding
- [ ] Add day/week view toggle
- [ ] Create team filter dropdown
- [ ] Implement event rendering (customer, service, address)
- [ ] Build event click handler with tooltip
- [ ] Add tooltip HTML generation
- [ ] Implement tooltip positioning and auto-dismiss
- [ ] Add privacy toggle for sensitive data
- [ ] Test with various data sets

### Phase 4: Employee Calendar
- [ ] Clone Job Calendar structure
- [ ] Transform employee schedules to events
- [ ] Implement employee event rendering
- [ ] Add employee tooltip
- [ ] Test with employee data (when available)

### Phase 5: Email Teams
- [ ] Create email form UI
- [ ] Add date picker and team selector
- [ ] Implement auto-subject generation
- [ ] Build HTML email generator
- [ ] Create team members table
- [ ] Create jobs table with conditional fields
- [ ] Add preview toggle
- [ ] Implement privacy mode in email
- [ ] Add form validation
- [ ] Test email HTML rendering

### Phase 6: Styling & Polish
- [ ] Apply Material-UI theming
- [ ] Create responsive layouts
- [ ] Add hover states and transitions
- [ ] Implement mobile breakpoints
- [ ] Style tooltips and popups
- [ ] Add loading states
- [ ] Polish form validation messages

### Phase 7: Testing & Documentation
- [ ] Manual testing with checklist above
- [ ] Cross-browser testing
- [ ] Create sample data files
- [ ] Write user documentation
- [ ] Write developer documentation
- [ ] Create deployment guide

### Phase 8: Deployment
- [ ] Build production bundle
- [ ] Test production build locally
- [ ] Deploy to hosting (Netlify/Vercel)
- [ ] Verify deployed app works
- [ ] Share with stakeholders

---

## Development Prompts

### Initial Setup Prompt
```
Create a new React application called "maidcentral-backup" with the following:
- Use create-react-app for bootstrapping
- Install these dependencies:
  - @mui/material @mui/icons-material @emotion/react @emotion/styled
  - @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction
  - react-router-dom
  - @mui/x-date-pickers date-fns

Set up this folder structure:
- src/components/ (for React components)
- src/styles/ (for CSS files)
- docs/ (for markdown documentation)
- public/ (for sample data files)

Create a basic Header component with navigation links for:
- Home, Jobs Calendar, Employee Calendar, Email Teams, Documentation

Create a basic Footer component with copyright and purpose statement.

Set up React Router in App.js with routes for all pages.
```

### File Upload Feature Prompt
```
Implement a file upload component (Home.js) that:
1. Uses Material-UI CloudUploadIcon and Paper components
2. Supports drag-and-drop file upload
3. Has a click-to-browse fallback
4. Only accepts .json files
5. Validates that uploaded file is valid JSON
6. Shows the file name after selection
7. Displays error messages using Material-UI Alert
8. On success, calls props.onFileUpload(data) and navigates to /jobs
9. Style the drop zone with dashed border, hover effects, and active state

Add visual feedback for:
- Hover state (blue border)
- Active drag state (green border)
- Error state (red alert)
- Success state (file name display)
```

### Data Transformation Prompt
```
Create a data transformation system that:

1. Detects JSON format:
   - Format A: Has CustomerInformation object (nested getall.json)
   - Format B: Has flat fields like CustomerFirstName (dispatch board)
   - Internal format: Has metadata, teams, jobs structure

2. For Format A (getall.json):
   - Extract teams from job.ScheduledTeams arrays
   - Each team object has: TeamListId, TeamListDescription, Color, SortOrder
   - Transform nested objects (CustomerInformation, HomeInformation, ServiceSet, NotesAndMemos)
   - Map ContactInfos array to phone/email (ContactTypeId 1-2 = phone, 3 = email)
   - Extract JobTags[].Description to addOns array
   - Handle null values with optional chaining

3. For Format B (dispatch board):
   - Extract teams from ScheduledTeamListIds (number array)
   - Generate team colors using hash function
   - Map flat fields directly (CustomerFirstName, HomeAddress1, etc.)
   - Combine CellPhone, PreferredPhone into single phone field
   - Use EmailAddressScorecard for email
   - Parse TagsString (comma-separated) to addOns array
   - Handle null/undefined with fallbacks

4. Output internal format with:
   - metadata object (company, dates)
   - teams array (id, name, color, sortOrder)
   - jobs array (all fields normalized)
   - employees array (empty for now)

5. Include comprehensive error handling:
   - Invalid JSON structure
   - Missing required fields
   - Empty Result array
   - Null nested objects

Test with both format types and edge cases.
```

### Job Calendar Prompt
```
Build a job calendar component using FullCalendar that:

1. Setup:
   - Use timeGridWeek as default view
   - Support timeGridDay and timeGridWeek views
   - Set time range: 6:00 AM to 10:00 PM
   - Include prev/next/today navigation

2. Event Rendering:
   - Transform jobs to calendar events with:
     - title: customer name
     - start: jobDate + startTime
     - end: jobDate + endTime
     - backgroundColor: team color
   - Display in event: time, customer name, service type, address (2 lines)

3. Team Filtering:
   - Dropdown with "All Teams" + list of teams
   - Filter jobs by selectedTeam prop
   - Handle multi-team jobs (scheduledTeams array)

4. Event Click Handler:
   - Create fixed-position tooltip DOM element
   - Position near click point (+10px offset)
   - Display all job details in formatted HTML:
     - Customer, address, service, scope, team
     - Schedule, add-ons
     - All instruction fields (event, special, pet, directions, equipment, waste, access, internal)
     - Bill rate and contact info (conditional on hideInfo prop)
   - Add close button (X)
   - Auto-dismiss after 10 seconds
   - Close on outside click
   - Remove any existing tooltips before showing new one

5. Controls:
   - Day/Week view toggle (ButtonGroup)
   - Team filter (Select dropdown)
   - Hide sensitive info toggle (Switch)

6. No Data State:
   - Show Alert if data is null
   - Message: "Please upload a JSON file on the home page"

Style with Material-UI components and custom CSS for tooltips.
```

### Email Teams Prompt
```
Create an email team schedule component with:

1. Form Fields (Material-UI):
   - Team dropdown (required) - populated from data.teams
   - Date picker (required) - @mui/x-date-pickers
   - Recipient email (required) - text input, type="email"
   - Subject (required) - auto-generated, editable
   - Additional message (optional) - multiline TextField
   - Hide confidential info - Switch

2. Auto-Generation:
   - Subject: "[Team Name] Schedule for [Formatted Date]"
   - Update when team or date changes
   - Use date-fns for formatting: "Monday, October 20, 2025"

3. Email HTML Generator:
   - Title: h2 with team name and date
   - Team Members Section:
     - Filter employees by teamId and selected date
     - Table: Name | Position | Hours (start-end)
     - Sort by start time
   - Jobs Section:
     - Filter jobs by scheduledTeamId and date
     - For each job, create styled div:
       - Header h4 with team color background: "Job #N: Customer (time)"
       - Table with field/value rows:
         - Time, Customer, Service, Scope, Address
         - Add-ons (if any)
         - All instruction fields (if not null)
         - Bill rate (if not hideInfo)
         - Contact info (if not hideInfo)
   - Footer: "Sent from MaidCentral Backup System"
   - Use inline styles for email client compatibility

4. Preview:
   - "Show Preview" / "Hide Preview" button
   - Render HTML using dangerouslySetInnerHTML
   - Style with border, padding, light background

5. Validation:
   - Check all required fields before send
   - Show error Alert for missing fields
   - On success, show success Alert with recipient email

6. Send Button:
   - Disabled if validation fails
   - For now, just show success message (demo mode)
   - Structure ready for EmailJS integration

Style form with max-width 600px, centered. Make email HTML tables responsive.
```

---

## Conclusion

This specification provides complete requirements for rebuilding the MaidCentral Backup application from scratch. The app is a React-based, client-side tool for viewing cleaning service schedules offline with privacy controls and email capabilities.

**Key Success Criteria:**
✅ Uploads and processes two different JSON formats
✅ Displays jobs on calendar with team colors and filtering
✅ Shows detailed job information on click
✅ Hides sensitive data on toggle
✅ Generates formatted email schedules
✅ Works entirely client-side (no backend)
✅ Responsive and accessible UI

**Timeline Estimate:**
- Setup & Core Data: 2-3 days
- Calendars: 2-3 days
- Email Feature: 1-2 days
- Polish & Testing: 1-2 days
- **Total: 6-10 days** for experienced React developer

**Critical Path:**
1. Data transformation (must support both formats)
2. Job calendar (primary feature)
3. Privacy controls (security requirement)
4. Email generation (key differentiator)
