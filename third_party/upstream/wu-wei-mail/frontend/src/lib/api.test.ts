import { beforeEach, describe, expect, it, vi } from "vitest";

function mockJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 400 ? "Error" : "OK",
    json: async () => body,
  } as Response;
}

describe("api client", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("sends bearer token when access token is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { api, setAccessToken } = await import("./api");
    setAccessToken("token-123");

    await api.get("/api/health");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer token-123");
    expect(options.credentials).toBe("include");
  });

  it("does not force Content-Type for FormData uploads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { api } = await import("./api");
    const payload = new FormData();
    payload.append("file", new Blob(["x"], { type: "text/plain" }), "x.txt");

    await api.upload("/api/upload", payload);

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = (options.headers ?? {}) as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
  });

  it("refreshes token and retries once on 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse({ detail: "unauthorized" }, 401))
      .mockResolvedValueOnce(mockJsonResponse({ access_token: "fresh-token" }, 200))
      .mockResolvedValueOnce(mockJsonResponse({ value: 42 }, 200));
    vi.stubGlobal("fetch", fetchMock);

    const { api, setAccessToken } = await import("./api");
    setAccessToken("expired-token");

    const result = await api.get<{ value: number }>("/api/protected");

    expect(result.value).toBe(42);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [refreshUrl] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(refreshUrl).toContain("/api/auth/refresh");

    const [, retryOptions] = fetchMock.mock.calls[2] as [string, RequestInit];
    const retryHeaders = retryOptions.headers as Record<string, string>;
    expect(retryHeaders.Authorization).toBe("Bearer fresh-token");
  });
});
