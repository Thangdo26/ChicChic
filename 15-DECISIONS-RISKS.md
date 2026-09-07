# ChicChic — decisions, risks và câu hỏi chờ PO

## Đã khóa, không tự đổi

FL-D01…D20 theo family v1.0/v1.1; FL-D21…D24 care-wish; Family LAYER + RETIRE-only; child không money/market/direct farm chat; catalog đóng; parent one-tap trong session hiện tại; proof media; no leaderboard/gacha/ads/infinite; DomainEvent không analytics Event; child data tối thiểu; pause digital không dừng chăm thật.

## Cần PO duyệt trước code

1. ai ký observed stage, health release, food-safety disposition;
2. local SOP nhiệt độ/use-by/packaging/recall;
3. retirement term, funding, refund/exception;
4. partial harvest/retire có mở không;
5. worker capacity, delivery zones, SLA và incident coverage;
6. order line/health package/market fee/market loss;
7. legal privacy/consumer/food/education review;
8. pilot cohort tuyển từ đâu và consent wording;
9. retention/deletion cho media, audit, financial records;
10. khi nào multi-flock/renew được mở.

## Risk register

| Risk | Tác động | Tín hiệu sớm | Mitigation/owner |
|---|---|---|---|
| stage giả như đã làm | trust/safety | terminal stage thiếu proof | CC-B01 / product+eng |
| mất lịch sử renew | tranh chấp/output | old QR trỏ lứa mới | CC-B02 / eng |
| lot hold bypass | food incident | lot giao khi health mới | CC-B04 / safety |
| worker quá tải | SLA/churn | overdue/decline tăng | CC-B12 / ops |
| child IDOR | privacy harm | direct URL cross-user pass | CC-B08 / security |
| payout duplicate | financial loss | listing/order totals lệch | CC-B06/07 / finance |
| giá âm biên | cash burn | contribution <0 | CC-B13 / finance |
| content gây sợ | family harm | parent complaint | education review |
| media leak | privacy/reputation | raw URL crawl | CC-B09 / security |
| docs drift | bad code/ops | count/link mismatch | CC-B15 / BA |

## NO-GO trước trẻ thật

Legal/privacy terms; education + ag/vet content review; parent consent/export/delete; child scope; lifecycle/safety/task integration tests; private cross-user tests; QR/physical upload; incident owner; no critical security finding; farm capacity/SLA; build + DB + browser verified.
