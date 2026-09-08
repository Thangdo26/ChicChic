# ChicChic — prompt triển khai cho Codex

**Trạng thái để chọn prompt tiếp theo — 08/09/2026:** B01 đã triển khai; B08 đã có server scope và PG/HTTP test, còn browser UAT. B06 đã có gộp task khóa Barn, Family approval atomic và return taskId; phần exact target/shipment còn mở. Không triển khai lại hoặc coi các prompt là bằng chứng đã hoàn thành. Đối chiếu [backlog](09-BACKLOG-TRACEABILITY.md) và [runbook security](docs/engineering/CC-B08-SECURITY.md) trước khi chọn slice mới.

Mỗi prompt dưới đây là một slice độc lập. Codex phải báo divergence trước khi code, không tự đổi quyết định LOCKED, không tạo claim y tế/pháp lý, cập nhật CODEMAP và test cùng commit.

## Prompt 0 — audit trước code

```text
Đọc CLAUDE.md, CODEMAP.md §§8–10, docs/ba/2026-09-06/00-README-HANDOFF.md và 01-CODEBASE-AUDIT.md. Đối chiếu schema/source ở commit hiện tại. Lập danh sách file/route/action/model sẽ chạm, invariant bị ảnh hưởng, migration/rollback, test plan. Chưa sửa code. Nếu source lệch tài liệu, báo divergence rõ.
```

## Prompt 1 — lifecycle request/proof

```text
Implement CC-B01 theo 03-PRD-LIFECYCLE.md và 06-TECHNICAL-DESIGN.md. Tách owner intent khỏi physical outcome; không update Flock/Bird terminal stage khi chỉ request. Thêm CAS/idempotency, exact flock target, proof/count/weight gates. Family lifecyclePolicy giữ RETIRE-only. Cập nhật Prisma/schema, actions, task UI, CODEMAP §§2/3/6/8, migration, unit+Postgres integration tests. Chạy tsc, lint, test, build; báo mọi gate bị block.
```

## Prompt 2 — multi-flock history

```text
Implement CC-B02. Không deleteMany Bird/Product/Health/Lot/Event trong renew. Tạo Flock cycle mới, preserve QR/history, currentFlock pointer và billing quote mới. Backfill nullable safely, test old/new trace and duplicate event keys. Không mở Family RENEW. Review financial/refund implications before code.
```

## Prompt 3 — safety hold

```text
Implement CC-B03/04/05 from 04-HEALTH-FOOD-SAFETY.md. Add HealthCase/Treatment/WithdrawalHold/LotSafety or smallest equivalent, keep HealthEvent history. Build one assertLotSafety policy and call every list/cart/claim/payment/delivery/trace path. Replace latest-event lookup with union holds. Separate custodyDueAt from useByAt and version local SOP. Add negative tests for crafted POST and overlapping holds; never invent veterinary intervals.
```

## Prompt 4 — task/shipment concurrency

```text
Implement CC-B06/07. Add semantic idempotency/TaskTarget/Shipment snapshot. Convert completion/decline/cancel/freeze/handover/harvest to expected-status CAS inside transaction. Never select all barn lots for one shipment. Return taskId. Run parallel Postgres tests, retry/kill transaction tests, and update CODEMAP.
```

## Prompt 5 — child/adult scope

```text
Implement CC-B08/Family UX rules. Add server Session scope ADULT/CHILD, enter/exit actions, direct URL and cross-tab tests. Every adult read/write requires ADULT; child allowlist only learning/suggestion. moCuaRaNgoai must change scope, not merely verify password. Preserve FL-D01..D24 and no child money/media/free text.
```

## Prompt 6 — family care wish

```text
Implement only the closed CARE_WISH catalog and parent approval path in 05-FAMILY-LEARNING-UX.md. Child suggestion has no side effect; parent+owner one tap creates one capped task; task proof/tag may emit event. No tag-driven new content until expert review. Add negative content/cross-parent/rate-limit tests.
```

## Prompt 7 — pilot operations/economics

```text
Implement CC-B10–15 only after P0 gates pass: outbox, worker SLA/exception dashboard, pricing snapshot/cost ledger, safety incident workflow, docs drift checks. Keep financial totals reconciled. Do not add push/AI/CMS to hide missing operational evidence.
```

## Prompt 8 — UAT gate

```text
Run docs/ba/2026-09-06/10-UAT-TEST-PLAN.md against a production-like Postgres/browser environment. Produce pass/fail evidence per UAT ID, SQL invariant checks, screenshots/log IDs, and a NO-GO list. Do not mark blocked DB/browser/build checks as pass.
```

## Handoff format bắt buộc sau mỗi prompt

```text
Changed files:
Policy/invariants preserved:
Migration + rollback:
Tests run/results:
Known gaps/blocked gates:
CODEMAP/docs updated:
```
