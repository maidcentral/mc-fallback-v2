# MaidCentral API v2 Optimization Requirements

**Endpoint**: `GET /api/dr-schedule?startDate=X&endDate=X`
**Current Performance**: 2-5 seconds per request
**Target Performance**: <500ms per request
**Priority**: HIGH - This endpoint is called 7 times per company per hourly sync

---

## Problem Statement

The backup portal's hourly sync process calls `/api/dr-schedule` **7 times per company** (once for each of the next 7 days). With multiple companies, this results in:

- **100 companies**: 700 API calls per hour
- **Current duration**: 700 calls × 3 seconds = **35 minutes** of total API time
- **Target duration**: 700 calls × 500ms = **~6 minutes** of total API time

Even with async processing on the client side, the API is the bottleneck.

---

## Current Architecture (Assumed)

Based on typical patterns, the current implementation likely:

```
1. Receive request: GET /api/dr-schedule?startDate=2025-10-28&endDate=2025-10-28
2. Query database for jobs on that date (slow query)
3. For each job:
   - Join multiple related tables (customers, homes, teams, employees, etc.)
   - Load nested objects (ScheduledTeams, ContactInfos, NotesAndMemos, etc.)
4. Transform/serialize data into nested DTO structure
5. Return JSON response
```

**Bottlenecks:**
- ❌ N+1 queries (loading related data for each job individually)
- ❌ Missing database indexes on frequently queried fields
- ❌ No caching (same date queried multiple times)
- ❌ Large JSON payloads (unnecessary data included)
- ❌ Inefficient ORM queries

---

## Recommended Optimizations

### 1. Database Query Optimization (Highest Impact)

#### A. Add Database Indexes

Ensure indexes exist on all frequently queried fields:

```sql
-- Jobs table
CREATE INDEX idx_jobs_job_date ON jobs(job_date);
CREATE INDEX idx_jobs_service_company_id ON jobs(service_company_id);
CREATE INDEX idx_jobs_scheduled_start_time ON jobs(scheduled_start_time);

-- ScheduledTeams junction table
CREATE INDEX idx_scheduled_teams_job_id ON scheduled_teams(job_information_id);
CREATE INDEX idx_scheduled_teams_team_id ON scheduled_teams(team_list_id);

-- EmployeeSchedules junction table
CREATE INDEX idx_employee_schedules_job_id ON employee_schedules(job_information_id);
CREATE INDEX idx_employee_schedules_employee_id ON employee_schedules(employee_information_id);

-- ContactInfos
CREATE INDEX idx_contact_infos_home_id ON contact_infos(home_information_id);

-- Tags
CREATE INDEX idx_job_tags_job_id ON job_tags(job_information_id);
CREATE INDEX idx_home_tags_home_id ON home_tags(home_information_id);

-- Composite indexes for common queries
CREATE INDEX idx_jobs_date_company ON jobs(job_date, service_company_id);
```

**Expected Impact**: 50-70% faster queries

#### B. Use Eager Loading (Avoid N+1 Queries)

Instead of loading each job's related data individually, load everything in bulk:

```csharp
// BAD (N+1 queries)
var jobs = context.Jobs
    .Where(j => j.JobDate == targetDate)
    .ToList();

foreach (var job in jobs) {
    job.ScheduledTeams = context.ScheduledTeams
        .Where(st => st.JobInformationId == job.JobInformationId)
        .ToList(); // Separate query for EACH job
}

// GOOD (2 queries total)
var jobs = context.Jobs
    .Where(j => j.JobDate == targetDate)
    .Include(j => j.ScheduledTeams)
        .ThenInclude(st => st.Team)
    .Include(j => j.CustomerInformation)
    .Include(j => j.HomeInformation)
        .ThenInclude(h => h.ContactInfos)
    .Include(j => j.NotesAndMemos)
    .Include(j => j.EmployeeSchedules)
        .ThenInclude(es => es.Employee)
    .Include(j => j.JobTags)
    .Include(j => j.ServiceSet)
    .AsSplitQuery() // Use split query for large datasets
    .ToList();
```

