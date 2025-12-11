# MaidCentral API v2 - Phase 2 Optimization Implementation Guide

**Endpoint**: `GET /api/dr-schedule?startDate=X&endDate=X`
**Goal**: Reduce response time from 2-5 seconds to <100ms
**Strategy**: Pre-generate schedule data hourly and serve from blob storage

---

## Overview

This document provides step-by-step instructions for implementing Phase 2 optimization of the `/api/dr-schedule` endpoint using a background job + blob storage pattern.

**Current Flow (Slow)**:
```
API Request → Database Query (2-5 sec) → Transform → Return JSON
```

**New Flow (Fast)**:
```
Hourly Background Job → Query DB once → Transform → Save to Blob Storage
                                                    ↓
API Request → Check Blob Storage → Return pre-generated JSON (<100ms)
             ↓ (if not found)
             Generate on-demand (fallback)
```

---

## Phase 2 Implementation Steps

### Step 1: Set Up Blob Storage Container

**Azure Blob Storage** (if using Azure):

```csharp
// Add NuGet package
// Install-Package Azure.Storage.Blobs

// In Startup.cs or Program.cs
services.AddSingleton(x =>
{
    var connectionString = configuration["AzureStorage:ConnectionString"];
    return new BlobServiceClient(connectionString);
});

// Create container (run once during deployment)
var blobServiceClient = new BlobServiceClient(connectionString);
var containerClient = blobServiceClient.GetBlobContainerClient("schedule-cache");
await containerClient.CreateIfNotExistsAsync(PublicAccessType.None);
```

**AWS S3** (if using AWS):

```csharp
// Add NuGet package
// Install-Package AWSSDK.S3

// In Startup.cs or Program.cs
services.AddSingleton<IAmazonS3>(x =>
{
    var awsOptions = configuration.GetAWSOptions();
    return awsOptions.CreateServiceClient<IAmazonS3>();
});

// Create bucket (run once during deployment)
var s3Client = new AmazonS3Client();
await s3Client.PutBucketAsync(new PutBucketRequest
{
    BucketName = "maidcentral-schedule-cache"
});
```

**Container/Bucket Structure**:
```
schedule-cache/
├── {service_company_id}/
│   ├── {date}/
│   │   └── schedule.json
│   └── ...
└── ...

Example:
schedule-cache/59/2025-10-28/schedule.json
schedule-cache/59/2025-10-29/schedule.json
schedule-cache/137/2025-10-28/schedule.json
```

---

### Step 2: Create Blob Storage Service

Create a service to abstract blob storage operations:

**File**: `Services/IBlobStorageService.cs`

```csharp
public interface IBlobStorageService
{
    Task<bool> ExistsAsync(string containerName, string blobPath);
    Task<string> DownloadAsStringAsync(string containerName, string blobPath);
    Task UploadAsync(string containerName, string blobPath, string content);
    Task DeleteAsync(string containerName, string blobPath);
}
```

**File**: `Services/AzureBlobStorageService.cs`

```csharp
using Azure.Storage.Blobs;
using System.Text;

public class AzureBlobStorageService : IBlobStorageService
{
    private readonly BlobServiceClient _blobServiceClient;

    public AzureBlobStorageService(BlobServiceClient blobServiceClient)
    {
        _blobServiceClient = blobServiceClient;
    }

    public async Task<bool> ExistsAsync(string containerName, string blobPath)
    {
        try
        {
            var containerClient = _blobServiceClient.GetBlobContainerClient(containerName);
            var blobClient = containerClient.GetBlobClient(blobPath);
            return await blobClient.ExistsAsync();
        }
        catch
        {
            return false;
        }
    }

    public async Task<string> DownloadAsStringAsync(string containerName, string blobPath)
    {
        var containerClient = _blobServiceClient.GetBlobContainerClient(containerName);
        var blobClient = containerClient.GetBlobClient(blobPath);

        var response = await blobClient.DownloadContentAsync();
        return response.Value.Content.ToString();
    }

    public async Task UploadAsync(string containerName, string blobPath, string content)
    {
        var containerClient = _blobServiceClient.GetBlobContainerClient(containerName);
        var blobClient = containerClient.GetBlobClient(blobPath);

        var bytes = Encoding.UTF8.GetBytes(content);
        using var stream = new MemoryStream(bytes);

        await blobClient.UploadAsync(stream, overwrite: true);
    }

    public async Task DeleteAsync(string containerName, string blobPath)
    {
        var containerClient = _blobServiceClient.GetBlobContainerClient(containerName);
        var blobClient = containerClient.GetBlobClient(blobPath);

        await blobClient.DeleteIfExistsAsync();
    }
}
```

