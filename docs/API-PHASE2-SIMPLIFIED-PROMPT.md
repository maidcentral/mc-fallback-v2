# MaidCentral API v2 - Phase 2 Optimization (Simplified)

**Endpoint**: `GET /api/dr-schedule?startDate=X&endDate=X`
**Goal**: Reduce response time from 2-5 seconds to <100ms
**Strategy**: Pre-generate schedule data hourly using existing blob storage

---

## Overview

Since blob storage is already set up in your project, you only need to:

1. ✅ Create a background job to pre-generate schedule JSON every hour
2. ✅ Update the existing API endpoint to check blob storage first
3. ✅ Schedule the job to run hourly

**Expected Result**: API response time drops from 2-5 seconds to <100ms (95%+ faster)

---

## Step 1: Create Schedule Generator Service

Extract your existing schedule generation logic into a reusable service.

**File**: `Services/ScheduleGeneratorService.cs`

```csharp
using Microsoft.EntityFrameworkCore;

public interface IScheduleGeneratorService
{
    Task<ScheduleDto> GenerateScheduleAsync(int serviceCompanyId, DateTime date);
}

public class ScheduleGeneratorService : IScheduleGeneratorService
{
    private readonly YourDbContext _context;
    private readonly ILogger<ScheduleGeneratorService> _logger;

    public ScheduleGeneratorService(
        YourDbContext context,
        ILogger<ScheduleGeneratorService> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<ScheduleDto> GenerateScheduleAsync(int serviceCompanyId, DateTime date)
    {
        _logger.LogInformation(
            "Generating schedule for company {CompanyId} on {Date}",
            serviceCompanyId,
            date.ToString("yyyy-MM-dd"));

        // YOUR EXISTING QUERY LOGIC HERE
        // Move your current /api/dr-schedule endpoint query logic here
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

        // YOUR EXISTING MAPPING LOGIC HERE
        // Move your current DTO mapping logic here
        var result = new ScheduleDto
        {
            Result = jobs.Select(job => MapJobToDto(job)).ToList(),
            Message = $"Successfully retrieved {jobs.Count} jobs",
            IsSuccess = true
        };

        return result;
    }

    private JobDto MapJobToDto(Job job)
    {
        // YOUR EXISTING MAPPING LOGIC
        // Copy from your current endpoint
        return new JobDto
        {
            JobInformationId = job.JobInformationId,
            ServiceCompanyId = job.ServiceCompanyId,
            // ... all other fields
        };
    }
}
```

**Register in DI** (`Startup.cs` or `Program.cs`):

```csharp
services.AddScoped<IScheduleGeneratorService, ScheduleGeneratorService>();
```

---

## Step 2: Create Background Job

**File**: `Jobs/SchedulePreGenerationJob.cs`

