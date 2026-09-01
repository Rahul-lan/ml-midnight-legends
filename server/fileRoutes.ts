import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { insertFile, getFileByShareToken } from "./db";
import { storageGetSignedUrl, storagePut } from "./storage";
import { nanoid } from "nanoid";

const MAX_FILE_BYTES = 250 * 1024 * 1024;

export function safeFileName(rawName: string) {
  const decoded = decodeURIComponent(rawName || "untitled").replace(/\\/g, "/");
  const base = decoded.split("/").pop() || "untitled";
  return base.replace(/[\u0000-\u001f<>:"/\\|?*]/g, "-").trim().slice(0, 180) || "untitled";
}

export function buildFileMetadata(userId: number, name: string, size: number, mimeType: string, storageKey: string) {
  return { userId, name: safeFileName(name), size, mimeType: mimeType.slice(0, 255), storageKey };
}

export function registerFileRoutes(app: Express) {
  app.post("/api/files/upload", async (req: Request, res: Response) => {
    try {
      let user;
      try {
        user = await sdk.authenticateRequest(req);
      } catch {
        user = null;
      }
      if (!user) {
        res.status(401).json({ error: "Sign in required" });
        return;
      }
      const body = req.body as Buffer;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        res.status(400).json({ error: "File payload is empty" });
        return;
      }
      if (body.length > MAX_FILE_BYTES) {
        res.status(413).json({ error: "Files must be 250 MB or smaller" });
        return;
      }
      const name = safeFileName(String(req.header("x-file-name") || "untitled"));
      const mimeType = String(req.header("x-file-type") || "application/octet-stream").slice(0, 255);
      const key = `user-${user.id}/files/${nanoid(14)}-${name}`;
      const stored = await storagePut(key, body, mimeType);
      const id = await insertFile(buildFileMetadata(user.id, name, body.length, mimeType, stored.key));
      res.status(201).json({ id, name, size: body.length, mimeType, uploadedAt: new Date().toISOString() });
    } catch (error) {
      console.error("[Files] Upload failed:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Upload failed" });
    }
  });

  app.get("/api/files/share/:token", async (req: Request, res: Response) => {
    try {
      const token = String(req.params.token || "");
      const file = await getFileByShareToken(token);
      if (!file) {
        res.status(404).send("This share link is no longer available.");
        return;
      }
      const signedUrl = await storageGetSignedUrl(file.storageKey);
      res.redirect(302, signedUrl);
    } catch (error) {
      console.error("[Files] Share delivery failed:", error);
      res.status(500).send("Unable to deliver this file.");
    }
  });
}
