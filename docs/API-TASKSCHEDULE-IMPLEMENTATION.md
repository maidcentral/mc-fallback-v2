# DR-Schedule API Performance Optimization

## Executive Summary

**Current Problem**: The `/api/dr-schedule` endpoint takes 2-5 seconds per request due to complex database queries with multiple joins. This endpoint is called frequently by the backup portal system.

**Proposed Solution**: Implement a background job that pre-generates schedule data every 30 minutes and stores it in blob storage. Update the API endpoint to serve pre-generated data for 95%+ faster response times.

**Expected Outcome**:
- API response time: 2-5 seconds → <100ms (95% improvement)
- Reduced database load during peak hours
- Better scalability for multiple companies

---

## Current Architecture

### Existing Endpoint
- **Path**: `GET /api/dr-schedule?startDate=X&endDate=X`
- **Behavior**: Queries database on every request
- **Performance**: 2-5 seconds per request
- **Database**: Multiple joins across Jobs, ScheduledTeams, CustomerInformation, HomeInformation, EmployeeSchedules, etc.
- **Response Format**: Nested JSON with job details, teams, employees, contact info, tags, etc.

### Key Constraint
The endpoint **must query exactly one day at a time** where `startDate === endDate`. This is a business requirement for data accuracy.

---

## Target Architecture

### New Flow
```
Background Job (Every 30 minutes):
├─ For each date in next 7 days:
│  ├─ Call API: GET /api/dr-schedule?startDate={date}&endDate={date}
│  │  (This returns ALL companies' data for that date in one call)
│  ├─ Transform/parse response to extract each company's schedule
│  ├─ For each company in the response:
│  │  ├─ Extract that company's jobs/data
│  │  ├─ Save to blob: schedule-cache/{companyId}/{date}/schedule.json
│  │  └─ Log success/failure
│  └─ Continue to next date
└─ Complete (7 API calls total, regardless of company count)

API Endpoint (When called with ?startDate=X&endDate=X&companyId=Y):
├─ Parse request parameters (date and companyId)
├─ Check blob storage: schedule-cache/{companyId}/{date}/schedule.json
├─ If exists: Return cached JSON (<100ms)
└─ If not exists: Generate on-demand (fallback to original logic)
```

---

## Requirements

### 1. Background Job Implementation

**Objective**: Create a scheduled job that runs every 30 minutes to pre-generate schedule data by calling the existing API endpoint and caching results in blob storage.

**Inputs**:
- Date range: Today + next 6 days (7 days total)

**Processing**:
- For each day (0-6 days from today):
  - Call existing endpoint: `GET /api/dr-schedule?startDate={date}&endDate={date}`
    - This returns ALL companies' schedule data for that single date
  - Parse the API response (which contains data for multiple companies)
  - Extract each company's data from the response
  - For each company in the response:
    - Serialize that company's data to JSON (compact format, no indentation)
    - Save to blob storage: `schedule-cache/{serviceCompanyId}/{YYYY-MM-DD}/schedule.json`
    - Handle errors gracefully (log and continue to next company)
  - Log completion for this date

**Outputs**:
- Pre-generated JSON files in blob storage (one per company per date)
- Logs indicating success/failure counts per date
- Timing metrics (total duration, files generated)

**Technical Notes**:
- Makes **7 API calls total** (one per day), regardless of company count
- Much more efficient than calling API per company
- Use existing blob storage service/client in the codebase
- Integrate with existing job scheduler (Hangfire confirmed)
- Should complete within 30-60 seconds for 100 companies

**Scheduling**:
- Run every 30 minutes (e.g., at :00 and :30 past each hour)
- Alternative: Run hourly if 30-minute interval is too aggressive

---

### 2. API Endpoint Update

**Objective**: Modify the existing `/api/dr-schedule` endpoint to check blob storage first before querying the database.

**New Logic**:

