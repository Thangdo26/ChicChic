# ChicChic — báo cáo BA/co-founder

Ngày 2026-09-06 · audit commit `60f7b87ed03a2e3534bca47255cb247368a810d7`

## Kết luận điều hành

ChicChic đã có một lõi khác biệt và đáng giữ: khách không bấm để “đổi” con gà; họ tạo việc, nông dân làm thật, ảnh/video mới đóng việc. Payment, harvest lot, market/handover, DomainEvent và Family Learning đã có nền PoC đáng kể. Tuy nhiên chưa nên mở rộng acquisition hoặc trẻ em ngay. Bốn nhóm P0 cần khóa trước là:

1. lifecycle request phải tách khỏi outcome có proof;
2. lứa mới phải tạo identity mới, không reset/xóa lịch sử;
3. health/food-safety hold phải là domain gate ở mọi cửa lot;
4. task/shipment/payout phải idempotent + CAS theo target snapshot.

Song song phải tách child/adult server session. Các rủi ro này lớn hơn việc thêm mini-game, AI, RFID hay CMS.

## Trải nghiệm sản phẩm đích

`Đặt suất → farm tiếp nhận → úm/quan sát → lớn → đẻ hoặc review xuất thịt → proof → lot safety → nhận/bán → outcome → lịch sử lứa`. Mỗi màn hình trả lời “ai làm, bằng chứng gì, mốc này là dự kiến hay thật, tiền/lô nào bị ảnh hưởng”. Ngày không có log là unknown, không phải zero. Family learning là parent-mediated, có hoạt động offline, không streak/leaderboard/ads.

## Pilot đề xuất

6–8 tuần, một farm và một delivery zone, 5–15 gia đình ấm; tách cohort brooding/near-lay/adult broiler. Pilot chỉ là giả thuyết nội bộ: activation ≥60%, W6 retention ≥40%, offline family mission ≥30%, parent report seen ≥50%, worker incremental median ≤30 phút/farm/tuần, zero critical safety/privacy. Một cohort gà con mới không thể chứng minh trứng đầu trong 6–8 tuần; phải quan sát dài hơn.

## Bằng chứng và giới hạn

Đã quét/đọc 255 file Git (59.565 dòng; 225 TS/TSX; 51 Prisma model; 11 Markdown), đọc sâu các route/action/lib/schema/test liên quan; `npm test` 918 pass, `tsc` pass, lint pass. Chưa có production DB/credentials, browser/concurrent HTTP hoặc Prisma engine nên chưa đánh dấu những gate đó là pass.

## Tài liệu bàn giao

Đọc [`docs/ba/2026-09-06/00-README-HANDOFF.md`](ChicChic/docs/ba/2026-09-06/00-README-HANDOFF.md) để đi qua toàn bộ bộ tài liệu. Audit có permalink code và mã `CC-F01…CC-F10`; backlog có story/AC/dependency; Codex prompts có format handoff; UAT và rollout có cổng NO-GO.

## Việc nên làm trong 7 ngày đầu

1. PO ký các quyết định safety owner, lifecycle outcome, retirement/refund, use-by, worker SLA và pricing coverage.
2. Developer viết integration tests cho lifecycle/task/hold/session trước migration.
3. Ops shadow một farm: đo phút thật, proof failure, temperature/lot flow, support questions.
4. Product chỉnh copy “dự kiến/đã xác nhận/đang chờ”, bỏ mọi claim không có record.
5. Chỉ sau khi UAT P0 pass mới mời cohort adult; family warm cohort đi sau.

Không có thay đổi source code trong gói này; đây là tài liệu BA/PRD/technical handoff để bạn duyệt trước khi Codex triển khai.

