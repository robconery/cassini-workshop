# User Stories

> Canonical backlog for the Cassini Mission Plan MCP. Consumed by the
> `bdd-specs` skill: each Story becomes a Feature, each acceptance criterion a
> Scenario, each `Then` one Specification.

## Definition of Ready

- Role, capability, and value stated and non-hollow.
- Acceptance criteria in Given/When/Then, happy path exhaustive.
- Out-of-scope explicit.
- Small enough that criteria can be enumerated (INVEST).

## Definition of Done

- All acceptance criteria pass as executable specs.
- Sad-path criteria covered, not just the happy path.
- For wire stories: a real request through the deployed Worker produces the
  expected response (no green-via-mocks).

---

## 📦 Epic: Foundation

_Stand up the runtime and the data so the tools have something to run on._

### STORY-001 — Worker scaffold + MCP transport

As a **workshop attendee following along**,
I want **a Cloudflare Worker that speaks MCP over HTTP/SSE on a public URL**,
so that **Claude Desktop can connect to it as a remote server**.

**Size:** S  ·  **Status:** ready

**Acceptance criteria**

_Happy path:_

```
AC1 — initialize handshake succeeds
  Given the Worker is deployed and reachable at its URL
  When  a client posts an MCP `initialize` request
  Then  the response carries a semantic `serverInfo.version`

AC2 — tools/list returns the seven tool names
  Given a connected MCP session
  When  the client calls `tools/list`
  Then  the response contains exactly: list_activities, get_activity,
        search_activities, count_activities, aggregate_activities,
        timeline, list_distinct
```

_Sad path:_

```
AC3 — unknown tool name returns an MCP error
  Given a connected MCP session
  When  the client calls `tools/call` with an undeclared tool name
  Then  the response is an MCP error (not a 500)
```

**Out of scope:** any tool's real behavior — only the surface is wired here.

---

### STORY-002 — Importer: seed D1 from cassini.db

As a **developer setting up the project**,
I want **a repeatable importer that loads `data/cassini.db` into D1, derives
`start_iso`, and builds the FTS5 virtual table**,
so that **the deployed Worker has data to query and every environment matches**.

**Size:** M  ·  **Status:** ready

**Acceptance criteria**

_Happy path:_

```
AC1 — schema matches ARCHITECTURE.md
  Given a fresh D1 database
  When  the importer runs to completion
  Then  `master_plan`, the three indexes, and `master_plan_fts` exist

AC2 — row count matches the source
  Given the source SQLite has N rows in master_plan
  When  the importer runs to completion
  Then  D1's master_plan has N rows minus any logged skip count

AC3 — start_iso is populated and well-formed
  Given a row whose `start_time_utc` is `2004-135T18:40:00`
  When  the importer runs to completion
  Then  that row's `start_iso` equals `2004-05-14T18:40:00Z`

AC4 — re-running is idempotent
  Given the importer has already run once
  When  the importer runs a second time with no data changes
  Then  D1's row count is unchanged
```

_Sad path:_

```
AC5 — malformed start_time_utc is skipped, not fatal
  Given a row whose `start_time_utc` cannot be parsed
  When  the importer runs
  Then  the row is skipped and logged, the importer exits 0
```

**Out of scope:** schema migrations beyond v1; incremental upserts.

---

## 🔧 Epic: Tool Catalogue

_Each story below ships one MCP tool. They share the query layer but each is
independently shippable to `tools/list`._

### STORY-003 — Tool: `list_activities`

As a **demo viewer**,
I want **filtered, paginated activity rows**,
so that **I can ask "what did CAPS do at Titan in 2010?" and see results**.

**Size:** M  ·  **Status:** ready

**Acceptance criteria**

_Happy path:_

```
AC1 — defaults return 25 rows
  Given no filters and no limit
  When  `list_activities` is called
  Then  the result array length equals 25

AC2 — date range narrows results
  Given `from=2010-01-01T00:00:00Z` and `to=2011-01-01T00:00:00Z`
  When  `list_activities` is called
  Then  every returned row has `start_iso` within [from, to)

AC3 — team filter applies exactly
  Given `team=CAPS`
  When  `list_activities` is called
  Then  every returned row has `team` equal to "CAPS"

AC4 — target filter applies exactly
  Given `target=Titan`
  When  `list_activities` is called
  Then  every returned row has `target` equal to "Titan"

AC5 — offset paginates
  Given a baseline call with limit=10
  When  the same call is made with limit=10, offset=10
  Then  the new result's first row does not appear in the baseline

AC6 — response includes start_iso and start_time_utc
  Given any successful call
  When  inspecting one row
  Then  it has both `start_iso` (ISO) and `start_time_utc` (raw DOY) keys
```

