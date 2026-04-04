import type { Request, Response, NextFunction } from "express";
import { isProtectedMcpMethod, verifyContextRequest } from "@ctxprotocol/sdk";
import { validateApiKey, getKeyRole } from "./api-keys.js";
import type { ApiKeyRole } from "./api-keys.js";

export interface AuthMiddlewareOptions {
  /** Expected audience for Context Protocol JWT validation (your tool URL) */
  audience?: string;
}

/**
 * Dual auth middleware for MCP HTTP server.
 *
 * - Discovery methods (initialize, tools/list) → pass through without auth
 * - Execution methods (tools/call) → require either:
 *   1. Valid Context Protocol JWT (paid marketplace users)
 *   2. Valid API key from our whitelist (free beta testers)
 */
export function createAuthMiddleware(options?: AuthMiddlewareOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Only check POST requests with a JSON-RPC body
    if (req.method !== "POST" || !req.body?.method) {
      next();
      return;
    }

    const method: string = req.body.method;

    // Best-effort: extract role from API key on ALL requests (including discovery)
    // This allows downstream code to know the user's role for tool filtering.
    const earlyToken = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (earlyToken) {
      const role = getKeyRole(earlyToken);
      if (role) (req as any).apiKeyRole = role;
    }

    // Discovery methods pass without auth
    if (!isProtectedMcpMethod(method)) {
      next();
      return;
    }

    // Protected method — require auth
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Authentication required" },
        id: req.body.id ?? null,
      });
      return;
    }

    const token = authHeader.replace(/^Bearer\s+/i, "");

    // Try 1: Context Protocol JWT
    try {
      const payload = await verifyContextRequest({
        authorizationHeader: authHeader,
        audience: options?.audience,
      });
      // Attach verified context for downstream use
      (req as any).context = payload;
      (req as any).authSource = "context-protocol";
      next();
      return;
    } catch {
      // JWT validation failed — try API key
    }

    // Try 2: API key from whitelist
    if (validateApiKey(token)) {
      (req as any).authSource = "api-key";
      (req as any).apiKeyRole = getKeyRole(token) || "user";
      next();
      return;
    }

    // Neither worked
    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Invalid credentials" },
      id: req.body.id ?? null,
    });
  };
}
