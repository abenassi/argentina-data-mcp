#!/usr/bin/env node

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools/register.js";

const server = new McpServer({
  name: "argentina-data-mcp",
  version: "0.3.0",
});

registerTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("argentina-data-mcp server running on stdio (v0.3.0)");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