_Sad path:_

```
AC7 — limit above ceiling is rejected
  Given `limit=101`
  When  `list_activities` is called
  Then  the response is an MCP validation error (not a 500, not silently
        clamped)

AC8 — malformed ISO `from` is rejected
  Given `from="not-a-date"`
  When  `list_activities` is called
  Then  the response is an MCP validation error
```

**Out of scope:** full-text search (STORY-005); aggregations (STORY-006).

---

### STORY-004 — Tool: `get_activity`

As a **demo viewer**,
I want **a single activity fetched by id**,
so that **after a list/search hit I can drill into the full description**.

**Size:** S  ·  **Status:** ready

**Acceptance criteria**

_Happy path:_

```
AC1 — known id returns the full row
  Given an `id` that exists in master_plan
  When  `get_activity` is called
  Then  the response includes every column of that row
```

_Sad path:_

```
AC2 — missing id returns MCP error
  Given an `id` that does not exist
  When  `get_activity` is called
  Then  the response is an MCP error whose message names the missing id

AC3 — non-integer id is rejected
  Given `id="abc"`
  When  `get_activity` is called
  Then  the response is an MCP validation error
```

**Out of scope:** bulk fetch by id list.

---

### STORY-005 — Tool: `search_activities`

As a **demo viewer**,
I want **full-text search over title + description**,
so that **I can ask "anything about Enceladus plumes?" and get ranked hits**.

**Size:** M  ·  **Status:** ready

**Acceptance criteria**

_Happy path:_

```
AC1 — matching query returns hits ordered by FTS rank
  Given the FTS index is populated
  When  `search_activities` is called with `query="Enceladus"`
  Then  every returned row has the token in title or description, ordered
        by FTS5 rank (best first)

AC2 — snippet is present and non-empty
  Given any hit
  When  inspecting it
  Then  `snippet` is a non-empty string

AC3 — default limit caps to 10
  Given no `limit` is passed
  When  the call returns
  Then  the result length is at most 10
```

_Sad path:_

```
AC4 — query shorter than 2 chars is rejected
  Given `query="a"`
  When  `search_activities` is called
  Then  the response is an MCP validation error

AC5 — limit above 50 is rejected
  Given `limit=51`
  When  `search_activities` is called
  Then  the response is an MCP validation error

AC6 — no matches returns an empty array, not an error
  Given `query="nonsense_xyz_no_match"`
  When  `search_activities` is called
  Then  the response is an empty array
```

**Out of scope:** stemming, language-aware tokenization beyond FTS5 default;
LIKE fallback (tracked in /design as a risk, separate story if it triggers).

---

### STORY-006 — Tool: `count_activities`

As a **demo viewer**,
I want **a count of rows matching filters**,
so that **the LLM can answer "how many Titan flybys in 2008?" cheaply**.

**Size:** S  ·  **Status:** ready

**Acceptance criteria**

_Happy path:_

```
AC1 — count matches a list_activities sweep
  Given the same filter set
  When  `count_activities` returns N
  Then  iterating `list_activities` with that filter set yields N rows total

AC2 — no filters returns the table cardinality
  Given no filters
  When  `count_activities` is called
  Then  `count` equals the master_plan row count

AC3 — no matches returns zero, not an error
  Given filters that match nothing
  When  `count_activities` is called
  Then  `count` is 0
```

_Sad path:_

```
AC4 — invalid ISO is rejected
  Given `from="garbage"`
  When  `count_activities` is called
  Then  the response is an MCP validation error
```

