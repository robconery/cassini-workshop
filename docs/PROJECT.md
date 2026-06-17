# PROJECT.md
<!-- Owner: /explore — do not edit manually -->

## 🎯 Problem

The Cassini-Huygens mission produced a rich operational record — ~62k entries
in `data/cassini.db` (`master_plan`) covering every scheduled activity across
the 20-year mission. The raw SQLite is opaque to humans: you can't browse
60k rows, and SQL is not the right interface for "what was Cassini doing
near Titan in 2010?". Today, exploring this data means hand-writing SQL.

An MCP server lets an LLM client (Claude Desktop, etc.) answer those
questions in natural language by querying the dataset through well-named
tools — and doubles as a teachable, real-world MCP example.

## 👤 Who It's For

- **Primary:** Rob + AI workshop attendees — live demo of a working MCP over
  a non-trivial dataset.
- **Secondary:** Anyone curious about Cassini who has Claude Desktop.
- **Not for:** general public web users, mission scientists needing
  publication-grade analysis, multi-tenant SaaS.

## 🏁 Goals

- Serve the `master_plan` dataset through MCP tools an LLM can call.
- Support timeline lookups, team/instrument/target filters, full-text search
  on title/description, and counts/aggregations.
- Be clean enough that workshop attendees can read the source and copy the
  patterns into their own MCP servers.

## ✅ Success

- Runs live in Claude Desktop during the workshop without surprises.
- Attendees can ask 3–4 different question shapes (timeline, filter,
  search, count) and get correct answers grounded in the dataset.
- Source reads as a reference implementation — no clever, no dead code.

## 📐 Scope

**In:**
- 🔧 Read-only MCP server over `data/cassini.db`.
- 🗓️ Timeline / date-range queries.
- 👥 Filter by team, target, spass_type.
- 🔍 Full-text search across title + description.
- 📊 Counts and aggregations (top targets, activity per team, etc.).
- 🖥️ Local stdio transport for Claude Desktop.

**Out:**
- ✍️ Writes / mutations of any kind.
- 🔐 Auth, multi-user, sessions.
- 🌐 External APIs, NASA service calls, dataset enrichment.

## 🧱 Constraints

- **Stack:** TypeScript + Bun.
- **Data:** SQLite, single table (`master_plan`), no schema changes.
- **Distribution:** runs locally; attendees install and point Claude Desktop
  at it.

## ❓ Open Questions

- 📅 Workshop date / deadline — TODO.
- 🧪 Demo script — which exact questions will be asked on stage? Still TODO.
- 🔎 FTS5 availability on D1 free tier — verify in `/plan`.

## 🧭 Resolved in /design

- ✅ Deploy target: Cloudflare Workers (free tier) + D1.
- ✅ Transport: remote MCP over HTTP/SSE (no stdio).
- ✅ Runtime: TypeScript on Workers (no Bun, no `bun:sqlite`).
- ✅ MCP framework: Cloudflare `agents` / workers-mcp.

## ⚠️ Riskiest Unknowns

- Whether `master_plan`'s freeform `title`/`description` text is rich enough
  for satisfying full-text search answers — only one table, and the columns
  are terse operational strings.
- Whether the time format (`2004-135T18:40:00`, day-of-year) needs a
  normalization layer before date-range tools feel natural to an LLM.
- Live-demo failure modes (Claude Desktop config, stdio handshake) —
  needs a rehearsal pass.

## 🪦 What Would Kill This

- Dataset turns out too thin to support interesting questions (mitigation:
  inspect distinct teams/targets early in `/design`).
- Workshop gets cancelled / refocused away from MCP.