```
STEP 1: Validate Request (existing logic)
- Ensure startDate and endDate are provided
- Ensure startDate === endDate (single-day constraint)
- Get company ID from query parameter or auth context

STEP 2: Check Blob Storage (NEW)
- Construct blob path: schedule-cache/{companyId}/{date}/schedule.json
- Check if file exists in blob storage
- If YES:
  - Download JSON string from blob
  - Return as response with Content-Type: application/json
  - Log: "Serving cached data for {companyId}/{date}"
  - Log response time (should be <100ms)
  - DONE (skip Step 3)

STEP 3: Generate On-Demand (existing logic, fallback)
- If blob file doesn't exist:
  - Log: "Cache miss. Generating on-demand for {companyId}/{date}"
  - Execute existing database query logic
  - Transform to DTO
  - Return as JSON
  - Log response time
  - DONE
```

**Backward Compatibility**:
- Must maintain exact same response format
- Must handle all existing query parameters
- Must return same error messages/status codes
- If blob storage fails, automatically fall back to on-demand generation

**Performance Monitoring**:
- Log whether request was served from cache or on-demand
- Log response time for each request
- Track cache hit rate (target: >95%)

---

### 3. Blob Storage Requirements

**Path Structure**:
```
schedule-cache/
├── {serviceCompanyId}/
│   ├── {YYYY-MM-DD}/
│   │   └── schedule.json
│   └── ...
└── ...

Examples:
schedule-cache/59/2025-12-03/schedule.json
schedule-cache/59/2025-12-04/schedule.json
schedule-cache/137/2025-12-03/schedule.json
```

**File Format**:
- Content-Type: `application/json`
- Encoding: UTF-8
- Structure: Same as current API response (nested JSON with Result array)
- Size: Typically 50-500KB per file

**Required Operations**:
- **Upload/Save**: Write JSON string to blob path (overwrite if exists)
- **Download/Read**: Read JSON string from blob path
- **Exists/Check**: Verify if file exists at blob path

**Note**: Use existing blob storage service in the codebase. The implementation should work with whatever blob storage is already configured (Azure Blob, AWS S3, local filesystem, etc.).

---

## Implementation Guidance for AI

### Step 1: Research the Codebase

**Locate Key Components**:
1. Find the current `dr-schedule` endpoint (likely in a Controller file)
2. Identify the database context/ORM being used (Entity Framework, Dapper, etc.)
3. Locate the existing blob storage service/client
4. Find the job scheduling mechanism (Hangfire, Quartz.NET, HostedService, etc.)
5. Identify how active companies are queried

**Questions to Answer**:
- What is the exact namespace and class for the dr-schedule endpoint?
- What blob storage library/service is being used?
- What are the method signatures for blob upload/download/exists operations?
- How are scheduled jobs currently registered in the application?
- What is the database context class name?

### Step 2: Create the Background Job

**Create New File**: `Jobs/SchedulePreGenerationJob.cs` (or similar)

**Dependencies to Inject**:
- HTTP client (to call the existing `/api/dr-schedule` endpoint)
- Blob storage service
- Logger
- Configuration (for API base URL)

**Method to Implement**: `public async Task ExecuteAsync()`

