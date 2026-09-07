# ChicChic — rollout, migration và rollback

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
