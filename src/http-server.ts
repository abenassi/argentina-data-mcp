#!/usr/bin/env node

import "dotenv/config";
import { randomUUID } from "node:crypto";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { registerTools } from "./tools/register.js";

const PORT = parseInt(process.env.MCP_HTTP_PORT || "3100", 10);

function createServer(): McpServer {
  const server = new McpServer({
    name: "argentina-data-mcp",
    version: "0.3.0",
  });

  registerTools(server);

  return server;
}

// Session management
const transports: Record<string, StreamableHTTPServerTransport> = {};

const app = express();
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: "argentina-data-mcp", version: "0.3.0" });
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

      const server = createServer();
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
