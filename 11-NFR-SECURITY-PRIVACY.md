# ChicChic — NFR, security và privacy

**Kiểm tra và vá 08/09/2026:** quyền CHILD cưỡng chế ở auth/action/API, tách allowlist khỏi quyền ADULT; scope CAS/token rotation/audit, không nâng reauth khi exit. Generic task lock + Family suggestion/approval transaction đã có test race PostgreSQL. Next/Vitest/PostCSS cập nhật, npm audit về 0 advisory, CI kiểm dependency và HTTP origin/cookie. Header bảo mật cũ đã được smoke kiểm nosniff/frame. Còn mở: browser nhiều tab/mobile, CSP, media classification/retention, outbox, health hold union, tải lớn và fail-open rate limiter khi DB bộ đếm hỏng. Không coi audit package là pentest hay chứng nhận tuân thủ. [Chi tiết](docs/engineering/CC-B08-SECURITY.md).

## 1. NFR mục tiêu pilot

| Nhóm | Mục tiêu |
|---|---|
| Correctness | money/lot/lifecycle transition atomic; idempotent retry |
| Availability | owner view degraded gracefully; farm queue offline retry; cron alert |
| Auditability | actor/time/policyVersion/proof/event cho mọi critical change |
| Performance | mobile farm page usable on 3G; queue query indexed; no N+1 critical path |
| Privacy | least privilege, child allowlist, public trace redaction, deletion/export policy |
| Safety | hold/recall fail closed; no unsupported health/food claim |
| Accessibility | parent/child copy readable, keyboard/touch, print worksheet |

## 2. Threat model

- crafted server action/FormData bypass UI;
- parent cookie reused in child mode/direct URL;
- IDOR qua barnId/childId/lotId/orderId;
- duplicate callback/race tạo payout/task/state;
- đoán trace code/public media scrape;
- service-role storage key leak hoặc raw public URL;
- worker phone mất/kết nối chập chờn;
- health/child data xuất hiện trong notification/analytics;
- admin sửa state không audit;
- cron crash sau state trước event.

## 3. Controls bắt buộc

1. Auth + scope + ownership trước mọi DB read/write.
2. Allowlist input/catalog; không tin hidden field.
3. CAS/unique/idempotency ở DB, không chỉ debounce client.
4. Event/outbox trong transaction; receipt unique.
5. Public trace token đủ entropy, rate limit, field redaction.
6. Media classification, signed upload, malware/type/size check, EXIF strip, retention/delete blob job.
7. Notification chỉ nội dung tối thiểu; không child nickname/address/health sensitive ngoài scope.
8. Admin action reason + actor + before/after audit; break-glass review.
9. Secrets server-only; rotate webhook/service keys; HMAC nếu provider hỗ trợ.
10. Backup restore drill và migration preflight duplicate checks.

## 4. Child privacy

Giữ FL-D11: nickname, age band, closed avatar, consent purpose; không DOB, trường, vị trí, child media/audio/free text. Chỉ parent export/delete đúng child; farm photos không mặc định là child data nhưng phải lọc khuôn mặt/PII và có public approval. Legal review phải đối chiếu khung Việt Nam hiện hành trước pilot; tài liệu này không tự kết luận compliance.

## 5. Security acceptance

Pentest/negative tests cho mọi action; cross-user matrix A/B; child direct URL; stale session; raw storage URL; race payout; SQL/JSON injection; oversized media; webhook replay. Critical finding = NO-GO.
