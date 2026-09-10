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
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));
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
import { nhanLoiMoiGiaDinh } from "@/app/family-actions";
import { saveDecorCatalog } from "@/app/catalog-actions";
import { createDecorOrder, reportDecorTransfer } from "@/app/decor-actions";
import { renameBird, renameBarn, installDecor, removeDecor, wearGear, removeGear, setDecorText, saveDecorLayout, reportTransfer } from "@/app/actions";
import { setDecorStock, deleteBarn, reassignBarn } from "@/app/admin-actions";
import { listLot, cancelListing } from "@/app/market-actions";
import { confirmDecorPaid, confirmMarketPaid } from "@/lib/payments";
import { decorProofSnapshot } from "@/lib/decor-proof";
import { moKhuCuaBe } from "@/lib/bai-hoc";
import { POST as reserveBarn } from "@/app/api/reservations/route";
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
  const { assertCatalogSchema } = createRequire(import.meta.url)("../scripts/check-catalog-schema.cjs");
  await expect(assertCatalogSchema(prisma)).rejects.toThrow("schema danh mục");
  runSql(resolve("prisma/migrations/202609080002_experience_catalog/migration.sql"));
  await assertCatalogSchema(prisma);
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


// Trải nghiệm 09/09: cổng quyền, tranh chấp và rollback dùng DB thật.
const basicAdmin = 'Basic ' + Buffer.from('admin:scope-test-admin').toString('base64');
async function farmFixture() {
  const f = await fixture();
  await prisma.familyEnrollment.update({ where: { id: f.enrollment.id }, data: { status: 'COMPLETED', barnLiveKey: null } });
  const key = randomUUID();
  const breed = await prisma.breed.create({ data: { slug: key, name: 'Gà Mía', layer: true, broiler: true } });
  const plan = await prisma.feedingPlan.create({ data: { slug: key, name: 'Quê', ratio: 'Ngô thóc' } });
  const flock = await prisma.flock.create({ data: { barnId: f.barn.id, productLine: 'LAYER', breedId: breed.id, feedingPlanId: plan.id, size: 3, stage: 'GROWING',
    birds: { create: [1,2,3].map((i) => ({ tagCode: 'L-' + i })) } }, include: { birds: true } });
  const workerSession = await prisma.session.create({ data: { token: randomUUID(), userId: f.worker.userId!, expiresAt: new Date(Date.now()+86400000) } });
  return { ...f, flock, breed, plan, workerSession };
}
async function itemFixture(wearable = false, stockQty = 20) {
  return prisma.decorItem.create({ data: { slug: randomUUID(), name: wearable ? 'Yếm đỏ' : 'Biển tên', svgKey: wearable ? 'yem' : 'bien', wearable,
    colorHex: wearable ? '#CC4433' : null, priceVnd: 45000, stockQty } });
}
async function paidInventory(f: Fixture, itemId: string, qty = 2) {
  return prisma.decorOrder.create({ data: { barnId: f.barn.id, userId: f.owner.id, paymentStatus: 'CONFIRMED', totalVnd: 45000 * qty,
    items: { create: { itemId, qty, priceVnd: 45000 } } } });
}
function proof(kind?: string, snapshot?: unknown) {
  const fd = new FormData(); fd.set('url', 'https://proof.example.invalid/experience.jpg');
  if (kind) fd.set(kind, typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot));
  return fd;
}
async function withBrokenTask(barnId: string, fn: () => Promise<void>) {
  if (!/^[a-z0-9]+$/.test(barnId)) throw new Error('Sai id fixture');
  await prisma.$executeRawUnsafe('CREATE FUNCTION fail_experience_task() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."barnId" = \'' + barnId + '\' THEN RAISE EXCEPTION \'test rollback\'; END IF; RETURN NEW; END $$');
  await prisma.$executeRawUnsafe('CREATE TRIGGER fail_experience_task BEFORE INSERT OR UPDATE ON "BarnTask" FOR EACH ROW EXECUTE FUNCTION fail_experience_task()');
  try { await fn(); } finally {
    await prisma.$executeRawUnsafe('DROP TRIGGER fail_experience_task ON "BarnTask"');
    await prisma.$executeRawUnsafe('DROP FUNCTION fail_experience_task()');
  }
}

