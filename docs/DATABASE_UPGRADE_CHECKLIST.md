# Database Upgrade Checklist

Production-ready checklist for deploying database migrations and seeds.

## Overview

Use this checklist for production database deployments to ensure:
- ✅ Zero data loss
- ✅ Minimal downtime
- ✅ Quick rollback capability
- ✅ Complete audit trail

---

## Pre-Deployment Checklist

### 1. Environment Preparation

- [ ] **Backup database** (CRITICAL!)
  ```bash
  # Full backup
  pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

  # Verify backup size
  ls -lh backup_*.sql

  # Store backup securely
  aws s3 cp backup_*.sql s3://your-backups/
  ```

- [ ] **Test on staging**
  ```bash
  # Use staging database
  export DATABASE_URL=$STAGING_DATABASE_URL

  # Run migrations
  npm run db:migrate

  # Run seeds
  npm run db:seed

  # Verify application works
  npm start
  ```

- [ ] **Review migration history**
  ```bash
  npm run db:migrate:status
  ```

- [ ] **Check for conflicts**
  ```bash
  git status
  git log --oneline | head -20
  ```

- [ ] **Set environment variables**
  ```bash
  # Admin emails
  export MASTER_ADMIN_EMAIL=admin@yourcompany.com
  export ADMIN_EMAIL=support@yourcompany.com

  # Verify
  echo $MASTER_ADMIN_EMAIL
  ```

### 2. Pre-Flight Checks

- [ ] **Database connection test**
  ```bash
  psql $DATABASE_URL -c "SELECT version();"
  ```

- [ ] **Disk space check**
  ```sql
  SELECT pg_size_pretty(pg_database_size('your_database'));
  ```

- [ ] **Active connections**
  ```sql
  SELECT count(*) FROM pg_stat_activity;
  ```

- [ ] **Long-running queries**
  ```sql
  SELECT pid, now() - query_start AS duration, query
  FROM pg_stat_activity
  WHERE state = 'active' AND now() - query_start > interval '1 minute'
  ORDER BY duration DESC;
  ```

- [ ] **Pending migrations count**
  ```bash
  npm run db:migrate -- --dry-run
  # Note how many will run
  ```

### 3. Communication

- [ ] **Schedule maintenance window**
  - Time: __________
  - Duration: ________ minutes
  - Notification sent: ✅

- [ ] **Notify stakeholders**
  - [ ] Engineering team
  - [ ] Customer support
  - [ ] Management

- [ ] **Prepare rollback plan**
  - Document rollback steps
  - Test rollback on staging
  - Estimate rollback time

---

## Deployment Checklist

### Phase 1: Pre-Deployment (T-30 minutes)

- [ ] **Enable maintenance mode**
  ```bash
  # Set maintenance flag
  export MAINTENANCE_MODE=true

  # Or update in database
  UPDATE system_settings SET maintenance_mode = true;
  ```

- [ ] **Wait for active requests to complete**
  ```sql
  SELECT count(*) FROM pg_stat_activity WHERE state = 'active';
  -- Wait until count is low (<5)
  ```

- [ ] **Create final backup**
  ```bash
  pg_dump $DATABASE_URL > final_backup_$(date +%Y%m%d_%H%M%S).sql
  ```

### Phase 2: Dry-Run Validation (T-15 minutes)

- [ ] **Dry-run migrations**
  ```bash
  npm run db:migrate -- --dry-run
  ```
  - Review output carefully
  - Verify migration count
  - Check for warnings

- [ ] **Estimate execution time**
  - Based on staging: ________ seconds
  - Add 50% buffer: ________ seconds

### Phase 3: Execute Migrations (T-0)

- [ ] **Record start time**: __________

- [ ] **Run migrations**
  ```bash
  # Set timeout (important for long-running migrations)
  export PGCONNECT_TIMEOUT=300

  # Execute migrations
  npm run db:migrate 2>&1 | tee migration_log_$(date +%Y%m%d_%H%M%S).txt
  ```

- [ ] **Monitor execution**
  - Watch terminal output
  - Check for errors
  - Note any warnings

- [ ] **Verify completion**
  ```bash
  npm run db:migrate:status
  ```
  - All migrations show "✅ Executed"
  - No failed migrations

### Phase 4: Run Seeds (If Needed)

- [ ] **Check seed status**
  ```bash
  npm run db:seed:status
  ```

- [ ] **Run seeds**
  ```bash
  npm run db:seed 2>&1 | tee seed_log_$(date +%Y%m%d_%H%M%S).txt
  ```

