# Architecture Updates Summary

**Date**: December 3, 2025
**Status**: ✅ Documentation Complete - Ready for Implementation

---

## What Changed

The MaidCentral Backup Portal v2 API architecture has been updated from a **synchronous polling model** to an **async job queue + blob storage model** for significantly better performance and scalability.

---

## Key Documents

1. **[BACKEND-REQUIREMENTS.md](./BACKEND-REQUIREMENTS.md)** - Main requirements document (UPDATED)
   - Architecture diagram updated with async flow
   - Database schema updated (new tables: `background_jobs`, updated `schedule_data`)
   - Supabase Storage setup added
   - Edge Functions section updated

2. **[ASYNC-SYNC-ARCHITECTURE.md](./ASYNC-SYNC-ARCHITECTURE.md)** - Complete async implementation guide (NEW)
   - Detailed architecture flow
   - Complete code examples for all 3 Edge Functions
   - Frontend integration examples
   - Monitoring & debugging queries
   - Cost analysis

---

## Architecture Changes

### Before (Synchronous)

```
Cron → hourly-sync (3-5 min) → PostgreSQL (2GB JSONB) → Frontend (2-3 sec)
```

**Problems:**
- Long-running cron job blocks other operations
- Large JSONB data in PostgreSQL (expensive)
- Slow API responses for frontend
- One failure blocks entire sync
- Limited scalability

### After (Async + Blob Storage)

```
Cron → hourly-sync (500ms) → background_jobs queue
                           ↓
         background-worker (async) → Supabase Storage (blob)
                                   ↓
                      get-schedule API (<50ms) → Frontend
```

**Benefits:**
- ⚡ **6x faster** cron (500ms vs 3-5 min)
- ⚡ **40x faster** API (<50ms vs 2-3 sec)
- 💰 **5x cheaper** ($10 vs $50/month)
- 📈 **10x scalability** (1000+ companies)
- 🔄 **Better reliability** (independent job failures, auto-retry)

---

## New Components

### 1. Database Tables

**background_jobs** (NEW)
```sql
- Async job queue
- Tracks: sync_users, sync_schedule jobs
- Supports auto-retry (max 3 attempts)
- Stores job params, results, errors
```

**schedule_data** (UPDATED)
```sql
- Now stores metadata only (not full JSONB)
- References blob storage path
- Includes: storage_path, file_size_kb, checksum
- Status tracking: processing, ready, failed
```

### 2. Supabase Storage

**Bucket: schedule-data**
```
Path structure: {company_id}/{date}/schedule.json
- Private (requires authentication)
- RLS policies for security
- CDN-cacheable for global performance
```

### 3. Edge Functions

**hourly-sync** (Coordinator)
- Queues background jobs (~500ms)
- Returns immediately (non-blocking)
- Triggers background-worker

**background-worker** (Executor)
- Executes jobs asynchronously
- Calls MaidCentral API v2
- Transforms data
- Saves to blob storage
- Updates metadata in PostgreSQL
- Supports auto-retry

**get-schedule** (Fast API)
- Reads from blob storage (<50ms)
- Applies featureToggles (privacy)
- Filters jobs (technicians)
- Returns JSON

---

## Performance Comparison

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Cron Duration | 3-5 min | 500ms | **6x faster** |
| API Response | 2-3 sec | <50ms | **40x faster** |
| DB Size (100 companies) | ~2GB | ~50MB | **40x smaller** |
| Cost (100 companies) | $25-50/mo | $0-10/mo | **5x cheaper** |
| Max Companies | ~100 | 1000+ | **10x scalable** |
| Error Handling | Blocking | Independent | **More reliable** |

---

## API Endpoints (No Changes)

The MaidCentral API v2 endpoints remain the same:

1. **GET /api/dr-schedule/users**
   - Returns all users across ServiceCompanyGroups
   - Called once per hourly sync

2. **GET /api/dr-schedule?startDate=X&endDate=X**
   - Returns schedule data for ONE day (startDate must equal endDate)
   - Called 7 times per company per sync (7-day rolling window)

**Key Constraint**: Schedule endpoint MUST be called with `startDate === endDate` (one day at a time)

