# CC-B01 — lifecycle request và physical outcome

Ngày: 2026-09-07. Source đối chiếu: `60f7b87ed03a2e3534bca47255cb247368a810d7`.

## Phạm vi và divergence

- Bộ BA được yêu cầu ở `docs/ba/2026-09-06/` hiện nằm ở gốc repo. Đã đọc các file 00/01/03/06/09/10/13 tại đó, cùng CLAUDE và CODEMAP §§8–10. Không di chuyển tài liệu có sẵn.
- Source khớp snapshot audit: MEAT/RETIRE đổi terminal lúc chủ chọn; RENEW reset cùng Flock và xóa Bird/Product; task HARVEST tra lô theo barn/ngày. CC-B01 thay các đường này.
- Giữ FL-D01…FL-D24. `allowedLifecycleChoices` vẫn là policy Family; điều kiện sẵn sàng ở `assertLifecycleChoice` khóa thêm RENEW cho STANDARD theo PRD §3.8. Chưa triển khai multi-flock/billing quote của CC-B02.
- RETIRE dùng mức `RETIRE_CARE_VND` và cơ chế chọn kỳ/đối soát hiện có. Request lưu chủ đã đồng ý điều khoản + thời điểm + version; farm nhận việc trước proof. Không tự tạo hóa đơn, không dùng thiếu tiền để đổi trạng thái gà.
- Không thêm policy an toàn thực phẩm hay thời gian thuốc. Gate MEAT kiểm toàn bộ HealthEvent còn REPORTED/TREATING hoặc withdrawalUntil còn hiệu lực, cùng Bird đang bệnh. Hệ thống hold/release và các cửa thương mại thuộc CC-B03/04/05.

## Contract

`decideEndOfLay(FormData)` nhận `barn`, `flockId`, `expectedVersion`, `choice`, `idempotencyKey` và `retireTermsAccepted=true` cho RETIRE. Trả `{ok,message,requestId,taskId}`; retry đúng actor/key/intent trả bản cũ. Key khác không được chen vào request còn hoạt động. Chỉ người qua `ownedBarn` được gửi.

`REQUESTED → ACCEPTED → IN_PROGRESS (MEAT đã ghi lô) → COMPLETED`.
Chủ chỉ rút REQUESTED → CANCELLED; farmer có thể DECLINED trước khi đã ghi lô, bắt buộc reason. UI hiện reason và hướng trao đổi/gửi lại. Request/task cũ không bị xóa.

`acceptLifecycleTask` ghi người nhận và thời điểm, chưa đổi đàn. `logHarvest` MEAT nhận exact `flockId`/`lifecycleRequestId`, một lô trọn đàn mỗi request. `completeTask` đòi ảnh/video và `confirmedCount`; service so danh tính từng Bird trong snapshot, không chỉ so số lượng. MEAT còn kiểm lô đúng request/flock/owner, count/weight/proof. RETIRE kiểm điều khoản và farm acceptance. Không ghi đè DECEASED; không tạo partial outcome.

Khóa theo Barn → Flock → Request → Task. CAS task OPEN và request status/version; CAS Flock stage/version/policy khi tạo request và ghi outcome. `nhanLoiMoiGiaDinh` khóa cùng Flock, vẫn là **cửa duy nhất ghi lifecyclePolicy**. Hai kết quả Family accepted và active MEAT không thể cùng commit.

Task DONE, media, nhật ký, Flock/Bird terminal, FlockOutcome, request COMPLETED và CARE_TASK_COMPLETED cùng transaction. Event vẫn qua `ghiSuKien`, giữ cờ Family và allowlist hiện có. Notify/track/revalidate sau commit; chưa bổ sung outbox cho notification (CC-B10).

## Schema và lịch sử

- `Flock.version` default 0; `LifecycleRequest` lưu actor/owner, snapshot Bird, điều khoản, trạng thái và CAS version.
- Unique `(requestedById,idempotencyKey)`, nullable `activeFlockId`, `BarnTask.lifecycleRequestId`, `HarvestLot.lifecycleRequestId`, `FlockOutcome.requestId`/proof.
- Quan hệ request → Barn/Flock, outcome → Flock/request/proof dùng Restrict. Actor/owner là snapshot id; không cascade theo tài khoản.
- Constraint SQL bổ sung kiểm active key/status, snapshot count, RENEW và số đo outcome. Prisma schema không biểu diễn CHECK; **phải chạy migration SQL**, không thay bằng db push.
- Không backfill request/outcome từ LifecycleDecision. Giữ mọi ID Flock/Bird/Health/Product/Lot/Decision/Event, QR và số tiền cũ. Flock một chuồng vẫn là mô hình cũ; không giả tạo cycle mới.

