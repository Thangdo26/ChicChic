# Trải nghiệm chuồng, trang trí và Family — 09/09/2026

## Phạm vi và quyết định của chủ dự án

Theo yêu cầu tiếp tục kiểm tra luồng user/admin/nông dân: sửa lỗi đặt tên, mua/lắp/mặc yếm, đăng/rút tin, nhận và bàn giao chuồng; cải thiện cảnh SVG; admin quản lý vật phẩm theo mùa; phụ huynh tự mở Family. Không triển khai multi-flock/RENEW, HealthHold, Shipment hoặc sản phẩm mới.

**Divergence đã xác nhận trước khi sửa:** source trước đợt này đã có cảnh khối và dữ liệu yếm, nhưng cảnh tĩnh; Family cần lời mời admin; danh mục mới phải sửa seed; chưa có cột ngừng bán/CAS danh mục. Bộ BA nằm ở gốc repo, đường dẫn `docs/ba/2026-09-06` trong handoff cũ không tồn tại.

Yêu cầu mới của chủ dự án thay điều kiện *phải có lời mời admin* bằng xác nhận trực tiếp của phụ huynh. FL-D04 vẫn là enrollment riêng, không tự bật mọi chuồng. FL-D01…FL-D24 còn lại giữ nguyên: LAYER, consent/assent, ADULT/CHILD scope, parent duyệt mong muốn, không tiền/free text/media/direct task cho trẻ. Cam kết `FAMILY_RETIRE_ONLY` không đảo ngược. Cờ `FAMILY_LEARNING_ENABLED` vẫn là cầu dao vận hành; tự mở không vượt PAUSED hoặc cờ tắt.

## Kết quả rà soát và sửa

| Luồng | Lỗi/thiếu đã sửa | Chứng cứ |
|---|---|---|
| Nhận chuồng | Khóa retry không kiểm chủ đơn có thể trả đơn tài khoản khác; nhiều request có thể vượt tải hoặc tạo nhiều cọc treo | PostgreSQL 25 request, thử khóa người khác; khóa FarmWorker → User trước kiểm lại |
| Đặt tên | Ghi tên cần kiểm lại chủ hiện tại và đúng gà LAYER/ALIVE; tên chuồng CAS chống tab cũ | PG chéo tài khoản, trạng thái gà, Unicode; HTTP action |
| Danh mục admin | Thêm/sửa/ẩn món từ 16 mẫu an toàn, gồm 5 mẫu lễ hội; không nhận SVG/HTML/URL tùy ý | Validation, PG role/CAS và HTTP admin; `DecorItem.active/version` |
| Mua trang trí | Hai lần mua có thể tạo nhiều đơn treo; giá/active/tồn phải kiểm lại khi trừ kho | PG tranh món cuối, 25 request, một đơn, không âm kho; admin mua hộ đứng tên chủ chuồng, đổi chủ trước đối soát bị chặn |
| Xác nhận tiền | DECOR/DELIVER trước đây có thể thiếu task nếu bước sau transaction lỗi | Ghi payment + vật phẩm/lô + task cùng transaction; trigger DB gây lỗi kiểm rollback |
| Lắp/xếp trang trí | Lắp trùng, thay đổi thiếu task, ảnh cũ vẫn được coi là xác nhận bản vẽ mới | Khóa Barn; `Event.id=idem_<decorId>` là biên nhận bền; sửa ảnh về null; so snapshot trước proof |
| Yếm | Tranh kho yếm, yêu cầu mới bị hoàn tất bởi màn hình cũ | Khóa Barn, đối soát đúng id/status; PENDING_OFF vẫn vẽ yếm; rút PENDING_ON giữ lịch sử |
| Đăng bán | Rút rồi đăng lại vướng unique lotId; người bán có thể rút tin đang được giữ chỗ | Dùng lại tin CANCELLED bằng CAS; khóa hạn mức seller; cấm rút RESERVED/PAID/DELIVERED |
| Bàn giao | Kiểm tải ngoài transaction có thể vượt maxBarns; ghi không kiểm snapshot cũ | Khóa cùng FarmWorker với nhận chuồng; CAS Barn; OPEN đi theo người mới, DONE/lô/media giữ người cũ |
| Xóa chuồng | Code cũ xóa Flock/Bird/Health/Lot và nhật ký | Chỉ dọn chuồng chưa từng dùng; khóa Barn FOR UPDATE, đếm mọi quan hệ và Event trước delete |
| Family | Phụ thuộc admin mời; có thể còn đường vào sau khi chuồng đổi chủ | Tự xác nhận, khóa Barn → Flock → Enrollment → Child; event/link một lần, bài chào sau POST; child gate kiểm chủ hiện tại |