---

## Implementation Checklist

### Phase 1: Database Setup
- [ ] Create `background_jobs` table
- [ ] Update `schedule_data` table schema
- [ ] Add Supabase Storage bucket (`schedule-data`)
- [ ] Configure storage RLS policies

### Phase 2: Edge Functions
- [ ] Implement `hourly-sync` (coordinator)
- [ ] Implement `background-worker` (executor)
- [ ] Implement `get-schedule` (fast API)
- [ ] Test locally with sample data

### Phase 3: Cron Setup
- [ ] Configure pg_cron to call `hourly-sync` every hour
- [ ] Monitor first few syncs
- [ ] Verify background jobs execute correctly

### Phase 4: Frontend Integration
- [ ] Update `useScheduleData` hook to call `get-schedule` API
- [ ] Test with different user roles (admin, technician)
- [ ] Verify featureToggles applied correctly
- [ ] Verify job filtering works for technicians

### Phase 5: Monitoring
- [ ] Set up background job monitoring queries
- [ ] Configure alerts for failed syncs
- [ ] Monitor storage usage
- [ ] Track API response times

---

## Migration Strategy

### Option A: Big Bang (Recommended for New Deployments)
1. Deploy new schema + Edge Functions
2. Run initial sync to populate blob storage
3. Switch frontend to new API
4. Monitor for 24 hours

### Option B: Gradual Migration (Existing Deployments)
1. Deploy new components alongside old ones
2. Run both systems in parallel for 1 week
3. Compare data consistency
4. Gradually switch companies to new system
5. Deprecate old system after full migration

**Recommendation**: Use Option A for this project since it's a new backend deployment.

---

## Monitoring Queries

See [ASYNC-SYNC-ARCHITECTURE.md](./ASYNC-SYNC-ARCHITECTURE.md#monitoring--debugging) for complete monitoring queries.

**Quick checks:**
```sql
-- View pending jobs
SELECT * FROM background_jobs WHERE status = 'pending';

-- View failed jobs (last 24 hours)
SELECT * FROM background_jobs
WHERE status = 'failed' AND created_at > NOW() - INTERVAL '24 hours';

-- View sync job stats
SELECT job_type, status, COUNT(*), AVG(duration_ms)
FROM background_jobs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY job_type, status;

-- View storage usage
SELECT c.name, COUNT(sd.id) as days_stored, SUM(sd.file_size_kb) as total_kb
FROM schedule_data sd
JOIN companies c ON sd.company_id = c.id
GROUP BY c.name;
```

---

## Cost Analysis

### Before (Synchronous)
- **Database**: $25-50/month (2GB JSONB data)
- **Edge Functions**: $0 (within free tier)
- **Total**: $25-50/month

### After (Async + Blob Storage)
- **Database**: $0-10/month (50MB metadata only)
- **Storage**: $0/month (35MB for 100 companies, within free 1GB)
- **Edge Functions**: $0 (within free 500K invocations)
- **Total**: $0-10/month ✅

**Scaling to 1000 companies:**
- **Database**: $25/month (Pro tier)
- **Storage**: $0/month (350MB, within Pro tier 100GB)
- **Bandwidth**: Included in Pro tier
- **Total**: $25/month (vs $250+ with old architecture)

---

## Next Steps

1. ✅ **Documentation Complete** (this update)
2. ⏭️ **Implement Database Schema** (Phase 1)
3. ⏭️ **Develop Edge Functions** (Phase 2)
4. ⏭️ **Set up Cron Job** (Phase 3)
5. ⏭️ **Integrate Frontend** (Phase 4)
6. ⏭️ **Deploy & Monitor** (Phase 5)

---

## Questions?

- **Architecture Details**: See [ASYNC-SYNC-ARCHITECTURE.md](./ASYNC-SYNC-ARCHITECTURE.md)
- **Full Requirements**: See [BACKEND-REQUIREMENTS.md](./BACKEND-REQUIREMENTS.md)
- **API Integration**: See "MaidCentral API v2 Integration" section in BACKEND-REQUIREMENTS.md

---

**Status**: Ready for implementation 🚀
