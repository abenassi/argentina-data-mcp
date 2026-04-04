#!/usr/bin/env node

import "dotenv/config";
import { randomUUID } from "node:crypto";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { registerTools } from "./tools/register.js";
import { createAuthMiddleware } from "./auth/middleware.js";
import type { ApiKeyRole } from "./auth/api-keys.js";
import { metadataHandler, authorizeHandler, tokenHandler, registerHandler } from "./auth/oauth.js";
import { pool } from "./db/pool.js";

const PORT = parseInt(process.env.MCP_HTTP_PORT || "3100", 10);
const BASE_URL = process.env.MCP_BASE_URL || `http://localhost:${PORT}`;

function createServer(role: ApiKeyRole = "user"): McpServer {
  const server = new McpServer({
    name: "argentina-data-mcp",
    version: "0.3.0",
  });

  registerTools(server, role);

  return server;
}

// Session management
const transports: Record<string, StreamableHTTPServerTransport> = {};

const app = express();
app.use(express.json());

// OAuth 2.1 endpoints (must be before auth middleware)
app.use(express.urlencoded({ extended: false }));
app.get("/.well-known/oauth-authorization-server", metadataHandler(BASE_URL));
app.get("/authorize", authorizeHandler);
app.post("/authorize", authorizeHandler);
app.post("/token", tokenHandler);
app.post("/register", registerHandler);

// Auth middleware — protects tools/call, allows discovery
app.use("/mcp", createAuthMiddleware({
  audience: process.env.MCP_AUTH_AUDIENCE,
}));

// Health check — returns 200 if PostgreSQL is reachable, 503 otherwise
app.get("/health", async (_req, res) => {
  try {
    const start = Date.now();
    await pool.query("SELECT 1");
    const dbLatencyMs = Date.now() - start;
    res.json({
      status: "ok",
      server: "argentina-data-mcp",
      version: "0.3.0",
      postgres: "connected",
      dbLatencyMs,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      status: "degraded",
      server: "argentina-data-mcp",
      version: "0.3.0",
      postgres: "unreachable",
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    });
  }
});

// MCP POST endpoint
app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  try {
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports[sid] = transport;
          console.log(`[${new Date().toISOString()}] Session created: ${sid}`);
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          delete transports[sid];
          console.log(`[${new Date().toISOString()}] Session closed: ${sid}`);
        }
      };

      const role: ApiKeyRole = (req as any).apiKeyRole || "user";
      const server = createServer(role);
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: No valid session ID provided" },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling POST:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// MCP GET endpoint (SSE streams)
app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await transports[sessionId].handleRequest(req, res);
});

// MCP DELETE endpoint (session termination)
app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await transports[sessionId].handleRequest(req, res);
});

app.listen(PORT, () => {
  console.log(`argentina-data-mcp HTTP server listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});

process.on("SIGTERM", async () => {
  console.log("Shutting down...");
  for (const sid in transports) {
    try { await transports[sid].close(); } catch { /* ignore */ }
    delete transports[sid];
  }
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("Shutting down...");
  for (const sid in transports) {
    try { await transports[sid].close(); } catch { /* ignore */ }
    delete transports[sid];
  }
  process.exit(0);
});