**Expected Impact**: 60-80% faster (reduces database round trips from hundreds to ~5)

#### C. Use Compiled Queries (If Using Entity Framework)

```csharp
// Pre-compile frequently used queries
private static readonly Func<YourDbContext, DateTime, IEnumerable<Job>> GetJobsByDate =
    EF.CompileQuery((YourDbContext context, DateTime date) =>
        context.Jobs
            .Where(j => j.JobDate == date)
            .Include(/* ... all includes ... */)
            .AsSplitQuery()
    );

// Usage
var jobs = GetJobsByDate(context, targetDate).ToList();
```

**Expected Impact**: 10-20% faster (query compilation cached)

---

### 2. Implement Response Caching (Medium Impact)

Since the same date is often requested multiple times (by different companies or retry logic):

```csharp
[ResponseCache(Duration = 300, VaryByQueryKeys = new[] { "startDate", "endDate", "serviceCompanyId" })]
[HttpGet("dr-schedule")]
public async Task<IActionResult> GetSchedule(string startDate, string endDate)
{
    // Cache responses for 5 minutes
    // VaryByQueryKeys ensures each date/company combination gets its own cache
}
```

Or use distributed cache (Redis):

```csharp
private readonly IDistributedCache _cache;

public async Task<IActionResult> GetSchedule(string startDate, string endDate)
{
    var cacheKey = $"schedule:{startDate}:{endDate}:{companyId}";

    // Try to get from cache
    var cachedData = await _cache.GetStringAsync(cacheKey);
    if (cachedData != null)
    {
        return Content(cachedData, "application/json");
    }

    // Generate response
    var data = await GenerateScheduleData(startDate, endDate);
    var json = JsonSerializer.Serialize(data);

    // Cache for 5 minutes
    await _cache.SetStringAsync(cacheKey, json, new DistributedCacheEntryOptions
    {
        AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5)
    });

    return Content(json, "application/json");
}
```

**Expected Impact**: 90%+ faster for cached responses (subsequent requests)

---

### 3. Background Job to Pre-Generate Data (Highest Impact for Backup Portal)

**Problem**: The backup portal calls the API for the next 7 days every hour. These dates rarely change minute-to-minute.

**Solution**: Run a background job on the API server to pre-generate schedule JSON files and save them to blob storage.

#### Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Background Job (runs every hour)                        │
│                                                           │
│  1. Query next 7 days of schedule data (bulk)           │
│  2. Transform to DTO format                              │
│  3. Save JSON to blob storage (Azure Blob/S3)           │
│     Path: {company_id}/{date}/schedule.json              │
│                                                           │
│  Duration: ~5 seconds for all companies/dates            │
└──────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│  GET /api/dr-schedule?date=X (NEW - Fast Version)       │
│                                                           │
│  1. Check if pre-generated file exists in blob storage   │
│  2. If yes: Return signed URL or stream file directly    │
│  3. If no: Generate on-demand (fallback to old logic)   │
│                                                           │
│  Duration: <100ms (just reading from blob storage)       │
└──────────────────────────────────────────────────────────┘
```

#### Implementation Example

**Background Job** (Hangfire, Azure Functions, or similar):

```csharp
public class SchedulePreGenerationJob
{
    private readonly YourDbContext _context;
    private readonly IBlobStorageClient _blobStorage;

    public async Task Execute()
    {
        var today = DateTime.UtcNow.Date;
        var companies = await _context.Companies
            .Where(c => c.IsActive && c.BackupPortalEnabled)
            .Select(c => c.ServiceCompanyId)
            .ToListAsync();

        foreach (var companyId in companies)
        {
            for (int i = 0; i < 7; i++)
            {
                var targetDate = today.AddDays(i);

                // Generate schedule data
                var scheduleData = await GenerateScheduleData(companyId, targetDate);
                var json = JsonSerializer.Serialize(scheduleData);

                // Save to blob storage
                var blobPath = $"{companyId}/{targetDate:yyyy-MM-dd}/schedule.json";
                await _blobStorage.UploadAsync("schedule-cache", blobPath, json);

                Console.WriteLine($"Pre-generated: {blobPath}");
            }
        }
    }

