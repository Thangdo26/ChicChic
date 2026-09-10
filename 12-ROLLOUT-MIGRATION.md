# ChicChic — rollout, migration và rollback

**Migration 10/09/2026:** danh mục đã áp production sau backup/restore/rehearsal mới, mọi cột cũ giữ nguyên; ba schema gate đạt. Local: 992 unit, 32 PG nghiệp vụ + 18 lifecycle, 52 HTTP; tsc/lint/build/build:vercel và audit 0 advisory đạt. Kiểm CI/Vercel đúng SHA khi phát hành; [bằng chứng và rollback](docs/engineering/CC-EXPERIENCE-20260909.md).

**Đợt 09/09/2026:** thêm migration 202609080002_experience_catalog sau lifecycle + session. Backup mới 54 bảng/1.067 dòng đã restore và rehearse khớp checksum, không đổi cột cũ. Vercel có ba gate schema. Rollback giữ schema/biên nhận/lịch sử; code cũ không hiểu active/mẫu mới nên cần dừng bán hoặc backport phần tương thích, không xóa món hay sửa stock để né. Không rollback về code xóa lịch sử hoặc bỏ CHILD scope. Trạng thái áp production/build/smoke cuối: [runbook trải nghiệm 09/09](docs/engineering/CC-EXPERIENCE-20260909.md).

**Thực thi bổ sung 08/09/2026:** migration `202609080001_session_scope` thêm Session scope/version/child và bảng audit, đồng thời hết hạn phiên cũ để buộc đăng nhập lại một lần. Backup 53 bảng/974 dòng, restore khớp checksum; rehearsal giữ lịch sử nghiệp vụ, chỉ đổi Session.expiresAt cũ có chủ ý. Vercel bắt buộc hai schema gate lifecycle + session trước build. Trước rollback code cũ phải thu hồi Session CHILD bằng rollback.sql, giữ schema/audit. `child_scope_v1` bên dưới là đề xuất cũ: bản hiện tại luôn cưỡng chế scope, không có flag tắt hàng rào; Family flag tắt trải nghiệm nhưng vẫn cho cha mẹ thoát. [Runbook](docs/engineering/CC-B08-SECURITY.md).

## Phase 0 — chuẩn hóa tài liệu/policy

Đóng source-of-truth matrix, cost/SOP owner, legal/privacy/education review, seed không còn claim giả. Feature flags: `lifecycle_v2`, `safety_hold_v1`, `child_scope_v1`.

## Phase 1 — internal shadow

Một farm, không khách trẻ. Chạy parallel ledger với code cũ; import cost, record worker minutes, replay task/cron, thử outage/restore. Exit: P0 UAT pass và không divergence không giải thích.

## Phase 2 — adult cohort

5–10 owner, một delivery zone; ưu tiên near-lay và broiler adult để kiểm output. Không mở market nếu safety/ship/payout chưa pass. Support trực tiếp, daily incident review.

## Phase 3 — family warm cohort

5–15 gia đình, parent-mediated, 1 farm. Family chỉ LAYER/RETIRE; child scope + catalog đóng; không trường học/ads/leaderboard. Parent consent/withdraw/delete/export drill trước mỗi cohort.

## Phase 4 — dài hạn

Theo dõi một cohort đủ cycle để kiểm first egg/end-of-lay/renew; không suy diễn từ pilot 6–8 tuần. Chỉ mở multi-flock/renew sau khi history model ổn định.

## Migration runbook

1. backup + checksum + maintenance window;
2. preflight duplicate/NULL/invalid enum;
3. add nullable columns/index concurrently nơi phù hợp;
4. backfill cycle 1/date confidence UNKNOWN, không tự bịa actual;
5. dual-read/dual-write có audit;
6. verify counts/trace/financial totals;
7. flip feature flag cohort nhỏ;
8. monitor errors, orphan tasks, hold bypass, payout duplicates;
9. finalize constraints sau observation;
10. archive old path nhưng giữ history.

## Rollback

Tắt flag → quay read path cũ chỉ khi không làm mất safety; không rollback bằng xóa history. Nếu migration backward-incompatible, restore DB snapshot và replay immutable events/ledger. Payout/financial/refund phải đối soát riêng trước khi mở lại.
