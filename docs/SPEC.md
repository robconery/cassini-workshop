# SPEC.md
<!-- Owner: /design — do not edit manually -->

## 🎯 Purpose

Define the **observable behavior** of the Cassini MCP server: every tool it
exposes, the inputs it accepts, the outputs it returns, and the rules it
must obey. This is the contract `/plan` slices into stories and
`/spec` turns into executable BDD specs.

## 🔌 API / Interface

The server speaks **MCP over HTTP/SSE** from a Cloudflare Worker. It
exposes the tools below — and **nothing else**. No resources, no prompts
in v1.

### Tool catalogue

| Tool | Purpose |
|---|---|
| `list_activities` | Filtered, paginated rows from `master_plan`. |
| `get_activity` | Fetch one row by `id`. |
| `search_activities` | Full-text search over `title` + `description`. |
| `count_activities` | Count rows matching filters (no body returned). |
| `aggregate_activities` | Group by `team` / `target` / `spass_type` → counts. |
| `timeline` | Bucketed counts over a date range (year or month). |
| `list_distinct` | Distinct values of `team` / `target` / `spass_type`. |

### Tool: `list_activities`
**Input:**
- `from?` ISO 8601 datetime (inclusive)
- `to?` ISO 8601 datetime (exclusive)
- `team?` string
- `target?` string
- `spass_type?` string
- `limit?` integer 1–100, default 25
- `offset?` integer ≥ 0, default 0

**Output:** array of activity objects:
`{ id, start_iso, start_time_utc, duration, team, spass_type, target, request_name, title, description }`

### Tool: `get_activity`
**Input:** `id` integer (required).
**Output:** one activity object (all columns) or a not-found error.

### Tool: `search_activities`
**Input:**
- `query` string (required, ≥ 2 chars)
- `limit?` integer 1–50, default 10
**Output:** array of `{ id, start_iso, team, target, title, snippet }`
where `snippet` is FTS5 `snippet()` over the matched text.

### Tool: `count_activities`
**Input:** same filters as `list_activities` (no limit/offset).
**Output:** `{ count: integer }`.

### Tool: `aggregate_activities`
**Input:**
- `group_by` enum: `team` | `target` | `spass_type` (required)
- filters: same as `list_activities` (optional)
- `top?` integer 1–100, default 20
**Output:** array `{ key, count }` sorted descending by count.

### Tool: `timeline`
**Input:**
- `from` ISO 8601 (required)
- `to` ISO 8601 (required)
- `bucket` enum: `year` | `month` (default `year`)
- filters: `team?`, `target?` (optional)
**Output:** array `{ bucket, count }` sorted ascending.

### Tool: `list_distinct`
**Input:** `field` enum: `team` | `target` | `spass_type` (required).
**Output:** array of strings sorted ascending. Cached in-isolate.

## 📋 Functional Requirements

1. **F1 — Read-only.** No tool mutates D1. Period.
2. **F2 — Date normalization.** All datetime inputs are ISO 8601; all
   datetime outputs include `start_iso` (ISO) alongside `start_time_utc`
   (raw mission DOY). The LLM never sees DOY format unless it asks for
   the raw row.
3. **F3 — Argument validation.** Every tool validates inputs with zod
   before any DB call. Invalid input returns a structured MCP error, not a
   500.
4. **F4 — Pagination ceilings.** `list_activities.limit ≤ 100`,
   `search_activities.limit ≤ 50`, `aggregate.top ≤ 100`. The server
   refuses larger requests rather than silently capping.
5. **F5 — Empty results are not errors.** Zero matches → empty array or
   `{ count: 0 }`, not a thrown error.
6. **F6 — `get_activity` not-found** returns an MCP error with a message
   the LLM can surface ("no activity with id N").
7. **F7 — Search relevance.** `search_activities` orders results by FTS5
   rank (best first), not by date.
8. **F8 — Timeline integrity.** Buckets with zero activity are still
   included in the timeline output as `{ bucket, count: 0 }` so the LLM
   doesn't infer gaps that don't exist.
9. **F9 — Distinct values cached.** `list_distinct` results are cached
   per isolate (lazy on first call); the cache lifetime equals the
   isolate's.
10. **F10 — Importer is repeatable.** Running the importer twice yields
    the same D1 state; it drops and recreates tables or no-ops if the
    content hash matches.

## 🚫 Non-Functional Requirements

- **N1 — Free tier.** Stay within Cloudflare Workers + D1 free-tier
  limits under realistic workshop demo load (≤ 50 calls/min).
- **N2 — Cold start budget.** First tool call after isolate spin-up
  returns in under 500 ms p95 on the demo network.
- **N3 — Source is teachable.** No file in `src/` exceeds ~150 lines.
  No clever abstractions; one obvious way to do each thing.
- **N4 — Deterministic SQL.** All queries use prepared statements with
  bound params. No string concatenation into SQL, ever.
- **N5 — Logging.** Each tool call logs `{ tool, ms, row_count }` to
  Workers logs. No PII (there is none anyway) and no full result bodies.
- **N6 — Versioning.** The MCP server reports a semantic version in its
  `initialize` response; bump on any tool-surface change.

## 📝 TODOs

- Confirm D1 free-tier FTS5 support; if absent, swap `search_activities`
  to `LIKE`-based fallback and note in `MEMORY.md`.
- Demo question script — the exact 4–6 questions the workshop will pose
  live (drives any last-mile tool tuning).