- [ ] **Verify seed data**
  ```bash
  npm run db:studio
  # Spot-check critical data
  ```

### Phase 5: Validation

- [ ] **Database integrity check**
  ```sql
  -- Check table counts
  SELECT schemaname, tablename,
         pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
         (SELECT count(*) FROM information_schema.columns
          WHERE table_schema = schemaname AND table_name = tablename) AS columns
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

  -- Check foreign keys
  SELECT COUNT(*) FROM information_schema.table_constraints
  WHERE constraint_type = 'FOREIGN KEY';

  -- Check indexes
  SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public';
  ```

- [ ] **Application smoke tests**
  ```bash
  # Start application
  npm start

  # Test critical endpoints
  curl -I http://localhost:3001/health
  curl http://localhost:3001/api/bots
  curl http://localhost:3001/api/users/me
  ```

- [ ] **Query performance check**
  ```sql
  -- Test critical queries
  EXPLAIN ANALYZE SELECT * FROM bots WHERE organization_id = 'xxx' LIMIT 10;
  EXPLAIN ANALYZE SELECT * FROM conversations WHERE bot_id = 'xxx' ORDER BY created_at DESC LIMIT 20;
  ```

- [ ] **Verify new tables/columns**
  ```sql
  -- Check monitoring tables exist
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name LIKE '%monitoring%';

  -- Check migration_history
  SELECT COUNT(*) FROM migration_history;
  ```

### Phase 6: Go Live

- [ ] **Record completion time**: __________

- [ ] **Disable maintenance mode**
  ```bash
  export MAINTENANCE_MODE=false
  # Or
  UPDATE system_settings SET maintenance_mode = false;
  ```

- [ ] **Monitor error logs**
  ```bash
  # Watch application logs
  tail -f logs/error.log

  # Watch database logs (if accessible)
  tail -f /var/log/postgresql/postgresql.log
  ```

- [ ] **Monitor system metrics**
  - CPU usage
  - Memory usage
  - Database connections
  - Response times

### Phase 7: Post-Deployment (First Hour)

- [ ] **Monitor for errors** (continuous for 1 hour)
  ```sql
  -- Check error_logs table
  SELECT COUNT(*), severity, category
  FROM error_logs
  WHERE created_at > NOW() - INTERVAL '1 hour'
  GROUP BY severity, category
  ORDER BY COUNT(*) DESC;
  ```

- [ ] **Check query performance**
  ```sql
  -- Slow queries in last hour
  SELECT query_type, AVG(execution_time_ms), MAX(execution_time_ms)
  FROM query_performance_logs
  WHERE created_at > NOW() - INTERVAL '1 hour'
  GROUP BY query_type
  HAVING AVG(execution_time_ms) > 1000
  ORDER BY AVG(execution_time_ms) DESC;
  ```

- [ ] **Verify critical features**
  - [ ] User login
  - [ ] Bot creation
  - [ ] Chat functionality
  - [ ] Dashboard loading
  - [ ] CRM operations

- [ ] **Customer feedback**
  - Monitor support channels
  - Check for unusual error reports
  - Respond to any issues quickly

---

## Rollback Procedures

### When to Rollback

Rollback immediately if:
- ❌ Migration failed with critical error
- ❌ Application crashes on startup
- ❌ Data corruption detected
- ❌ Critical features broken
- ❌ Performance degraded >50%

### Rollback Steps

#### Option 1: Use Migration Rollback (Preferred)

```bash
# 1. Enable maintenance mode
UPDATE system_settings SET maintenance_mode = true;

# 2. Rollback migrations
npm run db:migrate:down -- --steps=N

# 3. Verify rollback
npm run db:migrate:status

# 4. Restart application
npm start

# 5. Test critical features

# 6. Disable maintenance mode
UPDATE system_settings SET maintenance_mode = false;
```

#### Option 2: Restore from Backup (Nuclear Option)

```bash
# 1. Enable maintenance mode
UPDATE system_settings SET maintenance_mode = true;

# 2. Drop current database (DANGER!)
psql $DATABASE_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# 3. Restore from backup
psql $DATABASE_URL < final_backup_TIMESTAMP.sql

# 4. Verify restoration
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"

# 5. Restart application
npm start

# 6. Test critical features

# 7. Disable maintenance mode
UPDATE system_settings SET maintenance_mode = false;
```

### Post-Rollback

- [ ] **Document what went wrong**
  - Error messages
  - Stack traces
  - Affected rows/tables
  - Time of failure

- [ ] **Notify stakeholders**
  - Deployment rolled back
  - Reason for rollback
  - Timeline for retry

