# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**MaidCentral Backup Application**: A standalone, client-side React web application for viewing and managing cleaning service schedules offline when the main MaidCentral system is unavailable.

---

## Architecture

### Data Flow
1. **Input**: JSON file upload (Format A - api/jobs/getall structure)
2. **Transformation**: Convert nested JSON to internal format in browser
3. **Storage**: Persist to browser's LocalStorage (no backend/database)
4. **Display**: React components read from LocalStorage
5. **Export**: Generate PDF/PNG downloads for manual distribution

### Data Formats

**Format A (api/jobs/getall)** - The ONLY supported format:
- Nested structure with `Result[]` array
- Each job has: `ScheduledTeams[]`, `CustomerInformation`, `HomeInformation`, `NotesAndMemos`, `ContactInfos[]`, `EmployeeSchedules[]`
- Teams include `Color` and `SortOrder` properties
- HTML content in instruction fields (render with `dangerouslySetInnerHTML`)

**Internal Format** (after transformation):
```javascript
{
  metadata: { companyName, lastUpdated, dataFormat, dataRange, stats },
  teams: [{ id, name, color, sortOrder }],
  jobs: [{ id, customerName, serviceType, scheduledTeams, schedule, ... }],
  employees: [{ id, name, teamId, position, shifts }]
}
```

### Key Architectural Decisions

1. **Team Colors**: Use `ScheduledTeams[].Color` from source data (teams have official colors)
2. **Employee Shifts**: Extract from `EmployeeSchedules[]` array, use parent job's schedule times as shift times (no separate shift start/end in source data)
3. **Multi-Team Jobs**: Jobs can belong to multiple teams via `scheduledTeams[]` array
4. **Unassigned Jobs**: Jobs with empty `ScheduledTeams[]` assign to special "Unassigned" team (id: "0")
5. **Contact Info**: Prefer Cell Phone (ContactTypeId=2), fallback to Home Phone (ContactTypeId=1); Email is ContactTypeId=3
6. **View Modes**: Two-mode system - Office View (shows all data) vs Technician View (respects FeatureToggles from DTO)
7. **Export**: No email sending capability - generate PDF/PNG for manual distribution

### View Modes & Privacy System

**Office View** (default):
- Shows ALL data regardless of FeatureToggles
- Intended for office staff managing schedules
- Access to all billing rates, customer contacts, access codes, internal memos, discounts
- Toggle available in header (desktop & mobile)

**Technician View**:
- Respects FeatureToggles from uploaded data (DTO)
- Hides fields based on toggle values
- Intended for field technicians viewing their assignments

**FeatureToggles (from DTO)** - Control visibility in Technician View:

*Pricing/Rate Information (✅ Implemented):*
  - `TechDashboard_DisplayBillRate` - Show/hide bill rate (mapped to `billRate` field)
  - `TechDashboard_DisplayFeeSplitRate` - Show/hide fee split rate (mapped to `feeSplitRate` field)
  - `TechDashboard_DisplayAddOnRate` - Show/hide add-on rate (mapped to `addOnRate` field)
  - `TechDashboard_DisplayRoomRate` - Show/hide room rate (mapped to `roomRate` field)
  - `TechDashboard_HideDiscounts` - Hide discount information - inverse logic (mapped to `discounts` field)

*Contact Information (✅ Implemented):*
  - `TechDashboard_DisplayCustomerPhoneNumbers` - Show/hide customer phone numbers (mapped to `customerPhone` field)
  - `TechDashboard_DisplayCustomerEmails` - Show/hide customer emails (mapped to `customerEmail` field)

*Sensitive Data (✅ Implemented):*
  - `accessInformation` - Lockbox codes, gate codes, keys (always hidden in Technician View, no toggle available)
  - `internalMemo` - Internal office notes (always hidden in Technician View, no toggle available)

**Non-sensitive fields always shown:**
  - Customer name, address
  - Service type, scope of work
  - Schedule times, team assignments
  - General instructions (special, pet, directions, equipment, waste)

**Implementation**:
- View mode stored in localStorage (`mc_backup_user_prefs`)
- FeatureToggles come from uploaded JSON data (or debug panel overrides persisted in `mc_backup_debug_toggles`)
- Toggle logic:
  - For `Display*` toggles: `false` = hide, `true` = show
  - For `Hide*` toggles (inverse logic): `true` = hide, `false` = show
  - Office View ignores all FeatureToggles (shows everything)
  - Technician View respects FeatureToggles