**Out of scope:** counts grouped by a column (that's `aggregate_activities`).

---

### STORY-007 — Tool: `aggregate_activities`

As a **demo viewer**,
I want **group-by counts for team / target / spass_type**,
so that **I can ask "which targets got the most observations?"**.

**Size:** M  ·  **Status:** ready

**Acceptance criteria**

_Happy path:_

```
AC1 — grouping by target returns descending counts
  Given `group_by="target"`
  When  the call returns
  Then  the result is sorted descending by `count`

AC2 — top defaults to 20
  Given no `top` is passed
  When  the call returns
  Then  the result length is at most 20

AC3 — filters narrow the groups
  Given `group_by="team"` and `target="Titan"`
  When  the call returns
  Then  every group's count reflects only Titan-targeted rows
```

_Sad path:_

```
AC4 — unsupported group_by is rejected
  Given `group_by="description"`
  When  the call is made
  Then  the response is an MCP validation error

AC5 — top above 100 is rejected
  Given `top=101`
  When  the call is made
  Then  the response is an MCP validation error
```

**Out of scope:** multi-column grouping; arbitrary aggregate functions.

---

### STORY-008 — Tool: `timeline`

As a **demo viewer**,
I want **bucketed activity counts over a date range**,
so that **the LLM can describe the mission's tempo year by year**.

**Size:** M  ·  **Status:** ready

**Acceptance criteria**

_Happy path:_

```
AC1 — yearly buckets cover the full range inclusively
  Given `from=2004-01-01T00:00:00Z`, `to=2018-01-01T00:00:00Z`,
        `bucket="year"`
  When  the call returns
  Then  the result has one entry per year from 2004 through 2017

AC2 — empty buckets are present with count=0
  Given a date range that includes a year with zero activities
  When  the call returns
  Then  that year still appears with `count: 0`

AC3 — monthly bucket respects bucket size
  Given `bucket="month"` over a 3-month range
  When  the call returns
  Then  the result length equals 3

AC4 — filter narrows the totals
  Given `team="CAPS"`
  When  the call returns
  Then  each bucket's count includes only CAPS activities
```

_Sad path:_

```
AC5 — to before from is rejected
  Given `from=2010-01-01T00:00:00Z`, `to=2009-01-01T00:00:00Z`
  When  the call is made
  Then  the response is an MCP validation error

AC6 — missing from/to is rejected
  Given `from` omitted
  When  the call is made
  Then  the response is an MCP validation error
```

**Out of scope:** day-level buckets; per-target breakdowns.

---

### STORY-009 — Tool: `list_distinct`

As a **demo viewer**,
I want **distinct values of `team` / `target` / `spass_type`**,
so that **the LLM can build valid filters without guessing strings**.

**Size:** S  ·  **Status:** ready

**Acceptance criteria**

_Happy path:_

```
AC1 — values are sorted ascending and unique
  Given `field="team"`
  When  the call returns
  Then  the array is strictly ascending with no duplicates

AC2 — cached across calls in the same isolate
  Given `field="team"` has been called once
  When  it is called a second time in the same isolate
  Then  no D1 query is issued on the second call (verified via spy/log)
```

_Sad path:_

```
AC3 — unsupported field is rejected
  Given `field="description"`
  When  the call is made
  Then  the response is an MCP validation error
```

**Out of scope:** distinct values for free-text columns (title, description).

---

## 🚀 Epic: Ship

_Get the server to a public URL and prove it answers a real MCP call._

### STORY-010 — Wire: deploy to Cloudflare + curl initialize

As a **workshop presenter**,
I want **the Worker deployed to Cloudflare and reachable**,
so that **Claude Desktop and stage demos can use a real public URL, not
localhost**.

**Size:** S  ·  **Status:** ready

**Acceptance criteria**

_Happy path:_

```
AC1 — wrangler deploy succeeds
  Given valid `wrangler.toml` and authenticated CF account
  When  `wrangler deploy` is run
  Then  the command exits 0 and prints a `*.workers.dev` URL

AC2 — deployed URL handles MCP `initialize`
  Given the URL printed by AC1
  When  curl posts a valid MCP `initialize` JSON-RPC payload
  Then  the HTTP response is 200 with a body containing
        `serverInfo.name = "cassini-mission-plan"`

AC3 — deployed URL exposes seven tools
  Given the URL printed by AC1
  When  curl calls `tools/list`
  Then  the response lists exactly the seven tool names from STORY-001
```

_Sad path:_

```
AC4 — D1 binding misconfigured fails loudly
  Given `wrangler.toml` is missing the D1 binding
  When  `wrangler deploy` is attempted
  Then  the deploy fails before publishing (caught in CI / dev loop)
```

**Out of scope:** Claude Desktop end-to-end (parked — possible follow-up
story).
