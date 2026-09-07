# ChicChic — audit codebase có bằng chứng

**Snapshot:** repo public `Thangdo26/ChicChic`, branch `main`, commit `60f7b87ed03a2e3534bca47255cb247368a810d7`. Đây là static/code audit; không phải chứng nhận production readiness.

## 1. Bản đồ hiện tại

| Lớp | Quan sát |
|---|---|
| Web | Next.js 14 App Router, TypeScript, React 18, Prisma/PostgreSQL |
| Vai | chủ chuồng, nông dân, admin; family learning nằm trên parent session |
| Nguồn sự thật | Prisma 51 model, server actions, `DomainEvent`, `FarmUpdate`, `BarnMedia` |
| Chuỗi thương mại | Reservation → invoice/payment reconciliation → HarvestLot → market hoặc handover → payout |
| Chuỗi việc thật | owner/parent tạo `BarnTask`; farmer `completeTask` bắt buộc proof media |
| Test | Vitest 25 file/918 test, chủ yếu pure logic/source invariant; không thay thế DB race/browser/production |
| Việc nền | `/api/cron` gọi advance flock, expire reservation/lot, invoice/decor/nudge; cần secret và lịch thật |

## 2. Điểm mạnh nên giữ

1. `completeTask` là cửa chính cho proof: task DONE đi cùng media; `Barn.outside` chỉ đổi trong cửa này.
2. Money movement tách `DELIVER` khỏi `HANDOVER`; payout chỉ sinh khi đơn đã giao.
3. Family đã khóa nhiều giới hạn đúng hướng: không child login, không child money/market, catalog đóng, không free text/media của trẻ, phụ huynh duyệt care wish.
4. `DomainEvent` có allowlist payload và materializer có receipt unique; đây là nền để xây activity đáng tin.
5. README/CODEMAP đã ghi nhiều invariant và các lỗi lịch sử, giúp developer không lặp lại bug.

## 3. Findings ưu tiên

### CC-F01 — quyết định cuối chu kỳ làm đổi hiện thực trước proof (P0, TECH_READY)

`src/app/actions.ts#L753-L816` tạo `LifecycleDecision`, nhánh `MEAT` cập nhật mọi `Bird` thành `HARVESTED` và `Flock` thành `HARVESTED` trước khi `HARVEST` task được farmer làm xong. Nhánh `RETIRE` cũng đổi toàn đàn ngay. Việc tạo decision, state change, task và nhật ký nằm ở nhiều lệnh ngoài một transaction thống nhất; retry/concurrency có thể tạo decision trùng hoặc trạng thái không có proof. Câu stamp còn khẳng định đã sơ chế/kiểm dịch dù code mới chỉ tạo việc.

**Đề xuất:** `LifecycleRequest` với `REQUESTED → ACCEPTED → IN_PROGRESS → COMPLETED/DECLINED/CANCELLED`; chỉ `completeTask` cùng proof và số lượng đối soát mới ghi outcome/stage terminal. `RETIRE` cần owner fund/worker acceptance; `MEAT` cần harvest record, safety hold check và reconciliation. Migration giữ `LifecycleDecision` cũ làm history.

### CC-F02 — RENEW reset cùng Flock, xóa lịch sử lứa (P0, TECH_READY)

`src/app/actions.ts#L833-L882` `deleteMany` toàn bộ `Bird`/`Product`, reset cùng `Flock` về `BROODING`, đổi `startDate` và xóa vaccination. HarvestLot/HealthEvent/WeighIn/trace cũ vẫn mang `flockId`; dedupe key theo flock có thể chặn event lứa sau. Đây là mất identity lịch sử, không chỉ đổi UI.

**Đề xuất:** Barn có `currentFlockId`; mỗi lứa là Flock bất biến theo cycle, `FlockOutcome` liên kết lứa cũ; lứa mới tạo row mới và copy snapshot được phép. Cấm `deleteMany` dữ liệu nghiệp vụ trong renew. Family vẫn `RETIRE` only theo FL-D13 cho tới khi multi-flock được duyệt.

### CC-F03 — withdrawal đọc event mới nhất, không phải tập hold (P0, NEEDS_PO)

Các trang `src/app/chuong/[id]/page.tsx#L153-L157`, `truy-xuat/page.tsx#L39-L83`, `tx/[code]/page.tsx#L70-L108` lấy `healthEvents take: 1`. Schema có `HealthEvent.withdrawalUntil` nhưng chưa có runtime tạo/cập nhật case/treatment/hold và chưa có gate ở log lot, listing, claim, cart, payment, delivery/complete task. Một event cũ còn hiệu lực có thể bị event mới che khuất.

**Đề xuất:** mô hình `HealthCase`, `Treatment`, `WithdrawalHold` theo flock/product/lot; safety policy trả union hold còn hiệu lực; gate dùng chung ở mọi cửa thương mại và giao/nhận. Mốc hết hạn không tự đồng nghĩa đã đạt điều kiện release; cần người có quyền xác nhận SOP.

### CC-F04 — `LOT_KEEP_DAYS = 7` là custody, không phải use-by (P0, NEEDS_PO)

`src/lib/harvest.ts#L42-L79` và `src/app/market-actions.ts#L46-L187` dùng một hằng số 7 ngày cho thời gian farm giữ lô. Nó chưa có `useByAt`, nhiệt độ, chain of custody, packaging/batch/recall. `LOT_STATUS_VI.CLAIMED` còn nói “đang trên đường” khi mới là yêu cầu nhận.

