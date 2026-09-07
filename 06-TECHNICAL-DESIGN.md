# ChicChic — technical design cho developer/Codex

Tài liệu này là design đề xuất, không phải migration đã chạy. Trước code phải đọc `CLAUDE.md`, `CODEMAP.md` §§8–10 và đối chiếu schema tại thời điểm triển khai.

## 1. Migration tối thiểu theo slice

### Slice A — identity/lifecycle

Thêm `Flock.cycleNo`, `Flock.previousFlockId?`, `Barn.currentFlockId?`, `LifecycleRequest`, `FlockOutcome`, `dateConfidence`, `intakeAt`, `observedAt`, `version`. Backfill cycle 1 từ Flock hiện tại; không xóa Bird/Product/Lot/Event. Đổi đọc UI sang currentFlock nhưng trace/history đọc flockId gốc.

### Slice B — task/shipment

Thêm `TaskTarget(taskId, entityType, entityId, quantitySnapshot)`, `Shipment(id, barnId, ownerId, lotIds, addressSnapshot, status, version)`, `idempotencyKey` scoped theo actor/intent. Cân nhắc relation chuẩn thay JSON để query/unique được. `upsertTask` trả `{taskId, created}`.

### Slice C — health/safety

Thêm HealthCase/Treatment/WithdrawalHold/LotSafety như `04-HEALTH-FOOD-SAFETY.md`; giữ HealthEvent cho backward compatibility, materialize hold hiện có. Thêm policy version và audit actor.

### Slice D — session/privacy/media

Thêm `Session.scope` (ADULT/CHILD), `scopeExpiresAt`, `revokedAt`; tạo `enterChildScope`/`exitChildScope` server action. Media có classification, capture metadata policy, delete/retention job; public URL chỉ cho approved proof.

## 2. Transaction/CAS contract

Mọi action phải: auth/scope → load target → validate policy → transaction với `WHERE id AND status/version expected` → create proof/event/outbox cùng transaction → notify/revalidate sau commit. Nếu `count=0`, trả kết quả idempotent hoặc conflict rõ ràng; không update không điều kiện.

Không gọi `upsertTask` sau transaction nếu task là một phần nghiệp vụ; truyền `tx` hoặc có service transaction. Outbox event có `aggregateId`, `occurredAt`, `payloadVersion`, `publishedAt`, retry count. Materializer receipt unique `(childId,eventId)` vẫn giữ.

## 3. Policy functions

Tạo module thuần, test được:

- `assertLifecycleChoice({flock, actor, choice})`
- `assertFlockWritable({flock, expectedVersion})`
- `assertLotTypeEligible({productLine, stage, type})`
- `assertLotSafety({lotId, action, now})`
- `assertAdultScope(session)` / `assertChildScope(session)`
- `buildShipmentSnapshot(lotIds, address)`

Không lặp policy ở page/client. `FAMILY_RETIRE_ONLY` là khóa bất biến; chỉ enrollment accept được ghi lifecyclePolicy.

## 4. API/action contracts

| Action | Input server-validated | Success side effect | Failure |
|---|---|---|---|
| requestLifecycle | barnId, flockId, choice, idempotencyKey | LifecycleRequest REQUESTED + task target | no stage change |
| completeLifecycle | taskId, proof, measurements | outcome + terminal stage + event | CAS conflict/hold |
| logHarvest | flockId, lot type/count/weight/proof | lot + media + event | eligibility/safety reject |
| createShipment | exact lotIds/address snapshot | Shipment REQUESTED | no loose “all lots” query |
| completeShipment | shipmentId, proof | exact lots delivered + payout if market | no money on HANDOVER |
| approveCareWish | suggestionId | one semantic task + REVIEWED | parent/owner/scope reject |

## 5. Indexes/invariants

Unique active task semantic key; unique lifecycle request idempotency; unique `(barnId, cycleNo)`; index hold `(flockId, status, eligibleAt)`; index lot `(flockId, status, collectedAt)`; shipment target unique; payout unique listing/order. Migration must check existing duplicates before adding unique constraints.

## 6. Test gates

Unit: policy/state/copy rules. Integration Postgres: parallel approve/complete, stale version, hold union, retry. Browser: parent/child tabs, direct URL, upload, payment/QR. Contract: public trace redaction. Load: worker mobile retry and cron duplicate. Run `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` in an environment with Prisma engine/DB; document any unavailable gate.