**Register in DI Container**:

```csharp
// In Startup.cs or Program.cs
services.AddSingleton<IBlobStorageService, AzureBlobStorageService>();
```

---

### Step 3: Create Schedule Generator Service

Extract the schedule generation logic into a reusable service:

**File**: `Services/IScheduleGeneratorService.cs`

```csharp
public interface IScheduleGeneratorService
{
    Task<ScheduleDto> GenerateScheduleAsync(int serviceCompanyId, DateTime date);
}
```

**File**: `Services/ScheduleGeneratorService.cs`

```csharp
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

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

        // Query jobs with all related data using eager loading
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
            .AsSplitQuery() // Use split query for large datasets
            .AsNoTracking() // Read-only, improves performance
            .ToListAsync();

        _logger.LogInformation(
            "Found {JobCount} jobs for company {CompanyId} on {Date}",
            jobs.Count,
            serviceCompanyId,
            date.ToString("yyyy-MM-dd"));

        // Transform to DTO
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
        // Your existing mapping logic
        return new JobDto
        {
            JobInformationId = job.JobInformationId,
            ServiceCompanyId = job.ServiceCompanyId,
            JobDate = job.JobDate,
            ScheduledStartTime = job.ScheduledStartTime,
            ScheduledEndTime = job.ScheduledEndTime,

            CustomerInformation = new CustomerDto
            {
                CustomerFirstName = job.CustomerInformation?.FirstName,
                CustomerLastName = job.CustomerInformation?.LastName,
                // ... other customer fields
            },

            HomeInformation = new HomeDto
            {
                HomeAddress1 = job.HomeInformation?.Address1,
                HomeCity = job.HomeInformation?.City,
                // ... other home fields
            },

            ScheduledTeams = job.ScheduledTeams?.Select(st => new ScheduledTeamDto
            {
                TeamListId = st.TeamListId,
                TeamListDescription = st.Team?.Name,
                Color = st.Team?.Color,
                SortOrder = st.Team?.SortOrder ?? 0
            }).ToList() ?? new List<ScheduledTeamDto>(),

            EmployeeSchedules = job.EmployeeSchedules?.Select(es => new EmployeeScheduleDto
            {
                EmployeeInformationId = es.EmployeeInformationId,
                FirstName = es.Employee?.FirstName,
                LastName = es.Employee?.LastName,
                TeamListId = es.TeamListId,
                TeamPosition = es.TeamPosition
            }).ToList() ?? new List<EmployeeScheduleDto>(),

            ContactInfos = job.HomeInformation?.ContactInfos?.Select(ci => new ContactInfoDto
            {
                ContactTypeId = ci.ContactTypeId,
                ContactInfo = ci.ContactInfo
            }).ToList() ?? new List<ContactInfoDto>(),

            NotesAndMemos = new NotesAndMemosDto
            {
                EventInstructions = job.NotesAndMemos?.EventInstructions,
                HomeSpecialInstructions = job.NotesAndMemos?.HomeSpecialInstructions,
                HomePetInstructions = job.NotesAndMemos?.HomePetInstructions,
                HomeDirections = job.NotesAndMemos?.HomeDirections,
                HomeSpecialEquipment = job.NotesAndMemos?.HomeSpecialEquipment,
                HomeWasteDisposal = job.NotesAndMemos?.HomeWasteDisposal,
                HomeAccessInformation = job.NotesAndMemos?.HomeAccessInformation,
                HomeInternalMemo = job.NotesAndMemos?.HomeInternalMemo
            },

            JobTags = job.JobTags?.Select(t => new TagDto { TagName = t.TagName }).ToList(),
            HomeTags = job.HomeTags?.Select(t => new TagDto { TagName = t.TagName }).ToList(),
            CustomerTags = job.CustomerTags?.Select(t => new TagDto { TagName = t.TagName }).ToList(),

            ServiceSet = job.ServiceSet != null ? new ServiceSetDto
            {
                ServiceSetDescription = job.ServiceSet.Description,
                ServiceSetTypeDescription = job.ServiceSet.TypeDescription
            } : null,

            BillRate = job.BillRate
            // ... other job fields
        };
    }
}
```

**Register in DI Container**:

```csharp
services.AddScoped<IScheduleGeneratorService, ScheduleGeneratorService>();
```

---

### Step 4: Create Background Job (Hourly Pre-Generation)

**Using Hangfire** (recommended):

```csharp
// Add NuGet packages
// Install-Package Hangfire.AspNetCore
// Install-Package Hangfire.SqlServer (or Hangfire.PostgreSQL)

// In Startup.cs or Program.cs
services.AddHangfire(config => config
    .SetDataCompatibilityLevel(CompatibilityLevel.Version_170)
    .UseSimpleAssemblyNameTypeSerializer()
    .UseRecommendedSerializerSettings()
    .UseSqlServerStorage(configuration.GetConnectionString("HangfireConnection")));

services.AddHangfireServer();
```

**File**: `Jobs/SchedulePreGenerationJob.cs`

```csharp
using Hangfire;
using System.Text.Json;

public class SchedulePreGenerationJob
{
    private readonly YourDbContext _context;
    private readonly IScheduleGeneratorService _scheduleGenerator;
    private readonly IBlobStorageService _blobStorage;
    private readonly ILogger<SchedulePreGenerationJob> _logger;

    public SchedulePreGenerationJob(
        YourDbContext context,
        IScheduleGeneratorService scheduleGenerator,
        IBlobStorageService blobStorage,
        ILogger<SchedulePreGenerationJob> logger)
    {
        _context = context;
        _scheduleGenerator = scheduleGenerator;
        _blobStorage = blobStorage;
        _logger = logger;
    }

    [AutomaticRetry(Attempts = 3, DelaysInSeconds = new[] { 30, 60, 120 })]
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
                .Where(c => c.IsActive && c.BackupPortalEnabled)
                .Select(c => new { c.ServiceCompanyId, c.Name })
                .ToListAsync();

            _logger.LogInformation(
                "[PreGen] Found {CompanyCount} active companies to process",
                activeCompanies.Count);

            // Process each company
            foreach (var company in activeCompanies)
            {
                try
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

                            // Serialize to JSON
                            var json = JsonSerializer.Serialize(scheduleData, new JsonSerializerOptions
                            {
                                PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                                WriteIndented = false // Minimize file size
                            });

                            // Save to blob storage
                            var blobPath = $"{company.ServiceCompanyId}/{targetDate:yyyy-MM-dd}/schedule.json";
                            await _blobStorage.UploadAsync("schedule-cache", blobPath, json);

                            totalGenerated++;

                            _logger.LogDebug(
                                "[PreGen] Generated schedule for company {CompanyId} ({CompanyName}) on {Date}",
                                company.ServiceCompanyId,
                                company.Name,
                                targetDate.ToString("yyyy-MM-dd"));
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(
                                ex,
                                "[PreGen] Failed to generate schedule for company {CompanyId} on {Date}",
                                company.ServiceCompanyId,
                                targetDate.ToString("yyyy-MM-dd"));
                            // Continue to next date
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(
                        ex,
                        "[PreGen] Failed to process company {CompanyId} ({CompanyName})",
                        company.ServiceCompanyId,
                        company.Name);
                    // Continue to next company
                }
            }

            var duration = (DateTime.UtcNow - startTime).TotalSeconds;

            _logger.LogInformation(
                "[PreGen] Job completed successfully. Generated {TotalCount} schedules in {Duration:F2} seconds",
                totalGenerated,
                duration);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[PreGen] Job failed with exception");
            throw; // Let Hangfire handle retry
        }
    }
}
```

**Schedule the Job** (in `Startup.cs` or `Program.cs`):

```csharp
// Run hourly at :00
RecurringJob.AddOrUpdate<SchedulePreGenerationJob>(
    "schedule-pre-generation",
    job => job.ExecuteAsync(),
    Cron.Hourly); // Runs every hour at minute 0

// Or for more control (e.g., run at specific minute)
// RecurringJob.AddOrUpdate<SchedulePreGenerationJob>(
//     "schedule-pre-generation",
//     job => job.ExecuteAsync(),
//     "0 * * * *"); // Cron: Every hour at minute 0
```

**Optional: Trigger Manually via API** (for testing):

```csharp
[HttpPost("admin/trigger-schedule-pregeneration")]
[Authorize(Roles = "Admin")]
public IActionResult TriggerPreGeneration()
{
    BackgroundJob.Enqueue<SchedulePreGenerationJob>(job => job.ExecuteAsync());
    return Ok(new { message = "Schedule pre-generation job queued" });
}
```