```csharp
using System.Text.Json;

public class SchedulePreGenerationJob
{
    private readonly YourDbContext _context;
    private readonly IScheduleGeneratorService _scheduleGenerator;
    private readonly IYourExistingBlobService _blobStorage; // <-- Use your existing blob service
    private readonly ILogger<SchedulePreGenerationJob> _logger;

    public SchedulePreGenerationJob(
        YourDbContext context,
        IScheduleGeneratorService scheduleGenerator,
        IYourExistingBlobService blobStorage, // <-- Inject your existing blob service
        ILogger<SchedulePreGenerationJob> logger)
    {
        _context = context;
        _scheduleGenerator = scheduleGenerator;
        _blobStorage = blobStorage;
        _logger = logger;
    }

    public async Task ExecuteAsync()
    {
        _logger.LogInformation("[PreGen] Starting schedule pre-generation job");

        var startTime = DateTime.UtcNow;
        var today = DateTime.UtcNow.Date;
        var totalGenerated = 0;

        try
        {
            // Get all active companies with backup portal enabled
            var activeCompanies = await _context.Companies
                .Where(c => c.IsActive && c.BackupPortalEnabled) // Adjust field name as needed
                .Select(c => new { c.ServiceCompanyId, c.Name })
                .ToListAsync();

            _logger.LogInformation(
                "[PreGen] Found {CompanyCount} active companies",
                activeCompanies.Count);

            // Process each company
            foreach (var company in activeCompanies)
            {
                // Generate schedule for next 7 days
                for (int dayOffset = 0; dayOffset < 7; dayOffset++)
                {
                    var targetDate = today.AddDays(dayOffset);

                    try
                    {
                        // Generate schedule data
                        var scheduleData = await _scheduleGenerator
                            .GenerateScheduleAsync(company.ServiceCompanyId, targetDate);

                        // Serialize to JSON (no indenting = smaller file)
                        var json = JsonSerializer.Serialize(scheduleData, new JsonSerializerOptions
                        {
                            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                            WriteIndented = false
                        });

                        // Save to blob storage using YOUR existing method
                        var blobPath = $"schedule-cache/{company.ServiceCompanyId}/{targetDate:yyyy-MM-dd}/schedule.json";

                        // USE YOUR EXISTING BLOB UPLOAD METHOD HERE
                        // Example (adjust to match your existing blob service):
                        await _blobStorage.UploadAsync(blobPath, json);
                        // OR
                        // await _blobStorage.SaveStringAsync(blobPath, json);
                        // OR whatever method your blob service uses

                        totalGenerated++;

                        _logger.LogDebug(
                            "[PreGen] Generated: {CompanyId}/{Date}",
                            company.ServiceCompanyId,
                            targetDate.ToString("yyyy-MM-dd"));
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(
                            ex,
                            "[PreGen] Failed: {CompanyId}/{Date}",
                            company.ServiceCompanyId,
                            targetDate.ToString("yyyy-MM-dd"));
                        // Continue to next date
                    }
                }
            }

            var duration = (DateTime.UtcNow - startTime).TotalSeconds;

            _logger.LogInformation(
                "[PreGen] Completed. Generated {Count} schedules in {Duration:F2}s",
                totalGenerated,
                duration);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[PreGen] Job failed");
            throw;
        }
    }
}
```

---

## Step 3: Schedule the Job

**Option A: Using Hangfire** (if you have it):

```csharp
// In Startup.cs or Program.cs
RecurringJob.AddOrUpdate<SchedulePreGenerationJob>(
    "schedule-pre-generation",
    job => job.ExecuteAsync(),
    Cron.Hourly); // Runs every hour at :00
```

**Option B: Using Azure Functions** (if on Azure):

```csharp
// Create new Azure Function
[FunctionName("SchedulePreGeneration")]
public async Task Run(
    [TimerTrigger("0 0 * * * *")] TimerInfo timer, // Every hour
    ILogger log)
{
    var job = _serviceProvider.GetRequiredService<SchedulePreGenerationJob>();
    await job.ExecuteAsync();
}
```

**Option C: Using Quartz.NET** (if that's what you use):

```csharp
// Create Quartz job wrapper
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

// Schedule it
var trigger = TriggerBuilder.Create()
    .WithIdentity("schedule-pregen-trigger")
    .WithSchedule(CronScheduleBuilder.HourlyAt(0)) // Every hour at :00
    .Build();

await scheduler.ScheduleJob(jobDetail, trigger);
```

**Option D: Simple Hosted Service** (minimal dependencies):

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
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // Calculate delay until next hour
                var now = DateTime.UtcNow;
                var nextHour = now.Date.AddHours(now.Hour + 1);
                var delay = nextHour - now;

                _logger.LogInformation(
                    "[PreGen] Next run at {NextRun} (in {Minutes} minutes)",
                    nextHour,
                    delay.TotalMinutes);

                await Task.Delay(delay, stoppingToken);

                // Run the job
                using var scope = _serviceProvider.CreateScope();
                var job = scope.ServiceProvider.GetRequiredService<SchedulePreGenerationJob>();
                await job.ExecuteAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[PreGen] Hosted service error");
                await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken); // Wait 5 min on error
            }
        }
    }
}

