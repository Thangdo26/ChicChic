// Chỉ gọi từ action đã kiểm quyền, luôn truyền transaction; không có client/notify.
import type { Prisma } from "@prisma/client";
import { RETIRE_CARE_VND } from "@/data/catalog";
import type { LuaChon } from "@/lib/family-gates";
import { TASK_META } from "@/lib/tasks";
import { normalizeMediaUrl } from "@/lib/decor";
import {
  assertLifecycleChoice, assertLifecycleCount, assertLifecycleWeight,
  LifecycleError, RETIRE_TERMS_VERSION,
} from "@/lib/lifecycle";

type Tx = Prisma.TransactionClient;
const LIVE = ["ALIVE", "SICK", "UNDER_TREATMENT"] as const;
const conflict = () => new LifecycleError("Yêu cầu vừa đổi trạng thái. Tải lại trang để xem kết quả mới nhất.");

export function assertLifecycleWritesEnabled() {
  if (process.env.LIFECYCLE_WRITES_DISABLED === "1") {
    throw new LifecycleError("Nông trại đang đối soát vòng đời đàn. Đàn vẫn được chăm; vui lòng quay lại sau.");
  }
}

// Thứ tự khoá chung: Barn → Flock → Request → Task. Bàn giao/hoàn trả cũng ghi Barn,
// nên không thể đổi người phụ trách giữa lúc kiểm quyền và ghi kết quả lifecycle.
async function lockBarn(tx: Tx, barnId: string, ownerId: string, workerId?: string) {
  const row = await tx.barn.updateMany({
    where: { id: barnId, ownerId, workerId: workerId ?? { not: null } },
    data: { id: barnId },
  });
  if (row.count !== 1) throw new LifecycleError("Chuồng đã đổi chủ hoặc người phụ trách. Tải lại trang giúp mình nhé.");
}

async function lockFlock(tx: Tx, flockId: string, barnId: string) {
  // Khoá hàng trước khi đọc policy: nhận lời mời Family cũng khoá chính hàng này.
  const lock = await tx.flock.updateMany({
    where: { id: flockId, barnId }, data: { id: flockId },
  });
  if (lock.count !== 1) throw new LifecycleError("Yêu cầu không trỏ tới đàn của chuồng này.");
  return tx.flock.findUniqueOrThrow({ where: { id: flockId } });
}

export async function createLifecycleRequest(tx: Tx, input: {
  barnId: string; ownerId: string; requestedById: string; flockId: string;
  choice: LuaChon; expectedVersion: number; idempotencyKey: string; retireTermsAccepted: boolean;
}, now = new Date()) {
  assertLifecycleWritesEnabled();
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(input.idempotencyKey) ||
      !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new LifecycleError("Mã yêu cầu hoặc phiên bản đàn không hợp lệ. Tải lại trang rồi thử lại nhé.");
  }
  await lockBarn(tx, input.barnId, input.ownerId);
  const flock = await lockFlock(tx, input.flockId, input.barnId);
  const previous = await tx.lifecycleRequest.findUnique({
    where: { requestedById_idempotencyKey: {
      requestedById: input.requestedById, idempotencyKey: input.idempotencyKey,
    } }, include: { task: { select: { id: true } } },
  });
  if (previous) {
    if (previous.flockId !== input.flockId || previous.barnId !== input.barnId ||
        previous.choice !== input.choice || !previous.task) throw conflict();
    return { requestId: previous.id, taskId: previous.task.id, created: false };
  }
  assertLifecycleChoice(flock, input.choice);
  if (await tx.lifecycleRequest.findUnique({ where: { activeFlockId: flock.id } })) {
    throw new LifecycleError("Đàn đang có một yêu cầu chờ xử lý. Xem yêu cầu đó trước nhé.");
  }
  if (input.choice === "RETIRE" && !input.retireTermsAccepted) {
    throw new LifecycleError("Bạn cần đồng ý điều khoản nuôi dưỡng trước khi gửi yêu cầu nghỉ hưu.");
  }
  const birds = await tx.bird.findMany({ where: { flockId: flock.id, status: { in: [...LIVE] } }, select: { id: true } });
  if (birds.length === 0) throw new LifecycleError("Chưa có con nào trong đàn để đối soát. Liên hệ nông trại giúp mình nhé.");
  const cas = await tx.flock.updateMany({
    where: { id: flock.id, version: input.expectedVersion, stage: "END_OF_LAY", lifecyclePolicy: flock.lifecyclePolicy },
    data: { version: { increment: 1 } },
  });
  if (cas.count !== 1) throw conflict();
  const barn = await tx.barn.findUniqueOrThrow({ where: { id: input.barnId } });
  const request = await tx.lifecycleRequest.create({ data: {
    barnId: barn.id, flockId: flock.id, activeFlockId: flock.id,
    ownerId: input.ownerId, requestedById: input.requestedById,
    idempotencyKey: input.idempotencyKey, choice: input.choice,
    birdIds: birds.map((b) => b.id).sort(), expectedCount: birds.length,
    retireFeeVnd: input.choice === "RETIRE" ? RETIRE_CARE_VND : 0,
    retireTermsVersion: input.choice === "RETIRE" ? RETIRE_TERMS_VERSION : null,
    retireTermsAcceptedAt: input.choice === "RETIRE" ? now : null,
    createdAt: now,
  } });
  const kind = input.choice === "MEAT" ? "HARVEST" : "RETIRE";
  const task = await tx.barnTask.create({ data: {
    barnId: barn.id, workerId: barn.workerId!, requestedById: input.requestedById,
    lifecycleRequestId: request.id, kind, title: TASK_META[kind].label,
    note: `Chủ chuồng gửi yêu cầu ${input.choice === "MEAT" ? "nhận thịt" : "nghỉ hưu"} cho ${birds.length} con. Nhận việc, kiểm tra đúng đàn rồi gửi minh chứng khi hoàn tất.`,
    createdAt: now,
  } });
  await tx.farmUpdate.create({ data: {
    barnId: barn.id, workerId: barn.workerId!, kind: "NOTE",
    text: `Đã gửi yêu cầu ${input.choice === "MEAT" ? "nhận thịt" : "nghỉ hưu"} cho đàn; đang chờ cô chú nhận việc.`,
  } });
  return { requestId: request.id, taskId: task.id, created: true };
}

