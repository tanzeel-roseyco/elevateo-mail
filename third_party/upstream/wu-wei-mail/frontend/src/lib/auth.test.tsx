import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  pushMock,
  apiGetMock,
  apiPostMock,
  setAccessTokenMock,
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  apiGetMock: vi.fn(),
  apiPostMock: vi.fn(),
  setAccessTokenMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    get: apiGetMock,
    post: apiPostMock,
  },
  setAccessToken: setAccessTokenMock,
}));

import { AuthProvider, useAuth } from "./auth";

function Harness() {
  const { user, loading, login, logout } = useAuth();

  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="email">{user?.email ?? "none"}</div>
      <button onClick={() => void login("user@example.com", "secret")}>login</button>
      <button onClick={() => logout()}>logout</button>
    </div>
  );
}

describe("AuthProvider", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    pushMock.mockReset();
    apiGetMock.mockReset();
    apiPostMock.mockReset();
    setAccessTokenMock.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("hydrates user from refresh token on mount", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "fresh-access-token" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    apiGetMock.mockResolvedValue({
      id: "u1",
      email: "user@example.com",
      full_name: "User",
      role: "owner",
      workspace_id: "w1",
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
    });

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });

    expect(setAccessTokenMock).toHaveBeenCalledWith("fresh-access-token");
    expect(screen.getByTestId("email")).toHaveTextContent("user@example.com");
  });

  it("logs in and navigates to dashboard", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);
    apiPostMock.mockResolvedValue({
      access_token: "login-access-token",
      token_type: "bearer",
      user_id: "u1",
      workspace_id: "w1",
    });
    apiGetMock.mockResolvedValue({
      id: "u1",
      email: "user@example.com",
      full_name: "User",
      role: "owner",
      workspace_id: "w1",
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
    });

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });

    await act(async () => {
      fireEvent.click(screen.getByText("login"));
    });

    expect(apiPostMock).toHaveBeenCalledWith("/api/auth/login", {
      email: "user@example.com",
      password: "secret",
    });
    expect(setAccessTokenMock).toHaveBeenCalledWith("login-access-token");
    expect(pushMock).toHaveBeenCalledWith("/dashboard");
  });

  it("logs out and navigates to login", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    apiPostMock.mockResolvedValue({});

    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });

    fireEvent.click(screen.getByText("logout"));

    expect(apiPostMock).toHaveBeenCalledWith("/api/auth/logout");
    expect(setAccessTokenMock).toHaveBeenCalledWith(null);
    expect(pushMock).toHaveBeenCalledWith("/login");
  });
});
