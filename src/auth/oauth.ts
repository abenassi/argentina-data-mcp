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

/** OAuth authorization endpoint — shows login form or processes it */
export function authorizeHandler(req: Request, res: Response): void {
  // Read params from query (GET) or body (POST form)
  const clientId = (req.query.client_id as string) || req.body?.client_id || "";
  const redirectUri = (req.query.redirect_uri as string) || req.body?.redirect_uri || "";
  const state = (req.query.state as string) || req.body?.state || "";

  if (!clientId || !redirectUri) {
    res.status(400).json({ error: "invalid_request", error_description: "client_id and redirect_uri required" });
    return;
  }

  // If API key was submitted via form POST, validate and redirect with code
  const apiKey = req.body?.api_key as string | undefined;
  if (apiKey) {
    if (!validateApiKey(apiKey)) {
      res.status(200).send(authorizeFormHtml(clientId, redirectUri, state, "API key inválida. Revisá e intentá de nuevo."));
      return;
    }

    const code = randomUUID();
    authCodes.set(code, {
      clientId,
      secret: apiKey,
      expiresAt: Date.now() + 300_000,
    });

    const sep = redirectUri.includes("?") ? "&" : "?";
    const location = `${redirectUri}${sep}code=${encodeURIComponent(code)}${state ? `&state=${encodeURIComponent(state)}` : ""}`;
    res.redirect(302, location);
    return;
  }

  // GET request — show login form
  res.status(200).send(authorizeFormHtml(clientId, redirectUri, state));
}

/** Renders the HTML login form for OAuth authorization */
function authorizeFormHtml(clientId: string, redirectUri: string, state: string, error?: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Argentina Data MCP — Autorización</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0a1628; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #1e293b; border-radius: 12px; padding: 2rem; max-width: 420px; width: 100%; box-shadow: 0 4px 24px rgba(0,0,0,0.3); }
    h1 { font-size: 1.25rem; margin-bottom: 0.25rem; }
    .subtitle { color: #94a3b8; font-size: 0.875rem; margin-bottom: 1.5rem; }
    label { display: block; font-size: 0.875rem; color: #94a3b8; margin-bottom: 0.5rem; }
    input[type="password"] { width: 100%; padding: 0.625rem 0.75rem; border: 1px solid #334155; border-radius: 8px; background: #0f172a; color: #e2e8f0; font-size: 0.95rem; }
    input:focus { outline: none; border-color: #60a5fa; box-shadow: 0 0 0 2px rgba(96,165,250,0.3); }
    button { width: 100%; margin-top: 1rem; padding: 0.625rem; border: none; border-radius: 8px; background: #3b82f6; color: white; font-size: 0.95rem; font-weight: 600; cursor: pointer; }
    button:hover { background: #2563eb; }
    .error { background: #7f1d1d; color: #fca5a5; padding: 0.625rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.85rem; }
    .flag { font-size: 2rem; margin-bottom: 0.5rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="flag">🇦🇷</div>
    <h1>Argentina Data MCP</h1>
    <p class="subtitle">Ingresá tu API key para conectar</p>
    ${error ? `<div class="error">${esc(error)}</div>` : ""}
    <form method="POST">
      <input type="hidden" name="client_id" value="${esc(clientId)}">
      <input type="hidden" name="redirect_uri" value="${esc(redirectUri)}">
      <input type="hidden" name="state" value="${esc(state)}">
      <label for="api_key">API Key</label>
      <input type="password" id="api_key" name="api_key" placeholder="adm_..." required autofocus>
      <button type="submit">Autorizar</button>
    </form>
  </div>
</body>
</html>`;
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
