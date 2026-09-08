// PostgreSQL thật, auth/scope/actions thật; chỉ giả request context và dịch vụ ngoài.
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createRequire } from "node:module";
import { PrismaClient, type Prisma } from "@prisma/client";

const context = vi.hoisted(() => {
  const raw = process.env.CC_B01_DATABASE_URL;
  if (!raw) throw new Error("Cần CC_B01_DATABASE_URL trỏ tới DB test riêng.");
  const url = new URL(raw);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/cc_b01_test") throw new Error("Sai DB test.");
  const schema = `cc_security_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  url.searchParams.set("schema", schema); url.searchParams.set("connection_limit", "30");
  return { url: url.toString(), schema };
});
const requests = new AsyncLocalStorage<{ token: string; nextToken?: string; basic?: string }>();
// React 18 package không có cache ngoài môi trường RSC của Next; mỗi lời gọi ở đây là request mới.
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { prisma: new PrismaClient({ datasources: { db: { url: context.url } } }) };
});
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => ({ value: requests.getStore()?.token }),
    set: (_name: string, token: string) => { requests.getStore()!.nextToken = token; },
    delete: vi.fn(),
  }),
  headers: async () => new Headers(requests.getStore()?.basic ? { authorization: requests.getStore()!.basic! } : {}),
}));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notify: vi.fn(), workerUserIdOfBarn: vi.fn() }));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

import { prisma } from "@/lib/db";
import { getSessionUser, getChildSessionUser, getCurrentSession, requireUser, hashPassword } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { daXacMinhGanDay, dongDauXacMinh } from "@/lib/family";
import { changeSessionScope } from "@/lib/session-scope";
import { taoMongMuon } from "@/lib/de-xuat";
import { MONG_MUON, TRAN_CARE_WISH_TUAN } from "@/lib/de-xuat-meta";
import { upsertTask } from "@/lib/task-store";
import { vaoKhuCuaBe, moCuaRaNgoai, guiMongMuon, nhoCoChuLam, boQuaMongMuon, batDauBai } from "@/app/learning-actions";
import { cancelTask } from "@/app/task-actions";
import { completeTask, declineTask } from "@/app/worker-actions";

const { assertSessionSchema } = createRequire(import.meta.url)("../scripts/check-session-schema.cjs") as {
  assertSessionSchema: (db: PrismaClient | Prisma.TransactionClient) => Promise<void>;
};
const admin = new PrismaClient({ datasources: { db: { url: context.url } } });
let scratch: string;
let passwordHash: string;
let beforeMigrationError = "";
let legacySessionId: string;
const password = "Mat-khau-test-2026";

async function request<T>(token: string, fn: () => Promise<T>, basic?: string) {
  const jar = { token, basic, nextToken: undefined as string | undefined };
  const result = await requests.run(jar, fn);
  return { result, token: jar.nextToken ?? token };
}
function runSql(path: string) {
  execFileSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "db", "execute", "--url", context.url, "--file", path], { stdio: "pipe" });
}
async function fixture() {
  const key = randomUUID();
  const owner = await prisma.user.create({ data: { email: `${key}@example.invalid`, passwordHash } });
  const workerUser = await prisma.user.create({ data: { email: `w-${key}@example.invalid`, role: "WORKER" } });
  const farm = await prisma.farm.create({ data: { name: "Farm test", address: "Test" } });
  const zone = await prisma.zone.create({ data: { farmId: farm.id, name: "Test" } });
  const worker = await prisma.farmWorker.create({ data: { userId: workerUser.id, farmId: farm.id, name: "Test", area: "Test" } });
  const barn = await prisma.barn.create({ data: { slug: key, label: "Test", ownerId: owner.id, workerId: worker.id, zoneId: zone.id } });
  const enrollment = await prisma.familyEnrollment.create({ data: {
    barnId: barn.id, parentId: owner.id, status: "ACTIVE", cohortKey: "test", programVersion: "test", barnLiveKey: barn.id,
  } });
  const child = await prisma.childProfile.create({ data: {
    parentId: owner.id, nickname: "Bé test", ageBand: "AGE_5_6", avatarKey: "ga", status: "ACTIVE",
    links: { create: { enrollmentId: enrollment.id } },
  } });
  const session = await prisma.session.create({ data: {
    token: randomUUID(), userId: owner.id, expiresAt: new Date(Date.now() + 86_400_000), reauthAt: new Date(),
  } });
  return { owner, worker, barn, enrollment, child, session };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function suggestion(f: Fixture, optionKey = "CHO_AN_RAU") {
  const result = await taoMongMuon({ childId: f.child.id, parentId: f.owner.id, enrollmentId: f.enrollment.id, optionKey });
  expect(result.ok).toBe(true);
  return prisma.childSuggestion.findFirstOrThrow({ where: { childId: f.child.id, optionKey } });
}

beforeAll(async () => {
  process.env.FAMILY_LEARNING_ENABLED = "true";
  process.env.ADMIN_PASSWORD = "scope-test-admin";
  passwordHash = await hashPassword(password);
  if (!/^cc_security_[a-z0-9_]+$/.test(context.schema)) throw new Error("Sai schema test.");
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${context.schema}"`);
  scratch = mkdtempSync(join(tmpdir(), "cc-security-integration-"));
  const schemaFile = join(scratch, "before.prisma");
  writeFileSync(schemaFile, execFileSync("git", ["show", "60f7b87:prisma/schema.prisma"], { encoding: "utf8" }), "utf8");
  const sqlFile = join(scratch, "before.sql");
  execFileSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "diff", "--from-empty",
    "--to-schema-datamodel", schemaFile, "--script", "--output", sqlFile], { stdio: "pipe" });
  runSql(sqlFile);
  runSql(resolve("prisma/migrations/202609070001_cc_b01/migration.sql"));
  const legacyUser = await prisma.user.create({ data: { email: `legacy-${randomUUID()}@example.invalid` } });
  legacySessionId = randomUUID();
  await prisma.$executeRaw`INSERT INTO "Session" (id, token, "userId", "expiresAt") VALUES
    (${legacySessionId}, ${randomUUID()}, ${legacyUser.id}, ${new Date(Date.now() + 86_400_000)})`;
  try { await assertSessionSchema(prisma); } catch (e) { beforeMigrationError = (e as Error).message; }
  runSql(resolve("prisma/migrations/202609080001_session_scope/migration.sql"));
});
afterAll(async () => {
  await prisma.$disconnect();
  if (/^cc_security_[a-z0-9_]+$/.test(context.schema)) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${context.schema}" CASCADE`);
  await admin.$disconnect();
  if (scratch && resolve(scratch).startsWith(resolve(tmpdir()) + sep) && scratch.includes("cc-security-integration-")) rmSync(scratch, { recursive: true });
});