// Register in Startup.cs or Program.cs
services.AddHostedService<SchedulePreGenerationHostedService>();
```

---

## Step 4: Update API Endpoint

**File**: `Controllers/DRScheduleController.cs`

```csharp
[HttpGet]
public async Task<IActionResult> GetSchedule(
    [FromQuery] string startDate,
    [FromQuery] string endDate,
    [FromQuery] int? serviceCompanyId = null)
{
    var requestStart = DateTime.UtcNow;

    // Validate inputs
    if (string.IsNullOrEmpty(startDate) || string.IsNullOrEmpty(endDate))
    {
        return BadRequest(new { message = "startDate and endDate are required" });
    }

    if (!DateTime.TryParse(startDate, out var startDateParsed) ||
        !DateTime.TryParse(endDate, out var endDateParsed))
    {
        return BadRequest(new { message = "Invalid date format" });
    }

    // Enforce single-day constraint
    if (startDateParsed.Date != endDateParsed.Date)
    {
        return BadRequest(new { message = "startDate must equal endDate" });
    }

    var date = startDateParsed.Date;
    var companyId = serviceCompanyId ?? GetCompanyIdFromAuth();

    if (companyId == 0)
    {
        return BadRequest(new { message = "serviceCompanyId is required" });
    }

    try
    {
        // TRY TO GET PRE-GENERATED DATA FROM BLOB STORAGE (FAST!)
        var blobPath = $"schedule-cache/{companyId}/{date:yyyy-MM-dd}/schedule.json";

        // USE YOUR EXISTING BLOB SERVICE METHOD TO CHECK IF FILE EXISTS
        // Example (adjust to match your blob service):
        var blobExists = await _blobStorage.ExistsAsync(blobPath);
        // OR
        // var blobExists = await _blobStorage.FileExistsAsync(blobPath);

        if (blobExists)
        {
            _logger.LogInformation(
                "[API] Serving pre-generated data for {CompanyId}/{Date}",
                companyId,
                date.ToString("yyyy-MM-dd"));

            // USE YOUR EXISTING BLOB SERVICE METHOD TO DOWNLOAD FILE
            // Example (adjust to match your blob service):
            var json = await _blobStorage.DownloadAsStringAsync(blobPath);
            // OR
            // var json = await _blobStorage.ReadStringAsync(blobPath);

            var duration = (DateTime.UtcNow - requestStart).TotalMilliseconds;
            _logger.LogInformation("[API] Response time: {Duration:F0}ms (blob)", duration);

            return Content(json, "application/json");
        }

        // FALLBACK: GENERATE ON-DEMAND (if blob doesn't exist)
        _logger.LogWarning(
            "[API] Pre-generated data not found. Generating on-demand for {CompanyId}/{Date}",
            companyId,
            date.ToString("yyyy-MM-dd"));

        var scheduleData = await _scheduleGenerator.GenerateScheduleAsync(companyId, date);

        var duration2 = (DateTime.UtcNow - requestStart).TotalMilliseconds;
        _logger.LogInformation("[API] Response time: {Duration:F0}ms (on-demand)", duration2);

        return Ok(scheduleData);
    }
    catch (Exception ex)
    {
        _logger.LogError(
            ex,
            "[API] Error: {CompanyId}/{Date}",
            companyId,
            date.ToString("yyyy-MM-dd"));

        return StatusCode(500, new { message = "Internal server error" });
    }
}

private int GetCompanyIdFromAuth()
{
    // Your existing logic to get company ID from auth
    var companyIdClaim = User.FindFirst("CompanyId")?.Value;
    return int.TryParse(companyIdClaim, out var id) ? id : 0;
}
```

---

## Step 5: Testing

### Test the Background Job

**Trigger Manually** (add this temporary endpoint for testing):

```csharp
[HttpPost("admin/trigger-pregen")]
[Authorize(Roles = "Admin")] // Or whatever auth you use
public async Task<IActionResult> TriggerPreGeneration()
{
    var job = new SchedulePreGenerationJob(
        _context,
        _scheduleGenerator,
        _blobStorage,
        _logger);

    await job.ExecuteAsync();

    return Ok(new { message = "Pre-generation completed" });
}
```

**Check Blob Storage**:
- After running the job, verify files exist in blob storage
- Path: `schedule-cache/{companyId}/{date}/schedule.json`
- Should have files for 7 days for each active company

### Test the API Endpoint

```bash
# Should be FAST (<100ms) if pre-generated data exists
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "https://your-api.com/api/dr-schedule?startDate=2025-10-28&endDate=2025-10-28&serviceCompanyId=59"

