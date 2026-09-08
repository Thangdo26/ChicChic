# ChicChic — bộ handoff BA/co-founder (2026-09-06)

Đây là bộ tài liệu để chủ dự án, BA, developer và Codex cùng dùng khi đưa ChicChic từ PoC sang pilot có gia đình thật. Phạm vi bao gồm chuỗi dịch vụ nuôi hộ gà thật: đặt chuồng → tiếp nhận/úm → lớn → đẻ hoặc xuất thịt → thu hoạch → giao/nhận; đồng thời có lớp học tập và giải trí an toàn cho gia đình có trẻ.

## Cách đọc

1. `01-CODEBASE-AUDIT.md`: hiện trạng có bằng chứng, giới hạn xác minh và các issue mã `CC-Fxx`.
2. `02-BRD-STRATEGY.md`: bài toán kinh doanh, phân khúc, giả thuyết pilot và các quyết định không được suy diễn thành sự thật.
3. `03-PRD-LIFECYCLE.md`: trải nghiệm và luật nghiệp vụ cho vòng đời đàn.
4. `04-HEALTH-FOOD-SAFETY.md`: sức khỏe, ngừng thuốc, an toàn lô và SOP ngoài đời.
5. `05-FAMILY-LEARNING-UX.md`: thiết kế cho phụ huynh/trẻ 5–8 tuổi, dựa trên các quyết định FL-D01…FL-D24 đã khóa.
6. `06-TECHNICAL-DESIGN.md`: mô hình dữ liệu, action/API, transaction, outbox và bảo mật cần bổ sung.
7. `07-OPERATIONS-SERVICE-BLUEPRINT.md`: ai làm gì, bằng chứng nào, SLA, xử lý sự cố.
8. `08-ECONOMICS-PRICING.md`: cách tính giá và biên đóng góp bằng dữ liệu thật, không dùng số minh họa làm cam kết.
9. `09-BACKLOG-TRACEABILITY.md`: backlog P0–P3, story, tiêu chí nghiệm thu và phụ thuộc.
10. `10-UAT-TEST-PLAN.md`: kịch bản nghiệm thu từ đặt chuồng đến giao hàng và family learning.
11. `11-NFR-SECURITY-PRIVACY.md`: NFR, threat model, quyền trẻ/phụ huynh, media và dữ liệu cá nhân.
12. `12-ROLLOUT-MIGRATION.md`: migration không mất lịch sử, pilot theo cohort và cổng go/no-go.
13. `13-CODEX-PROMPTS.md`: prompt copy/paste để Codex triển khai từng slice.
14. `14-RESEARCH-SOURCES.md`: nguồn tham khảo và phân biệt fact với inference.
15. `15-DECISIONS-RISKS.md`: quyết định đã khóa, đề xuất chờ product owner, risk register.

## Trạng thái tài liệu

**Release DB 08/09/2026:** migration scope đã commit production sau backup/restore/rehearsal 53 bảng/974 dòng. Giữ lịch sử nghiệp vụ; hết hạn Session cũ để người dùng đăng nhập lại một lần. Hai gate schema đã đạt. Chi tiết và rollback ở runbook CC-B08.

**Cập nhật 2026-09-08:** CC-B08 đã triển khai quyền ADULT/CHILD ở server, CAS/token rotation/audit và UI vào/ra; CC-B06 đã làm phần transaction/gộp việc Family và khóa việc thường. Nâng Next lên 15.5.25, vá dependency, thêm gate schema + test PG/HTTP vào CI. Bằng chứng, migration/rollback và giới hạn trong [runbook CC-B08](docs/engineering/CC-B08-SECURITY.md). B02–B05/B07/B09 còn mở; B06 và UAT14/15 chưa đóng toàn bộ.

**Cập nhật triển khai 2026-09-07:** CC-B01 đã có code (`59a2931`) và đã áp SQL vào production sau sự cố Vercel thiếu schema `602956053`. Có backup/restore/checksum, gate schema trước build và test PostgreSQL; xem [runbook và giới hạn nghiệm thu](docs/engineering/CC-B01-LIFECYCLE.md). Các finding của snapshot audit bên dưới vẫn là bằng chứng lịch sử; không coi B01 là đã đóng B02–B08 hay toàn bộ UAT.

- `CURRENT`: đã quan sát trong commit audit; không có nghĩa là đã đạt production.
- `PROPOSED`: hướng sản phẩm/kỹ thuật cần PO duyệt.
- `TECH_READY`: đủ rõ để viết code sau khi PO duyệt.
- `NEEDS_PO`: còn quyết định về chính sách, giá, SOP hoặc pháp lý.
- `NO-GO`: không mở pilot cho tới khi điều kiện nêu trong tài liệu được đóng.

Không tài liệu nào trong bộ này tự động thay đổi schema, code, giá, chính sách pháp lý hoặc lời hứa với khách hàng. Các thay đổi code phải vẫn tuân `CLAUDE.md` và `CODEMAP.md`; mỗi migration phải có rollback/đối soát.

## Thứ tự code đề xuất

`P0 dữ liệu + lifecycle` → `P0 health/lot gates` → `P0 task/concurrency` → `P0 session/privacy` → `P1 operations + economics` → `P1 family learning` → `P2 delight`. Không xây mini-game, AI hay CMS trước khi chuỗi chăm thật có proof, SLA và đối soát.

## Phạm vi audit

Audit đọc toàn bộ 255 file được Git theo commit `60f7b87ed03a2e3534bca47255cb247368a810d7` (227 file TypeScript/MJS, 11 Markdown, Prisma schema), lập inventory/hash/line count và đọc sâu các route/action/lib/schema/test liên quan. Đã chạy `npm test` (918 test pass), `npx tsc --noEmit` và `npm run lint` thành công. Chưa xác minh production DB, browser flow, cron thật hoặc build có engine Prisma vì môi trường không cấp phép tải engine; các điểm đó được đánh dấu rõ là chưa kiểm chứng.