**Logic**:
1. Loop through next 7 days (starting from today)
2. For each day:
   - Call existing API endpoint: `GET /api/dr-schedule?startDate={date}&endDate={date}`
   - Parse the response (contains ALL companies' data for that date)
   - Extract each company's data from the response
   - For each company:
     - Serialize company's data to JSON
     - Upload to blob storage: `schedule-cache/{companyId}/{date}/schedule.json`
     - Handle exceptions per company (log and continue)
3. Log final statistics (files generated, failures)

**Key Insight**: This approach calls the API **7 times total** (once per day), not once per company. The API returns all companies' data in a single response, which the job then splits and caches individually.

### Step 3: Schedule the Job

**Locate Scheduler Setup** (usually in `Startup.cs`, `Program.cs`, or a dedicated scheduler configuration file)

**Add Job Registration**:
- If using Hangfire: `RecurringJob.AddOrUpdate<SchedulePreGenerationJob>(...)`
- If using Quartz.NET: Create trigger with 30-minute cron expression
- If using HostedService: Create new BackgroundService with 30-minute interval

**Cron Expression**: Run every 30 minutes
- `*/30 * * * *` (every 30 minutes)
- Alternative: `0 * * * *` (every hour at :00)

### Step 4: Update API Endpoint

**Locate Existing Endpoint**: `Controllers/DRScheduleController.cs` or similar

**Inject Blob Storage Service**: Add to constructor if not already injected

**Modify Request Handler**:
1. Keep all existing validation logic
2. After validation, before database query:
   - Build blob path
   - Check if blob exists
   - If exists: Download and return
3. Keep existing database query as fallback
4. Add logging for cache hits/misses

**Critical**: Do not change response format. The cached JSON should be identical to what the original endpoint returns.

### Step 5: Testing Approach

**Unit Tests**:
- Test blob path construction
- Test cache hit scenario
- Test cache miss scenario
- Test error handling

**Integration Tests**:
- Trigger background job manually
- Verify files appear in blob storage
- Call API endpoint and verify <100ms response
- Test with non-existent date (should fall back)

**Load Tests**:
- Use ApacheBench, k6, or similar
- Target: 100 requests with <100ms average response time

---

## Success Criteria

### Performance Metrics
- ✅ API response time: <100ms for 95% of requests (cached)
- ✅ API response time: <500ms for 5% of requests (on-demand)
- ✅ Background job duration: <60 seconds for 100 companies
- ✅ Cache hit rate: >95%

### Functional Requirements
- ✅ Backward compatible: All existing API clients continue to work
- ✅ Same response format: Cached responses match on-demand responses
- ✅ Error resilience: If blob storage fails, fall back to on-demand
- ✅ Data freshness: Cache updated every 30 minutes

### Monitoring
- ✅ Log cache hit/miss for each API request
- ✅ Log background job statistics (success/fail counts, duration)
- ✅ Track response times (cached vs on-demand)

---

## Rollback Plan

If issues occur after deployment:

1. **Disable Background Job**: Comment out job registration in scheduler setup
2. **Disable Cache Check**: Comment out blob storage check in API endpoint
3. **Revert to Original**: API will function exactly as before (on-demand only)

---

## Example: High-Level Pseudocode

### Background Job
```pseudo
class SchedulePreGenerationJob:
    method ExecuteAsync():
        today = current date
        totalFiles = 0
        totalFailures = 0

        for dayOffset from 0 to 6:
            date = today + dayOffset days

            try:
                // Call existing API endpoint (returns ALL companies for this date)
                apiUrl = "/api/dr-schedule?startDate={date}&endDate={date}"
                response = await httpClient.Get(apiUrl)
                allCompaniesData = parse(response)

                // Extract and save each company's data
                for each company in allCompaniesData:
                    try:
                        companySchedule = extractCompanyData(company)
                        json = serialize(companySchedule)
                        blobPath = "schedule-cache/{company.Id}/{date}/schedule.json"
                        blobStorage.Upload(blobPath, json)
                        totalFiles++
                        log "Saved: {company.Id}/{date}"
                    catch error:
                        totalFailures++
                        log "Failed to save {company.Id}/{date}: {error}"
                        continue // Don't stop for individual company failures

            catch error:
                log "Failed to fetch date {date}: {error}"
                continue // Don't stop for date-level failures

        log "Completed: {totalFiles} files generated, {totalFailures} failures"
```

### API Endpoint Update
```pseudo
method GetSchedule(startDate, endDate, companyId):
    // Existing validation
    validate(startDate == endDate)
    validate(companyId)

    // NEW: Check cache first
    blobPath = "schedule-cache/{companyId}/{date}/schedule.json"
    if blobStorage.Exists(blobPath):
        json = blobStorage.Download(blobPath)
        log "Served from cache"
        return json

    // FALLBACK: Existing logic
    log "Cache miss - generating on demand"
    scheduleData = GenerateSchedule(companyId, date)
    return scheduleData
```

---

## Configuration

**Recommended Settings** (add to `appsettings.json`):
```json
{
  "SchedulePreGeneration": {
    "Enabled": true,
    "IntervalMinutes": 30,
    "DaysInAdvance": 7,
    "BlobContainerOrFolder": "schedule-cache"
  }
}
```

---

## Questions to Clarify Before Implementation

1. **Blob Storage**: What blob storage system is currently in use? (Azure Blob, AWS S3, local filesystem?)
2. **Job Scheduler**: What job scheduler is currently in use? (Hangfire, Quartz.NET, custom?)
3. **Active Companies**: What is the exact field/column name to identify active companies?
4. **Performance Baseline**: What are the current average and P95 response times for the dr-schedule endpoint?
5. **Company Count**: Approximately how many active companies are in the system?

---

## Additional Notes

- The implementation should work with your existing infrastructure
- No new external dependencies should be required (use existing blob storage and scheduler)
- Focus on reusing existing code patterns and conventions
- Maintain backward compatibility at all costs
- Add comprehensive logging for troubleshooting

---

**Ready for AI implementation. Please research the codebase, answer the clarifying questions, and implement following the requirements above.**

---

## Technology Stack Notes

**Confirmed Technologies**:
- ✅ **Job Scheduler**: Hangfire (not Quartz.NET, not HostedService)
- ✅ **Blob Storage**: Already configured in the codebase

**Implementation Notes for Hangfire**:
- Register recurring job in your existing Hangfire configuration
- Use `RecurringJob.AddOrUpdate<JobClass>(...)` pattern
- Cron expression for every 30 minutes: `"*/30 * * * *"`
- Alternative hourly: `"0 * * * *"` or `Cron.Hourly()`

```csharp
public class TaskScheduleService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<TaskScheduleService> _logger;

    public TaskScheduleService(
        IServiceProvider serviceProvider,
        ILogger<TaskScheduleService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    public void ConfigureJobs()
    {
        // ... your existing jobs ...

        // NEW: Pre-generate schedule JSON every 30 minutes
        RecurringJob.AddOrUpdate<SchedulePreGenerationJob>(
            "schedule-blob-pregen",
            job => job.ExecuteAsync(),
            "*/30 * * * *"); // Every 30 minutes

        _logger.LogInformation("[TaskSchedule] Scheduled schedule pre-generation job (every 30 min)");
    }
}
```

### Option B: If using Quartz.NET

```csharp
public class TaskScheduleService
{
    private readonly IScheduler _scheduler;
    private readonly ILogger<TaskScheduleService> _logger;

    public TaskScheduleService(
        IScheduler scheduler,
        ILogger<TaskScheduleService> logger)
    {
        _scheduler = scheduler;
        _logger = logger;
    }

    public async Task ConfigureJobs()
    {
        // ... your existing jobs ...

        // NEW: Pre-generate schedule JSON every 30 minutes
        var jobDetail = JobBuilder.Create<SchedulePreGenerationQuartzJob>()
            .WithIdentity("schedule-blob-pregen")
            .Build();

        var trigger = TriggerBuilder.Create()
            .WithIdentity("schedule-blob-pregen-trigger")
            .WithSchedule(
                CronScheduleBuilder.CronSchedule("0 */30 * * * ?") // Every 30 minutes
            )
            .Build();

        await _scheduler.ScheduleJob(jobDetail, trigger);

        _logger.LogInformation("[TaskSchedule] Scheduled schedule pre-generation job (every 30 min)");
    }
}

// Quartz job wrapper
public class SchedulePreGenerationQuartzJob : IJob
{
    private readonly SchedulePreGenerationJob _job;

    public SchedulePreGenerationQuartzJob(SchedulePreGenerationJob job)
    {
        _job = job;
    }

    public async Task Execute(IJobExecutionContext context)
    {
        await _job.ExecuteAsync();
    }
}
```

### Option C: If using HostedService/BackgroundService

```csharp
public class SchedulePreGenerationHostedService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<SchedulePreGenerationHostedService> _logger;

    public SchedulePreGenerationHostedService(
        IServiceProvider serviceProvider,
        ILogger<SchedulePreGenerationHostedService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("[PreGen] Starting background service (every 30 min)");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // Run immediately on start
                await RunJobAsync();

                // Wait 30 minutes
                _logger.LogInformation("[PreGen] Next run in 30 minutes");
                await Task.Delay(TimeSpan.FromMinutes(30), stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[PreGen] Background service error");
                await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken); // Retry in 5 min on error
            }
        }
    }

    private async Task RunJobAsync()
    {
        using var scope = _serviceProvider.CreateScope();
        var job = scope.ServiceProvider.GetRequiredService<SchedulePreGenerationJob>();
        await job.ExecuteAsync();
    }
}

// Register in Startup.cs or Program.cs
services.AddHostedService<SchedulePreGenerationHostedService>();
```

---

## Step 2: Create SchedulePreGenerationJob

**File**: `Jobs/SchedulePreGenerationJob.cs`

```csharp
using System.Text.Json;

public class SchedulePreGenerationJob
{
    private readonly YourDbContext _context;
    private readonly IYourBlobService _blobService; // Your existing blob service
    private readonly ILogger<SchedulePreGenerationJob> _logger;

    public SchedulePreGenerationJob(
        YourDbContext context,
        IYourBlobService blobService, // Inject your existing blob service
        ILogger<SchedulePreGenerationJob> logger)
    {
        _context = context;
        _blobService = blobService;
        _logger = logger;
    }

    public async Task ExecuteAsync()
    {
        _logger.LogInformation("[PreGen] Starting schedule pre-generation (30-min interval)");

        var startTime = DateTime.UtcNow;
        var today = DateTime.UtcNow.Date;
        var totalGenerated = 0;
        var totalFailed = 0;

        try
        {
            // Get all active companies (adjust WHERE clause to your needs)
            var activeCompanies = await _context.ServiceCompanies
                .Where(c => c.IsActive) // Adjust field name as needed
                .Select(c => new { c.ServiceCompanyId, c.CompanyName })
                .ToListAsync();

            _logger.LogInformation(
                "[PreGen] Processing {Count} active companies",
                activeCompanies.Count);

            // Process each company
            foreach (var company in activeCompanies)
            {
                // Generate for next 7 days
                for (int dayOffset = 0; dayOffset < 7; dayOffset++)
                {
                    var targetDate = today.AddDays(dayOffset);

                    try
                    {
                        // Generate schedule data using your existing logic
                        var scheduleData = await GenerateScheduleForDate(
                            company.ServiceCompanyId,
                            targetDate);

                        // Serialize to JSON (compact)
                        var json = JsonSerializer.Serialize(scheduleData, new JsonSerializerOptions
                        {
                            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                            WriteIndented = false // Compact = smaller file
                        });

                        // Save to blob storage
                        var blobPath = $"schedule-cache/{company.ServiceCompanyId}/{targetDate:yyyy-MM-dd}/schedule.json";

                        // USE YOUR EXISTING BLOB SERVICE METHOD
                        await _blobService.UploadAsync(blobPath, json);
                        // OR adjust to match your blob service interface:
                        // await _blobService.SaveAsync(blobPath, json);
                        // await _blobService.WriteAsync(blobPath, json);

                        totalGenerated++;

                        _logger.LogTrace(
                            "[PreGen] ✓ {CompanyId}/{Date}",
                            company.ServiceCompanyId,
                            targetDate.ToString("yyyy-MM-dd"));
                    }
                    catch (Exception ex)
                    {
                        totalFailed++;
                        _logger.LogError(
                            ex,
                            "[PreGen] ✗ Failed: {CompanyId}/{Date}",
                            company.ServiceCompanyId,
                            targetDate.ToString("yyyy-MM-dd"));
                        // Continue to next date
                    }
                }
            }

            var duration = (DateTime.UtcNow - startTime).TotalSeconds;

            _logger.LogInformation(
                "[PreGen] Completed: {Success} generated, {Failed} failed, {Duration:F1}s",
                totalGenerated,
                totalFailed,
                duration);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[PreGen] Job failed");
            throw;
        }
    }

    private async Task<object> GenerateScheduleForDate(int serviceCompanyId, DateTime date)
    {
        // YOUR EXISTING QUERY LOGIC FROM dr-schedule ENDPOINT
        // Copy the query logic from your current DRScheduleController

        var jobs = await _context.Jobs
            .Where(j => j.ServiceCompanyId == serviceCompanyId
                     && j.JobDate.Date == date.Date)
            .Include(j => j.ScheduledTeams)
                .ThenInclude(st => st.Team)
            .Include(j => j.CustomerInformation)
            .Include(j => j.HomeInformation)
                .ThenInclude(h => h.ContactInfos)
            .Include(j => j.NotesAndMemos)
            .Include(j => j.EmployeeSchedules)
                .ThenInclude(es => es.Employee)
            .Include(j => j.JobTags)
            .Include(j => j.HomeTags)
            .Include(j => j.CustomerTags)
            .Include(j => j.ServiceSet)
            .AsSplitQuery()
            .AsNoTracking()
            .ToListAsync();

        // YOUR EXISTING DTO MAPPING LOGIC
        var result = new
        {
            Result = jobs.Select(job => MapJobToDto(job)).ToList(),
            Message = $"Successfully retrieved {jobs.Count} jobs",
            IsSuccess = true
        };

        return result;
    }

    private object MapJobToDto(Job job)
    {
        // YOUR EXISTING MAPPING LOGIC FROM dr-schedule ENDPOINT
        // Copy the DTO mapping from your current endpoint
        return new
        {
            JobInformationId = job.JobInformationId,
            ServiceCompanyId = job.ServiceCompanyId,
            JobDate = job.JobDate,
            ScheduledStartTime = job.ScheduledStartTime,
            ScheduledEndTime = job.ScheduledEndTime,
            // ... all other fields from your existing endpoint
        };
    }
}
```

**Register in DI Container** (`Startup.cs` or `Program.cs`):

```csharp
services.AddScoped<SchedulePreGenerationJob>();
```

---

## Step 3: Update DR-Schedule API Endpoint

**File**: `Controllers/DRScheduleController.cs` (or wherever your dr-schedule endpoint is)

### Original Endpoint (Before):

```csharp
[HttpGet]
public async Task<IActionResult> GetSchedule(
    [FromQuery] string startDate,
    [FromQuery] string endDate,
    [FromQuery] int? serviceCompanyId = null)
{
    // ... validation ...

    // Generate data on every request (SLOW - 2-5 seconds)
    var jobs = await _context.Jobs.Where(...).ToListAsync();
    var result = MapToDto(jobs);
    return Ok(result);
}
```

### Updated Endpoint (After - with Blob Storage):

```csharp
[HttpGet]
public async Task<IActionResult> GetSchedule(
    [FromQuery] string startDate,
    [FromQuery] string endDate,
    [FromQuery] int? serviceCompanyId = null)
{
    var requestStart = DateTime.UtcNow;

    // ========================================
    // Validation (KEEP YOUR EXISTING LOGIC)
    // ========================================
    if (string.IsNullOrEmpty(startDate) || string.IsNullOrEmpty(endDate))
    {
        return BadRequest(new { message = "startDate and endDate are required" });
    }

    if (!DateTime.TryParse(startDate, out var startDateParsed) ||
        !DateTime.TryParse(endDate, out var endDateParsed))
    {
        return BadRequest(new { message = "Invalid date format. Use YYYY-MM-DD" });
    }

    // Enforce single-day constraint
    if (startDateParsed.Date != endDateParsed.Date)
    {
        return BadRequest(new
        {
            message = "startDate must equal endDate (single day queries only)",
            hint = "This API requires startDate == endDate for optimal performance"
        });
    }

    var date = startDateParsed.Date;

    // Get company ID from query or auth (KEEP YOUR EXISTING LOGIC)
    var companyId = serviceCompanyId ?? GetCompanyIdFromAuth();
    if (companyId == 0)
    {
        return BadRequest(new { message = "serviceCompanyId is required" });
    }

    try
    {
        // ========================================
        // NEW: TRY BLOB STORAGE FIRST (FAST!)
        // ========================================
        var blobPath = $"schedule-cache/{companyId}/{date:yyyy-MM-dd}/schedule.json";

        // Check if pre-generated file exists
        // USE YOUR EXISTING BLOB SERVICE METHOD:
        var blobExists = await _blobService.ExistsAsync(blobPath);
        // OR adjust to your blob service interface:
        // var blobExists = await _blobService.FileExistsAsync(blobPath);
        // var blobExists = await _blobService.CheckExistsAsync(blobPath);

        if (blobExists)
        {
            // Serve from blob storage (FAST - <100ms)
            _logger.LogInformation(
                "[API] Serving cached data: {CompanyId}/{Date}",
                companyId,
                date.ToString("yyyy-MM-dd"));

            // Download JSON from blob
            // USE YOUR EXISTING BLOB SERVICE METHOD:
            var json = await _blobService.DownloadAsStringAsync(blobPath);
            // OR adjust to your blob service interface:
            // var json = await _blobService.ReadAsync(blobPath);
            // var json = await _blobService.GetStringAsync(blobPath);

            var duration = (DateTime.UtcNow - requestStart).TotalMilliseconds;
            _logger.LogInformation(
                "[API] Response time: {Duration:F0}ms (blob cache)",
                duration);

            // Return pre-generated JSON directly
            return Content(json, "application/json");
        }

        // ========================================
        // FALLBACK: GENERATE ON-DEMAND (SLOWER)
        // ========================================
        _logger.LogWarning(
            "[API] Cache miss. Generating on-demand: {CompanyId}/{Date}",
            companyId,
            date.ToString("yyyy-MM-dd"));

        // YOUR EXISTING QUERY LOGIC (keep as-is)
        var jobs = await _context.Jobs
            .Where(j => j.ServiceCompanyId == companyId
                     && j.JobDate.Date == date.Date)
            .Include(j => j.ScheduledTeams)
                .ThenInclude(st => st.Team)
            .Include(j => j.CustomerInformation)
            .Include(j => j.HomeInformation)
                .ThenInclude(h => h.ContactInfos)
            .Include(j => j.NotesAndMemos)
            .Include(j => j.EmployeeSchedules)
                .ThenInclude(es => es.Employee)
            .Include(j => j.JobTags)
            .Include(j => j.HomeTags)
            .Include(j => j.CustomerTags)
            .Include(j => j.ServiceSet)
            .AsSplitQuery()
            .AsNoTracking()
            .ToListAsync();

        // YOUR EXISTING DTO MAPPING (keep as-is)
        var result = new
        {
            Result = jobs.Select(job => MapJobToDto(job)).ToList(),
            Message = $"Successfully retrieved {jobs.Count} jobs",
            IsSuccess = true
        };

        var duration2 = (DateTime.UtcNow - requestStart).TotalMilliseconds;
        _logger.LogInformation(
            "[API] Response time: {Duration:F0}ms (on-demand)",
            duration2);

        return Ok(result);
    }
    catch (Exception ex)
    {
        _logger.LogError(
            ex,
            "[API] Error: {CompanyId}/{Date}",
            companyId,
            date.ToString("yyyy-MM-dd"));

        return StatusCode(500, new
        {
            message = "Internal server error",
            error = ex.Message
        });
    }
}

// YOUR EXISTING HELPER METHODS (keep as-is)
private int GetCompanyIdFromAuth()
{
    // Your existing auth logic
    var companyIdClaim = User.FindFirst("CompanyId")?.Value;
    return int.TryParse(companyIdClaim, out var id) ? id : 0;
}

private object MapJobToDto(Job job)
{
    // Your existing DTO mapping
    return new
    {
        JobInformationId = job.JobInformationId,
        // ... all other fields
    };
}
```

---

## Step 4: Configuration

**Add to `appsettings.json`**:

```json
{
  "SchedulePreGeneration": {
    "Enabled": true,
    "IntervalMinutes": 30,
    "DaysInAdvance": 7,
    "BlobContainer": "schedule-cache"
  }
}
```

**Use in code** (optional - for flexibility):

```csharp
var intervalMinutes = _configuration.GetValue<int>("SchedulePreGeneration:IntervalMinutes", 30);
var daysInAdvance = _configuration.GetValue<int>("SchedulePreGeneration:DaysInAdvance", 7);
```

---

## Step 5: Testing

### Test Pre-Generation Job Manually

**Add temporary endpoint** (for testing):

```csharp
[HttpPost("admin/test-pregen")]
[Authorize(Roles = "Admin")] // Or your auth
public async Task<IActionResult> TestPreGeneration()
{
    var job = _serviceProvider.GetRequiredService<SchedulePreGenerationJob>();

    await job.ExecuteAsync();

    return Ok(new
    {
        message = "Pre-generation job completed",
        checkBlob = "Verify files exist in blob storage at: schedule-cache/{companyId}/{date}/schedule.json"
    });
}
```

**Test it**:

```bash
POST https://your-api.com/admin/test-pregen
Authorization: Bearer YOUR_ADMIN_TOKEN

# Check logs for:
# [PreGen] Starting schedule pre-generation...
# [PreGen] Completed: X generated, Y failed, Z.Zs
```

### Verify Blob Storage

**Check that files exist**:
- Path pattern: `schedule-cache/{companyId}/2025-12-03/schedule.json`
- Should have 7 files per company (today + next 6 days)

### Test API Endpoint

**Test with cached data**:

```bash
# Should be FAST (<100ms) if pre-generated
GET https://your-api.com/api/dr-schedule?startDate=2025-12-03&endDate=2025-12-03&serviceCompanyId=59
Authorization: Bearer YOUR_TOKEN

# Check logs for:
# [API] Serving cached data: 59/2025-12-03
# [API] Response time: XXms (blob cache)
```

**Test with non-cached data** (future date):

```bash
# Should fall back to on-demand generation
GET https://your-api.com/api/dr-schedule?startDate=2025-12-10&endDate=2025-12-10&serviceCompanyId=59

# Check logs for:
# [API] Cache miss. Generating on-demand: 59/2025-12-10
# [API] Response time: XXXXms (on-demand)
```

### Load Test

```bash
# Test with ApacheBench (100 requests, 10 concurrent)
ab -n 100 -c 10 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  "https://your-api.com/api/dr-schedule?startDate=2025-12-03&endDate=2025-12-03&serviceCompanyId=59"

# Expected results:
# - Mean response time: <100ms
# - 95th percentile: <150ms
# - All requests: 200 OK
```

---

## Step 6: Monitoring

**Track in Application Insights / Your Logging**:

```csharp
// In API endpoint
_logger.LogInformation(
    "[Metrics] API request - Company:{CompanyId}, Date:{Date}, Source:{Source}, Duration:{Ms}ms",
    companyId,
    date.ToString("yyyy-MM-dd"),
    isFromBlob ? "BlobCache" : "OnDemand",
    responseTimeMs);

// In pre-generation job
_logger.LogInformation(
    "[Metrics] PreGen - Companies:{Count}, Generated:{Success}, Failed:{Failed}, Duration:{Sec}s",
    companyCount,
    totalGenerated,
    totalFailed,
    durationSeconds);
```

**Key Metrics**:
- ✅ Cache hit rate (target: >95%)
- ✅ API response time (target: <100ms for cached, <500ms for on-demand)
- ✅ Pre-generation job duration (target: <60 seconds)
- ✅ Pre-generation failures (target: <1%)

---

## Deployment Checklist

- [ ] Add `SchedulePreGenerationJob` class
- [ ] Update `TaskScheduleService` to schedule job every 30 minutes
- [ ] Update `DRScheduleController` endpoint to check blob first
- [ ] Add configuration to `appsettings.json`
- [ ] Deploy to staging/dev environment
- [ ] Test manually via `/admin/test-pregen` endpoint
- [ ] Verify blob storage has files
- [ ] Test API endpoint returns cached data
- [ ] Load test to verify <100ms response time
- [ ] Monitor for 1 hour (verify job runs every 30 min)
- [ ] Deploy to production
- [ ] Monitor for 24 hours
- [ ] Remove test endpoint (or protect it)

---

## Rollback Plan

If issues occur:

1. **Stop pre-generation job**:
   ```csharp
   // Comment out in TaskScheduleService:
   // RecurringJob.AddOrUpdate<SchedulePreGenerationJob>(...);
   ```

2. **Disable blob check in API**:
   ```csharp
   // Comment out blob storage check:
   // var blobExists = await _blobService.ExistsAsync(blobPath);
   // if (blobExists) { ... }

   // Just use original logic:
   var jobs = await _context.Jobs.Where(...).ToListAsync();
   return Ok(MapToDto(jobs));
   ```

3. **Redeploy previous version**

---

## Expected Results

### Before:
- ❌ API response time: 2-5 seconds
- ❌ Database queries: 50-100+ per request
- ❌ High database load

### After:
- ✅ API response time: <100ms (95%+ of requests)
- ✅ Database queries: 0 per request (when cached)
- ✅ Low database load (queries run every 30 min in background)
- ✅ Cache hit rate: >95%
- ✅ Cost: ~$2/month for blob storage

### Performance Improvement:
**95% faster** (2-5 sec → <100ms) 🚀

---

## Summary

**3 Files to Change**:
1. `TaskScheduleService.cs` - Schedule job every 30 minutes
2. `Jobs/SchedulePreGenerationJob.cs` - NEW - Pre-generate JSON to blob
3. `Controllers/DRScheduleController.cs` - Check blob first, fallback to on-demand

**Result**: 95% faster API with minimal changes to existing code! ✅