# Check logs for:
# "[API] Serving pre-generated data..."
# "[API] Response time: XXms (blob)"
```

### Load Test

```bash
# Using Apache Bench
ab -n 1000 -c 10 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  "https://your-api.com/api/dr-schedule?startDate=2025-10-28&endDate=2025-10-28&serviceCompanyId=59"

# Expected results:
# - Mean: <100ms
# - 95th percentile: <200ms
# - All requests successful
```

---

## Configuration

**Add to your existing configuration** (`appsettings.json`):

```json
{
  "SchedulePreGeneration": {
    "Enabled": true,
    "DaysInAdvance": 7,
    "BlobContainerName": "schedule-cache"
  }
}
```

**Use in code**:

```csharp
var daysInAdvance = _configuration.GetValue<int>("SchedulePreGeneration:DaysInAdvance", 7);
```

---

## Monitoring

**Key Metrics to Track**:

```csharp
// In your logging
_logger.LogInformation(
    "[Metrics] API={ResponseTimeMs}, Source={BlobOrOnDemand}, Company={CompanyId}, Date={Date}",
    responseTimeMs,
    isFromBlob ? "Blob" : "OnDemand",
    companyId,
    date);

// In background job
_logger.LogInformation(
    "[Metrics] PreGen JobDuration={Seconds}s, TotalGenerated={Count}, Companies={CompanyCount}",
    durationSeconds,
    totalGenerated,
    companyCount);
```

**What to Monitor**:
- ✅ API response time (target: <100ms for 95%+ of requests)
- ✅ Pre-generation job duration (target: <60 seconds)
- ✅ Cache hit rate (target: >95%)
- ✅ Failed generations (target: <1%)

---

## Rollback Plan

If issues occur:

1. **Disable pre-generation job** (comment out the scheduler registration)
2. **Comment out blob check in API endpoint**:
   ```csharp
   // var blobExists = await _blobStorage.ExistsAsync(blobPath);
   // if (blobExists) { ... }

   // Just generate on-demand (original behavior)
   var scheduleData = await _scheduleGenerator.GenerateScheduleAsync(companyId, date);
   return Ok(scheduleData);
   ```
3. **Deploy previous version** via your CI/CD pipeline

---

## Expected Results

### Before Implementation:
- ❌ Response time: 2-5 seconds
- ❌ Database queries: 50-100+ per request
- ❌ High database load during peak hours

### After Implementation:
- ✅ Response time: <100ms (95%+ requests from blob)
- ✅ Database queries: 0 per request (when cached)
- ✅ Low database load (only during hourly job)
- ✅ Cache hit rate: >95%
- ✅ On-demand fallback: <500ms (if blob missing)

### Performance Improvement:
- **95% faster** API responses (2-5 sec → <100ms)
- **Zero database load** during API requests (when cached)
- **Cost**: ~$2/month for blob storage (files are small)

---

## Implementation Checklist

- [ ] Create `ScheduleGeneratorService` (Step 1)
- [ ] Create `SchedulePreGenerationJob` (Step 2)
- [ ] Schedule the job (Step 3) - Choose your scheduler
- [ ] Update API endpoint to check blob storage (Step 4)
- [ ] Add configuration settings
- [ ] Test manually via `/admin/trigger-pregen`
- [ ] Verify blob storage has files
- [ ] Test API endpoint returns cached data fast
- [ ] Load test to verify <100ms response time
- [ ] Deploy to production
- [ ] Monitor for 24 hours
- [ ] Verify hourly job runs successfully

---

## Quick Start Summary

**3 Simple Changes**:

1. **Add Service** → Extract schedule generation into `ScheduleGeneratorService`
2. **Add Job** → Create `SchedulePreGenerationJob` to pre-generate hourly
3. **Update API** → Check blob storage first in your existing endpoint

**Result**: 95% faster API (2-5 sec → <100ms) 🚀

---

## Questions?

- **Where to put the files?** Follow your existing project structure
- **Which scheduler?** Use whatever you already have (Hangfire, Azure Functions, Quartz, HostedService)
- **Blob service methods?** Adjust examples to match your existing blob service interface

**Ready to implement!** Should take 3-5 days total.
