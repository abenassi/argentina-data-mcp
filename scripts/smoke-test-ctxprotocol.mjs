#!/usr/bin/env node
/**
 * Context Protocol Smoke Test Reproducer
 *
 * Simulates what Context Protocol's /contribute page does when validating
 * an MCP server. Tests multiple scenarios to find the root cause of:
 *   "Smoke test failed for 'bcra_tipo_cambio': Output does not match declared
 *    outputSchema — Schema errors: (root): must be object"
 *
 * Usage: node scripts/smoke-test-ctxprotocol.mjs [endpoint]
 */

import Ajv from "/home/abenassi/repos/argentina-data-mcp/node_modules/ajv/dist/ajv.js";

const ENDPOINT = process.argv[2] || "https://argentinadata.mymcps.dev/mcp";
const TOOL_NAME = "bcra_tipo_cambio";

let requestId = 0;
function nextId() { return ++requestId; }

// ============================================================================
// Minimal MCP-over-HTTP-Streaming client
// ============================================================================

async function mcpRequest(endpoint, method, params, sessionId, bearerToken) {
  const body = {
    jsonrpc: "2.0",
    id: nextId(),
    method,
    ...(params ? { params } : {}),
  };

  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  if (bearerToken) headers["Authorization"] = `Bearer ${bearerToken}`;

  const resp = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
  const sid = resp.headers.get("mcp-session-id");
  const ct = resp.headers.get("content-type") || "";

  if (ct.includes("text/event-stream")) {
    const text = await resp.text();
    const events = [];
    for (const block of text.split("\n\n")) {
      const dl = block.split("\n").find((l) => l.startsWith("data: "));
      if (dl) try { events.push(JSON.parse(dl.slice(6))); } catch {}
    }
    const result = events.find((e) => e.id === body.id) || events[0];
    return { status: resp.status, data: result, sessionId: sid || sessionId, rawText: text };
  }

  if (ct.includes("application/json")) {
    const data = await resp.json();
    return { status: resp.status, data, sessionId: sid || sessionId };
  }

  const text = await resp.text();
  return { status: resp.status, data: text, sessionId: sid || sessionId };
}

