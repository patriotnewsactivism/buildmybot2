# Apex lead ingest

BuildMyBot accepts Apex lead handoff on the existing Supabase CRM `leads` table. Apex's client is a separate change and must call this contract. BuildMyBot does not use a Neon database for this path.

The route is disabled until `APEX_LEAD_INGEST_TOKEN` is set on the server. An empty value does not authenticate anyone.

Production schema changes are on hold. See `docs/MIGRATION_BASELINE_RECONCILIATION.md` and `supabase/migrations/20260925200000_apex_lead_ingest.sql`. Until `leads.external_id` (and the other columns that migration adds) exist, a call that would read or write those columns returns **503** `{ "error": "schema_not_ready", "reason": "..." }` instead of 500.

## Authentication

`Authorization: Bearer <token>`

The server compares the token to `APEX_LEAD_INGEST_TOKEN` in constant time (SHA-256 digest, then `timingSafeEqual`).

| Condition | Status | Body |
| --- | --- | --- |
| Env unset or blank | 503 | `{ "error": "ingest_disabled" }` |
| Missing or wrong token | 401 | `{ "error": "unauthorized" }` |

Session cookies are not accepted.

## Tenant resolution

Provide `orgId` and/or `ownerEmail`. The server resolves them from Supabase (`organizations`, `users`). It does not trust the caller as a member of that organization.

- `orgId` must match `organizations.id`, or a user row whose `organization_id` is that id.
- `ownerEmail` must match one active user. That user's `organization_id` is the tenant when set; otherwise the tenant is that user.
- If both are sent, they must resolve to the same tenant. A conflict is **400** `{ "error": "tenant_mismatch" }`.
- If a provided identifier does not resolve, or neither is sent: **400** `{ "error": "tenant_unresolved" }`.
- Two active users with the same email: **400** `{ "error": "tenant_ambiguous" }`.

New rows are attributed to the resolved user (`leads.user_id`) and, when the tenant has an organization, `leads.organization_id`. Listing uses the same scope as the dashboard: organization id when present, otherwise user id.

## POST `/api/integrations/apex/leads`

```json
{
  "orgId": "optional-org-id",
  "ownerEmail": "optional-owner@example.com",
  "dryRun": true,
  "leads": [
    {
      "externalId": "apex-123",
      "name": "Ada Lovelace",
      "email": "ada@example.com",
      "phone": "+15551212",
      "company": "Analytical Engines",
      "title": "Engineer",
      "website": "https://example.com",
      "source": "linkedin",
      "notes": "Asked for a demo",
      "tags": ["demo"]
    }
  ]
}
```

- `dryRun` defaults to **true**. Omit it, or send `true`, to validate and report without writing. Send `false` to persist. Any other type is **400** `{ "error": "invalid_dry_run" }`.
- `leads` is required. More than 200 leads is **413** `{ "error": "too_many_leads" }`.
- Each lead needs `externalId` and at least one of `email` or `phone`. Invalid leads are listed in `rejected` and do not fail the rest of the batch.
- Phone values are normalized to the CRM check (`+` optional, 2–15 digits). Email is stored lowercased.
- Idempotency key: organization (or user, when the tenant has no organization) + `leads.source = 'apex'` + `externalId`.
- The row `source` column is always `apex` for rows this route writes. The payload `source` is kept on `metadata.apex.source` and is not the idempotency source.
- `company`, `title`, `website`, and `tags` are stored (`company` column plus `metadata.apex`). `notes` is stored on `leads.notes`.
- Re-sending an identical lead counts as `duplicates` and does not write. A changed payload counts as `updated`. A new key counts as `accepted`.
- Inserted leads use status `New`. Updates do not reset status or score.
- A unique-index race is treated as an update or duplicate, not a second row.

**200**

```json
{
  "dryRun": false,
  "accepted": 1,
  "updated": 0,
  "duplicates": 0,
  "rejected": [{ "externalId": "optional", "reason": "contact_required" }]
}
```

`externalId` is omitted on a rejected item that had no usable id.

If the schema probe fails because a required column is missing, the response is 503 `schema_not_ready` even for `dryRun: true` (idempotency cannot be classified without `external_id`). A phone-only write before `email` is nullable also returns 503 `schema_not_ready`. Retrying the same batch is safe because accepted rows become duplicates or updates.

## GET `/api/integrations/apex/leads`

Query: `orgId` and/or `ownerEmail`, optional `since` (ISO timestamp), optional `limit` (integer 1–200, default 50).

Same bearer auth. Returns that tenant's CRM leads, newest `created_at` first, not only Apex rows.

`since` keeps a lead when `created_at` or `updated_at` is greater than or equal to the timestamp.

**200**

```json
{
  "leads": [
    {
      "id": "uuid",
      "externalId": "apex-123",
      "name": "Ada Lovelace",
      "email": "ada@example.com",
      "phone": "",
      "company": "Analytical Engines",
      "status": "New",
      "source": "apex",
      "createdAt": "2026-09-25T00:00:00.000Z",
      "updatedAt": "2026-09-25T00:00:00.000Z"
    }
  ]
}
```

`externalId` is omitted when the row has none. Missing email, phone, or company are empty strings. `source` is the `leads.source` column (`apex` for rows ingested here).

Invalid `since` or `limit` is **400**.

## Production changes needed

1. Set `APEX_LEAD_INGEST_TOKEN` on Railway project `BuildMyBot2`, service `buildmybot2-web`. Leave it unset until the Apex client should be allowed to call. Do not put the token in any `VITE_*` variable.
2. After the migration hold is cleared for this file, apply `supabase/migrations/20260925200000_apex_lead_ingest.sql` to project `blyebndyrojmreensbxe`. Do not run `supabase db push` as a blanket replay.
3. Redeploy is not required for the env var alone if Railway restarts the service on variable changes. The route returns `ingest_disabled` until the token exists, and `schema_not_ready` until the migration is applied.
