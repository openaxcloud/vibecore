# Backup And Restore

## Cloud SQL / PostgreSQL

Production PostgreSQL must enable:

- automated backups
- point-in-time recovery
- cross-zone durability
- restore drills at least monthly

## Project Data

- Active workspace files live on PVCs.
- Project snapshots, exports, and zip archives live in S3-compatible object storage.
- Snapshot archives exclude runtime secrets.

## Cloud Storage Lifecycle

Configure lifecycle policies for:

- temporary exports
- old snapshots beyond plan retention
- expired deployment artifacts
- legal-hold exclusions

## Restore Scripts

Local dry-run:

```bash
pnpm sre:validate
```

This validates observability assets and runs `scripts/backup-restore-dry-run.mjs`, which performs a checksum-based restore dry run.

## Production Restore Flow

1. Select restore point.
2. Restore PostgreSQL to isolated instance.
3. Verify schema migration compatibility.
4. Restore required object storage snapshots.
5. Reattach or recreate workspace PVCs.
6. Run application smoke tests.
7. Promote restored stack or selectively export/import data.
