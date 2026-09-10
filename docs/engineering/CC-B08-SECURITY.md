# CC-B08 và nền tảng idempotency — 2026-09-08

**Delta 09/09/2026:** release kế tiếp thêm gate danh mục, parent self-service, snapshot proof DECOR/GEAR và sửa race/ownership/history. Không đổi request/outcome hoặc CHILD scope. Xem [runbook mới](CC-EXPERIENCE-20260909.md) trước deploy/rollback; số kiểm tra bên dưới là của release lịch sử.

Đợt này xử lý quyền phiên Family ở server, race của mong muốn/việc thường và dependency có advisory. Không mở RENEW, không đổi FL-D01…FL-D24 và không thay đổi physical outcome của CC-B01.

## Hành vi và các file chính

- `src/lib/auth.ts`: `getCurrentSession` đọc phiên thật; `getSessionUser` mặc định chỉ ADULT; child action dùng `getChildSessionUser`, trang dùng `requireChildUser`. Mỗi request mới đọc lại scope. Request đã được chấp nhận trước khi chuyển scope có thể hoàn tất.
- `src/app/learning-actions.ts`, `src/lib/session-scope.ts`: cha mẹ bấm **Vào khu của bé** bằng POST; vào/ra đều CAS theo phiên + version, đổi token, xóa `reauthAt` và ghi `SessionScopeEvent` cùng transaction. Thoát cần mật khẩu cũ, có rate limit, không cấp dấu xác minh nhạy cảm. Family tắt/consent rút vẫn thoát được.
- `src/middleware.ts`, `src/lib/scope-path.ts`, root layout: middleware ghi đè pathname/header từ client. Layout chỉ cho CHILD xem đường dẫn nằm trong allowlist của đúng bé; các action/API vẫn tự kiểm quyền, không dựa vào layout/middleware. Basic Auth không vượt qua CHILD. API thông báo trả danh sách rỗng cho phiên không có quyền, API thanh toán trả 401.
- `EnterChildSpace`, `ExitGate`, `SessionScopeSync`: chuyển quyền xong tải lại trang; storage event làm các tab khác tải lại; trang khôi phục từ bfcache tải lại. Đây là lớp UX; lớp quyền thật nằm ở server. Nội dung từng tải trước đó không thể bị thu hồi khỏi thiết bị chỉ bằng server.
- `src/lib/de-xuat.ts`: khóa suất rồi hồ sơ; kiểm quyền/link còn hoạt động, kiểm trùng và trần tuần + tạo suggestion trong một transaction. Giữ 3 CARE_WISH/chuồng/7 ngày; không tăng trần theo số bé. Catalog đóng, không thêm dữ liệu trẻ.
- `nhoCoChuLam`: khóa Barn, đọc lại quyền/đích, CAS PENDING và tạo/gộp task cùng transaction. Lỗi DB rollback toàn bộ, không ghi bù ngoài transaction. Trạng thái REVIEWED vẫn không có nghĩa mọi mong muốn đều đã tạo task: ghi nhớ và DECOR_WISH giữ nghĩa cũ.
- `src/lib/task-store.ts`: `upsertTask(input, tx?)` trả `{taskId, created}`, khóa Barn, chỉ cập nhật task OPEN, không gộp task lifecycle. `worker-actions.completeTask/declineTask` cùng thứ tự Barn → Task cho việc thường. Không tự sửa/xóa task trùng đã tồn tại trước đợt này.

## Divergence và giới hạn

Thiết kế BA đề xuất `scopeExpiresAt/revokedAt`; implementation dùng hạn `Session.expiresAt` hiện có và thu hồi token trong DB, không tạo một TTL riêng chưa được chốt. Hết hạn là mất xác thực, không tự cấp phiên ADULT. Phiên cũ không có bằng chứng đang ở scope nào nên migration hết hạn chúng; mọi người đăng nhập lại một lần. Phiên mới bắt đầu ADULT, quyền CHILD bắt đầu từ POST vào khu bé. Nhật ký scope giữ sessionId/userId/version, không giữ token, mật khẩu, childId hay biệt danh.

CC-B06 chỉ hoàn thành phần gộp task/CAS/transaction của Family và thứ tự khóa việc thường. Chưa có semantic unique key cho mọi nguồn tạo task, chưa có TaskTarget/Shipment: FREEZE/HANDOVER còn nhắm theo chuồng; không đánh dấu B06/B07 hoàn tất. B02–B05/B09 và outbox, media approval/retention, health hold union, lot eligibility, safety SOP, pricing/renew vẫn còn.

## Dependency

Next 14.2.35 → **15.5.25**, eslint-config-next cùng phiên bản; Vitest 2 → **3.2.7**. Giữ React 18/Prisma 5 để giới hạn thay đổi. Chuyển `params/searchParams/cookies/headers` sang async; không giữ `UnsafeUnwrappedHeaders`. Override PostCSS của Next sang bản 8.5 đã vá (lockfile giải quyết 8.5.28). `npm ci` và `npm audit --audit-level=moderate` đạt 0 advisory tại thời điểm kiểm tra; không suy ra ứng dụng không còn lỗ hổng. CI dùng Node 22.