`Event` thông thường vẫn là analytics best effort. **Ngoại lệ có chủ ý:** dòng `decor_installed` mang id `idem_…` ghi trực tiếp trong transaction để chống replay sau khi món đã gỡ. Không xóa/prune các biên nhận này. `DomainEvent` vẫn là luồng riêng duy nhất sinh bài; không đưa catalog/tên món/địa chỉ vào payload học của bé.

## Giao diện và cách sử dụng

- Chủ chuồng mở cảnh lớn: gà đi dạo theo CSS, chạm/Enter/Space để xem tên; có nút tạm dừng, focus và `prefers-reduced-motion`. Ảnh nhỏ giữ tĩnh. Không canvas, WebGL, RAF hoặc dependency 3D.
- Cảnh lấy danh sách Bird ALIVE, không tạo thêm gà để làm đẹp; trần hình 12, số nhận nuôi hiện tại tối đa 10. Yếm WORN/PENDING_OFF hiển thị đúng màu; PENDING_ON chỉ có dấu chờ. Cảnh là minh họa, không phải livestream.
- Giữ khung 240×180 nên không migrate vị trí đồ đã mua. Mái, cửa, sân, cây và ánh sáng được vẽ lại bằng SVG. Năm mẫu mới: đèn lồng, chậu mai, cây thông, vòng lá, dây cờ.
- Admin vào `/admin#danh-muc-trang-tri`, chọn mẫu, đặt tên/mã/giá/tồn thực, bật bán khi sẵn sàng. Giá 1…10.000.000đ, tồn 0…9.999. Mã/hình/loại/màu không đổi sau tạo; ngừng bán vẫn giữ đồ đã mua. Đơn cũ giữ giá đã chốt. Seed chỉ tạo món còn thiếu, không ghi đè vận hành.
- Family: tạo hồ sơ với xác minh mật khẩu, nhóm 7–8 cần bé đồng ý; chọn chuồng LAYER đã cọc, đọc cam kết nghỉ hưu và xác nhận. Mở ngay, không cần admin. Có thể thêm anh chị em vào suất ACTIVE. Không vượt yêu cầu MEAT đang xử lý hoặc tự mở suất PAUSED.
- Khu bé có góc ngắm đúng đàn, nhận diện tên/yếm, gợi ý cùng bố mẹ tìm trong ảnh thật. Chạm chỉ đổi state tại máy; decor chỉ lấy món đã có proof, không truyền chữ tự do trên biển. Bài học và mong muốn tiếp tục qua catalog/giới hạn hiện có, không điểm số hay streak.
- Nông dân tải lại danh sách trước khi gửi proof DECOR/GEAR. Danh sách đã đổi thì action từ chối và rollback cả task/media; tab cũ phải mở lại, không bỏ kiểm tra để làm xong.

## Migration và rollback

Migration `prisma/migrations/202609080002_experience_catalog/migration.sql` chỉ thêm `DecorItem.active=true`, `version=0` và CHECK version ≥0. Không backfill vật phẩm lễ hội, không đổi tiền/tồn/đàn/lịch sử. Không tự chạy `db push`, seed hoặc reset production.

1. Backup nhất quán schema public bằng snapshot; phục hồi sang DB riêng; đối chiếu số dòng/checksum từng bảng.
2. Diễn tập SQL migration và ba schema gate trên bản phục hồi. Khi áp thật, khóa ghi trong transaction ngắn, đặt lock timeout; checksum mọi cột cũ trước/sau, sai thì rollback.
3. Áp migration trước code dùng cột mới. `build:vercel` chạy `db:check:lifecycle`, `db:check:session`, `db:check:catalog` rồi Next build. CI dựng baseline + cả ba SQL, chạy PG/HTTP/audit.
4. Chỉ phát hành sau npm test, tsc, lint, build và smoke; kiểm CI/Vercel đúng commit.

**Rollback:** giữ nguyên schema, dữ liệu và biên nhận Event. Ưu tiên sửa tiếp; không DROP/DELETE lịch sử. Trước khi quay về code chưa hiểu `active`/mẫu lễ hội phải dừng bán hoặc mang theo bộ lọc active và renderer tương thích; không dùng stockQty=0 để giả ngừng bán. Giữ hàng rào scope của CC-B08 và khóa xóa lịch sử. Có thể tắt Family bằng cầu dao trong sự cố, nhưng không đổi policy đàn hay công việc chăm gà. Tắt chuyển động chỉ là sửa CSS/UI. `rollback.sql` là truy vấn kiểm tra, không phải script phá dữ liệu.