function validateSchema(data, schema) {
  const ajv = new Ajv.default({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const valid = validate(data);
  return { valid, errors: validate.errors || [] };
}

function fmt(errors) {
  return errors.map(e => {
    const path = e.instancePath || "(root)";
    return `${path}: ${e.message}`;
  }).join("; ");
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("=".repeat(72));
  console.log("  Context Protocol Smoke Test Reproducer");
  console.log(`  Endpoint: ${ENDPOINT}`);
  console.log(`  Tool:     ${TOOL_NAME}`);
  console.log("=".repeat(72));

  // --- STEP 1: Initialize session ---
  console.log("\n[1] Initialize...");
  const init = await mcpRequest(ENDPOINT, "initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "ctxprotocol-smoke-test", version: "1.0.0" },
  });
  if (init.status !== 200) {
    console.log(`    FAIL: HTTP ${init.status}`);
    return;
  }
  const sid = init.sessionId;
  console.log(`    OK (session: ${sid})`);

  // --- STEP 2: tools/list ---
  console.log("\n[2] tools/list...");
  const list = await mcpRequest(ENDPOINT, "tools/list", {}, sid);
  const tools = list.data?.result?.tools || [];
  const tool = tools.find(t => t.name === TOOL_NAME);
  if (!tool) {
    console.log(`    FAIL: '${TOOL_NAME}' not found. Available: ${tools.map(t => t.name).join(", ")}`);
    return;
  }
  console.log(`    OK (${tools.length} tools, '${TOOL_NAME}' has outputSchema: ${!!tool.outputSchema})`);

  const outputSchema = tool.outputSchema;

  // --- STEP 3: tools/call WITHOUT auth ---
  console.log("\n[3] tools/call (no auth)...");
  const noAuth = await mcpRequest(ENDPOINT, "tools/call",
    { name: TOOL_NAME, arguments: {} }, sid);
  console.log(`    HTTP ${noAuth.status}`);
  console.log(`    Response body: ${JSON.stringify(noAuth.data).slice(0, 200)}`);

  if (noAuth.status === 401) {
    console.log("    --> 401 Unauthorized (expected for unauthenticated calls)");

    // Simulate what Context Protocol does: extract structuredContent
    const sc = noAuth.data?.result?.structuredContent;
    console.log(`    --> result?.structuredContent = ${sc} (${typeof sc})`);

    if (outputSchema) {
      console.log("\n    Validating extracted structuredContent against outputSchema:");
      if (sc === undefined) {
        console.log("    --> Cannot validate 'undefined'. @cfworker/json-schema would say:");
        console.log('    --> "(root): must be object"');
        console.log("    --> THIS MATCHES THE REPORTED ERROR!");
      } else {
        const v = validateSchema(sc, outputSchema);
        console.log(`    --> Valid: ${v.valid}${v.valid ? "" : " | Errors: " + fmt(v.errors)}`);
      }
    }
  }

  // --- STEP 4: tools/call WITH fake JWT ---
  console.log("\n[4] tools/call (fake JWT)...");
  const init2 = await mcpRequest(ENDPOINT, "initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "ctxprotocol-smoke-test", version: "1.0.0" },
  });
  const fakeAuth = await mcpRequest(ENDPOINT, "tools/call",
    { name: TOOL_NAME, arguments: {} }, init2.sessionId, "fake-jwt-token");
  console.log(`    HTTP ${fakeAuth.status}`);
  console.log(`    Response body: ${JSON.stringify(fakeAuth.data).slice(0, 200)}`);

  // --- STEP 5: Check the 401 response format ---
  console.log("\n[5] Analyzing 401 response format...");
  console.log("    Our server's createContextMiddleware() returns:");
  console.log('    res.status(401).json({ error: "Unauthorized" })');
  console.log("    This is NOT a valid JSON-RPC response (missing jsonrpc, id fields).");
  console.log("    An MCP client parsing this would get:");
  console.log("    - data.result = undefined");
  console.log("    - data.result?.structuredContent = undefined");

  // --- STEP 6: Reproduce the exact error ---
  console.log("\n[6] Reproducing the exact smoke test error...");
  console.log("    Context Protocol smoke test flow:");
  console.log("    1. Connect -> OK");
  console.log("    2. tools/list -> gets outputSchema");
  console.log("    3. tools/call -> HTTP 401 { error: 'Unauthorized' }");
  console.log("    4. Extract structuredContent from response -> undefined");
  console.log("    5. Validate undefined against outputSchema (type: 'object')");
  console.log("    6. FAIL: '(root): must be object'");

  if (outputSchema) {
    // @cfworker/json-schema format: "(root): must be object"
    // ajv format: instancePath="", message="must be object"
    // Let's show both
    const v = validateSchema(undefined, outputSchema);
    console.log(`\n    ajv validation of 'undefined' against outputSchema:`);
    console.log(`    Valid: ${v.valid}`);
    console.log(`    Errors: ${fmt(v.errors)}`);
    console.log(`    @cfworker format would be: "(root): must be object"`);
  }

  // --- CONCLUSION ---
  console.log("\n" + "=".repeat(72));
  console.log("  DIAGNOSIS");
  console.log("=".repeat(72));
  console.log(`
  ROOT CAUSE: Context Protocol's smoke test calls tools/call but gets
  HTTP 401 because createContextMiddleware() rejects the request.

  Two possible sub-causes:

  A) Context Protocol does NOT send a JWT during smoke test.
     Their platform just tests the endpoint "raw" without auth.
     Fix: Allow unauthenticated tools/call for smoke testing, OR
     configure the server to accept Context Protocol's smoke test.

  B) Context Protocol DOES send a valid JWT but our middleware rejects it.
     Possible reasons:
     - JWKS endpoint returns 404 (confirmed: https://ctxprotocol.com/.well-known/jwks.json)
     - Hardcoded public key in @ctxprotocol/sdk may be outdated
     - Key rotation occurred but our installed SDK has old key
     Fix: Update @ctxprotocol/sdk to latest version, or verify the
     public key matches what Context Protocol is currently using.

  SECONDARY ISSUE: API key auth for tools/call is also broken.
  The API key middleware sets authSource="api-key" and calls next(),
  but createContextMiddleware() runs next and overrides with 401.
  API key users cannot execute tools via HTTP.

  The error flow:
  1. tools/call request arrives
  2. createContextMiddleware() returns HTTP 401 { error: "Unauthorized" }
  3. Context Protocol extracts result.structuredContent from response
  4. Gets undefined (401 body has no .result property)
  5. Validates undefined against outputSchema { type: "object", ... }
  6. Validation fails: "(root): must be object"
`);

  console.log("  RECOMMENDED FIXES:");
  console.log("  1. Fix API key middleware to skip createContextMiddleware");
  console.log("     when authSource is already set");
  console.log("  2. Update @ctxprotocol/sdk to latest to get current public key");
  console.log("  3. Add logging to createContextMiddleware to see JWT errors");
  console.log("  4. Verify the public key by checking Context Protocol docs/support");
}

main().catch(console.error);
