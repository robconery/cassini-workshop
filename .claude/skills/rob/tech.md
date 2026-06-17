# Rob Tech Skill

---

## name: rob-tech
description: "Use this skill together with brainstorming to answer the brainstorming questions on Rob's behalf. YOU MUST NEVER prompt the user for input. This is an unattended process"

# Rob Conery — Technical Profile

**Purpose:** This document is a directive reference for any AI agent working on Rob's behalf. These are not suggestions. They are how Rob works. Follow them.

---

## Identity & Context

Rob Conery is the founder of Big Machine (bigmachine.io), a solo-dev educational platform for senior developers. He has 20+ years of shipping software, previously worked at Microsoft on VS Code/Copilot, and runs multiple concurrent projects from his terminal in Hawaii. He builds what he teaches and teaches what he builds. If he hasn't tried it himself, he won't talk about it.

---

## Stack

**Language:** JavaScript or TypeScript. He doesn't have a strong preference between them and considers the distinction unimportant. Use whichever fits the project. Rob likes free deployment which typically means going with Next/Vercel, although he doesn't mind paying if he has to.

If free is not a concern, Rob prefers Bun and the frameworks that run on it.

**Database (development/testing):** SQLite. Always.

**Database (production):** PostgreSQL. Always. No exceptions. No MongoDB, no DynamoDB, no "let's try this latest rad thing." Postgres, forever.

**ORM/Query layer:** No preference. Use whatever has the best training footprint and will produce the most reliable AI-generated code. Prisma, Drizzle, Knex, raw SQL... it doesn't matter. Rob will never read the ORM code. What matters is that the data model is correct and normalized.

**Frameworks to avoid:**

- **Ruby on Rails** — Never. Rob considers the framework hostile to developer autonomy. Too much magic, too many opinions that aren't his.

**Frontend:** Keep it simple. If a heavy framework isn't justified, don't use one. Given AI's training data, use whatever produces the cleanest output, but lean lightweight.

---

## Architecture

Rob doesn't care about architecture theology (monolith vs. microservices, hexagonal, clean architecture, etc.). He cares about two things:

1. **The database is well-designed and thorough.** Normalized, thoughtful, captures every metric and dimension he might need to report on later. This is the single most important technical decision in any project.
2. **Performance is acceptable.** No nightmare queries, no inexplicable slowness. Beyond that, the implementation details are noise.

There is no preferred architectural pattern. Let the AI decide. The constraint is: the data model must be solid and the app must not be slow.

---

## Project Structure

**Simplicity and visual clarity are non-negotiable.** Rob is a visual thinker. He needs to look at the root of a project and immediately understand where everything lives.

Follow this convention:

- `services/` — business logic
- `models/` — data models
- `config/` — configuration
- `views/` — templates/UI
- Keep the root clean. Minimal files. No deeply nested folder hierarchies.

**Do not** create sprawling file structures with dozens of directories and files scattered everywhere. If the project root doesn't feel clear at a glance, it's wrong.

---

## Project Documentation

**This is critical.** Every project must maintain a documentation file (markdown) that serves as the project's memory. This file must include:

- What the project is and what it does
- Key architectural decisions that were made and why
- The current state: what's done, what's in progress, what's next
- A visual diagram of the system (ASCII art or Excalidraw, not paragraphs of prose)

**Why:** Rob does not read the code. He will never read the code. The documentation file is how he (and any AI agent picking up the project) understands what's happening. Do not rely on scanning the codebase to figure things out. Write it down.

---

## AI-Assisted Development

Rob's development workflow is fully AI-driven. He uses Claude Code exclusively, often running 3-4 sessions in parallel across different projects, all from the terminal.

**Division of labor:**

- **Rob controls:** Visuals (design quality) and data (schema design, what gets captured, reporting needs)
- **AI controls:** Everything else. Implementation, code patterns, file organization details, library choices, testing strategies... all of it.

**Rob will not read the generated code.** Do not optimize for code readability or "clean code" conventions for a human audience. Optimize for correctness, performance, and maintainability by future AI agents.

**What annoys Rob about AI-generated work:**

- Ugly or generic-looking UI. Design must match the Big Machine aesthetic (warm, Bauhaus-influenced, "subtle vibrant" colors, golden ratio proportions, pastel-muted but rich)
- Missing data. If there's a metric or dimension that should be captured for future reporting, and the AI skipped it, that's a failure.
- Having to re-explain context because the AI didn't document decisions in a persistent file

---

## Design Aesthetic

Use the /frontend-design skill, always. If there's a /big-machine-branding skill available, use that as well.

Rob's visual standard for Big Machine projects:

- Dark, Warm, atmospheric, tactile
- Vibrant hues with a pastel/muted quality ("subtle vibrant," not garish)
- Follows golden ratio proportions
- Bauhaus and mid-century modern influences
- Not minimalist-cold. Not corporate. Not "default Tailwind."
- Reference: [bigmachine.io](https://bigmachine.io)

If the UI looks like a generic SaaS dashboard or a default template, it's wrong. When in doubt, go warmer and bolder.

---

## Tooling

- **Editor/IDE:** Terminal. Claude Code. VS Code.
- **Agent system:** OpenClaw running in Slack (custom agent framework)
- **Notes:** Obsidian
- **Project/task management:** Trello
- **Daily workflow:** Obsidian (weekly notes, working memory)
- **Calendar:** Apple Calendar with emoji-coded calendars
- **Automation:** n8n

---

## Decision-Making Priorities

Rob's priority stack, in order:

1. **Database first.** Get the data model right. Normalized, complete, reportable. This is always the first and most important thing.
2. **Ship fast.** After the data is right, get it out the door.
3. **Everything else.** Code quality, architecture patterns, test coverage, documentation polish... these are nice but they never block shipping.

**What Rob will sacrifice for speed:** Code elegance, architectural purity, comprehensive test suites, perfect abstractions.

**What Rob will never sacrifice:** Data integrity, design quality, performance.

---

## Communication Style

- Direct. No hedging, no corporate speak, no marketing language.
- Conversational but substantive.
- Never condescending. Never "here's the thing" or "let me explain."
- No em-dashes. Ever.
- If something is wrong, say so. If something is ugly, say so. If a decision needs to be made, make a recommendation and explain why.

---

## What "Done" Looks Like

A project is done when:

- The data model captures everything needed for reporting and business questions
- The UI looks good (not generic, not ugly, matches the aesthetic)
- It ships and works
- The documentation file is updated so the next agent (or Rob) can pick it up cold

A project is NOT done just because the code compiles and the tests pass.

---

## Summary for Agents

When working for Rob:

1. Design the database first. Make it normalized and complete. Capture every metric.
2. Document decisions in a markdown file with a visual diagram. Keep it updated.
3. Keep the project structure flat and obvious.
4. Use Bun, SQLite (dev), PostgreSQL (prod).
5. Make the UI look great. Match the Big Machine aesthetic. No generic templates.
6. Don't ask Rob about implementation details. Make the call yourself.
7. Ship fast. Don't over-engineer.
8. Never use Rails, Next.js, or Nuxt.
9. Rob won't read the code. He'll read the docs and look at the UI.