import { and, desc, eq, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertFile, InsertUser, files, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  (['name', 'email', 'loginMethod'] as const).forEach(field => {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  });
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (!Object.keys(updateSet).length) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function listFiles(userId: number, search?: string) {
  const db = await getDb();
  if (!db) return [];
  const searchFilter = search?.trim()
    ? or(like(files.name, `%${search.trim()}%`), like(files.mimeType, `%${search.trim()}%`))
    : undefined;
  return db.select().from(files).where(searchFilter ? and(eq(files.userId, userId), searchFilter) : eq(files.userId, userId)).orderBy(desc(files.uploadedAt));
}

export async function insertFile(file: InsertFile) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  const result = await db.insert(files).values(file);
  return Number(result[0].insertId);
}

export async function getFileForUser(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(files).where(and(eq(files.id, id), eq(files.userId, userId))).limit(1);
  return result[0];
}

export async function getFileByShareToken(shareToken: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(files).where(eq(files.shareToken, shareToken)).limit(1);
  return result[0];
}

export async function setShareToken(id: number, userId: number, shareToken: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  await db.update(files).set({ shareToken }).where(and(eq(files.id, id), eq(files.userId, userId)));
}

export async function deleteFile(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  await db.delete(files).where(and(eq(files.id, id), eq(files.userId, userId)));
}
