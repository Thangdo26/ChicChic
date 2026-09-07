# ChicChic — UAT và test plan

## 1. Ma trận kịch bản business-critical

| ID | Kịch bản | Kết quả mong đợi |
|---|---|---|
| UAT-01 | reserve + duplicate callback | một reservation/order; snapshot giá; retry an toàn |
| UAT-02 | intake proof | Flock cycle 1, actual/estimated rõ; worker proof hiện đúng |
| UAT-03 | cron missed/retry | không nhảy observed stage; event/outbox không mất/nhân đôi |
| UAT-04 | first egg | EGG lot đúng flock, proof bắt buộc, stage LAYING chỉ sau commit |
| UAT-05 | no egg day | hiển thị unknown/không ghi zero giả |
| UAT-06 | health hold overlap | list/cart/claim/delivery bị chặn tới khi tất cả hold clear |
| UAT-07 | meat lifecycle | request không đổi terminal stage; complete cần exact lot/count/weight/proof |
| UAT-08 | Family meat attempt | UI ẩn và crafted POST đều bị policy từ chối |
| UAT-09 | renew | Flock cũ, lot, health, events/QR còn; Flock mới cycleNo+quote mới |
| UAT-10 | two farmers complete | chỉ một DONE/media/event/payout; request còn lại idempotent/conflict |
| UAT-11 | freeze one lot | chỉ lot target đổi storage; lot khác không đổi |
| UAT-12 | handover | chỉ shipment snapshot delivered; không payout |
| UAT-13 | market delivery | exact order/listing delivered; payout một lần sau proof |
| UAT-14 | child direct URL | adult route/mutation bị 403/redirect; child learning allowlist hoạt động |
| UAT-15 | parent approve two tabs | một task semantic; retry không tạo duplicate |
| UAT-16 | withdraw/pause | child content/nudge dừng; chăm thật không dừng |
| UAT-17 | public trace | redacted fields, safety status đúng, trace code không đoán được |
| UAT-18 | delete/export | export chỉ child scope; deletion không xóa farm audit/financial cần giữ |

## 2. Test data

Tạo cohort riêng: layer brooding, layer near-lay, adult broiler, Family layer, held lot, delivered lot, overlapping health holds, two workers, two parents. Không dùng seed ảnh mẫu làm proof pass.

## 3. Race/rollback

Chạy Postgres thật với 20–50 request song song cho approve, complete, claim, confirm, cron; kill process giữa transaction và retry. Kiểm invariant counts, unique, event receipts, payout, no orphan task. Chạy migration trên copy production-like và rollback/restore rehearsal.

## 4. Exit criteria

Không còn P0 fail; tất cả UAT 01–18 pass; zero critical privacy/safety; worker median task ≤30 phút/farm/tuần; support có runbook; build/DB/browser verified. Nếu môi trường không có Prisma engine/DB, ghi `BLOCKED`, không đánh dấu pass.
