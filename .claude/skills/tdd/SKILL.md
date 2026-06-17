---
name: tdd
description: >-
  Test-driven development with bun:test, written for clarity. Produces failing
  tests FIRST — before any implementation — that read as the executable spec a
  builder agent implements against. Each test names a single behavior in plain
  language, follows Arrange–Act–Assert, asserts one thing, and uses real types
  with no `any`. Use when asked to "write the tests first", do TDD, red-green-
  refactor, or hand a builder agent a test suite to build against. This is the
  lighter sibling of `bdd-specs`: no PLAN.md/STORIES.md ceremony, no
  Feature/Scenario nesting — just clear, behavior-named bun tests that guide
  the build. Ships a ready-to-copy bun:test template.
---

# Test-Driven Development — Clear Tests, Written First

Under this skill the test is written **before** the implementation and is the
spec the builder works from. A human (or a builder agent) should be able to
read the test file top to bottom and understand exactly what the code is
supposed to do — without opening the source. If a test isn't clear on its own,
it isn't done.

Do not write implementation code under this skill until the tests exist, fail
for the right reason, and the user has seen them.

## 🎯 Why clarity is the whole point

These tests are a **guide handed to a builder agent.** The builder implements
against them with no other context, so every test must answer three questions
by itself:

1. **What** behavior is being built (the test name).
2. **With what** inputs (the Arrange block).
3. **What counts as correct** (one assertion).

A clever, terse, or DRY-but-cryptic test fails as a guide even if it passes as
a check. Optimize for the next reader, not for line count.

## The cycle

Run it in order, one behavior at a time:

1. **Red** — write one failing test for the next behavior. Run `bun test` and
   confirm it fails *because the behavior is missing*, not because of a typo,
   bad import, or compile error. A test that errors out is not a red test.
2. **Green** — (builder's job, or yours if implementing) write the minimum
   code to pass.
3. **Refactor** — clean up with the test as the safety net. The test does not
   change during refactor; if it has to, you changed behavior, not structure.

Write the smallest next test that forces new code. Don't write ten tests
against code that doesn't exist — write one, watch it fail, then move on. The
suite grows behavior by behavior.

## bun:test — the runner, always

This project uses Bun. Import from `"bun:test"`, run with `bun test`. Do not
auto-detect or ask.

```ts
import { test, expect } from "bun:test";
```

Use `describe` only to group tests around one subject — keep nesting shallow
(one level). Prefer flat, fully-named `test(...)` calls over deep `describe`
trees; the name carries the meaning. Use `beforeEach` for shared Arrange only
when several tests need the identical setup.

## How every test must read

1. **Name the behavior, not the method.** The test name is a sentence about
   what the code does, readable without the body.
   - ✅ `test("merges quantities when the same SKU is added twice", …)`
   - ❌ `test("add()", …)` / `test("works", …)` / `test("test 2", …)`
2. **Arrange–Act–Assert, visibly.** Three blocks, separated by a blank line.
   Arrange sets up inputs; Act performs the one operation under test; Assert
   checks the outcome. Keep them in that order.
3. **One assertion per test.** A failing test must name exactly one broken
   behavior. Need another check → another test. (Asserting several fields of a
   single returned value is fine via one `toEqual` on the whole object — that's
   still one behavior.)
4. **Real, typed values.** TypeScript throughout, no `any`, no untyped
   fixtures. The types in the test are part of the spec the builder reads.
5. **Concrete, meaningful data.** Use values that show intent (`unitPrice: 5`,
   `email: "ada@example.com"`), not `foo`/`bar`/`123`. Magic numbers in the
   assertion should be obviously derived from the Arrange values.
6. **Test behavior through the public surface.** Import what production will
   export and exercise that — not private helpers. If a behavior can only be
   reached by poking internals, the API is the thing to fix. Drive side effects
   (DB, email, network) through fakes injected at the boundary, never by
   reaching into internals.
7. **Happy path first and thorough; failure cases after.** Cover the success
   behaviors a feature implies before its error/validation/edge cases. Group
   failure-mode tests together, below the happy-path ones — don't interleave.
8. **No logic in tests.** No `if`, no loops generating assertions, no
   computing the expected value with the same code under test. Write the
   expected value as a literal.

## The subject need not exist yet

Tests are written against the intended API. Import the symbol production
*will* export; the import failing or the type not existing yet is expected —
that is the red state. Write the import as if the code were already built, then
let the builder build to it.

## Template

Copy `templates/feature.bun.test.ts` and adapt it — don't hand-write the
scaffold. It shows the AAA shape, behavior-named tests, one assertion each,
happy-path-first ordering, and a segregated failure-cases section.

## Handing off to the builder

When the tests are written and reviewed, the builder agent implements against
them. Tell the builder: the tests are the spec, make them pass without
weakening or skipping them, and don't change a test to go green — a test that
must change to pass means the behavior was wrong, which is a conversation, not
an edit.
