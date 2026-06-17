/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/spec/**/*.spec.ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.json" }],
  },
  // Reset the better-sqlite3 native addon's isInitialized guard before each
  // test file. Without this, the second (and later) test files that load
  // better-sqlite3 skip setErrorConstructor, causing SqliteError to fail
  // `instanceof Error` in jest's per-file vm contexts (see the file for details).
  setupFiles: ["<rootDir>/spec/support/reset-sqlite3-addon.js"],
};