---

### Step 5: Update API Endpoint to Serve from Blob Storage

**File**: `Controllers/DRScheduleController.cs`

```csharp
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

[ApiController]
[Route("api/dr-schedule")]
public class DRScheduleController : ControllerBase
{
    private readonly IBlobStorageService _blobStorage;
    private readonly IScheduleGeneratorService _scheduleGenerator;
    private readonly ILogger<DRScheduleController> _logger;

    public DRScheduleController(
        IBlobStorageService blobStorage,
        IScheduleGeneratorService scheduleGenerator,
        ILogger<DRScheduleController> logger)
    {
        _blobStorage = blobStorage;
        _scheduleGenerator = scheduleGenerator;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetSchedule(
        [FromQuery] string startDate,
        [FromQuery] string endDate,
        [FromQuery] int? serviceCompanyId = null)
    {
        var requestStartTime = DateTime.UtcNow;

        // Validate inputs
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
            return BadRequest(new { message = "startDate must equal endDate (single day only)" });
        }

        var date = startDateParsed.Date;

        // Get company ID from query parameter or auth context
        var companyId = serviceCompanyId ?? GetCompanyIdFromAuthContext();
        if (companyId == 0)
        {
            return BadRequest(new { message = "serviceCompanyId is required" });
        }

        try
        {
            // Try to get pre-generated data from blob storage
            var blobPath = $"{companyId}/{date:yyyy-MM-dd}/schedule.json";
            var blobExists = await _blobStorage.ExistsAsync("schedule-cache", blobPath);

            if (blobExists)
            {
                _logger.LogInformation(
                    "[API] Serving pre-generated schedule from blob storage for company {CompanyId} on {Date}",
                    companyId,
                    date.ToString("yyyy-MM-dd"));

                // Serve from blob storage (FAST!)
                var json = await _blobStorage.DownloadAsStringAsync("schedule-cache", blobPath);

                var duration = (DateTime.UtcNow - requestStartTime).TotalMilliseconds;
                _logger.LogInformation(
                    "[API] Request completed in {Duration:F0}ms (blob storage)",
                    duration);

                return Content(json, "application/json");
            }

            // Fallback: Generate on-demand
            _logger.LogWarning(
                "[API] Pre-generated data not found. Generating on-demand for company {CompanyId} on {Date}",
                companyId,
                date.ToString("yyyy-MM-dd"));

            var scheduleData = await _scheduleGenerator.GenerateScheduleAsync(companyId, date);

            var duration2 = (DateTime.UtcNow - requestStartTime).TotalMilliseconds;
            _logger.LogInformation(
                "[API] Request completed in {Duration:F0}ms (on-demand generation)",
                duration2);

            return Ok(scheduleData);
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "[API] Error processing schedule request for company {CompanyId} on {Date}",
                companyId,
                date.ToString("yyyy-MM-dd"));

            return StatusCode(500, new
            {
                message = "Internal server error",
                error = ex.Message
            });
        }
    }

    private int GetCompanyIdFromAuthContext()
    {
        // Extract company ID from JWT claims or other auth mechanism
        var companyIdClaim = User.FindFirst("CompanyId")?.Value;
        if (int.TryParse(companyIdClaim, out var companyId))
        {
            return companyId;
        }
        return 0;
    }
}
```

---

### Step 6: Add Monitoring and Metrics

**Track Performance Metrics**:

```csharp
// In API endpoint
using System.Diagnostics;

[HttpGet]
public async Task<IActionResult> GetSchedule(...)
{
    var stopwatch = Stopwatch.StartNew();

    // ... endpoint logic ...

    stopwatch.Stop();

    // Log metrics
    _logger.LogInformation(
        "[Metrics] Schedule API request - CompanyId: {CompanyId}, Date: {Date}, " +
        "Source: {Source}, Duration: {Duration}ms",
        companyId,
        date.ToString("yyyy-MM-dd"),
        blobExists ? "BlobStorage" : "OnDemand",
        stopwatch.ElapsedMilliseconds);

    // Optional: Send to Application Insights, DataDog, etc.
    // telemetryClient.TrackMetric("ScheduleAPI.ResponseTime", stopwatch.ElapsedMilliseconds);
}
```

**Monitor Background Job**:

