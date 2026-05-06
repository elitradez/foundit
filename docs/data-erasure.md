# Data Erasure — Operator Runbook

Fulfills DRPV-07 (HECVAT) and DPA Section 12 (right-to-erasure).

## What gets deleted

| Table | Action |
|---|---|
| `claims` | PII columns set to NULL (`student_name`, `student_email`, `phone_number`, `student_id_number`, `claim_description`, `description`, `staff_notes`). Row preserved for referential integrity. |
| `student_info` | Rows hard-deleted (all PII columns are NOT NULL). |
| `claimed_items` | Rows hard-deleted (all PII columns are NOT NULL). |
| `alerts` | PII columns set to NULL (`phone`, `email`, `description`). Row preserved for operational audit chain. Matched by phone/email directly, independent of claims. |
| Storage (`items` bucket) | Proof-of-ownership photos deleted by path stored in `claimed_items.photo_path`. |

Tables **not touched**: `items`, `universities`, `departments`, `security_log`, `retention_log`.

Storage failures are logged to `retention_log` with `notes = 'erasure_orphan_photo: ...'` and never block database deletion.

## Operator flow

### 1. Receive the request

Student emails ebunting07@gmail.com requesting deletion of their data.

### 2. Verify identity

Reply to the email from the student's original address to confirm it is the same account. Do not proceed until the student replies confirming the request.

### 3. Dry-run first

Always preview before committing:

```bash
curl -X POST https://founditcampus.com/api/admin/erasure?dry_run=true \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $ADMIN_API_SECRET" \
  -d '{"email": "student@university.edu"}'
```

Response:
```json
{
  "dry_run": true,
  "claims_affected": 2,
  "student_info_rows": 1,
  "claimed_items_rows": 1,
  "alerts_affected": 3
}
```

Review the counts. If `claims_affected` is 0, the email or phone is not in the system — confirm the address with the student before proceeding.

You can also scope to a single university:
```bash
-d '{"email": "student@university.edu", "university_id": "uuid-here"}'
```

### 4. Execute the erasure

```bash
curl -X POST https://founditcampus.com/api/admin/erasure \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $ADMIN_API_SECRET" \
  -d '{"email": "student@university.edu"}'
```

Response:
```json
{
  "success": true,
  "claims_affected": 2,
  "photos_deleted": 1,
  "photos_failed": 0,
  "alerts_affected": 3
}
```

### 5. Save the audit reference

An audit row is written automatically to `security_log` with `event_type = 'erasure_admin'`. Note the timestamp for your records. No PII is captured in the log row.

If `photos_failed > 0`, check `retention_log` for the `erasure_orphan_photo` entries and manually delete those storage objects via the Supabase dashboard.

Note: `alerts_affected` counts SMS-alert rows that were cleared. A student may have alerts but no claims (e.g. they texted the number but never submitted a claim form). Both are erased in the same request.

### 6. Reply to the student

Confirm deletion is complete. Per DPA Section 12, the SLA is 10 business days from receipt. Production data is deleted immediately. Supabase point-in-time backups containing the deleted records expire on a 30-day rolling window per Supabase's backup policy.

## SLA summary

| Milestone | Target |
|---|---|
| Acknowledge request | 2 business days |
| Complete deletion | 10 business days |
| Backup expiry | 30 days (Supabase rolling window) |