export async function lockLifecycleTask(tx: Tx, taskId: string, workerId: string) {
  assertLifecycleWritesEnabled();
  const target = await tx.barnTask.findUnique({ where: { id: taskId }, include: { lifecycleRequest: true } });
  const request = target?.lifecycleRequest;
  if (!target || !request || target.workerId !== workerId) throw conflict();
  await lockBarn(tx, request.barnId, request.ownerId, workerId);
  const flock = await lockFlock(tx, request.flockId, request.barnId);
  const fresh = await tx.lifecycleRequest.findUniqueOrThrow({
    where: { id: request.id },
    include: { task: true, harvestLot: { include: { proofMedia: true } } },
  });
  if (fresh.task?.id !== taskId || fresh.task.barnId !== fresh.barnId || fresh.task.workerId !== workerId ||
      fresh.task.kind !== (fresh.choice === "MEAT" ? "HARVEST" : "RETIRE")) throw conflict();
  return { request: fresh, flock };
}

type Locked = Awaited<ReturnType<typeof lockLifecycleTask>>;

async function assertMeatSafe(tx: Tx, flockId: string, now: Date) {
  // Gate tối thiểu trên TOÀN BỘ HealthEvent hiện có, không đọc "event mới nhất".
  // Không tự suy ra SOP/release; hệ thống hold thương mại đầy đủ thuộc CC-B04.
  const hold = await tx.healthEvent.findFirst({ where: {
    flockId, OR: [{ status: { in: ["REPORTED", "TREATING"] } }, { withdrawalUntil: { gt: now } }],
  }, select: { id: true } });
  const unwell = await tx.bird.count({ where: { flockId, status: { in: ["SICK", "UNDER_TREATMENT"] } } });
  if (hold || unwell) throw new LifecycleError("Đàn còn ghi nhận sức khỏe hoặc thời gian ngừng thuốc cần xử lý. Báo nông trại trước khi thu hoạch.");
}

async function checkExecution(tx: Tx, locked: Locked, now: Date) {
  assertLifecycleChoice(locked.flock, locked.request.choice);
  if (locked.request.task?.status !== "OPEN" || locked.request.activeFlockId !== locked.flock.id) throw conflict();
  if (locked.request.choice === "MEAT") await assertMeatSafe(tx, locked.flock.id, now);
}

export async function acceptLifecycle(tx: Tx, locked: Locked, workerId: string, now = new Date()) {
  const { request } = locked;
  if (["ACCEPTED", "IN_PROGRESS", "COMPLETED"].includes(request.status)) return false;
  await checkExecution(tx, locked, now);
  if (request.status !== "REQUESTED") throw conflict();
  const cas = await tx.lifecycleRequest.updateMany({
    where: { id: request.id, status: "REQUESTED", version: request.version },
    data: { status: "ACCEPTED", version: { increment: 1 }, acceptedByWorkerId: workerId, acceptedAt: now },
  });
  if (cas.count !== 1) throw conflict();
  return true;
}