```csharp
// In SchedulePreGenerationJob
var metrics = new
{
    TotalCompanies = activeCompanies.Count,
    TotalGenerated = totalGenerated,
    DurationSeconds = duration,
    SuccessRate = (double)totalGenerated / (activeCompanies.Count * 7) * 100
};

_logger.LogInformation(
    "[PreGen] Job metrics: {@Metrics}",
    metrics);
```

---

### Step 7: Configuration

**Add to `appsettings.json`**:

```json
{
  "AzureStorage": {
    "ConnectionString": "DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net"
  },
  "Hangfire": {
    "ConnectionString": "Server=...;Database=HangfireDB;..."
  },
  "SchedulePreGeneration": {
    "Enabled": true,
    "DaysInAdvance": 7,
    "ContainerName": "schedule-cache"
  }
}
```

---

### Step 8: Testing

**Test Pre-Generation Job Manually**:

```bash
# Trigger via API
POST https://your-api.com/admin/trigger-schedule-pregeneration
Authorization: Bearer <admin-token>
```

**Test API Endpoint**:

```bash
# Should return pre-generated data (<100ms)
GET https://your-api.com/api/dr-schedule?startDate=2025-10-28&endDate=2025-10-28&serviceCompanyId=59
Authorization: Bearer <token>

# Check response time in headers or logs
```

**Load Test**:

```bash
# Using Apache Bench
ab -n 1000 -c 10 -H "Authorization: Bearer <token>" \
  "https://your-api.com/api/dr-schedule?startDate=2025-10-28&endDate=2025-10-28&serviceCompanyId=59"

# Expected results:
# - Mean response time: <100ms
# - 95th percentile: <200ms
# - Success rate: 100%
```

---

## Expected Results

### Before Phase 2:
- Response time: 2-5 seconds
- Database queries per request: 50-100+
- CPU usage during peak: High
- Database load: High

### After Phase 2:
- Response time: <100ms (pre-generated), <500ms (on-demand fallback)
- Database queries per request: 0 (blob storage) or optimized (fallback)
- CPU usage during peak: Low
- Database load: Minimal (only during hourly job)

### Metrics to Track:
- ✅ API response time (target: <100ms for 95% of requests)
- ✅ Pre-generation job duration (target: <30 seconds for 100 companies)
- ✅ Cache hit rate (target: >95%)
- ✅ Blob storage costs (expected: ~$2-5/month)

---

## Rollback Plan

If issues occur, you can quickly revert:

1. **Disable pre-generation job**:
   ```csharp
   RecurringJob.RemoveIfExists("schedule-pre-generation");
   ```

2. **Remove blob storage check** (serve on-demand only):
   ```csharp
   // Comment out blob storage logic in API endpoint
   // var blobExists = await _blobStorage.ExistsAsync(...);
   // if (blobExists) { ... }
   ```

3. **Deploy previous version** via your CI/CD pipeline

---

## Deployment Checklist

- [ ] Add database indexes (if not done in Phase 1)
- [ ] Set up Azure Blob Storage container / AWS S3 bucket
- [ ] Add connection strings to configuration
- [ ] Install NuGet packages (Azure.Storage.Blobs, Hangfire)
- [ ] Deploy code changes
- [ ] Run database migrations (if any)
- [ ] Trigger initial pre-generation job manually
- [ ] Verify blob storage contains schedule files
- [ ] Test API endpoint returns pre-generated data
- [ ] Monitor logs for first 24 hours
- [ ] Verify Hangfire dashboard shows successful hourly jobs

---

## Cost Estimate

**Azure Blob Storage**:
- Storage: 350MB (100 companies × 7 days × ~500KB per file) = $0.01/month
- Transactions: ~20,000 operations/month = $0.50/month
- **Total**: ~$0.50-1/month

**Compute** (Background Job):
- Runs for ~30 seconds per hour
- **Total**: Negligible (existing server)

**Total Estimated Cost**: <$2/month

---

## Support

If you have questions during implementation:

1. Check Hangfire dashboard: `/hangfire`
2. Review logs for `[PreGen]` and `[API]` prefixes
3. Verify blob storage in Azure Portal / AWS Console
4. Test manually via `/admin/trigger-schedule-pregeneration`

---

## Summary

This implementation will:
- ✅ Reduce API response time by **95%** (2-5 sec → <100ms)
- ✅ Reduce database load by **95%** (queries happen once per hour, not per request)
- ✅ Cost only ~$2/month for blob storage
- ✅ Maintain backward compatibility (on-demand fallback)
- ✅ Complete in 3-5 days of development time

**Ready to implement!** 🚀
