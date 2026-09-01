import { describe, expect, it, vi } from "vitest";

const sharedFiles: any[] = [];
const insertFile = vi.fn(async (file: any) => { sharedFiles.push({ ...file, id: 42, uploadedAt: new Date() }); return 42; });
const getFileById = vi.fn(async (id: number) => sharedFiles.find(file => file.id === id));
const listPublicFiles = vi.fn(async () => sharedFiles);
const storagePut = vi.fn(async () => ({ key: "public/files/key", url: "/manus-storage/public/files/key" }));
const storageGetSignedUrl = vi.fn(async (key: string) => `https://signed.example/${key}`);
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: vi.fn(async () => null) } }));
vi.mock("./db", () => ({ insertFile, getFileById, getFileByShareToken: vi.fn(), listPublicFiles }));
vi.mock("./storage", () => ({ storagePut, storageGetSignedUrl }));

const { registerFileRoutes } = await import("./fileRoutes");
const { appRouter } = await import("./routers");
import type { TrpcContext } from "./_core/context";

function context(user: TrpcContext["user"]): TrpcContext {
  return { user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("public file route integration", () => {
  it("carries an authenticated upload into the anonymous public flow", async () => {
    sharedFiles.length = 0;
    const routes: Record<string, (req: any, res: any) => Promise<void>> = {};
    registerFileRoutes({ post: (path: string, handler: any) => { routes[`POST ${path}`] = handler; }, get: (path: string, handler: any) => { routes[`GET ${path}`] = handler; } } as any);

    const uploadResponse = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await routes["POST /api/files/upload"]({ body: Buffer.from("hello"), header: (name: string) => name === "x-file-name" ? encodeURIComponent("hello.txt") : "text/plain" }, uploadResponse);
    expect(insertFile).toHaveBeenCalledWith(expect.objectContaining({ userId: null, name: "hello.txt", size: 5, mimeType: "text/plain", storageKey: "public/files/key" }));

    const visitor = appRouter.createCaller(context(null));
    await expect(visitor.files.publicList()).resolves.toMatchObject([{ id: 42, name: "hello.txt" }]);
    const publicResponse = { redirect: vi.fn() };
    await routes["GET /api/files/public/:id"]({ params: { id: "42" } }, publicResponse);
    await expect(visitor.files.publicDownload({ id: 42 })).resolves.toEqual({ url: "https://signed.example/public/files/key" });
    expect(publicResponse.redirect).toHaveBeenCalledWith(302, "https://signed.example/public/files/key");
  });
});
