import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  nextResponse: {
    json: vi.fn((body, init) => ({ body, status: init?.status || 200 })),
  },
  killAppProcesses: vi.fn(),
  spawnUpdaterAndExit: vi.fn(),
}));

vi.mock("next/server", () => ({ NextResponse: mocks.nextResponse }));
vi.mock("@/lib/appUpdater", () => ({
  killAppProcesses: mocks.killAppProcesses,
  spawnUpdaterAndExit: mocks.spawnUpdaterAndExit,
}));

const { GET } = await import("../../src/app/api/version/route.js");
const { POST } = await import("../../src/app/api/version/update/route.js");

describe("custom update guard", () => {
  it("does not query npm for an update from a custom build", async () => {
    const response = await GET();
    expect(await response.json()).toMatchObject({
      currentVersion: expect.stringContaining("-3h."),
      latestVersion: null,
      hasUpdate: false,
      customBuild: true,
      updateCommand: "npm run update:custom",
    });
  });

  it("refuses the public updater so custom routing cannot be overwritten", async () => {
    const response = await POST();
    expect(response).toMatchObject({ status: 409 });
    expect(response.body.message).toContain("npm run update:custom");
    expect(mocks.killAppProcesses).not.toHaveBeenCalled();
    expect(mocks.spawnUpdaterAndExit).not.toHaveBeenCalled();
  });
});