## Migration triển khai

**Đã áp vào database production ngày 2026-09-07 khi xử lý lỗi Vercel `602956053`.** SQL: [migration.sql](../../prisma/migrations/202609070001_cc_b01/migration.sql). Các bước dưới đây áp dụng cho database khác hoặc lần triển khai mới; không chạy lại SQL trên DB đã có schema.

1. Chốt đúng DB mục tiêu và backup/restore có kiểm tra; đối chiếu checksum/số dòng các bảng lịch sử, QR cũ và tổng tiền. Dừng các instance/action lifecycle cũ trong cửa sổ triển khai; phiên bản cũ vẫn có đường đổi stage/xóa lịch sử.
2. Preflight chỉ đọc: xác nhận các bảng/field mới chưa tồn tại; kiểm TaskKind, Flock.barnId; liệt kê task HARVEST cũ OPEN và đàn HARVESTED/RETIRED chưa đủ proof. Các unique mới áp lên bảng mới/cột nullable nên không ép gộp decision/lot cũ.
3. Chạy SQL bằng kết nối trực tiếp đã được xác định, trong maintenance window. Repo trước slice này dùng db push, chưa có migration baseline; **không chạy migrate deploy lên DB cũ** trước khi có kế hoạch baseline riêng.

```powershell
npx.cmd prisma db execute --url $env:CC_B01_TARGET_URL --file prisma/migrations/202609070001_cc_b01/migration.sql
npx.cmd prisma generate
```

4. Triển khai code CC-B01 với `LIFECYCLE_WRITES_DISABLED=1`, đối chiếu lại số dòng/ID/QR/tổng tiền. Dữ liệu cũ không có request, task/lô cũ có lifecycleRequestId NULL; không tự đổi stage cho khớp tài liệu.
5. Đối soát các task/đàn legacy bằng record ngoài đời. Không tự gắn một lô gần ngày vào task cũ. Task HARVEST thiếu request bị từ chối khi hoàn tất, kèm hướng liên hệ nông trại. Việc phục hồi/mapping legacy cần quyết định dựa trên hồ sơ thật, không nằm trong migration tự động.
6. Khi kiểm tra nội bộ đạt, đổi cờ về 0 rồi restart các instance. Chạy UAT-07/08 và các phần lifecycle của UAT-10; không xem B01 là đã đóng các P0 thương mại khác.

Truy vấn đối soát (chỉ đọc):

```sql
SELECT "flockId", COUNT(*) FROM "LifecycleRequest"
WHERE "activeFlockId" IS NOT NULL GROUP BY "flockId" HAVING COUNT(*) > 1;

SELECT r.id FROM "LifecycleRequest" r
LEFT JOIN "BarnTask" t ON t."lifecycleRequestId" = r.id
LEFT JOIN "FlockOutcome" o ON o."requestId" = r.id
WHERE t.id IS NULL OR (r.status = 'COMPLETED' AND
  (t.status <> 'DONE' OR t."proofMediaId" IS NULL OR o.id IS NULL));

SELECT t.id, t."barnId", t.status FROM "BarnTask" t
WHERE t.kind = 'HARVEST' AND t.status = 'OPEN' AND t."lifecycleRequestId" IS NULL;
```

## Rollback

- **Đã có request/outcome:** đặt `LIFECYCLE_WRITES_DISABLED=1`, restart, giữ schema/code đọc và các bản ghi. Cờ này đóng cả request/accept/log MEAT/complete/decline/cancel lifecycle; không đổi gà hay việc chăm thường. Không quay lại action cũ cho phép terminal trước proof. Sửa tiến hoặc đối soát/restore + replay có kiểm chứng; không xóa sổ mới để ép rollback.
- **Bảng mới còn rỗng:** [rollback.sql](../../prisma/migrations/202609070001_cc_b01/rollback.sql) khóa bảng và tự từ chối nếu có dữ liệu/liên kết. Script không xóa lịch sử cũ; giữ enum TaskKind.RETIRE vì PostgreSQL không có DROP VALUE an toàn. Chỉ gỡ schema khi app đã dừng truy cập schema mới. Muốn quay code cũ vẫn phải đóng các cửa lifecycle không an toàn.
- Đã diễn tập trên Postgres test: migrate từ schema audit, giữ fixture lịch sử/QR, cold rollback + reapply; rollback có request/outcome bị từ chối và dữ liệu không đổi. Đây không phải diễn tập restore backup production.