describe('Trải nghiệm: Family tự mở với cam kết của phụ huynh', () => {
  it('25 lượt xác nhận không lời mời chỉ tạo một suất, một sự kiện và một bài chào', async () => {
    const f = await farmFixture();
    const join = () => request(f.session.token, () => nhanLoiMoiGiaDinh({ barnSlug: f.barn.slug, childId: f.child.id, xacNhan: true }));
    const results = await Promise.all(Array.from({ length: 25 }, join));
    expect(results.every((r) => r.result.ok)).toBe(true);
    const active = await prisma.familyEnrollment.findMany({ where: { barnId: f.barn.id, status: 'ACTIVE' } });
    expect(active).toHaveLength(1); expect(active[0].acceptedAt).not.toBeNull();
    expect(await prisma.childBarnLink.count({ where: { enrollmentId: active[0].id } })).toBe(1);
    expect(await prisma.domainEvent.count({ where: { barnId: f.barn.id, type: 'FAMILY_ENROLLED' } })).toBe(1);
    expect(await prisma.learningMoment.count({ where: { childId: f.child.id } })).toBe(1);
    const flock = await prisma.flock.findUniqueOrThrow({ where: { id: f.flock.id } });
    expect(flock.lifecyclePolicy).toBe('FAMILY_RETIRE_ONLY'); expect(flock.stage).toBe('GROWING');
    expect(await prisma.bird.count({ where: { flockId: f.flock.id, status: 'ALIVE' } })).toBe(3);
  });
  it('không vượt quyền cha mẹ, assent, LAYER hay xác nhận bắt buộc', async () => {
    const f = await farmFixture(), other = await fixture();
    const join = (token = f.session.token, confirm = true) => request(token, () => nhanLoiMoiGiaDinh({ barnSlug: f.barn.slug, childId: f.child.id, xacNhan: confirm }));
    expect((await join(other.session.token)).result.ok).toBe(false);
    expect((await join(f.workerSession.token)).result.ok).toBe(false);
    expect((await join(f.session.token, false)).result.ok).toBe(false);
    await prisma.childProfile.update({ where: { id: f.child.id }, data: { status: 'DRAFT' } });
    expect((await join()).result.ok).toBe(false);
    await prisma.childProfile.update({ where: { id: f.child.id }, data: { status: 'ACTIVE' } });
    await prisma.flock.update({ where: { id: f.flock.id }, data: { productLine: 'BROILER' } });
    expect((await join()).result.ok).toBe(false);
    expect(await prisma.domainEvent.count({ where: { barnId: f.barn.id } })).toBe(0);
  });
  it('không tự mở lại PAUSED, thêm anh chị em không tạo lại event; trả chuồng đóng cổng trẻ', async () => {
    const f = await farmFixture();
    const join = (childId = f.child.id) => request(f.session.token, () => nhanLoiMoiGiaDinh({ barnSlug: f.barn.slug, childId, xacNhan: true }));
    expect((await join()).result.ok).toBe(true);
    const active = await prisma.familyEnrollment.findUniqueOrThrow({ where: { barnLiveKey: f.barn.id } });
    await prisma.familyEnrollment.update({ where: { id: active.id }, data: { status: 'PAUSED' } });
    expect((await join()).result.ok).toBe(false);
    await prisma.familyEnrollment.update({ where: { id: active.id }, data: { status: 'ACTIVE' } });
    const sibling = await prisma.childProfile.create({ data: { parentId: f.owner.id, nickname: 'Em', ageBand: 'AGE_5_6', avatarKey: 'ga', status: 'ACTIVE' } });
    expect((await join(sibling.id)).result.ok).toBe(true);
    expect(await prisma.domainEvent.count({ where: { barnId: f.barn.id, type: 'FAMILY_ENROLLED' } })).toBe(1);
    expect(await moKhuCuaBe(f.owner.id, sibling.id)).not.toBeNull();
    await prisma.barn.update({ where: { id: f.barn.id }, data: { ownerId: null } });
    expect(await moKhuCuaBe(f.owner.id, sibling.id)).toBeNull();
    expect((await prisma.flock.findUniqueOrThrow({ where: { id: f.flock.id } })).lifecyclePolicy).toBe('FAMILY_RETIRE_ONLY');
  });
});