**Đề xuất:** tách `custodyDueAt` (nông trại giữ bao lâu) khỏi `useByAt`/`storagePolicyVersion` (SOP từng loại hàng). Chỉ công bố ngày/hướng dẫn đã được người chịu trách nhiệm an toàn duyệt; không lấy số tham khảo nước ngoài làm quy định Việt Nam.

### CC-F05 — task và shipment không có target snapshot/CAS đủ chặt (P0, TECH_READY)

`src/lib/task-store.ts#L11-L45` đọc `findFirst OPEN` rồi update/create không transaction/unique semantic key; return không có task id. `completeTask` kiểm status trước transaction rồi `update` theo id (`src/app/worker-actions.ts#L58-L153`), không CAS `OPEN`, nên hai request có thể cùng tạo side effect. `FREEZE` cập nhật mọi lô `AT_FARM` của barn (`#L197-L207`), `HANDOVER` chọn mọi lô `CLAIMED` (`#L220-L229`) thay vì shipment snapshot. `HARVEST` chỉ tìm một lô MEAT theo barn và createdAt (`#L99-L109`).

**Đề xuất:** `TaskTarget`/`Shipment` snapshot exact IDs; unique semantic idempotency; mọi transition `WHERE status = expected`; một transaction cho target state + proof + event + payout; retry trả kết quả cũ.

### CC-F06 — child mode chưa là server-side session scope (P0, NEEDS_PO)

`Session` chỉ có token/user/expires/reauth; middleware đổi header để ẩn adult nav. `moCuaRaNgoai` (`src/app/learning-actions.ts#L381-L396`) xác minh password nhưng không ghi mode/scope. Các adult action chủ yếu chỉ kiểm `getSessionUser`/owner. Vì vậy URL trực tiếp, tab khác hoặc cookie parent có thể đi vào adult route nếu route đó không tự kiểm thêm; static audit chưa chạy HTTP live.

**Đề xuất:** session scope `ADULT`/`CHILD`, enter-child tạo/đổi scope server-side; mọi adult read/mutation yêu cầu ADULT, child chỉ allowlist learning endpoints. Cross-tab revocation và audit. Không tạo child password/PIN mới.

### CC-F07 — family lifecycle gate không bao phủ mọi write path (P0, TECH_READY)

`allowedLifecycleChoices` bảo vệ `decideEndOfLay`, nhưng `worker-actions.logHarvest` (`#L377-L447`) lấy flock theo `productLine/stage`, không kiểm `lifecyclePolicy`, safety hold hay type eligibility ở domain policy chung. Một worker request crafted có thể log MEAT cho Family flock nếu không có gate khác.

**Đề xuất:** `assertLifecyclePolicy`, `assertLotEligibility`, `assertSafetyClear` là domain functions dùng ở mọi write path, không tin form/UI.

### CC-F08 — planned dates bị đọc như sự thật sinh học (P0, NEEDS_PO)

`src/lib/flock.ts` dùng `BROOD_DAYS = 21`; `plannedStage` theo lịch và milestone nói bỏ đèn/qua úm. Reservation tạo Flock/startDate trước khi biết intake thật; cycleDays chung cho breed/feeding. Lịch chỉ là estimate, không xác nhận đã lớn/đẻ.

**Đề xuất:** lưu `dateConfidence` (ACTUAL/ESTIMATED/UNKNOWN), `intakeAt`, `hatchAt`, `stageObservedAt`, expected vs observed stage, actor/source. First egg có proof vẫn là trigger tốt; end-of-lay theo lịch chỉ là review due.

### CC-F09 — outbox/event gap và learning quota chưa đủ (P1)

`lib/jobs.ts` advance cập nhật flock rồi ghi event ngoài transaction; crash giữa hai bước tạo gap. Materializer có receipt nhưng chưa thay thế outbox. Các quota family cần kiểm tra weekly per child/family, không chỉ per run (`TRAN_MOI_BE`, `TRAN_MOI_LUOT`). `chonDonVi` hiện theo task kind, không theo care tag — nên giữ cho tới khi có nội dung được duyệt.

### CC-F10 — economics, media và docs có drift (P1)

Giá/health package/retirement fee có số hiển thị nhưng chưa có bảng cost thật, order-line snapshot và coverage contract rõ. Public storage URL không phải ownership gate; xóa DB row chưa xóa blob. README nói 4 runtime deps/34 models/chưa có test và còn TODO marketplace/harvest đã có trong code; CODEMAP có đoạn family “chưa làm” xen đoạn đã làm.

**Đề xuất:** có source-of-truth matrix, pricing version, cost ledger, media classification (`private`, `approved-public-proof`), retention/delete job, docs CI kiểm link/count.

## 4. Kiểm chứng đã làm và chưa làm

### Đã làm

- đọc cấu trúc và inventory toàn bộ file Git; đếm/hash/line count;
- đọc các Markdown hiện có, Prisma schema, actions/lib/routes/components/tests liên quan;
- `npm ci --ignore-scripts --no-audit --no-fund` thành công;
- `npm test`: 25 file, 918 test pass;
- `npx tsc --noEmit`: pass;
- `npm run lint`: pass.

### Chưa làm được trong snapshot này

- không có production credentials/DB nên chưa chạy `db push`, seed, browser hoặc concurrent HTTP;
- `prisma generate` có engine download bị môi trường chặn; build runtime/Prisma engine chưa được xác nhận;
- chưa xác nhận worker ngoài đời, nhiệt độ, vệ sinh, pháp lý, chi phí, willingness-to-pay hay retention bằng khách hàng thật.

Mọi câu “có thể xảy ra” trong bảng trên là static risk cần integration/UAT chứng minh, không phải incident đã quan sát trong production.