- [ ] **Fix issues**
  - Debug migration code
  - Test fix on staging
  - Update checklist for next attempt

---

## Post-Deployment Checklist

### Day 1 (24 Hours)

- [ ] **Monitor system health**
  ```sql
  -- System health summary
  SELECT metric_type, AVG(value) AS avg_value
  FROM system_health_metrics
  WHERE recorded_at > NOW() - INTERVAL '24 hours'
  GROUP BY metric_type;
  ```

- [ ] **Check error rates**
  ```sql
  -- Errors by severity
  SELECT severity, COUNT(*)
  FROM error_logs
  WHERE created_at > NOW() - INTERVAL '24 hours'
  GROUP BY severity;
  ```

- [ ] **API usage patterns**
  ```sql
  -- Top endpoints
  SELECT endpoint, COUNT(*), AVG(response_time_ms)
  FROM api_usage_metrics
  WHERE created_at > NOW() - INTERVAL '24 hours'
  GROUP BY endpoint
  ORDER BY COUNT(*) DESC
  LIMIT 10;
  ```

- [ ] **Database size**
  ```sql
  SELECT pg_size_pretty(pg_database_size(current_database()));
  ```

### Week 1 (7 Days)

- [ ] **Review migration logs**
  - Any warnings?
  - Performance issues?
  - Unexpected behavior?

- [ ] **Analyze query performance**
  ```sql
  -- Slowest queries over 7 days
  SELECT query_type, COUNT(*), AVG(execution_time_ms), MAX(execution_time_ms)
  FROM query_performance_logs
  WHERE created_at > NOW() - INTERVAL '7 days'
  GROUP BY query_type
  ORDER BY AVG(execution_time_ms) DESC
  LIMIT 20;
  ```

- [ ] **Index usage**
  ```sql
  -- Unused indexes
  SELECT schemaname, tablename, indexname, idx_scan
  FROM pg_stat_user_indexes
  WHERE idx_scan = 0
  ORDER BY pg_relation_size(indexrelid) DESC;
  ```

- [ ] **Table bloat**
  ```sql
  -- Table sizes
  SELECT tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
  ```

### Month 1 (30 Days)

- [ ] **Performance trends**
  - Compare to pre-migration baseline
  - Identify regressions
  - Optimize if needed

- [ ] **Feature adoption**
  ```sql
  -- Most used features
  SELECT feature_name, SUM(usage_count) AS total_usage
  FROM feature_usage_metrics
  WHERE last_used_at > NOW() - INTERVAL '30 days'
  GROUP BY feature_name
  ORDER BY total_usage DESC;
  ```

- [ ] **Clean up old data** (if applicable)
  ```sql
  -- Archive old logs
  DELETE FROM api_usage_metrics WHERE created_at < NOW() - INTERVAL '90 days';
  DELETE FROM query_performance_logs WHERE created_at < NOW() - INTERVAL '30 days';
  ```

- [ ] **Update documentation**
  - Record lessons learned
  - Update checklist for next time
  - Document any gotchas

---

## Emergency Contacts

### Team

| Role | Name | Contact | Timezone |
|------|------|---------|----------|
| Lead Engineer | ________ | ________ | ________ |
| DBA | ________ | ________ | ________ |
| DevOps | ________ | ________ | ________ |
| Manager | ________ | ________ | ________ |

### External

| Service | Contact | Notes |
|---------|---------|-------|
| Database Host | ________ | Supabase/Neon/etc. |
| Cloud Provider | ________ | AWS/Vercel/Railway |
| Monitoring | ________ | Sentry/DataDog |

---

## Deployment Log Template

```
DEPLOYMENT LOG
==============

Date: ___________
Time Start: ___________
Time End: ___________
Duration: ___________

Deployed By: ___________
Reviewed By: ___________

Migrations Executed: ___________
Seeds Executed: ___________

Issues Encountered:
- ___________
- ___________

Resolution:
- ___________

Rollback Required: YES / NO
Rollback Time: ___________

Post-Deployment Status:
- Application: UP / DOWN
- Database: HEALTHY / ISSUES
- Performance: GOOD / DEGRADED
- Errors: NONE / MINOR / CRITICAL

Notes:
___________

Next Actions:
- ___________
- ___________
```

---

## See Also

- [DATABASE_MIGRATIONS.md](./DATABASE_MIGRATIONS.md) - Migration guide
- [DATABASE_SEEDS.md](./DATABASE_SEEDS.md) - Seeding guide
- [CLAUDE.md](../CLAUDE.md) - Project overview
