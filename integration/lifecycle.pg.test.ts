// DB thật; chỉ giả session/callback Next và thông báo ngoài. Không tải .env của app.
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const context = vi.hoisted(() => {
  const raw = process.env.CC_B01_DATABASE_URL;
  if (!raw) throw new Error("Cần CC_B01_DATABASE_URL trỏ tới Postgres test riêng; không dùng DATABASE_URL.");
  const url = new URL(raw);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/cc_b01_test") {
    throw new Error("Chỉ nhận DB cc_b01_test trên localhost/127.0.0.1.");
  }
  const schema = `cc_b01_test_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  url.searchParams.set("schema", schema);
  url.searchParams.set("connection_limit", "30");
  return {
    url: url.toString(), schema,
    actor: null as { id: string; role: "USER" } | null,
    worker: null as { workerId: string; name: string; user: { id: string } } | null,
  };
});
vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return { prisma: new PrismaClient({ datasources: { db: { url: context.url } } }) };
});
vi.mock("@/lib/auth", () => ({
  getSessionUser: vi.fn(async () => context.actor), activeWorkerSession: vi.fn(async () => context.worker),
  SESSION_COOKIE: "cc-test", verifyPassword: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notify: vi.fn(), workerUserIdOfBarn: vi.fn() }));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));
vi.mock("@/lib/invoices", () => ({ chuongBiKhoa: vi.fn(async () => false) }));

import { prisma } from "@/lib/db";
import { decideEndOfLay, cancelLifecycleRequest } from "@/app/actions";
import { acceptLifecycleTask, completeTask, declineTask, logHarvest } from "@/app/worker-actions";
import { nhanLoiMoiGiaDinh } from "@/app/family-actions";
import { cancelTask } from "@/app/task-actions";

const cli = resolve("node_modules/prisma/build/index.js");
const migration = resolve("prisma/migrations/202609070001_cc_b01/migration.sql");
const rollback = resolve("prisma/migrations/202609070001_cc_b01/rollback.sql");
const admin = new PrismaClient({ datasources: { db: { url: context.url } } });
let scratch: string;
let legacy: Awaited<ReturnType<typeof fixture>>;

function runSql(path: string) {
  return execFileSync(process.execPath, [cli, "db", "execute", "--url", context.url, "--file", path], { encoding: "utf8", stdio: "pipe" });
}

async function fixture(family = false) {
  const suffix = randomUUID();
  const owner = await prisma.user.create({ data: { email: `${suffix}@example.invalid`, name: "Chủ test" } });
  const user = await prisma.user.create({ data: { email: `worker-${suffix}@example.invalid`, role: "WORKER", name: "Cô chú test" } });
  const farm = await prisma.farm.create({ data: { name: "Farm test", address: "Dữ liệu test" } });
  const zone = await prisma.zone.create({ data: { farmId: farm.id, name: "Khu test" } });
  const worker = await prisma.farmWorker.create({ data: { farmId: farm.id, userId: user.id, name: "Cô chú test", area: "Test" } });
  const barn = await prisma.barn.create({ data: { slug: `cc-b01-${suffix}`, label: "Chuồng test", ownerId: owner.id, workerId: worker.id, zoneId: zone.id } });
  const breed = await prisma.breed.create({ data: { slug: suffix, name: "Giống test" } });
  const feed = await prisma.feedingPlan.create({ data: { slug: suffix, name: "Thức ăn test", ratio: "Test" } });
  // SQL cột cũ: client mới tự điền default version ngay cả khi chỉ select id.
  const flock = { id: randomUUID() };
  await prisma.$executeRaw`INSERT INTO "Flock" ("id", "barnId", "breedId", "feedingPlanId", "productLine", "size", "stage", "lifecyclePolicy")
    VALUES (${flock.id}, ${barn.id}, ${breed.id}, ${feed.id}, 'LAYER', 4, 'END_OF_LAY',
      ${family ? "FAMILY_RETIRE_ONLY" : "STANDARD"}::"FlockLifecyclePolicy")`;
  await prisma.bird.createMany({ data: [
    ...[1, 2, 3].map((n) => ({ flockId: flock.id, tagCode: `T-${n}`, name: `Bạn ${n}` })),
    { flockId: flock.id, tagCode: "T-4", status: "DECEASED", name: "Lịch sử" },
  ] });
  return { owner, user, worker, barn, flock };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function sessions(f: Fixture) {
  context.actor = { id: f.owner.id, role: "USER" };
  context.worker = { workerId: f.worker.id, name: f.worker.name, user: { id: f.user.id } };
}
function requestForm(f: Fixture, choice = "MEAT", key = randomUUID(), version = 0, terms = true) {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ barn: f.barn.slug, flockId: f.flock.id, choice,
    expectedVersion: String(version), idempotencyKey: key, retireTermsAccepted: String(terms) })) fd.set(k, v);
  return fd;
}
function proof(count = 3, url = "https://proof.example.invalid/task.jpg") {
  const fd = new FormData(); fd.set("url", url); fd.set("confirmedCount", String(count)); return fd;
}
function harvestForm(f: Fixture, requestId: string, qty = 3) {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ barn: f.barn.slug, flockId: f.flock.id, lifecycleRequestId: requestId,
    type: "MEAT", qty: String(qty), weightKg: "4.5", url: "https://proof.example.invalid/lot.jpg" })) fd.set(k, v);
  return fd;
}
async function request(f: Fixture, choice = "MEAT") {
  sessions(f);
  const version = (await prisma.flock.findUniqueOrThrow({ where: { id: f.flock.id } })).version;
  const r = await decideEndOfLay(requestForm(f, choice, randomUUID(), version));
  expect(r.ok, r.message).toBe(true);
  expect(r.taskId).toBeTruthy(); expect(r.requestId).toBeTruthy();
  return { taskId: r.taskId!, requestId: r.requestId! };
}
async function snapshot(f: Fixture) {
  const [flock, birds, reqs, tasks, media, updates, lots, outcomes, events] = await Promise.all([
    prisma.flock.findUnique({ where: { id: f.flock.id } }),
    prisma.bird.findMany({ where: { flockId: f.flock.id }, orderBy: { id: "asc" } }),
    prisma.lifecycleRequest.findMany({ where: { barnId: f.barn.id } }),
    prisma.barnTask.findMany({ where: { barnId: f.barn.id } }),
    prisma.barnMedia.count({ where: { barnId: f.barn.id } }),
    prisma.farmUpdate.count({ where: { barnId: f.barn.id } }),
    prisma.harvestLot.count({ where: { barnId: f.barn.id } }),
    prisma.flockOutcome.count({ where: { flockId: f.flock.id } }),
    prisma.domainEvent.count({ where: { barnId: f.barn.id } }),
  ]);
  return { flock, birds, reqs, tasks, media, updates, lots, outcomes, events };
}

beforeAll(async () => {
  process.env.FAMILY_LEARNING_ENABLED = "true";
  if (!/^cc_b01_test_[a-z0-9_]+$/.test(context.schema)) throw new Error("Schema test không hợp lệ.");
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${context.schema}"`);
  scratch = mkdtempSync(join(tmpdir(), "cc-b01-integration-"));
  const baseline = join(scratch, "before.prisma");
  writeFileSync(baseline, execFileSync("git", ["show", "60f7b87ed03a2e3534bca47255cb247368a810d7:prisma/schema.prisma"], { encoding: "utf8" }), "utf8");
  const initialSql = join(scratch, "before.sql");
  execFileSync(process.execPath, [cli, "migrate", "diff", "--from-empty", "--to-schema-datamodel", baseline, "--script", "--output", initialSql], { stdio: "pipe" });
  runSql(initialSql);
  legacy = await fixture();
  await prisma.lifecycleDecision.create({ data: { barnId: legacy.barn.id, flockId: legacy.flock.id, choice: "MEAT", note: "Lịch sử giữ nguyên" } });
  await prisma.healthEvent.create({ data: { flockId: legacy.flock.id, status: "RECOVERED", description: "Lịch sử sức khỏe" } });
  await prisma.product.create({ data: { flockId: legacy.flock.id, type: "EGG", qty: 7 } });
  await prisma.event.create({ data: { name: "legacy-test", barnSlug: legacy.barn.slug } });
  await prisma.$executeRaw`INSERT INTO "HarvestLot" ("id", "barnId", "flockId", "workerId", "ownerId", "type", "qty", "publicCode")
    VALUES (${randomUUID()}, ${legacy.barn.id}, ${legacy.flock.id}, ${legacy.worker.id}, ${legacy.owner.id}, 'EGG', 7, 'legacy-cc-b01')`;
  runSql(migration);
  // Cold rollback rồi áp lại; enum RETIRE được giữ lại có chủ ý.
  runSql(rollback);
  runSql(migration);
});
afterAll(async () => {
  await prisma.$disconnect();
  if (/^cc_b01_test_[a-z0-9_]+$/.test(context.schema)) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${context.schema}" CASCADE`);
  await admin.$disconnect();
  if (scratch && resolve(scratch).startsWith(resolve(tmpdir()) + sep) && scratch.includes("cc-b01-integration-")) {
    rmSync(scratch, { recursive: true });
  }
});
beforeEach(() => { delete process.env.LIFECYCLE_WRITES_DISABLED; });