- Helper function: `shouldHideField(viewMode, fieldName, featureToggles)` returns true if field should be hidden
- Field name mapping in `userPreferences.js:FIELD_TO_FEATURE_TOGGLE`:
  ```javascript
  {
    billRate: 'TechDashboard_DisplayBillRate',
    feeSplitRate: 'TechDashboard_DisplayFeeSplitRate',
    addOnRate: 'TechDashboard_DisplayAddOnRate',
    roomRate: 'TechDashboard_DisplayRoomRate',
    customerPhone: 'TechDashboard_DisplayCustomerPhoneNumbers',
    customerEmail: 'TechDashboard_DisplayCustomerEmails',
    discounts: 'TechDashboard_HideDiscounts', // Inverse logic
    accessInformation: null, // Always hidden in Technician view
    internalMemo: null // Always hidden in Technician view
  }
  ```
- Usage pattern: `if (!shouldHideField(viewMode, 'billRate', featureToggles)) { /* show field */ }`

**Adding New FeatureToggle Support**:
1. Add mapping to `FIELD_TO_FEATURE_TOGGLE` in `userPreferences.js`
2. Update UI components to call `shouldHideField()` with the new fieldName
3. Test that Office View shows field, Technician View respects toggle

### Component Architecture

```
App.js (root)
├── usePersistedData hook (loads from localStorage on mount)
├── Header (navigation)
├── Routes
│   ├── Dashboard (landing - shows navigation cards)
│   ├── Admin (upload JSON, clear data)
│   ├── JobCalendar (FullCalendar with team filtering)
│   ├── EmployeeCalendar (FullCalendar with employee shifts)
│   ├── ExportSchedule (PDF/PNG generation)
│   └── Documentation (help)
└── Footer
```

### Data Layer

**LocalStorage Keys**:
- `mc_backup_data`: Entire transformed dataset
- `mc_backup_user_prefs`: User preferences (viewMode only)
- `mc_backup_debug_toggles`: Debug panel FeatureToggle overrides (persists across refreshes)

**Utilities**:
- `storage.js`: Simple wrapper around localStorage (save, load, clear, exists)
- `dataTransform.js`: Transform Format A → internal format
- `exportHelpers.js`: html2canvas + jsPDF for PDF/PNG generation
- `teamPositions.js`: Map TeamPosition IDs (1,2,3...) to names/colors
- `userPreferences.js`: User preferences storage (viewMode) and FeatureToggle field mapping

**Hooks**:
- `usePersistedData.js`: Load on mount, provide save/clear functions
- `useUserPreferences.js`: Manage view mode toggle (Office/Technician)

---

## Development Commands

```bash
# Install dependencies
npm install

# Required dependencies:
npm install @mui/material @mui/icons-material @emotion/react @emotion/styled
npm install @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/interaction
npm install react-router-dom @mui/x-date-pickers date-fns
npm install html2canvas jspdf

# Start development server
npm start

# Build for production
npm run build

# Run tests
npm test
```

---

## Critical Implementation Notes

### Data Transformation (`dataTransform.js`)

**Teams Extraction**:
- Iterate all jobs, collect unique `ScheduledTeams[]` entries
- Use `TeamListId` as unique key
- Include: `TeamListDescription`, `Color`, `SortOrder`
- Always add "Unassigned" team (id: "0", color: "#999999")
- Sort by `SortOrder` ascending

**Jobs Transformation**:
- Handle null/undefined with optional chaining everywhere
- Combine first/last name: `CustomerInformation.CustomerFirstName + CustomerLastName`
- Build address from `HomeInformation` (Address1, Address2, City, Region, PostalCode)
- Extract all instructions from `NotesAndMemos` object (EventInstructions, HomeSpecialInstructions, etc.)
- Combine tags from `JobTags[]`, `HomeTags[]`, `CustomerTags[]`
- Map `ScheduledTeams[].TeamListId` → `scheduledTeams[]` array
- Empty `ScheduledTeams[]` → assign to team "0" (Unassigned)

**Employees Extraction**:
- Iterate all jobs' `EmployeeSchedules[]` arrays
- Group by `EmployeeInformationId` (one employee can have multiple shifts)
- Each job → one shift for employees on that job
- Use job's `ScheduledStartTime`/`ScheduledEndTime` as shift times
- Map `TeamPosition` number → position name/color from constants

**Null Safety Pattern**:
```javascript
// Use this pattern everywhere
const customerName = job.CustomerInformation
  ? `${job.CustomerInformation.CustomerFirstName || ''} ${job.CustomerInformation.CustomerLastName || ''}`.trim()
  : 'Unknown Customer';
```

### Calendar Components (JobCalendar, EmployeeCalendar)

