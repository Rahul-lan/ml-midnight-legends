import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { deleteFile, getFileById, getFileForUser, listFiles, listPublicFiles, setShareToken } from "./db";
import { storageGetSignedUrl } from "./storage";
import { nanoid } from "nanoid";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  files: router({
    publicList: publicProcedure.input(z.object({ search: z.string().optional() }).optional()).query(async ({ ctx, input }) => {
      const publicFiles = await listPublicFiles(input?.search);
      return publicFiles.map(({ userId, ...file }) => ({ ...file, isOwner: ctx.user?.id === userId }));
    }),
    publicDownload: publicProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
      const file = await getFileById(input.id);
      if (!file) throw new Error("File not found");
      return { url: await storageGetSignedUrl(file.storageKey) };
    }),
    list: protectedProcedure.input(z.object({ search: z.string().optional() }).optional()).query(({ ctx, input }) => listFiles(ctx.user.id, input?.search)),
    download: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const file = await getFileForUser(input.id, ctx.user.id);
      if (!file) throw new Error("File not found");
      return { url: await storageGetSignedUrl(file.storageKey) };
    }),
    setSharing: protectedProcedure.input(z.object({ id: z.number().int().positive(), enabled: z.boolean() })).mutation(async ({ ctx, input }) => {
      const file = await getFileForUser(input.id, ctx.user.id);
      if (!file) throw new Error("File not found");
      const shareToken = input.enabled ? (file.shareToken ?? nanoid(18)) : null;
      await setShareToken(input.id, ctx.user.id, shareToken);
      return { shareToken };
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const file = await getFileForUser(input.id, ctx.user.id);
      if (!file) throw new Error("File not found");
      await deleteFile(input.id, ctx.user.id);
      return { success: true } as const;
    }),
  }),
});

export type AppRouter = typeof appRouter;