## Kiểm thử và giới hạn

Kết quả ngày 2026-09-07 trên checkout triển khai:

| Lệnh | Kết quả |
|---|---|
| `npm test` | 26 file, 943/943 pass |
| `npm run test:lifecycle:pg` | 18/18 pass trên PostgreSQL riêng tại localhost, gồm 2 ca gate deploy |
| `npx tsc --noEmit` | Exit 0 |
| `npm run lint` | Exit 0, không warning/error ESLint |
| `npm run build` | Exit 0, Prisma generate và Next production build thành công |
| `npm run build:vercel` | Exit 0 trên DB production đã khôi phục local; gate schema chạy trước Next build |
| HTTP `next start` local | 6 lượt qua cổng quyền thật bằng Session fixture trên DB restore: owner, farmer và khách; không error digest |

Trên Windows dùng `npm.cmd`/`npx.cmd` vì execution policy không cho chạy wrapper `.ps1`.
Build đặt DATABASE_URL/DIRECT_URL trong riêng process trỏ về DB test; không đổi `.env` và không kết nối DB đang dùng để kiểm build.

Unit: `npm test`; TypeScript: `npx tsc --noEmit`; lint/build như lệnh chuẩn của repo.

Postgres chạy riêng, không dùng `.env`/DATABASE_URL của app. Tạo DB trống `cc_b01_test` trên localhost; user test cần quyền tạo schema. Bộ kiểm từ chối host khác hoặc tên DB khác. Fixture baseline lấy từ commit audit (repo test cần có commit này).

```powershell
$env:CC_B01_DATABASE_URL = 'postgresql://USER:PASSWORD@127.0.0.1:PORT/cc_b01_test'
npm.cmd run test:lifecycle:pg
```

Bộ kiểm tạo schema ngẫu nhiên, chạy SQL baseline/migration, gọi action thật với Postgres thật. Session, Next callback, notification và billing-lock được giả để không gửi tin/đụng dịch vụ thật; bộ này không chứng minh xác thực HTTP/cookie. Mỗi lần kết thúc tự drop **đúng schema test** và xóa thư mục SQL tạm, kể cả khi assertion fail.

## Gate deploy và khởi tạo DB trống

`vercel.json.buildCommand` gọi `npm run build:vercel`: generate client → `npm run db:check:lifecycle` → Next build. Script [check-lifecycle-schema.cjs](../../scripts/check-lifecycle-schema.cjs) chỉ đọc **DATABASE_URL của runtime**, kiểm các cột mới, enum, unique, FK Restrict và CHECK đã validate. Thiếu schema/constraint hoặc không nối được DB thì exit 1 trước Next build. Không tự migrate, seed, reset hoặc bỏ qua kiểm tra bằng kill switch. `npm run build` vẫn là build local thuần, không chứng minh DB đã migrate.

CI dựng schema audit trên Postgres trống, áp SQL CC-B01, chạy unit + PostgreSQL integration và cùng lệnh build Vercel. Checkout cần giữ commit audit để dựng baseline. Hai ca hồi quy chứng minh: DB trước migration bị từ chối; có đủ cột nhưng thiếu CHECK (như chỉ chạy db push) cũng bị từ chối.

**DB hoàn toàn trống, chỉ để khởi tạo:** xác nhận đúng URL và chưa có bảng ứng dụng trước khi dùng các lệnh sau (PowerShell). Đây không phải lệnh nâng cấp DB đang có dữ liệu:

```powershell
$ccBaseline = Join-Path $env:TEMP ('cc-b01-' + [guid]::NewGuid().ToString() + '.prisma')
$ccBaselineSql = $ccBaseline + '.sql'
[IO.File]::WriteAllText($ccBaseline, ((git show 60f7b87ed03a2e3534bca47255cb247368a810d7:prisma/schema.prisma) -join "`n"), [Text.UTF8Encoding]::new($false))
npx.cmd prisma migrate diff --from-empty --to-schema-datamodel $ccBaseline --script --output $ccBaselineSql
npx.cmd prisma db execute --file $ccBaselineSql --schema prisma/schema.prisma
npx.cmd prisma db execute --file prisma/migrations/202609070001_cc_b01/migration.sql --schema prisma/schema.prisma
npm.cmd run db:check:lifecycle
```

Chỉ seed nếu đó là DB demo mới. DB cũ dùng quy trình backup/migration ở trên. `db push`, `db reset` và `migrate deploy` thiếu baseline không thay thế được quy trình này. Tham khảo [cấu hình buildCommand của Vercel](https://vercel.com/docs/project-configuration/vercel-json#buildcommand).

## Sự cố Vercel ngày 2026-09-07

Code `59a2931` đã deploy nhưng schema chưa áp; trang `/chuong/chuong-1uy66w` trả digest `602956053`. Truy vấn DB xác nhận `P2022` cho `Flock.version`/`BarnTask.lifecycleRequestId` và `P2021` cho `LifecycleRequest`. HTTP 200 vẫn có thể chứa error boundary của Next streaming; phải kiểm nội dung/digest, không chỉ status.

Đã dùng pg_dump snapshot để sao lưu 51 bảng public, 973 dòng vào thư mục riêng ngoài repo; khôi phục sang PostgreSQL local và so khớp số dòng + checksum của cả 51 bảng. Đã diễn tập migration trên bản sao rồi áp cùng SQL lên production trong transaction, với lock timeout và kiểm checksum trước/sau toàn bộ bảng cũ; chỉ commit khi lịch sử không đổi. Sau commit gate schema đạt, request/outcome mới đều 0 tại thời điểm kiểm tra. Không tạo outcome cho decision cũ.

HTTP Vercel sau migration: URL bị lỗi không còn digest, khách chưa đăng nhập được chuyển về đăng nhập; `/chuong/demo` và `/dang-nhap` không có error boundary. Đây chưa phải nghiệm thu tương tác/upload trên browser. Thông tin xác thực và bản dump không được commit.

Đã chạy production build bằng `next start` với DB restore local, tạo Session fixture ngắn hạn và gọi HTTP thật: owner mở trang chuồng/sổ thu hoạch; trang kết chu kỳ chuyển hướng đúng vì đàn chưa END_OF_LAY; farmer mở danh sách và chi tiết chuồng; khách bị chuyển về đăng nhập. Cả 6 lượt không có error digest. Session fixture đã xóa, server test đã dừng; không mượn hoặc tạo session production. Chưa kiểm password login hay thao tác upload qua trình duyệt.

Phủ: 25 request/lot/complete đồng thời; 20 accept/decline đồng thời; complete đua decline; actor/key đua khác đàn; Family acceptance đua MEAT; sai chủ/worker/flock/request/lot; thiếu proof/count/weight/điều khoản; thay Bird dù đủ số; hold cũ bị event mới che; lỗi DB sau stage buộc rollback rồi retry; khóa ghi; legacy task; chặn cancelTask xóa task lifecycle; migration/rollback giữ lịch sử.

Giới hạn còn lại:

- Chưa UAT trên browser/điện thoại hoặc upload thật; URL minh chứng trong fixture chỉ phục vụ test dữ liệu. Chưa kiểm kill process, backup/restore production hoặc media authorization ngoài phạm vi hiện có.
- Chưa đóng CC-B02–B08, safety/release ở list/cart/payment/delivery, full task/shipment concurrency, child/adult session scope.
- Owner/worker đổi trong lúc request chạy sẽ bị kiểm lại dưới khóa. Owner khác snapshot hoặc dữ liệu đàn lệch cần nông trại đối soát; không tự tiếp tục theo ý định chủ cũ. Chưa có workflow admin sửa lifecycle exception.
- Outcome của RETIRE ghi trạng thái tổng kết; lịch sử HealthEvent vẫn giữ. Không coi nghỉ hưu là xác nhận đàn hết bệnh.
- Bộ SQL không tự sửa các terminal/RENEW lịch sử đã ghi sai trước bản này; cần bằng chứng thực tế trước khi phục hồi.