    private async Task<ScheduleDto> GenerateScheduleData(int companyId, DateTime date)
    {
        // Your existing logic to query and transform data
        var jobs = await _context.Jobs
            .Where(j => j.ServiceCompanyId == companyId && j.JobDate == date)
            .Include(/* all related data */)
            .ToListAsync();

        return new ScheduleDto
        {
            Result = jobs.Select(j => MapToJobDto(j)).ToList()
        };
    }
}
```

**Updated API Endpoint**:

```csharp
[HttpGet("dr-schedule")]
public async Task<IActionResult> GetSchedule(
    string startDate,
    string endDate,
    [FromQuery] int? serviceCompanyId = null)
{
    // Validate single-day request
    if (startDate != endDate)
    {
        return BadRequest("startDate must equal endDate");
    }

    var date = DateTime.Parse(startDate);
    var companyId = serviceCompanyId ?? GetCompanyIdFromAuth();

    // Try to get pre-generated file from blob storage
    var blobPath = $"{companyId}/{date:yyyy-MM-dd}/schedule.json";
    var exists = await _blobStorage.ExistsAsync("schedule-cache", blobPath);

    if (exists)
    {
        // Return pre-generated data (FAST!)
        var json = await _blobStorage.DownloadAsStringAsync("schedule-cache", blobPath);
        return Content(json, "application/json");
    }

    // Fallback: Generate on-demand (slower, but ensures data availability)
    var scheduleData = await GenerateScheduleData(companyId, date);
    return Ok(scheduleData);
}
```

**Expected Impact**:
- **95%+ faster** for pre-generated dates (<100ms response time)
- Background job completes in ~5 seconds for all companies/dates
- No impact on database during API requests

---

### 4. Reduce JSON Payload Size (Low-Medium Impact)

Review the DTO structure and remove unnecessary fields:

```csharp
// Consider adding a 'slim' or 'minimal' query parameter
[HttpGet("dr-schedule")]
public async Task<IActionResult> GetSchedule(
    string startDate,
    string endDate,
    [FromQuery] bool minimal = false)
{
    if (minimal)
    {
        // Return only essential fields
        var slimJobs = jobs.Select(j => new SlimJobDto
        {
            JobInformationId = j.JobInformationId,
            CustomerName = j.CustomerInformation.FullName,
            ScheduledStartTime = j.ScheduledStartTime,
            ScheduledTeams = j.ScheduledTeams.Select(st => st.TeamListId).ToList(),
            // Only essential fields
        });
        return Ok(slimJobs);
    }

    // Full response (existing behavior)
    return Ok(fullJobs);
}
```

**Expected Impact**: 20-30% faster (smaller payloads transfer faster)

---

### 5. Parallelize Data Loading (Low-Medium Impact)

If generating data on-demand, parallelize independent queries:

```csharp
public async Task<ScheduleDto> GenerateScheduleData(int companyId, DateTime date)
{
    // Load all data in parallel
    var jobsTask = LoadJobsAsync(companyId, date);
    var teamsTask = LoadTeamsAsync(companyId);
    var employeesTask = LoadEmployeesAsync(companyId, date);

    await Task.WhenAll(jobsTask, teamsTask, employeesTask);

    var jobs = await jobsTask;
    var teams = await teamsTask;
    var employees = await employeesTask;

    // Combine and return
    return BuildScheduleDto(jobs, teams, employees);
}
```

**Expected Impact**: 15-25% faster (parallel I/O operations)

---

## Recommended Implementation Priority

### Phase 1: Quick Wins (1-2 days)
1. ✅ Add database indexes (30 min)
2. ✅ Implement response caching (1 hour)
3. ✅ Fix N+1 queries with eager loading (2-4 hours)

**Expected Result**: 2-5 seconds → **500ms-1 second**

### Phase 2: Major Optimization (3-5 days)
4. ✅ Implement background job + blob storage (2-3 days)
5. ✅ Update API endpoint to read from blob storage (1 day)

**Expected Result**: 500ms-1 second → **<100ms** (for pre-generated data)

### Phase 3: Polish (1-2 days)
6. ✅ Add minimal response format (1 day)
7. ✅ Parallelize queries (1 day)

**Expected Result**: Further 10-20% improvement

---

## Performance Testing

Use a tool like Apache JMeter or k6 to benchmark the API:

```javascript
// k6 load test script
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  vus: 10, // 10 virtual users
  duration: '30s',
};