describe("CC-B08 · quyền phiên thật", () => {
  it("gate từ chối DB cũ hoặc thiếu CHECK, chấp nhận migration đủ", async () => {
    const legacy = await prisma.session.findUniqueOrThrow({ where: { id: legacySessionId } });
    expect(legacy.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(beforeMigrationError).toContain("Session.scope");
    await assertSessionSchema(prisma);
    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('ALTER TABLE "Session" DROP CONSTRAINT "Session_scope_check"');
      await assertSessionSchema(tx);
    })).rejects.toThrow("Session_scope_check");
    await assertSessionSchema(prisma);
  });
  it("vào CHILD đổi token, xóa reauth, chặn adult action/API và Basic Admin", async () => {
    const f = await fixture();
    const entered = await request(f.session.token, () => vaoKhuCuaBe({ childId: f.child.id }));
    expect(entered.result.ok).toBe(true);
    expect(entered.token !== f.session.token).toBe(true);
    expect((await request(f.session.token, getCurrentSession)).result).toBeNull();
    expect((await request(entered.token, getSessionUser)).result).toBeNull();
    expect((await request(entered.token, () => getChildSessionUser(f.child.id))).result?.id).toBe(f.owner.id);
    expect((await request(entered.token, daXacMinhGanDay)).result).toBe(false);
    expect((await request(entered.token, dongDauXacMinh)).result).toBe(false);
    expect((await request(entered.token, isAdmin, `Basic ${Buffer.from("admin:scope-test-admin").toString("base64")}`)).result).toBe(false);
    const task = await upsertTask({ barnId: f.barn.id, workerId: f.worker.id, kind: "FEED", title: "Test" });
    expect((await request(entered.token, () => cancelTask(task.taskId))).result.ok).toBe(false);
    expect(await prisma.barnTask.count({ where: { id: task.taskId } })).toBe(1);
    await expect(request(entered.token, () => requireUser("/cho"))).rejects.toThrow(`REDIRECT:/be/${f.child.id}`);
    expect(await prisma.sessionScopeEvent.count({ where: { sessionId: f.session.id } })).toBe(1);
  });
  it("sai cha mẹ / sai bé / scope ADULT không gọi được child action", async () => {
    const f = await fixture(); const other = await fixture();
    expect((await request(f.session.token, () => vaoKhuCuaBe({ childId: other.child.id }))).result.ok).toBe(false);
    expect((await request(f.session.token, () => guiMongMuon({ childId: f.child.id, optionKey: "CHO_AN_RAU" }))).result.ok).toBe(false);
    const entered = await request(f.session.token, () => vaoKhuCuaBe({ childId: f.child.id }));
    expect((await request(entered.token, () => guiMongMuon({ childId: other.child.id, optionKey: "CHO_AN_RAU" }))).result.ok).toBe(false);
    expect((await request(entered.token, () => batDauBai({ momentId: "nonexistent" }))).result.ok).toBe(false);
    expect((await request(entered.token, () => guiMongMuon({ childId: f.child.id, optionKey: "CHO_AN_RAU" }))).result.ok).toBe(true);
  });
  it("mật khẩu sai không đổi quyền; ra đúng đổi token/audit, không mở reauth; Family tắt vẫn ra được", async () => {
    const f = await fixture();
    const entered = await request(f.session.token, () => vaoKhuCuaBe({ childId: f.child.id }));
    expect((await request(entered.token, () => moCuaRaNgoai({ password: "sai" }))).result.ok).toBe(false);
    process.env.FAMILY_LEARNING_ENABLED = "false";
    try {
      const exited = await request(entered.token, () => moCuaRaNgoai({ password }));
      expect(exited.result.ok).toBe(true);
      expect((await request(entered.token, getCurrentSession)).result).toBeNull();
      expect((await request(exited.token, getSessionUser)).result?.id).toBe(f.owner.id);
      expect((await request(exited.token, daXacMinhGanDay)).result).toBe(false);
      expect(await prisma.sessionScopeEvent.count({ where: { sessionId: f.session.id } })).toBe(2);
    } finally { process.env.FAMILY_LEARNING_ENABLED = "true"; }
  });
  it("25 CAS cùng snapshot chỉ một lần chuyển quyền/audit; snapshot cũ không mở lượt CHILD mới", async () => {
    const f = await fixture();
    const results = await Promise.all(Array.from({ length: 25 }, () => changeSessionScope(f.session, "CHILD", f.child.id)));
    expect(results.filter(Boolean)).toHaveLength(1);
    const child = await prisma.session.findUniqueOrThrow({ where: { id: f.session.id } });
    expect(await changeSessionScope(child, "ADULT", null)).toBe(true);
    const adult = await prisma.session.findUniqueOrThrow({ where: { id: f.session.id } });
    expect(await changeSessionScope(adult, "CHILD", f.child.id)).toBe(true);
    expect(await changeSessionScope(child, "ADULT", null)).toBe(false);
    expect(await prisma.sessionScopeEvent.count({ where: { sessionId: f.session.id } })).toBe(3);
  });
  it("validation hỏng rollback cả scope/audit; phiên hết hạn không được chuyển quyền", async () => {
    const f = await fixture();
    await expect(changeSessionScope(f.session, "CHILD", f.child.id, async () => false)).rejects.toThrow("SESSION_SCOPE_TARGET_CLOSED");
    expect((await prisma.session.findUniqueOrThrow({ where: { id: f.session.id } })).scope).toBe("ADULT");
    expect(await prisma.sessionScopeEvent.count({ where: { sessionId: f.session.id } })).toBe(0);
    await prisma.session.update({ where: { id: f.session.id }, data: { expiresAt: new Date(0) } });
    expect(await changeSessionScope(f.session, "CHILD", f.child.id)).toBe(false);
  });
  it("rút consent đóng child action; rollback thu hồi CHILD và giữ audit", async () => {
    const f = await fixture();
    const entered = await request(f.session.token, () => vaoKhuCuaBe({ childId: f.child.id }));
    await prisma.childProfile.update({ where: { id: f.child.id }, data: { status: "CONSENT_WITHDRAWN" } });
    expect((await request(entered.token, () => guiMongMuon({ childId: f.child.id, optionKey: "CHO_AN_RAU" }))).result.ok).toBe(false);
    runSql(resolve("prisma/migrations/202609080001_session_scope/rollback.sql"));
    expect((await request(entered.token, getCurrentSession)).result).toBeNull();
    expect(await prisma.sessionScopeEvent.count({ where: { sessionId: f.session.id } })).toBe(1);
  });
});

