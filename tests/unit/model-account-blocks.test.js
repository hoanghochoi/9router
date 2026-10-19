import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProviderConnections: vi.fn(),
  getSettings: vi.fn(),
  updateProviderConnection: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  ...mocks,
  getProxyPools: vi.fn(),
  validateApiKey: vi.fn(),
}));
vi.mock("@/lib/network/connectionProxy", () => ({
  resolveConnectionProxyConfig: vi.fn(async () => ({})),
  pickProxyPoolId: vi.fn(),
}));
vi.mock("@/shared/constants/providers.js", () => ({
  FREE_PROVIDERS: {},
  resolveProviderId: (provider) => provider === "cx" ? "codex" : provider,
}));
vi.mock("@/sse/utils/logger.js", () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn() }));

const { getProviderCredentials } = await import("@/sse/services/auth.js");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getProviderConnections.mockResolvedValue([
    { id: "account-a", providerSpecificData: { planType: "free" } },
    { id: "account-b", providerSpecificData: { planType: "plus" } },
  ]);
  mocks.getSettings.mockResolvedValue({});
});

describe("persistent per-account model blocks", () => {
  it("skips an exact blocked model even when that account is pinned", async () => {
    mocks.getSettings.mockResolvedValue({ modelAccountBlocks: { "account-a": ["gpt-6-sol"] } });
    await expect(getProviderCredentials("codex", null, "gpt-6-sol", { preferredConnectionId: "account-a" }))
      .resolves.toMatchObject({ connectionId: "account-b" });
  });

  it("supports prefix wildcards without blocking unrelated models", async () => {
    mocks.getSettings.mockResolvedValue({ modelAccountBlocks: { "account-a": ["gpt-5.*"] } });
    await expect(getProviderCredentials("codex", null, "gpt-5.4"))
      .resolves.toMatchObject({ connectionId: "account-b" });
    await expect(getProviderCredentials("codex", null, "gpt-6-sol"))
      .resolves.toMatchObject({ connectionId: "account-a" });
  });

  it("falls back outside an unavailable preferred pool without bypassing blocks", async () => {
    mocks.getSettings.mockResolvedValue({
      modelAccountPools: { "codex/gpt-6-sol": ["account-a"] },
      modelAccountBlocks: { "account-a": ["gpt-6-sol"] },
    });
    await expect(getProviderCredentials("codex", null, "gpt-6-sol"))
      .resolves.toMatchObject({ connectionId: "account-b" });
  });

  it("returns no credentials when all accounts are blocked", async () => {
    mocks.getSettings.mockResolvedValue({ modelAccountBlocks: {
      "account-a": ["gpt-6-sol"], "account-b": ["gpt-6-*"],
    } });
    await expect(getProviderCredentials("codex", null, "gpt-6-sol")).resolves.toBeNull();
    expect(mocks.updateProviderConnection).not.toHaveBeenCalled();
  });

  it("keeps retry exclusions and cooldowns when falling back from a model pool", async () => {
    mocks.getSettings.mockResolvedValue({ modelAccountPools: { "codex/gpt-6-sol": ["account-a"] } });
    await expect(getProviderCredentials("codex", new Set(["account-a"]), "gpt-6-sol"))
      .resolves.toMatchObject({ connectionId: "account-b" });
    mocks.getProviderConnections.mockResolvedValue([
      { id: "account-a", "modelLock_gpt-6-sol": "2099-01-01T00:00:00.000Z" },
      { id: "account-b" },
    ]);
    await expect(getProviderCredentials("codex", null, "gpt-6-sol"))
      .resolves.toMatchObject({ connectionId: "account-b" });
  });

  it("resolves provider aliases and prefers the configured plan", async () => {
    mocks.getSettings.mockResolvedValue({ modelAccountPools: { "codex/gpt-6-sol": ["plan:plus"] } });
    await expect(getProviderCredentials("cx", null, "gpt-6-sol"))
      .resolves.toMatchObject({ connectionId: "account-b" });
  });

  it("preserves normal account selection when no rules exist", async () => {
    await expect(getProviderCredentials("codex", null, "gpt-6-sol"))
      .resolves.toMatchObject({ connectionId: "account-a" });
  });
});