Backup mới kiểm chứng sáng 10/09/2026, riêng ngoài repo: `C:/Users/thang/AppData/Local/Temp/chicchic-experience-20260910-v1`, 54 bảng/1.067 dòng, archive 209.651 bytes. Restore và rehearsal đã khớp toàn bộ checksum; các cột cũ không đổi. Không đưa dump, cookie, URL có mật khẩu hoặc dữ liệu riêng lên Git.

## Kiểm tra có thể chạy lại

```text
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run test:lifecycle:pg
npm run test:security:pg
npm run build:vercel
npm run test:security:http
npx tsx scripts/render-coop-preview.tsx <thư-mục-preview-riêng>
```

PG chỉ nhận `CC_B01_DATABASE_URL` ở localhost/127.0.0.1, DB `cc_b01_test`; mỗi suite dùng schema riêng. HTTP chỉ nhận `CC_SECURITY_SMOKE_DATABASE_URL` là DB test hoặc restore local, tự khởi động Next production và dùng tài khoản tổng hợp. Không dùng tài khoản/phiên production. Preview xuất 0/1/6/10/12 con và danh mục từ component thật; đã xem PNG, đây là bằng chứng bố cục tĩnh.

**Trạng thái kiểm tra lại 10/09/2026:** 992 unit/render/source tests, 32 PG security/nghiệp vụ, 18 PG lifecycle đạt. TypeScript/lint và `npm run build` đạt. Smoke bản Next production local: **52 assertions đạt**, có Family self-service, catalog admin, tên gà Unicode và cổng CHILD. Admin HTTP cần Basic Auth bên ngoài và scope hợp lệ; fixture smoke dùng mật khẩu test riêng. `npm run build:vercel` cũng đạt đủ ba schema gate và Next build. Kết quả local cuối được chạy lại sáng 10/09 sau khi khởi động lại DB test; lần build bị gián đoạn do DB local tắt không được tính là đạt.

Cập nhật Vitest 3.2.7 → 4.1.11 để vá [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9), advisory mới công bố sau lần audit trước. Đây là lỗi mock dev server; không coi đó là bằng chứng production đã bị khai thác. Vite 8 dùng [Oxc JSX transform](https://vite.dev/config/shared-options#oxc), nên `vitest.config.ts` đặt runtime automatic riêng cho render TSX, không đổi tsconfig/build Next. `npm audit --audit-level=moderate` đạt 0 advisory tại lần kiểm tra này.

## Phát hành 10/09/2026

Migration danh mục **đã áp production** sau bản backup mới và restore/rehearsal: transaction commit, checksum/số dòng của mọi cột cũ giữ nguyên, cả ba schema gate đạt. Không chạy seed hoặc tạo tồn kho lễ hội trên production. Chứng cứ riêng: `production-migrated.json` và `http-smoke.json` trong thư mục backup nêu trên.

Code và tài liệu được phát hành cùng commit lên `main`. Trạng thái CI/Vercel phải kiểm theo đúng SHA commit tại [GitHub Actions](https://github.com/Thangdo26/ChicChic/actions/workflows/ci.yml) và status Vercel của commit; kết quả local không thay thế trạng thái deploy. Smoke production chỉ đọc trang công khai/cổng đăng nhập, không tạo dữ liệu kiểm thử trong hệ thống thật.

## Giới hạn còn lại

Không gọi lần rà soát này là chứng nhận toàn bộ ứng dụng. B02–B05/B07/B09 còn backlog; B06 vẫn thiếu target riêng cho HANDOVER/FREEZE/WEIGH, shipment/split delivery và outbox. Chưa thay đổi SOP thú y/food safety, giá kinh tế, retention/CSP hoặc hành vi limiter khi DB lỗi. Chưa diễn tập webhook ngân hàng/upload thiết bị thật, tải lớn, Safari/Android, nhiều tab/Back hoặc thao tác chạm bằng browser kết nối. HTTP production local và SVG render không thay thế các UAT đó. Nội dung học được giữ nguyên; chưa tuyên bố tác động giáo dục từ cảnh mới.

Tham chiếu thiết kế chuyển động: [W3C Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html), [Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html). Quyền server action tham chiếu [Next.js Data Security](https://nextjs.org/docs/app/guides/data-security).