describe("CC-B01 · Postgres thật", () => {
  it("migration/rollback giữ nguyên Flock, Bird, Health, Product, Lot, Decision, Event và QR cũ", async () => {
    expect(await prisma.bird.count({ where: { flockId: legacy.flock.id } })).toBe(4);
    expect(await prisma.healthEvent.count({ where: { flockId: legacy.flock.id } })).toBe(1);
    expect(await prisma.product.findFirst({ where: { flockId: legacy.flock.id } })).toMatchObject({ qty: 7 });
    expect(await prisma.lifecycleDecision.count({ where: { flockId: legacy.flock.id } })).toBe(1);
    expect(await prisma.harvestLot.findUnique({ where: { publicCode: "legacy-cc-b01" } })).toMatchObject({ flockId: legacy.flock.id, lifecycleRequestId: null });
    expect(await prisma.event.count({ where: { barnSlug: legacy.barn.slug } })).toBe(1);
    expect(await prisma.lifecycleRequest.count()).toBe(0);
    expect(await prisma.flockOutcome.count()).toBe(0);
  });
  it("25 request trùng: một request/task, vẫn END_OF_LAY, không outcome hay Bird terminal", async () => {
    const f = await fixture(); sessions(f); const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 25 }, () => decideEndOfLay(requestForm(f, "MEAT", key))));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(new Set(results.map((r) => r.requestId)).size).toBe(1);
    const s = await snapshot(f);
    expect(s.reqs).toHaveLength(1); expect(s.tasks).toHaveLength(1);
    expect(s.flock?.stage).toBe("END_OF_LAY"); expect(s.outcomes).toBe(0);
    expect(s.birds.map((b) => b.status).sort()).toEqual(["ALIVE", "ALIVE", "ALIVE", "DECEASED"]);
    expect(s.tasks[0].lifecycleRequestId).toBe(s.reqs[0].id);
    const before = await snapshot(f);
    expect((await decideEndOfLay(requestForm(f, "RETIRE", key))).ok).toBe(false);
    expect((await decideEndOfLay(requestForm(f, "MEAT", randomUUID()))).ok).toBe(false);
    expect(await snapshot(f)).toEqual(before);
  });
  it("stale version, sai chủ/đàn, chưa đăng nhập và RENEW đều không ghi", async () => {
    const f = await fixture(), other = await fixture(); sessions(f);
    const before = await snapshot(f);
    expect((await decideEndOfLay(requestForm(f, "MEAT", randomUUID(), 99))).ok).toBe(false);
    expect((await decideEndOfLay(requestForm(f, "RENEW"))).ok).toBe(false);
    const bad = requestForm(f); bad.set("flockId", other.flock.id);
    expect((await decideEndOfLay(bad)).ok).toBe(false);
    context.actor = { id: other.owner.id, role: "USER" };
    expect((await decideEndOfLay(requestForm(f))).ok).toBe(false);
    context.actor = null;
    expect((await decideEndOfLay(requestForm(f))).ok).toBe(false);
    expect(await snapshot(f)).toEqual(before);
  });
  it("Family crafted MEAT/RENEW và logHarvest đều bị chặn; RETIRE cần đồng ý điều khoản", async () => {
    const f = await fixture(true); sessions(f); const before = await snapshot(f);
    for (const choice of ["MEAT", "RENEW"]) expect((await decideEndOfLay(requestForm(f, choice))).ok).toBe(false);
    expect((await logHarvest(harvestForm(f, "forged"))).ok).toBe(false);
    expect((await decideEndOfLay(requestForm(f, "RETIRE", randomUUID(), 0, false))).ok).toBe(false);
    expect(await snapshot(f)).toEqual(before);
  });
  it("MEAT: thiếu proof/nhận việc/lô/số con không hoàn tất; mỗi thất bại rollback toàn bộ", async () => {
    const f = await fixture(); const r = await request(f); let before = await snapshot(f);
    expect((await completeTask(r.taskId, proof())).ok).toBe(false);
    expect(await snapshot(f)).toEqual(before);
    expect((await acceptLifecycleTask(r.taskId)).ok).toBe(true);
    before = await snapshot(f);
    expect((await completeTask(r.taskId, new FormData())).ok).toBe(false);
    expect((await completeTask(r.taskId, proof())).ok).toBe(false);
    // Lô mới cùng chuồng nhưng không thuộc request không thể làm bằng chứng thay.
    await prisma.harvestLot.create({ data: { barnId: f.barn.id, flockId: f.flock.id, workerId: f.worker.id, type: "MEAT", qty: 3, weightKg: 4.5 } });
    before = await snapshot(f);
    expect((await completeTask(r.taskId, proof())).ok).toBe(false);
    expect((await logHarvest(harvestForm(f, r.requestId, 2))).ok).toBe(false);
    expect(await snapshot(f)).toEqual(before);
  });
  it("25 log + 25 complete đồng thời: đúng 1 lô/outcome/proof/event; replay vô hại", async () => {
    const f = await fixture(); const r = await request(f);
    const accepted = await Promise.all(Array.from({ length: 20 }, () => acceptLifecycleTask(r.taskId)));
    expect(accepted.every((x) => x.ok)).toBe(true);
    const lots = await Promise.all(Array.from({ length: 25 }, () => logHarvest(harvestForm(f, r.requestId))));
    expect(lots.every((x) => x.ok)).toBe(true);
    const pending = await snapshot(f);
    expect(pending.flock?.stage).toBe("END_OF_LAY"); expect(pending.lots).toBe(1); expect(pending.outcomes).toBe(0);
    const changedStorage = harvestForm(f, r.requestId); changedStorage.set("storage", "CHILLED");
    expect((await logHarvest(changedStorage)).ok).toBe(false);
    expect((await declineTask(r.taskId, "Đã có lô thì không rút")).ok).toBe(false);
    expect((await completeTask(r.taskId, proof(2))).ok).toBe(false);
    expect(await snapshot(f)).toEqual(pending);
    const finished = await Promise.all(Array.from({ length: 25 }, () => completeTask(r.taskId, proof())));
    expect(finished.every((x) => x.ok)).toBe(true);
    const done = await snapshot(f);
    expect(done.flock?.stage).toBe("HARVESTED"); expect(done.outcomes).toBe(1); expect(done.media).toBe(2);
    expect(done.birds.map((b) => b.status).sort()).toEqual(["DECEASED", "HARVESTED", "HARVESTED", "HARVESTED"]);
    expect(done.reqs[0].status).toBe("COMPLETED"); expect(done.tasks[0].status).toBe("DONE");
    expect(await prisma.domainEvent.count({ where: { barnId: f.barn.id, type: "CARE_TASK_COMPLETED" } })).toBe(1);
    expect((await completeTask(r.taskId, proof())).ok).toBe(true);
    expect((await logHarvest(harvestForm(f, r.requestId))).ok).toBe(true);
    expect(await snapshot(f)).toEqual(done);
    expect(() => runSql(rollback)).toThrow();
    expect(await snapshot(f)).toEqual(done);
  });
  it("RETIRE Family chỉ terminal sau farm nhận việc + proof/count; không tự tạo hóa đơn", async () => {
    const f = await fixture(true); const r = await request(f, "RETIRE");
    expect((await snapshot(f)).flock?.stage).toBe("END_OF_LAY");
    expect((await acceptLifecycleTask(r.taskId)).ok).toBe(true);
    expect((await completeTask(r.taskId, proof())).ok).toBe(true);
    const s = await snapshot(f);
    expect(s.flock).toMatchObject({ stage: "RETIRED", lifecyclePolicy: "FAMILY_RETIRE_ONLY" });
    expect(s.outcomes).toBe(1); expect(s.reqs[0].retireTermsAcceptedAt).not.toBeNull();
    expect(s.reqs[0].acceptedByWorkerId).toBe(f.worker.id);
    expect(await prisma.careOrder.count({ where: { barnId: f.barn.id } })).toBe(0);
  });
  it("hủy/từ chối có reason, không outcome; request mới không ghi đè lịch sử", async () => {
    const f = await fixture(); const r = await request(f, "RETIRE");
    const before = await snapshot(f);
    expect((await cancelTask(r.taskId)).ok).toBe(false);
    expect(await snapshot(f)).toEqual(before);
    expect((await cancelLifecycleRequest(f.barn.slug, r.requestId)).ok).toBe(true);
    expect((await cancelLifecycleRequest(f.barn.slug, r.requestId)).ok).toBe(true);
    expect((await completeTask(r.taskId, proof())).ok).toBe(false);
    const second = await request(f, "RETIRE");
    const results = await Promise.all(Array.from({ length: 20 }, () => declineTask(second.taskId, "Chưa chuẩn bị xong nơi chăm tiếp")));
    expect(results.every((x) => x.ok)).toBe(true);
    const s = await snapshot(f);
    expect(s.reqs).toHaveLength(2); expect(s.outcomes).toBe(0); expect(s.flock?.stage).toBe("END_OF_LAY");
    expect(s.reqs.every((x) => !!x.reason)).toBe(true);
    expect((await completeTask(second.taskId, proof())).ok).toBe(false);
  });
  it("complete đua decline: chỉ một kết quả, không orphan media/event", async () => {
    const f = await fixture(); const r = await request(f, "RETIRE"); await acceptLifecycleTask(r.taskId);
    await Promise.all([completeTask(r.taskId, proof()), declineTask(r.taskId, "Chưa hoàn tất chăm tiếp")]);
    const s = await snapshot(f);
    if (s.reqs[0].status === "COMPLETED") {
      expect(s.outcomes).toBe(1); expect(s.media).toBe(1); expect(s.tasks[0].status).toBe("DONE");
    } else {
      expect(s.reqs[0].status).toBe("DECLINED"); expect(s.outcomes).toBe(0); expect(s.media).toBe(0);
      expect(s.flock?.stage).toBe("END_OF_LAY"); expect(s.events).toBe(0);
    }
  });
  it("hold cũ không bị event RECOVERED mới che; kiểm cả lúc nhận/lô/hoàn tất", async () => {
    const f = await fixture(); const r = await request(f);
    const hold = await prisma.healthEvent.create({ data: { flockId: f.flock.id, status: "RECOVERED", description: "Hold cũ", withdrawalUntil: new Date(Date.now() + 86400000) } });
    await prisma.healthEvent.create({ data: { flockId: f.flock.id, status: "RECOVERED", description: "Mới hơn" } });
    expect((await acceptLifecycleTask(r.taskId)).ok).toBe(false);
    await prisma.healthEvent.update({ where: { id: hold.id }, data: { withdrawalUntil: null } });
    await acceptLifecycleTask(r.taskId);
    await prisma.healthEvent.update({ where: { id: hold.id }, data: { withdrawalUntil: new Date(Date.now() + 86400000) } });
    expect((await logHarvest(harvestForm(f, r.requestId))).ok).toBe(false);
    await prisma.healthEvent.update({ where: { id: hold.id }, data: { withdrawalUntil: null } });
    expect((await logHarvest(harvestForm(f, r.requestId))).ok).toBe(true);
    await prisma.healthEvent.update({ where: { id: hold.id }, data: { withdrawalUntil: new Date(Date.now() + 86400000) } });
    const before = await snapshot(f);
    expect((await completeTask(r.taskId, proof())).ok).toBe(false);
    expect(await snapshot(f)).toEqual(before);
  });
  it("lỗi DB sau khi đổi stage phải rollback task/proof/Bird/outcome rồi retry được", async () => {
    const f = await fixture(); const r = await request(f, "RETIRE"); await acceptLifecycleTask(r.taskId);
    await prisma.$executeRawUnsafe(`CREATE FUNCTION reject_outcome() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER reject_outcome BEFORE INSERT ON "FlockOutcome" FOR EACH ROW EXECUTE FUNCTION reject_outcome()`);
    const before = await snapshot(f);
    try { await expect(completeTask(r.taskId, proof())).rejects.toThrow(); }
    finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER reject_outcome ON "FlockOutcome"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION reject_outcome()`);
    }
    expect(await snapshot(f)).toEqual(before);
    expect((await completeTask(r.taskId, proof())).ok).toBe(true);
  });
  it("Family acceptance đua MEAT: không thể vừa hứa RETIRE-only vừa có request MEAT", async () => {
    const f = await fixture(); sessions(f);
    const enrollment = await prisma.familyEnrollment.create({ data: {
      barnId: f.barn.id, parentId: f.owner.id, cohortKey: "cc-b01", programVersion: "test", barnLiveKey: f.barn.id,
    } });
    const child = await prisma.childProfile.create({ data: { parentId: f.owner.id, nickname: "Test", ageBand: "AGE_5_6", avatarKey: "ga-con", status: "ACTIVE" } });
    const [intent, accepted] = await Promise.all([
      decideEndOfLay(requestForm(f)),
      nhanLoiMoiGiaDinh({ enrollmentId: enrollment.id, childId: child.id, xacNhan: true }),
    ]);
    expect(intent.ok && accepted.ok).toBe(false);
    const s = await snapshot(f);
    if (accepted.ok) { expect(s.flock?.lifecyclePolicy).toBe("FAMILY_RETIRE_ONLY"); expect(s.reqs).toHaveLength(0); }
    if (intent.ok) { expect(s.flock?.lifecyclePolicy).toBe("STANDARD"); expect(s.reqs).toHaveLength(1); }
    expect(intent.ok || accepted.ok).toBe(true);
  });
  it("đổi người phụ trách và kill switch chặn ghi nhưng không sửa đàn", async () => {
    const f = await fixture(), other = await fixture(); const r = await request(f, "RETIRE");
    await prisma.barn.update({ where: { id: f.barn.id }, data: { workerId: other.worker.id } });
    let before = await snapshot(f);
    expect((await acceptLifecycleTask(r.taskId)).ok).toBe(false);
    expect(await snapshot(f)).toEqual(before);
    await prisma.barn.update({ where: { id: f.barn.id }, data: { workerId: f.worker.id } });
    process.env.LIFECYCLE_WRITES_DISABLED = "1";
    before = await snapshot(f);
    expect((await acceptLifecycleTask(r.taskId)).ok).toBe(false);
    expect((await cancelLifecycleRequest(f.barn.slug, r.requestId)).ok).toBe(false);
    expect(await snapshot(f)).toEqual(before);
  });
  it("cùng actor/key đua trên hai đàn: một thắng, bên kia trả conflict có kiểm soát", async () => {
    const f = await fixture(), other = await fixture(); sessions(f);
    await prisma.barn.update({ where: { id: other.barn.id }, data: { ownerId: f.owner.id } });
    const key = randomUUID();
    const results = await Promise.all([decideEndOfLay(requestForm(f, "MEAT", key)), decideEndOfLay(requestForm(other, "MEAT", key))]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await prisma.lifecycleRequest.count({ where: { requestedById: f.owner.id } })).toBe(1);
    expect((await snapshot(f)).outcomes + (await snapshot(other)).outcomes).toBe(0);
  });
  it("sai request/lot target và task legacy không thể thay proof của đúng đàn", async () => {
    const f = await fixture(), other = await fixture(); const r = await request(f);
    await acceptLifecycleTask(r.taskId);
    const foreign = harvestForm(other, r.requestId);
    expect((await logHarvest(foreign)).ok).toBe(false);
    const wrongFlock = harvestForm(f, r.requestId); wrongFlock.set("flockId", other.flock.id);
    expect((await logHarvest(wrongFlock)).ok).toBe(false);
    const wrongRequest = harvestForm(f, "forged-request-id");
    expect((await logHarvest(wrongRequest)).ok).toBe(false);
    expect((await logHarvest(harvestForm(f, r.requestId))).ok).toBe(true);
    await prisma.harvestLot.update({ where: { lifecycleRequestId: r.requestId }, data: { flockId: other.flock.id } });
    const before = await snapshot(f);
    expect((await completeTask(r.taskId, proof())).ok).toBe(false);
    expect(await snapshot(f)).toEqual(before);
    const legacyTask = await prisma.barnTask.create({ data: { barnId: f.barn.id, workerId: f.worker.id, kind: "HARVEST", title: "Việc cũ" } });
    expect((await completeTask(legacyTask.id, proof())).ok).toBe(false);
    expect(await prisma.barnTask.findUnique({ where: { id: legacyTask.id } })).toMatchObject({ status: "OPEN", proofMediaId: null });
  });
  it("đàn đổi danh tính dù vẫn đủ số con phải dừng để đối soát", async () => {
    const f = await fixture(); const r = await request(f, "RETIRE"); await acceptLifecycleTask(r.taskId);
    const bird = await prisma.bird.findFirstOrThrow({ where: { flockId: f.flock.id, status: "ALIVE" } });
    await prisma.bird.update({ where: { id: bird.id }, data: { status: "DECEASED" } });
    await prisma.bird.create({ data: { flockId: f.flock.id, tagCode: "NEW", status: "ALIVE" } });
    const before = await snapshot(f);
    expect((await completeTask(r.taskId, proof(3))).ok).toBe(false);
    expect(await snapshot(f)).toEqual(before);
  });
});