**FullCalendar Setup**:
- Views: `timeGridWeek` (default), `timeGridDay`
- Time range: 6:00 AM - 10:00 PM (`slotMinTime: '06:00:00'`, `slotMaxTime: '22:00:00'`)
- Team filter: Dropdown with "All Teams" + individual teams
- Multi-team jobs: Show when ANY of job's teams matches filter

**Event Click Tooltips**:
- Use direct DOM manipulation (not React state) - FullCalendar operates outside React
- Position: `fixed`, near click point (`clickInfo.jsEvent.pageX/pageY + 10px`)
- Auto-dismiss: setTimeout 10 seconds
- Close: X button, click outside, or auto-timeout
- Remove existing tooltips before showing new one

**Color Coding**:
- Jobs: Use team color from `ScheduledTeams[].Color`
- Employees: Use team color (not position color)

### Export Schedule (`ExportSchedule.js`)

**PDF Generation Pattern**:
```javascript
// 1. Create HTML preview in div with ref
// 2. Use html2canvas(element, { scale: 2 })
// 3. Convert canvas to image data
// 4. Add to jsPDF
// 5. Trigger download with auto-generated filename
```

**Filename Pattern**: `{TeamName}_Schedule_{YYYY-MM-DD}.pdf`

**Export Content**:
- Header: Team name + date
- Team Members Table: Filter employees by teamId + date, show name/position/hours
- Jobs Section: Filter jobs by scheduledTeams + date, show all details (respect privacy toggle)
- Footer: "Generated from MaidCentral Backup System"

---

## Testing Strategy

**Sample Data**: Use `chs-alljobs.json` for testing (Format A with real structure)

**Key Test Scenarios**:
1. Upload chs-alljobs.json → verify teams extracted with colors
2. Refresh page → verify data persists from localStorage
3. Filter by team → verify multi-team jobs appear correctly
4. Toggle privacy → verify billRate/contactInfo hidden
5. Export PDF → verify team members + jobs render correctly
6. Clear data → verify localStorage empty, redirects to upload

**Edge Cases**:
- Jobs with no teams → should show in "Unassigned"
- Jobs with multiple teams → should appear when filtering any of those teams
- Employees with no shifts on selected date → should not appear in export
- HTML in instructions → should render (not escape)
- Missing/null nested objects → should not crash (use optional chaining)

---

## Project Status Tracking

**Last Updated**: 2025-10-21
**Current Status**: 🟡 Planning Complete - Ready to Build

### Implementation Phases

| Phase | Status | Progress |
|-------|--------|----------|
| Phase 1: Setup | ⚪ Not Started | 0% |
| Phase 2: Data Layer | ⚪ Not Started | 0% |
| Phase 3: Core UI | ⚪ Not Started | 0% |
| Phase 4: Admin Page | ⚪ Not Started | 0% |
| Phase 5: Job Calendar | ⚪ Not Started | 0% |
| Phase 6: Employee Calendar | ⚪ Not Started | 0% |
| Phase 7: Export Schedule | ⚪ Not Started | 0% |
| Phase 8: Polish & Docs | ⚪ Not Started | 0% |

**Legend**: ⚪ Not Started | 🟡 In Progress | 🟢 Complete | 🔴 Blocked

### Next Phase: Phase 1 - Setup

**Tasks**:
- [ ] Create React app structure
- [ ] Install all dependencies
- [ ] Set up folder structure (components, utils, hooks, constants, styles)
- [ ] Create basic routing skeleton
- [ ] Create placeholder components

**Estimated Time**: 30 minutes

---

## Key Files Reference

- `PROJECT-PLAN.md` - Detailed implementation plan with all phases
- `REBUILD-SPEC.md` - Original specification (includes Format B which is NOT used)
- `chs-alljobs.json` - Sample Format A data for testing
- `chs-dispatch-data-20251020.json` - Format B sample (NOT USED)

---

## Status Tracking Instructions

**When completing tasks**:
1. Check off tasks in phase sections above (change `[ ]` to `[x]`)
2. Update progress percentage in Quick Status table
3. Add notes under each phase for important discoveries

**When completing a phase**:
1. Update phase status to 🟢 Complete
2. Update progress to 100%
3. Move to next phase in "Next Phase" section

**When blocked**:
1. Update phase status to 🔴 Blocked
2. Document blocker clearly
3. Tag with required action to unblock

---

**Remember**:
- Always use optional chaining for nested objects
- Teams have official colors in the data - use them
- Jobs can have multiple teams
- Employee shifts use job times (no separate shift times)
- LocalStorage is the ONLY persistence mechanism
- No backend, no database, no email sending