export default function () {
  const response = http.get(
    'https://api.maidcentral.com/api/dr-schedule?startDate=2025-10-28&endDate=2025-10-28',
    {
      headers: { Authorization: 'Bearer YOUR_TOKEN' },
    }
  );

  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
}
```

**Metrics to Track**:
- Average response time (target: <500ms)
- P95 response time (95th percentile, target: <1 second)
- Throughput (requests per second)
- Error rate (target: <1%)

---

## Alternative: Dedicated Backup API Endpoint

If modifying the existing endpoint is complex, consider creating a new optimized endpoint:

```
GET /api/dr-schedule/backup?date=YYYY-MM-DD&companyId=X
```

**Benefits**:
- Doesn't impact existing integrations
- Can be heavily optimized for backup portal use case
- Separate caching strategy
- Can use different data model (pre-transformed)

**Implementation**:
```csharp
[HttpGet("dr-schedule/backup")]
public async Task<IActionResult> GetScheduleForBackup(
    string date,
    int companyId)
{
    // Check pre-generated blob storage
    var blobPath = $"backup/{companyId}/{date}/schedule.json";
    if (await _blobStorage.ExistsAsync("schedule-cache", blobPath))
    {
        var json = await _blobStorage.DownloadAsStringAsync("schedule-cache", blobPath);
        return Content(json, "application/json");
    }

    // Generate on-demand with optimized query
    var data = await GenerateBackupScheduleData(companyId, DateTime.Parse(date));
    return Ok(data);
}
```

---

## Cost Analysis

### Database Optimization (Phase 1)
- **Time**: 1-2 days
- **Cost**: Developer time only
- **Impact**: 2-5 sec → 500ms-1 sec (**70-80% faster**)

### Background Job + Blob Storage (Phase 2)
- **Time**: 3-5 days
- **Cost**:
  - Developer time
  - Blob storage: $0.02/GB/month (~$2/month for 100 companies)
  - Background job compute: Minimal (runs for ~5 seconds per hour)
- **Impact**: 500ms-1 sec → <100ms (**90-95% faster**)
- **ROI**: Extremely high - drastically reduces load on database

---

## Summary

### Current State
- Response time: 2-5 seconds
- 700 API calls per hour (100 companies × 7 days)
- Total sync time: 35 minutes
- High database load

### Target State (After Optimization)
- Response time: <100ms (pre-generated) or <500ms (on-demand)
- Same 700 API calls per hour
- Total sync time: <2 minutes
- Minimal database load (queries run once per hour in background)

### Recommended Approach

**Best Option**: Implement Phase 1 + Phase 2
1. Add indexes and fix N+1 queries (quick win)
2. Implement background job to pre-generate schedule data
3. Store pre-generated data in blob storage
4. Update API to serve from blob storage

**Total Development Time**: 4-7 days
**Expected Performance Improvement**: 95%+ faster (2-5 sec → <100ms)
**Ongoing Cost**: ~$2-5/month (blob storage)

---

## Questions for API Team

1. **Current ORM**: Are you using Entity Framework, Dapper, or raw SQL?
2. **Database**: SQL Server, PostgreSQL, MySQL?
3. **Caching Infrastructure**: Do you have Redis or similar available?
4. **Blob Storage**: Do you have Azure Blob Storage, AWS S3, or similar?
5. **Background Jobs**: Do you use Hangfire, Azure Functions, AWS Lambda?
6. **Current Query Performance**: Can you share EXPLAIN ANALYZE output for the main query?
7. **Deployment Constraints**: Any restrictions on adding indexes or new infrastructure?

---

**Contact**: Provide feedback or questions about these requirements to the backup portal team.
