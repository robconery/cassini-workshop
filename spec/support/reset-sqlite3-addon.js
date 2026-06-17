/**
 * Jest setupFile — reset better-sqlite3 native addon before each test file.
 *
 * ROOT CAUSE this fixes:
 *   better-sqlite3's database.js guards the setErrorConstructor call with an
 *   `addon.isInitialized` flag. The native `.node` addon is cached at the Node
 *   native-module level and SHARED across all of jest's per-file vm contexts.
 *   The first test file that loads better-sqlite3 sets `addon.isInitialized = true`
 *   using its own vm-context SqliteError.  Every subsequent test file skips
 *   setErrorConstructor, so all contexts after the first keep using the
 *   original SqliteError constructor.
 *
 *   In jest, each test file runs in its own vm context, which means each file
 *   has its own `Error` class.  SqliteError from context-1 inherits from
 *   context-1's Error.prototype.  When jest's `expect().rejects.toThrow()`
 *   runs inside context-2, it checks `value instanceof Error` against
 *   context-2's Error — which fails for a SqliteError built in context-1.
 *   jest's toThrowMatchers then sees `thrown = null` and reports
 *   "Received function did not throw" even though the promise DID reject.
 *
 * THE FIX:
 *   This file runs as a jest setupFile (before each test file's vm context).
 *   It obtains the cached native addon directly and deletes `isInitialized`,
 *   so that the next `new Database()` call in this context re-runs
 *   setErrorConstructor with the SqliteError constructor from THIS context.
 *   The error class then satisfies `instanceof Error` in the same context
 *   that created it, which is what jest's assertion machinery requires.
 */

"use strict";

const path = require("path");

try {
  // Resolve the path relative to this file's location (spec/support/) to be
  // robust regardless of which directory jest is invoked from.
  const addonPath = path.resolve(__dirname, "../../node_modules/better-sqlite3/build/Release/better_sqlite3.node");
  const nativeAddon = require(addonPath);
  // Delete the flag so the next Database() in this vm context will call
  // setErrorConstructor(SqliteError) with the correct Error class.
  delete nativeAddon.isInitialized;
} catch (_) {
  // If the path changes (e.g. a different build output), fail silently here
  // and let the actual test require surface the real problem.
}
