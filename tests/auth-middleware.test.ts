import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @ctxprotocol/sdk
vi.mock("@ctxprotocol/sdk", () => ({
  isProtectedMcpMethod: (method: string) => method === "tools/call",
  verifyContextRequest: vi.fn(),
}));

// Mock api-keys module
vi.mock("../src/auth/api-keys.js", () => ({
  validateApiKey: vi.fn(),
}));

import { createAuthMiddleware } from "../src/auth/middleware.js";
import { verifyContextRequest } from "@ctxprotocol/sdk";
import { validateApiKey } from "../src/auth/api-keys.js";

const mockVerify = verifyContextRequest as ReturnType<typeof vi.fn>;
const mockValidateKey = validateApiKey as ReturnType<typeof vi.fn>;

function mockReq(body: any, authorization?: string) {
  return {
    method: "POST",
    body,
    headers: authorization ? { authorization } : {},
  } as any;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  mockVerify.mockReset();
  mockValidateKey.mockReset();
});

describe("auth middleware", () => {
  const middleware = createAuthMiddleware();

  it("allows initialize without auth", async () => {
    const req = mockReq({ method: "initialize", id: 1 });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("allows tools/list without auth", async () => {
    const req = mockReq({ method: "tools/list", id: 1 });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("rejects tools/call without auth header", async () => {
    const req = mockReq({ method: "tools/call", id: 1 });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: -32001 }),
      }),
    );
  });

  it("allows tools/call with valid Context Protocol JWT", async () => {
    mockVerify.mockResolvedValueOnce({ sub: "user-123" });
    const req = mockReq(
      { method: "tools/call", id: 1 },
      "Bearer eyJ.valid.jwt",
    );
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.authSource).toBe("context-protocol");
    expect(req.context).toEqual({ sub: "user-123" });
  });

  it("allows tools/call with valid API key when JWT fails", async () => {
    mockVerify.mockRejectedValueOnce(new Error("invalid JWT"));
    mockValidateKey.mockReturnValueOnce(true);
    const req = mockReq(
      { method: "tools/call", id: 1 },
      "Bearer adm_testkey123",
    );
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.authSource).toBe("api-key");
  });

  it("rejects tools/call with invalid API key and invalid JWT", async () => {
    mockVerify.mockRejectedValueOnce(new Error("invalid JWT"));
    mockValidateKey.mockReturnValueOnce(false);
    const req = mockReq(
      { method: "tools/call", id: 1 },
      "Bearer bad_token",
    );
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("passes through non-POST requests (GET for SSE)", async () => {
    const req = { method: "GET", body: {}, headers: {} } as any;
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