export async function prepareLifecycleHarvest(tx: Tx, locked: Locked, input: {
  qty: number; weightKg: number | null; url: string; storage: string; mediaType: string;
}, now = new Date()) {
  const { request, flock } = locked;
  const lot = request.harvestLot;
  if (lot) {
    if (lot.qty !== input.qty || lot.weightKg !== input.weightKg || lot.proofMedia?.url !== input.url ||
        lot.storage !== input.storage || lot.proofMedia?.type !== input.mediaType) {
      throw new LifecycleError("Yêu cầu này đã có lô thu hoạch với thông tin khác. Không được ghi đè lô cũ.");
    }
    return false;
  }
  await checkExecution(tx, locked, now);
  if (request.choice !== "MEAT" || request.status !== "ACCEPTED") {
    throw new LifecycleError("Cần nhận đúng việc thu hoạch của đàn trước khi ghi lô.");
  }
  const birds = await tx.bird.findMany({ where: { flockId: flock.id, status: { in: [...LIVE] } }, select: { id: true } });
  assertLifecycleCount(request.birdIds, birds.map((b) => b.id), input.qty);
  assertLifecycleWeight(input.qty, input.weightKg);
  const cas = await tx.lifecycleRequest.updateMany({
    where: { id: request.id, status: "ACCEPTED", version: request.version },
    data: { status: "IN_PROGRESS", version: { increment: 1 } },
  });
  if (cas.count !== 1) throw conflict();
  return true;
}

export async function completeLifecycle(tx: Tx, locked: Locked, input: {
  confirmedCount: number; proofMediaId: string; workerId: string;
}, now = new Date()) {
  const { request, flock } = locked;
  await checkExecution(tx, locked, now);
  if (!request.acceptedAt || !request.acceptedByWorkerId ||
      !["ACCEPTED", "IN_PROGRESS"].includes(request.status)) {
    throw new LifecycleError("Cô chú cần nhận việc trước khi báo hoàn tất.");
  }
  const proof = await tx.barnMedia.findUnique({ where: { id: input.proofMediaId } });
  if (!proof || proof.barnId !== request.barnId || proof.workerId !== input.workerId || !normalizeMediaUrl(proof.url)) {
    throw new LifecycleError("Cần minh chứng của đúng chuồng và người hoàn tất.");
  }
  const birds = await tx.bird.findMany({ where: { flockId: flock.id, status: { in: [...LIVE] } }, select: { id: true } });
  assertLifecycleCount(request.birdIds, birds.map((b) => b.id), input.confirmedCount);
  let weightKg: number | null = null;
  if (request.choice === "MEAT") {
    const lot = request.harvestLot;
    if (!lot || lot.flockId !== flock.id || lot.barnId !== request.barnId || lot.ownerId !== request.ownerId ||
        lot.type !== "MEAT" || lot.qty !== input.confirmedCount || lot.createdAt < request.createdAt ||
        !lot.proofMedia || lot.proofMedia.barnId !== request.barnId || !normalizeMediaUrl(lot.proofMedia.url)) {
      throw new LifecycleError("Ghi lô của đúng yêu cầu trước: số con, số cân và ảnh lúc cân phải khớp đàn.");
    }
    assertLifecycleWeight(lot.qty, lot.weightKg);
    weightKg = lot.weightKg;
  } else if (!request.retireTermsAcceptedAt || !request.retireTermsVersion) {
    throw new LifecycleError("Yêu cầu chưa ghi nhận điều khoản nuôi dưỡng của chủ chuồng.");
  }
  const terminal = request.choice === "MEAT" ? "HARVESTED" : "RETIRED";
  const cas = await tx.flock.updateMany({
    where: { id: flock.id, version: flock.version, stage: "END_OF_LAY", lifecyclePolicy: flock.lifecyclePolicy },
    data: { stage: terminal, version: { increment: 1 } },
  });
  if (cas.count !== 1) throw conflict();
  const changed = await tx.bird.updateMany({
    where: { flockId: flock.id, id: { in: request.birdIds }, status: { in: [...LIVE] } },
    data: { status: terminal },
  });
  if (changed.count !== request.expectedCount) throw conflict();
  const done = await tx.lifecycleRequest.updateMany({
    where: { id: request.id, status: request.status, version: request.version },
    data: { status: "COMPLETED", version: { increment: 1 }, activeFlockId: null, completedAt: now, closedAt: now },
  });
  if (done.count !== 1) throw conflict();
  await tx.flockOutcome.create({ data: {
    requestId: request.id, flockId: flock.id, choice: request.choice, qty: input.confirmedCount,
    weightKg, workerId: input.workerId, proofMediaId: input.proofMediaId, completedAt: now,
  } });
}

export async function closeLifecycle(tx: Tx, locked: Locked, status: "DECLINED" | "CANCELLED", reason: string, now = new Date()) {
  const { request } = locked;
  if (request.status === status) return false;
  if (request.task?.status !== "OPEN" || request.harvestLot ||
      !["REQUESTED", "ACCEPTED"].includes(request.status) ||
      (status === "CANCELLED" && request.status !== "REQUESTED")) {
    throw new LifecycleError("Việc đã bắt đầu xử lý hoặc đã ghi lô; liên hệ nông trại để đối soát, không rút hay từ chối lúc này.");
  }
  const cas = await tx.lifecycleRequest.updateMany({
    where: { id: request.id, status: request.status, version: request.version },
    data: { status, reason, closedAt: now, activeFlockId: null, version: { increment: 1 } },
  });
  if (cas.count !== 1) throw conflict();
  return true;
}