Nguồn: [Next security release 25/08/2026](https://nextjs.org/blog/august-2026-security-release), [hướng dẫn nâng cấp Next 15](https://nextjs.org/docs/app/guides/upgrading/version-15). Danh sách advisory và phiên bản thực tế được đối chiếu thêm bằng npm audit/npm registry.

## Migration và deploy

1. Sao lưu consistent snapshot DB production (không lưu credential/dump trong repo), restore sang DB local riêng và đối chiếu count/checksum.
2. DB hiện hữu đã có CC-B01: áp `prisma/migrations/202609080001_session_scope/migration.sql`. SQL thêm enum, ba cột Session, bảng audit, CHECK và unique; hết hạn Session cũ để khóa đường truy cập chưa có scope, không xóa dữ liệu. DB trống: dựng baseline rồi CC-B01 theo runbook cũ, sau đó áp migration scope. Không chạy `migrate deploy` trên DB cũ chưa có migration baseline.
3. Chạy `npm run db:check:lifecycle` và `npm run db:check:session` với DATABASE_URL runtime. `db push` không tạo đủ CHECK.
4. Vercel chạy `npm run build:vercel`: generate → hai gate schema → Next build. Không tự migrate production trong build. Giữ code cũ chạy trong lúc áp schema cộng thêm, rồi mới push code đã qua kiểm tra.
5. Kiểm tra chuồng owner, sổ thu hoạch, farmer, Family và chuyển scope sau release. Rollout cohort Family vẫn cần UAT trên thiết bị thật.

Rehearsal local ngày 08/09: backup **53 bảng/974 dòng**, restore đủ count/checksum; migration guarded kiểm toàn bộ cột cũ trong cùng transaction (bỏ qua ba cột Session mới và expiresAt được đổi có chủ ý); giữ nguyên mọi cột còn lại và lịch sử nghiệp vụ. Trạng thái production được ghi ở handoff/MEMORY sau khi áp thực tế; không suy từ rehearsal.

Test migration bắt được `CURRENT_TIMESTAMP` cast sang timestamp không timezone có thể lệch 7 giờ ở DB Asia/Saigon. Bản cuối dùng mốc 1970 cố định để hết hạn phiên cũ; test xác minh phiên trước migration thực sự đã hết hạn. Backup/rehearsal cuối dùng thư mục riêng ngoài repo, không dùng lại bản rehearsal có lỗi này.

**Production đã áp 08/09/2026:** guarded migration commit thành công, cả gate lifecycle/session đạt; count/hash giữ nguyên mọi cột cũ ngoài Session.expiresAt được chủ ý hết hạn. File xác nhận và backup ở thư mục riêng `chicchic-security-20260908-v3` trong Local Temp, không commit dump/credential. Người dùng cần đăng nhập lại một lần.

## Rollback

- Ưu tiên sửa tiếp và giữ schema cộng thêm. Không có flag tắt hàng rào scope; `FAMILY_LEARNING_ENABLED` chỉ tắt trải nghiệm, không nâng quyền CHILD.
- **Trước khi quay về code không hiểu scope**, chạy `prisma/migrations/202609080001_session_scope/rollback.sql` để thu hồi các Session CHILD. Không nâng CHILD thành ADULT. Người đang ở khu bé phải đăng nhập lại. Giữ các cột/bảng mới và audit.
- Không xóa schema/audit để rollback. Không quay về Next 14 như giải pháp dài hạn vì có advisory; bản rollback ứng dụng cũng cần dependency đã vá.

## Kiểm chứng và lệnh

```sh
npm ci
npx next typegen
npm test
npx tsc --noEmit
npm run lint
npm run test:security:pg
npm run test:lifecycle:pg
npm run build
npm run build:vercel
npm run test:security:http
npm audit --audit-level=moderate
```

Hai suite PG chỉ nhận `CC_B01_DATABASE_URL` là DB `cc_b01_test` trên localhost/127.0.0.1, tự tạo schema ngẫu nhiên. HTTP smoke nhận `CC_SECURITY_SMOKE_DATABASE_URL` trỏ DB local `cc_b01_test` hoặc `cc_security_restore_<ngày>`, dùng schema đã migrate và bản build production. Chạy `scripts/smoke-security.cjs` tạo fixture tổng hợp, không gửi cookie production. Session fixture được thu hồi, dữ liệu test được giữ trong DB local để chẩn đoán. CI dựng DB riêng và chạy đủ cả hai loại test. PowerShell dùng `npm.cmd`/`npx.cmd` nếu execution policy chặn `.ps1`.

Trên Windows, chạy generate/build **sau** khi suite PG đã đóng Prisma, tránh lỗi EPERM đổi DLL đang được test nạp. Không chạy build đồng thời với DB test.

Đã kiểm tra: **959 unit/source tests, 13 PostgreSQL security/idempotency, 18 PostgreSQL lifecycle, 37 assertions HTTP** (gồm POST thật/CSRF/token rotation/HTML/API), tsc/lint/build và audit. HTTP test tạo một lỗi origin có chủ ý; không coi log lỗi đó là lỗi ứng dụng. Chưa có browser kết nối nên chưa chứng minh trực quan storage event/Back/mobile upload; UAT14/15 chưa đóng toàn bộ. Chưa làm pentest độc lập, CSP nonce, media privacy, outbox, SLA tải lớn; rate limit hiện vẫn theo chính sách fail-open cũ khi DB bộ đếm hỏng.