describe('Trải nghiệm: danh mục, tên và tồn kho', () => {
  it('admin tạo món mùa lễ; CAS ngừng bán, không sửa hình đã bán hay giá của đơn cũ', async () => {
    const f = await farmFixture();
    const input = { slug: randomUUID(), name: 'Đèn lồng Tết', svgKey: 'tet-lantern', priceVnd: 45000, stockQty: 4, active: true };
    expect((await request(f.session.token, () => saveDecorCatalog(input))).result.ok).toBe(false);
    const results = await Promise.all(Array.from({length: 10}, () => request(f.session.token, () => saveDecorCatalog(input), basicAdmin)));
    expect(results.filter((r) => r.result.ok)).toHaveLength(1);
    const item = await prisma.decorItem.findUniqueOrThrow({ where: { slug: input.slug } });
    const old = await paidInventory(f, item.id);
    const family = await fixture(); const entered = await request(family.session.token, () => vaoKhuCuaBe({ childId: family.child.id }));
    expect((await request(entered.token, () => saveDecorCatalog({ ...input, name: 'Không được đổi', expectedVersion: 0 }), basicAdmin)).result.ok).toBe(false);
    const edits = await Promise.all(Array.from({ length: 10 }, () => request(f.session.token, () => saveDecorCatalog({ ...input, priceVnd: 55000, active: false, expectedVersion: 0 }), basicAdmin)));
    expect(edits.filter((r) => r.result.ok)).toHaveLength(1);
    expect((await request(f.session.token, () => saveDecorCatalog({ ...input, svgKey: 'noel-tree', expectedVersion: 1 }), basicAdmin)).result.ok).toBe(false);
    expect((await request(f.session.token, () => createDecorOrder(f.barn.slug, [{ slug: input.slug, qty: 1 }]))).result.ok).toBe(false);
    expect((await prisma.decorOrderItem.findFirstOrThrow({ where: { orderId: old.id } })).priceVnd).toBe(45000);
    expect((await request(f.session.token, () => installDecor(f.barn.slug, item.slug, randomUUID()))).result.ok).toBe(true);
  });
  it('chỉ đổi tên đúng gà LAYER còn sống trong chuồng; giữ Unicode', async () => {
    const f = await farmFixture(), other = await fixture(); const bird = f.flock.birds[0];
    expect((await request(other.session.token, () => renameBird(f.barn.slug, bird.id, 'Sai'))).result.ok).toBe(false);
    expect((await request(f.session.token, () => renameBird(f.barn.slug, bird.id, '  Mơ 🌻  '))).result.ok).toBe(true);
    expect((await prisma.bird.findUniqueOrThrow({ where: { id: bird.id } })).name).toBe('Mơ 🌻');
    expect((await request(f.session.token, () => renameBarn(f.barn.slug, 'Vườn của Mơ'))).result.ok).toBe(true);
    await prisma.bird.update({ where: { id: bird.id }, data: { status: 'DECEASED' } });
    expect((await request(f.session.token, () => renameBird(f.barn.slug, bird.id, 'Sai'))).result.ok).toBe(false);
    await prisma.flock.update({ where: { id: f.flock.id }, data: { productLine: 'BROILER' } });
    expect((await request(f.session.token, () => renameBird(f.barn.slug, f.flock.birds[1].id, 'Sai'))).result.ok).toBe(false);
  });
  it('25 lượt mua giữ đúng một đơn, trừ một tồn; xác nhận lặp chỉ lắp một món và một việc', async () => {
    const f = await farmFixture(), item = await itemFixture(false, 2);
    const buys = await Promise.all(Array.from({ length: 25 }, () => request(f.session.token, () => createDecorOrder(f.barn.slug, [{ slug: item.slug, qty: 1 }]))));
    expect(buys.filter((r) => r.result.ok)).toHaveLength(1);
    expect((await prisma.decorItem.findUniqueOrThrow({ where: { id: item.id } })).stockQty).toBe(1);
    const order = await prisma.decorOrder.findFirstOrThrow({ where: { barnId: f.barn.id } });
    await Promise.all(Array.from({ length: 10 }, () => confirmDecorPaid(order.id, 'ADMIN')));
    await request(f.session.token, () => reportDecorTransfer(order.id));
    expect((await prisma.decorOrder.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe('CONFIRMED');
    expect(await prisma.barnDecor.count({ where: { barnId: f.barn.id } })).toBe(1);
    expect(await prisma.barnTask.count({ where: { barnId: f.barn.id, kind: 'DECOR' } })).toBe(1);
  });
  it('admin mua hộ lập hóa đơn cho chủ chuồng và đối soát được; chuồng đổi chủ thì chặn', async () => {
    const f = await farmFixture(), admin = await fixture(), item = await itemFixture(false, 2);
    await prisma.user.update({ where: { id: admin.owner.id }, data: { role: 'ADMIN' } });
    expect((await request(admin.session.token, () => createDecorOrder(f.barn.slug, [{ slug: item.slug, qty: 1 }]))).result.ok).toBe(true);
    const order = await prisma.decorOrder.findFirstOrThrow({ where: { barnId: f.barn.id } });
    expect(order.userId).toBe(f.owner.id);
    await prisma.barn.update({ where: { id: f.barn.id }, data: { ownerId: admin.owner.id } });
    expect((await confirmDecorPaid(order.id, 'ADMIN')).ok).toBe(false);
    expect((await prisma.decorOrder.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe('UNPAID');
    await prisma.barn.update({ where: { id: f.barn.id }, data: { ownerId: f.owner.id } });
    expect((await confirmDecorPaid(order.id, 'ADMIN')).ok).toBe(true);
    expect(await prisma.barnDecor.count({ where: { barnId: f.barn.id } })).toBe(1);
    expect(await prisma.barnTask.count({ where: { barnId: f.barn.id, kind: 'DECOR' } })).toBe(1);
  });
  it('hai chuồng tranh món cuối không âm kho; điều chỉnh từ snapshot cũ bị từ chối', async () => {
    const f = await farmFixture(), other = await farmFixture(), item = await itemFixture(false, 1);
    const rs = await Promise.all([f,other].map((x) => request(x.session.token, () => createDecorOrder(x.barn.slug, [{ slug: item.slug, qty: 1 }]))));
    expect(rs.filter((r) => r.result.ok)).toHaveLength(1);
    expect((await request(f.session.token, () => setDecorStock(item.slug, { delta: 2, expectedQty: 1 }), basicAdmin)).result.ok).toBe(false);
    const stocks = await Promise.all(Array.from({ length: 10 }, () => request(f.session.token, () => setDecorStock(item.slug, { delta: 2, expectedQty: 0 }), basicAdmin)));
    expect(stocks.filter((r) => r.result.ok)).toHaveLength(1);
    expect((await prisma.decorItem.findUniqueOrThrow({ where: { id: item.id } })).stockQty).toBe(2);
  });
  it('mất bước tạo việc rollback luôn xác nhận tiền và lắp món', async () => {
    const f = await farmFixture(), item = await itemFixture();
    await request(f.session.token, () => createDecorOrder(f.barn.slug, [{ slug: item.slug, qty: 1 }]));
    const order = await prisma.decorOrder.findFirstOrThrow({ where: { barnId: f.barn.id } });
    await withBrokenTask(f.barn.id, async () => { await expect(confirmDecorPaid(order.id, 'ADMIN')).rejects.toThrow(); });
    expect((await prisma.decorOrder.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe('UNPAID');
    expect(await prisma.barnDecor.count({ where: { barnId: f.barn.id } })).toBe(0);
    expect((await confirmDecorPaid(order.id, 'ADMIN')).ok).toBe(true);
  });
});

describe('Trải nghiệm: bản vẽ, yếm và minh chứng', () => {
  it('25 lượt lắp cùng khóa chỉ tạo một món; lỗi tạo việc rollback thay đổi chữ/bố cục', async () => {
    const f = await farmFixture(), item = await itemFixture(); await paidInventory(f, item.id, 3); const key = randomUUID();
    const rs = await Promise.all(Array.from({length: 25}, () => request(f.session.token, () => installDecor(f.barn.slug, item.slug, key))));
    expect(rs.every((r) => r.result.ok)).toBe(true);
    const decor = await prisma.barnDecor.findMany({ where: { barnId: f.barn.id } }); expect(decor).toHaveLength(1);
    await withBrokenTask(f.barn.id, async () => { await expect(request(f.session.token, () => setDecorText(f.barn.slug, decor[0].id, 'Mơ'))).rejects.toThrow(); });
    expect((await prisma.barnDecor.findUniqueOrThrow({ where: { id: decor[0].id } })).text).toBeNull();
    expect((await request(f.session.token, () => setDecorText(f.barn.slug, decor[0].id, 'Mơ'))).result.ok).toBe(true);
    await request(f.session.token, () => removeDecor(f.barn.slug, decor[0].id));
    expect((await request(f.session.token, () => installDecor(f.barn.slug, item.slug, key))).result.ok).toBe(true);
    expect(await prisma.barnDecor.count({ where: { barnId: f.barn.id } })).toBe(0);
    expect(await prisma.event.count({ where: { barnSlug: f.barn.slug, name: 'decor_installed' } })).toBe(1);
  });
  it('ảnh bản vẽ cũ bị từ chối; đúng snapshot mới ghi proof; chỉnh vị trí cần ảnh mới', async () => {
    const f = await farmFixture(), item = await itemFixture(); await paidInventory(f, item.id);
    await request(f.session.token, () => installDecor(f.barn.slug, item.slug, randomUUID()));
    const rows = await prisma.barnDecor.findMany({ where: { barnId: f.barn.id } });
    const old = decorProofSnapshot(rows, f.barn.label);
    await request(f.session.token, () => setDecorText(f.barn.slug, rows[0].id, 'Mơ'));
    const task = await prisma.barnTask.findFirstOrThrow({ where: { barnId: f.barn.id, kind: 'DECOR', status: 'OPEN' } });
    expect((await request(f.workerSession.token, () => completeTask(task.id, proof('decorSnapshot', old)))).result.ok).toBe(false);
    expect(await prisma.barnMedia.count({ where: { barnId: f.barn.id } })).toBe(0);
    const now = await prisma.barnDecor.findMany({ where: { barnId: f.barn.id } });
    expect((await request(f.workerSession.token, () => completeTask(task.id, proof('decorSnapshot', decorProofSnapshot(now, f.barn.label))))).result.ok).toBe(true);
    await request(f.session.token, () => saveDecorLayout(f.barn.slug, [{ ...now[0], x: 30 }]));
    expect((await prisma.barnDecor.findUniqueOrThrow({ where: { id: now[0].id } })).photoUrl).toBeNull();
    expect(await prisma.barnTask.count({ where: { barnId: f.barn.id, kind: 'DECOR', status: 'OPEN' } })).toBe(1);
    await request(f.session.token, () => removeDecor(f.barn.slug, now[0].id));
    expect(await prisma.barnMedia.count({ where: { barnId: f.barn.id } })).toBe(1);
  });
  it('yếm chỉ WORN/OFF sau proof đúng danh sách, không dùng ảnh cũ cho yêu cầu mới', async () => {
    const f = await farmFixture(), item = await itemFixture(true); await paidInventory(f, item.id, 2);
    await Promise.all(Array.from({ length: 15 }, () => request(f.session.token, () => wearGear(f.barn.slug, f.flock.birds[0].id, item.slug))));
    const initial = await prisma.birdGear.findMany({ where: { birdId: f.flock.birds[0].id } }); expect(initial).toHaveLength(1); expect(initial[0].status).toBe('PENDING_ON');
    await request(f.session.token, () => wearGear(f.barn.slug, f.flock.birds[1].id, item.slug));
    const task = await prisma.barnTask.findFirstOrThrow({ where: { barnId: f.barn.id, kind: 'GEAR', status: 'OPEN' } });
    expect((await request(f.workerSession.token, () => completeTask(task.id, proof('gearSnapshot', initial)))).result.ok).toBe(false);
    const pending = await prisma.birdGear.findMany({ where: { bird: { flockId: f.flock.id }, status: 'PENDING_ON' }, select: { id: true, status: true } });
    expect((await request(f.workerSession.token, () => completeTask(task.id, proof('gearSnapshot', pending)))).result.ok).toBe(true);
    await request(f.session.token, () => removeGear(f.barn.slug, initial[0].id));
    expect((await prisma.birdGear.findUniqueOrThrow({ where: { id: initial[0].id } })).status).toBe('PENDING_OFF');
    const offTask = await prisma.barnTask.findFirstOrThrow({ where: { barnId: f.barn.id, kind: 'GEAR', status: 'OPEN' } });
    expect((await request(f.workerSession.token, () => completeTask(offTask.id, proof('gearSnapshot', [{ id: initial[0].id, status: 'PENDING_OFF' }])))).result.ok).toBe(true);
    expect((await prisma.birdGear.findUniqueOrThrow({ where: { id: initial[0].id } })).status).toBe('OFF');
  });
  it('hai con tranh yếm cuối chỉ một yêu cầu; rút khi chưa mặc giữ dòng lịch sử', async () => {
    const f = await farmFixture(), item = await itemFixture(true); await paidInventory(f, item.id, 1);
    const rs = await Promise.all(f.flock.birds.map((b) => request(f.session.token, () => wearGear(f.barn.slug, b.id, item.slug))));
    expect(rs.filter((r) => r.result.ok)).toHaveLength(1);
    const gear = await prisma.birdGear.findFirstOrThrow({ where: { bird: { flockId: f.flock.id } } });
    await request(f.session.token, () => removeGear(f.barn.slug, gear.id));
    const saved = await prisma.birdGear.findUniqueOrThrow({ where: { id: gear.id } });
    expect(saved.status).toBe('OFF'); expect(saved.wornAt).toBeNull();
  });
});

describe('Trải nghiệm: quản lý chuồng, đặt chuồng và chợ', () => {
  it('không xóa chuồng có Flock/Bird/Family/Event; chỉ dọn chuồng chưa từng dùng', async () => {
    const f = await farmFixture();
    expect((await request(f.session.token, () => deleteBarn(f.barn.slug, f.barn.slug), basicAdmin)).result.ok).toBe(false);
    expect(await prisma.bird.count({ where: { flockId: f.flock.id } })).toBe(3);
    const empty = await prisma.barn.create({ data: { slug: randomUUID(), label: 'Trống', zoneId: f.barn.zoneId } });
    expect((await request(f.session.token, () => deleteBarn(empty.slug, 'sai'), basicAdmin)).result.ok).toBe(false);
    expect((await request(f.session.token, () => deleteBarn(empty.slug, empty.slug), basicAdmin)).result.ok).toBe(true);
    const history = await prisma.barn.create({ data: { slug: randomUUID(), label: 'Có lịch sử', zoneId: f.barn.zoneId } });
    await prisma.event.create({ data: { name: 'test_history', barnSlug: history.slug } });
    expect((await request(f.session.token, () => deleteBarn(history.slug, history.slug), basicAdmin)).result.ok).toBe(false);
  });
  it('bàn giao cùng lúc không vượt tải; chuyển việc OPEN và giữ người làm DONE', async () => {
    const f = await farmFixture(), other = await farmFixture(), target = await fixture();
    await prisma.farmWorker.update({ where: { id: target.worker.id }, data: { maxBarns: 2 } });
    const open = await upsertTask({ barnId: f.barn.id, workerId: f.worker.id, kind: 'FEED', title: 'Ăn' });
    const done = await prisma.barnTask.create({ data: { barnId: f.barn.id, workerId: f.worker.id, kind: 'CHECK', title: 'Cũ', status: 'DONE' } });
    const rs = await Promise.all([f,other].map((x) => request(x.session.token, () => reassignBarn(x.barn.slug, target.worker.id), basicAdmin)));
    expect(rs.filter((r) => r.result.ok)).toHaveLength(1);
    expect(await prisma.barn.count({ where: { workerId: target.worker.id, ownerId: { not: null } } })).toBe(2);
    const barn = await prisma.barn.findUniqueOrThrow({ where: { id: f.barn.id } });
    expect((await prisma.barnTask.findUniqueOrThrow({ where: { id: open.taskId } })).workerId).toBe(barn.workerId);
    expect((await prisma.barnTask.findUniqueOrThrow({ where: { id: done.id } })).workerId).toBe(f.worker.id);
  });
  it('khóa nhận chuồng không lộ đơn người khác; báo tiền không hạ CONFIRMED', async () => {
    const f = await farmFixture(), other = await fixture(); const key = randomUUID();
    const old = await prisma.reservation.create({ data: { barnId: f.barn.id, userId: f.owner.id, idemKey: key, productLine: 'LAYER', breedSlug: f.breed.slug, feedingPlanSlug: f.plan.slug, henNames: [], priceEstimateVnd: 100000, depositVnd: 50000, paymentStatus: 'CONFIRMED' } });
    const body = { workerId: f.worker.id, productLine: 'LAYER', breedSlug: f.breed.slug, feedingPlanSlug: f.plan.slug, qty: 3, idemKey: key };
    const response = (await request(other.session.token, () => reserveBarn(new Request('http://localhost/api/reservations', { method: 'POST', body: JSON.stringify(body) })))).result;
    expect(response.status).toBe(409); expect(JSON.stringify(await response.json())).not.toContain(old.id);
    await request(f.session.token, () => reportTransfer(f.barn.slug));
    expect((await prisma.reservation.findUniqueOrThrow({ where: { id: old.id } })).paymentStatus).toBe('CONFIRMED');
  });
  it('25 lượt nhận chuồng cùng người chỉ có một đơn cọc treo, đúng số gà', async () => {
    const f = await farmFixture();
    const results = await Promise.all(Array.from({ length: 25 }, () => request(f.session.token, () => reserveBarn(new Request('http://localhost/api/reservations', { method: 'POST', body: JSON.stringify({ workerId: f.worker.id, productLine: 'LAYER', breedSlug: f.breed.slug, feedingPlanSlug: f.plan.slug, qty: 6, idemKey: randomUUID() }) })))));
    expect(results.filter((r) => r.result.status === 200)).toHaveLength(1);
    const orders = await prisma.reservation.findMany({ where: { userId: f.owner.id }, include: { barn: { include: { flock: true } } } });
    expect(orders).toHaveLength(1); expect(orders[0].barn?.flock?.size).toBe(6);
    expect(await prisma.bird.count({ where: { flockId: orders[0].barn!.flock!.id } })).toBe(6);
  });
  it('đăng/rút/đăng lại dùng một tin; giữ chỗ thì người bán không rút được', async () => {
    const f = await farmFixture();
    await prisma.payoutAccount.create({ data: { userId: f.owner.id, bankName: 'Test', accountNo: '123456789', holderName: 'TEST' } });
    await prisma.marketPrice.create({ data: { type: 'EGG', unitVnd: 6000 } });
    const lot = await prisma.harvestLot.create({ data: { barnId: f.barn.id, flockId: f.flock.id, workerId: f.worker.id, ownerId: f.owner.id, type: 'EGG', qty: 10 } });
    await Promise.all(Array.from({length: 15}, () => request(f.session.token, () => listLot(lot.id))));
    const listing = await prisma.marketListing.findUniqueOrThrow({ where: { lotId: lot.id } });
    expect((await request(f.session.token, () => cancelListing(listing.id))).result.ok).toBe(true);
    expect((await request(f.session.token, () => listLot(lot.id))).result.ok).toBe(true);
    expect(await prisma.marketListing.count({ where: { lotId: lot.id } })).toBe(1);
    await prisma.marketListing.update({ where: { id: listing.id }, data: { status: 'RESERVED' } });
    expect((await request(f.session.token, () => cancelListing(listing.id))).result.ok).toBe(false);
    expect((await prisma.harvestLot.findUniqueOrThrow({ where: { id: lot.id } })).status).toBe('LISTED');
  });
  it('xác nhận đơn chợ và việc giao nguyên tử; retry không chi tiền hoặc tạo việc thứ hai', async () => {
    const f = await farmFixture(), buyer = await fixture();
    const lot = await prisma.harvestLot.create({ data: { barnId: f.barn.id, flockId: f.flock.id, workerId: f.worker.id, ownerId: f.owner.id, type: 'EGG', qty: 10, status: 'LISTED' } });
    const order = await prisma.marketOrder.create({ data: { buyerId: buyer.owner.id, status: 'REPORTED', totalVnd: 60000, goodsVnd: 60000 } });
    const listing = await prisma.marketListing.create({ data: { lotId: lot.id, sellerId: f.owner.id, buyerId: buyer.owner.id, orderId: order.id, status: 'RESERVED', priceVnd: 60000, feePercent: 20, feeVnd: 12000, netVnd: 48000 } });
    await withBrokenTask(f.barn.id, async () => { await expect(confirmMarketPaid(order.id, 'ADMIN')).rejects.toThrow(); });
    expect((await prisma.marketOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('REPORTED');
    await Promise.all(Array.from({length: 10}, () => confirmMarketPaid(order.id, 'ADMIN')));
    expect(await prisma.barnTask.count({ where: { orderId: order.id } })).toBe(1);
    expect(await prisma.payout.count({ where: { listingId: listing.id } })).toBe(0);
    const task = await prisma.barnTask.findUniqueOrThrow({ where: { orderId: order.id } });
    await Promise.all(Array.from({length: 10}, () => request(f.workerSession.token, () => completeTask(task.id, proof()))));
    expect(await prisma.payout.count({ where: { listingId: listing.id } })).toBe(1);
    expect((await prisma.harvestLot.findUniqueOrThrow({ where: { id: lot.id } })).status).toBe('DELIVERED');
  });
});
