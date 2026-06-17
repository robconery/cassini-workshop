// STORY-010 — Wire: deploy to Cloudflare + curl initialize
//
// This is the production-reality gate. It does NOT use the in-memory harness:
// it makes a real HTTP request to the deployed Worker. Set DEPLOY_URL to the
// `*.workers.dev` URL printed by `wrangler deploy`. With no URL set, the spec
// fails — that is correct: "deployed" is unproven until a real request lands.
import { describe, it, expect, beforeAll } from "@jest/globals";

const DEPLOY_URL = process.env.DEPLOY_URL ?? "";

const TOOL_NAMES = [
  "list_activities",
  "get_activity",
  "search_activities",
  "count_activities",
  "aggregate_activities",
  "timeline",
  "list_distinct",
];

/** Minimal JSON-RPC POST to the live MCP endpoint. */
async function rpc(method: string, params: Record<string, unknown> = {}): Promise<{
  status: number;
  body: { result?: Record<string, unknown>; error?: unknown };
}> {
  const res = await fetch(DEPLOY_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return { status: res.status, body: (await res.json()) as never };
}

describe("Feature: the deployed Worker answers a real MCP request", () => {
  // -------------------------------------------------------------------
  // HAPPY PATH
  // -------------------------------------------------------------------
  describe("Scenario: initializing against the live URL", () => {
    let status: number;
    let serverInfo: { name?: string; version?: string };

    beforeAll(async () => {
      const { status: s, body } = await rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "spec", version: "0.0.0" },
      });
      status = s;
      serverInfo = (body.result?.serverInfo as typeof serverInfo) ?? {};
    });

    it("responds 200 OK", () => {
      expect(status).toBe(200);
    });

    it("identifies as the Cassini server", () => {
      expect(serverInfo.name).toBe("cassini-mission-plan");
    });
  });

  describe("Scenario: listing tools against the live URL", () => {
    let names: string[];

    beforeAll(async () => {
      const { body } = await rpc("tools/list", {});
      const tools = (body.result?.tools as Array<{ name: string }>) ?? [];
      names = tools.map((t) => t.name);
    });

    it("exposes exactly the seven declared tools", () => {
      expect(names.sort()).toEqual([...TOOL_NAMES].sort());
    });
  });
});
