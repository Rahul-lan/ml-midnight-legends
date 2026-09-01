import { beforeEach, describe, expect, it, vi } from "vitest";

const state = { files: [] as Array<{ id: number; userId: number; name: string; size: number; mimeType: string; storageKey: string; uploadedAt: Date; shareToken: string | null }> };

vi.mock("./db", () => ({
  listPublicFiles: vi.fn(async (search?: string) => state.files.filter(file => !search || file.name.includes(search) || file.mimeType.includes(search))),
  getFileById: vi.fn(async (id: number) => state.files.find(file => file.id === id)),
  listFiles: vi.fn(async (userId: number, search?: string) => {
    return state.files.filter(file => file.userId === userId && (!search || file.name.includes(search) || file.mimeType.includes(search)));
  }),
  getFileForUser: vi.fn(async (id: number, userId: number) => {
    return state.files.find(file => file.id === id && file.userId === userId);
  }),
  setShareToken: vi.fn(async (id: number, userId: number, shareToken: string | null) => {
    const file = state.files.find(item => item.id === id && item.userId === userId);
    if (file) file.shareToken = shareToken;
  }),
  deleteFile: vi.fn(async (id: number, userId: number) => {
    const index = state.files.findIndex(file => file.id === id && file.userId === userId);
    if (index >= 0) state.files.splice(index, 1);
  }),
}));
vi.mock("./storage", () => ({ storageGetSignedUrl: vi.fn(async (key: string) => `https://signed.example/${key}`) }));

const { appRouter } = await import("./routers");
import { buildFileMetadata } from "./fileRoutes";
import type { TrpcContext } from "./_core/context";

function context(user: TrpcContext["user"]): TrpcContext {
  return { user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}
const user = { id: 7, openId: "user-7", email: "user@example.com", name: "User", loginMethod: "manus", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };

describe("files access control and library behavior", () => {
  beforeEach(() => {
    state.files = [
      { id: 1, userId: 7, name: "notes.md", size: 120, mimeType: "text/markdown", storageKey: "user-7/notes", uploadedAt: new Date("2026-01-01"), shareToken: null },
      { id: 2, userId: 7, name: "cover.png", size: 2048, mimeType: "image/png", storageKey: "user-7/cover", uploadedAt: new Date("2026-01-02"), shareToken: "share-2" },
    ];
  });

  it("allows visitors to browse public files and create public signed links", async () => {
    const caller = appRouter.createCaller(context(null));
    const publicFiles = await caller.files.publicList({ search: "cover" });
    expect(publicFiles).toHaveLength(1);
    expect(publicFiles[0]).toMatchObject({ id: 2, name: "cover.png", isOwner: false });
    expect(publicFiles[0]).not.toHaveProperty("userId");
    await expect(caller.files.publicDownload({ id: 2 })).resolves.toEqual({ url: "https://signed.example/user-7/cover" });
  });

  it("builds safe persistent metadata without file bytes", () => {
    expect(buildFileMetadata(7, "../draft<final>.pdf", 4096, "application/pdf", "user-7/files/key")).toEqual({
      userId: 7,
      name: "draft-final-.pdf",
      size: 4096,
      mimeType: "application/pdf",
      storageKey: "user-7/files/key",
    });
  });

  it("rejects anonymous library reads and download links", async () => {
    const caller = appRouter.createCaller(context(null));
    await expect(caller.files.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.files.download({ id: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("lists only the signed-in user's files and passes search through", async () => {
    const caller = appRouter.createCaller(context(user));
    await expect(caller.files.list({ search: "notes" })).resolves.toHaveLength(1);
    await expect(caller.files.list()).resolves.toHaveLength(2);
  });

  it("creates a download URL only for owned files", async () => {
    const caller = appRouter.createCaller(context(user));
    await expect(caller.files.download({ id: 1 })).resolves.toEqual({ url: "https://signed.example/user-7/notes" });
    await expect(caller.files.download({ id: 999 })).rejects.toThrow("File not found");
  });

  it("enables sharing and preserves an existing share token", async () => {
    const caller = appRouter.createCaller(context(user));
    const created = await caller.files.setSharing({ id: 1, enabled: true });
    expect(created.shareToken).toEqual(expect.any(String));
    await expect(caller.files.setSharing({ id: 2, enabled: true })).resolves.toEqual({ shareToken: "share-2" });
  });

  it("deletes only an owned file record", async () => {
    const caller = appRouter.createCaller(context(user));
    await expect(caller.files.remove({ id: 1 })).resolves.toEqual({ success: true });
    await expect(caller.files.list()).resolves.toHaveLength(1);
  });
});
