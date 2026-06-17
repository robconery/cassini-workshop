/**
 * Spec harness — the seam every spec drives the system through.
 *
 * CONTRACT (implemented by T01 + T05; stub throws until then, so specs are RED):
 *
 * Specs never call internal functions. They build an MCP JSON-RPC request and
 * push it through the PRODUCTION entry point — `default.fetch` from
 * `src/server.ts` — with an in-memory SQLite store injected at the `Db`
 * boundary (the same port D1 implements in production). Mocks define test
 * reality; this entry-point path defines production reality.
 *
 * Implement against this signature; do not change the signatures without
 * updating the specs that depend on them.
 */
import type { Row } from "./fixtures";

/** MCP error surfaced by a tool call — code is the JSON-RPC error code. */
export class McpError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "McpError";
  }
}

/** A live MCP session bound to the exported Worker `fetch`, backed by `rows`. */
export interface Session {
  /** Result of the MCP `initialize` handshake. */
  initialize(): Promise<{ serverInfo: { name: string; version: string } }>;
  /** Tool names from `tools/list`. */
  listTools(): Promise<string[]>;
  /** Call a tool; resolves to its structured result or throws `McpError`. */
  callTool<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T>;
}

/**
 * Build a session whose store is seeded with `rows`.
 * Implementation: create an in-memory SQLite (schema + FTS per
 * ARCHITECTURE.md), insert rows, wrap as the `Db` port, inject into the
 * Worker `env`, and route requests through `app.fetch`.
 */
export function sessionWith(_rows: Row[]): Session {
  throw new Error("harness not implemented — build T01/T05 first (specs are red by design)");
}