describe("Family · idempotency/CAS với DB", () => {
  it("25 mong muốn trùng tạo một dòng; nhiều bé dùng chung trần tuần", async () => {
    const f = await fixture();
    const input = { parentId: f.owner.id, enrollmentId: f.enrollment.id, childId: f.child.id, optionKey: "CHO_AN_RAU" };
    const results = await Promise.all(Array.from({ length: 25 }, () => taoMongMuon(input)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await prisma.childProfile.findUniqueOrThrow({ where: { id: f.child.id } })).updatedAt).toEqual(f.child.updatedAt);
    expect((await prisma.familyEnrollment.findUniqueOrThrow({ where: { id: f.enrollment.id } })).updatedAt).toEqual(f.enrollment.updatedAt);
    const sibling = await prisma.childProfile.create({ data: {
      parentId: f.owner.id, nickname: "Bé khác", ageBand: "AGE_5_6", avatarKey: "ga", status: "ACTIVE",
      links: { create: { enrollmentId: f.enrollment.id } },
    } });
    await Promise.all(MONG_MUON.filter((m) => m.kind === "CARE_WISH").flatMap((m) => [f.child.id, sibling.id]
      .map((childId) => taoMongMuon({ ...input, childId, optionKey: m.key }))));
    expect(await prisma.childSuggestion.count({ where: { enrollmentId: f.enrollment.id, kind: "CARE_WISH" } })).toBe(TRAN_CARE_WISH_TUAN);
  });
  it("25 upsert cùng loại trả một taskId; không sửa task DONE", async () => {
    const f = await fixture(); const input = { barnId: f.barn.id, workerId: f.worker.id, kind: "FEED" as const, title: "V1" };
    const results = await Promise.all(Array.from({ length: 25 }, () => upsertTask(input)));
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.taskId)).size).toBe(1);
    await prisma.barnTask.update({ where: { id: results[0].taskId }, data: { status: "DONE" } });
    const next = await upsertTask({ ...input, title: "V2" });
    expect(next.created).toBe(true);
    expect((await prisma.barnTask.findUniqueOrThrow({ where: { id: results[0].taskId } })).title).toBe("V1");
  });
  it("25 lượt duyệt chỉ một task; child không được duyệt; retry không nhân đôi", async () => {
    const f = await fixture(); const row = await suggestion(f);
    const childSession = await prisma.session.create({ data: {
      token: randomUUID(), userId: f.owner.id, scope: "CHILD", scopeChildId: f.child.id, expiresAt: new Date(Date.now() + 86_400_000),
    } });
    expect((await request(childSession.token, () => nhoCoChuLam({ id: row.id }))).result.ok).toBe(false);
    const results = await Promise.all(Array.from({ length: 25 }, () => request(f.session.token, () => nhoCoChuLam({ id: row.id }))));
    expect(results.every((r) => r.result.ok)).toBe(true);
    expect(await prisma.barnTask.count({ where: { barnId: f.barn.id } })).toBe(1);
    expect((await prisma.childSuggestion.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("REVIEWED");
  });
  it("duyệt và bỏ qua đồng thời chỉ một kết quả; task khớp kết quả", async () => {
    const f = await fixture(); const row = await suggestion(f);
    await Promise.all([
      request(f.session.token, () => nhoCoChuLam({ id: row.id })),
      request(f.session.token, () => boQuaMongMuon({ id: row.id })),
    ]);
    const saved = await prisma.childSuggestion.findUniqueOrThrow({ where: { id: row.id } });
    expect(await prisma.barnTask.count({ where: { barnId: f.barn.id } })).toBe(saved.status === "REVIEWED" ? 1 : 0);
  });
  it("DB từ chối tạo task: rollback trạng thái mong muốn, retry thành công", async () => {
    const f = await fixture(); const row = await suggestion(f);
    await prisma.$executeRawUnsafe(`CREATE FUNCTION fail_task_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST_TASK_FAILURE'; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_task_test BEFORE INSERT ON "BarnTask" FOR EACH ROW EXECUTE FUNCTION fail_task_test()`);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect((await request(f.session.token, () => nhoCoChuLam({ id: row.id }))).result.ok).toBe(false);
      expect((await prisma.childSuggestion.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("PENDING");
      expect(await prisma.barnTask.count({ where: { barnId: f.barn.id } })).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER fail_task_test ON "BarnTask"');
      await prisma.$executeRawUnsafe('DROP FUNCTION fail_task_test()'); spy.mockRestore();
    }
    expect((await request(f.session.token, () => nhoCoChuLam({ id: row.id }))).result.ok).toBe(true);
  });
  it("complete/decline/upsert việc thường đồng thời không deadlock, proof chỉ ghi một lần", async () => {
    const f = await fixture();
    const workerSession = await prisma.session.create({ data: {
      token: randomUUID(), userId: f.worker.userId!, expiresAt: new Date(Date.now() + 86_400_000),
    } });
    const input = { barnId: f.barn.id, workerId: f.worker.id, kind: "RANGE_OUT" as const, title: "Thả vườn" };
    const task = await upsertTask(input);
    const proof = new FormData(); proof.set("url", "https://proof.example.invalid/task.jpg");
    await Promise.all([
      ...Array.from({ length: 10 }, () => request(workerSession.token, () => completeTask(task.taskId, proof))),
      request(workerSession.token, () => declineTask(task.taskId, "Chưa phù hợp hôm nay")),
      ...Array.from({ length: 10 }, () => upsertTask(input)),
    ]);
    const saved = await prisma.barnTask.findUniqueOrThrow({ where: { id: task.taskId } });
    expect(["DONE", "DECLINED"]).toContain(saved.status);
    expect(await prisma.barnMedia.count({ where: { barnId: f.barn.id } })).toBe(saved.status === "DONE" ? 1 : 0);
    expect(await prisma.barnTask.count({ where: { barnId: f.barn.id, status: "OPEN" } })).toBeLessThanOrEqual(1);
  });
});
