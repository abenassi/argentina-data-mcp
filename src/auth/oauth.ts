import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { validateApiKey } from "./api-keys.js";

/**
 * Minimal OAuth 2.1 endpoints for MCP auth.
 *
 * Supports client_credentials grant: the client sends client_id + client_secret,
 * and we return the secret as the Bearer access_token (since our middleware
 * already validates API keys as Bearer tokens).
 *
 * Also supports authorization_code grant for Claude.ai's browser-based flow.
 */

// In-memory store for authorization codes (short-lived)
const authCodes = new Map<string, { clientId: string; secret: string; expiresAt: number }>();

// In-memory store for dynamically registered clients
const registeredClients = new Map<string, { clientId: string; clientSecret?: string }>();

/** OAuth 2.0 Authorization Server Metadata (RFC 8414) */
export function metadataHandler(baseUrl: string) {
  return (_req: Request, res: Response) => {
    res.json({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/authorize`,
      token_endpoint: `${baseUrl}/token`,
      registration_endpoint: `${baseUrl}/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "client_credentials"],
      token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
      code_challenge_methods_supported: ["S256"],
    });
  };
}

/** OAuth authorization endpoint — immediate redirect with code */
export function authorizeHandler(req: Request, res: Response): void {
  const clientId = (req.query.client_id as string) || "";
  const redirectUri = (req.query.redirect_uri as string) || "";
  const state = (req.query.state as string) || "";

  if (!clientId || !redirectUri) {
    res.status(400).json({ error: "invalid_request", error_description: "client_id and redirect_uri required" });
    return;
  }

  // Look up the client's secret from dynamic registration
  const client = registeredClients.get(clientId);
  const secret = client?.clientSecret || "";

  // Generate an authorization code
  const code = randomUUID();
  authCodes.set(code, {
    clientId,
    secret,
    expiresAt: Date.now() + 300_000, // 5 minutes
  });

  // Redirect back to the client with the code
  const sep = redirectUri.includes("?") ? "&" : "?";
  const location = `${redirectUri}${sep}code=${encodeURIComponent(code)}${state ? `&state=${encodeURIComponent(state)}` : ""}`;
  res.redirect(302, location);
}

/** OAuth token endpoint — exchange code or client credentials for access token */
export function tokenHandler(req: Request, res: Response): void {
  // Support both form-urlencoded and JSON bodies
  const grantType = req.body.grant_type;
  let clientId = req.body.client_id || "";
  let clientSecret = req.body.client_secret || "";

  // Support HTTP Basic auth
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Basic ")) {
    const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
    const [id, secret] = decoded.split(":");
    clientId = clientId || id;
    clientSecret = clientSecret || secret;
  }

  if (grantType === "client_credentials") {
    // Direct client credentials — secret is the API key
    if (!clientSecret || !validateApiKey(clientSecret)) {
      res.status(401).json({ error: "invalid_client", error_description: "Invalid client credentials" });
      return;
    }

    res.json({
      access_token: clientSecret,
      token_type: "Bearer",
      expires_in: 86400,
    });
    return;
  }

  if (grantType === "authorization_code") {
    const code = req.body.code;
    const stored = code ? authCodes.get(code) : undefined;

    if (!stored || stored.expiresAt < Date.now()) {
      if (code) authCodes.delete(code);
      res.status(400).json({ error: "invalid_grant", error_description: "Invalid or expired authorization code" });
      return;
    }

    // Verify client_id matches
    if (stored.clientId !== clientId) {
      authCodes.delete(code);
      res.status(400).json({ error: "invalid_grant", error_description: "Client ID mismatch" });
      return;
    }

    authCodes.delete(code);

    // The access token is the client's secret (API key)
    const accessToken = clientSecret || stored.secret;

    if (!accessToken || !validateApiKey(accessToken)) {
      res.status(401).json({ error: "invalid_client", error_description: "Invalid client credentials" });
      return;
    }

    res.json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 86400,
    });
    return;
  }

  res.status(400).json({ error: "unsupported_grant_type" });
}

/** Dynamic Client Registration (RFC 7591) */
export function registerHandler(req: Request, res: Response): void {
  const clientId = randomUUID();
  const clientSecret = req.body.client_secret; // Optional: client may provide their API key

  registeredClients.set(clientId, { clientId, clientSecret });

  res.status(201).json({
    client_id: clientId,
    client_secret: clientSecret,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    grant_types: ["authorization_code", "client_credentials"],
    response_types: ["code"],
    token_endpoint_auth_method: "client_secret_post",
  });
}

// Cleanup expired auth codes periodically
setInterval(() => {
  const now = Date.now();
  for (const [code, data] of authCodes) {
    if (data.expiresAt < now) authCodes.delete(code);
  }
}, 60_000);
