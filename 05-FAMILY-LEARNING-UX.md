# ChicChic — family learning và giải trí có trách nhiệm

## 1. Quyết định đã khóa

Giữ nguyên FL-D01…FL-D20 trong spec v1.0/v1.1: parent account, hai nhóm 5–6/7–8, Family mặc định LAYER, enrollment riêng, không child money/market/direct farm chat, không child media/free text, không leaderboard/gacha/ads/infinite, không MEAT Family. FL-D21…FL-D24: catalog `CARE_WISH` đóng; trẻ chỉ gửi `ChildSuggestion`; parent duyệt và một chạm tạo task; task hoàn tất có proof/tag mới có thể sinh learning moment. Không đảo FL-D13: Family là RETIRE-only, RENEW chờ multi-flock.

## 2. Job-to-be-done

“Con được tham gia một việc nhỏ có thật, bố mẹ hiểu điều gì đã xảy ra, người nuôi không bị làm phiền quá mức.” Mỗi moment 3–5 phút là product hypothesis; không phải luật y tế/giáo dục. Không mở app vẫn tham gia được qua kể chuyện, ảnh in, worksheet hoặc quan sát ngoài đời có parent.

## 3. Luồng chuẩn

`Parent opt-in enrollment → child enters scoped space → child chọn moment/CARE_WISH đóng → server ghi suggestion không side effect → parent xem reason + target barn → parent approve một chạm → upsert task có cap theo barn → farmer làm + proof/tag → event → materializer tạo moment đã duyệt → parent co-use → child thấy câu ngắn, không tiền/điểm`.

## 4. Catalog v1 đề xuất

| optionKey | Bé đọc | Task | điều kiện |
|---|---|---|---|
| `CHO_AN_RAU` | “Cho các bạn gà ăn rau” | CHECK/FEED preset | farm plan cho phép |
| `KIEM_TRA_NUOC` | “Kiểm tra máng nước” | CHECK | không yêu cầu bé vào chuồng |
| `DON_O_DE` | “Dọn ổ đẻ” | CHECK | worker only |
| `CHUP_CAN_CANH` | “Chụp cận cảnh hôm nay” | CHECK | media public approval |
| `RA_VUON` | “Cho các bạn ra vườn” | RANGE_OUT | farm safety flag + worker discretion |

Catalog là allowlist có copy, age variant, expected proof, safety note, careTag. Không cho child nhập text/ảnh/giọng hoặc chọn task kind tùy ý.

## 5. Hoạt động nên xây

- **Album có chú thích parent:** ảnh thật theo timeline, child nickname/avatar đóng; không nhận diện khuôn mặt.
- **Dự đoán rồi mở lại:** “Con đoán hôm nay có mấy quả?” lưu offline/parent, sau đó so với số **đã ghi**; trạng thái unknown được nói rõ, không chấm điểm.
- **Toán đời thật:** gom trứng, cân mẫu, so sánh trước/sau; không biến yield thành thi đua giữa trẻ.
- **Craft offline:** worksheet chu kỳ, thẻ quan sát nước/thức ăn/hành vi; có bản in.
- **Kính trọng người chăm:** moment luôn ghi “cô/chú nông dân đã làm…” với thời điểm/proof, không coi farm là đồ chơi.
- **Tình huống nhạy cảm:** bệnh/chết chỉ parent-mediated, câu trung tính, chuyên gia duyệt; không tự sinh grief moment từ event.

## 6. Server-side safety

Child session chỉ allowlist route/action learning. Parent session/mode ADULT mới xem barn, duyệt suggestion, money, lifecycle. `moCuaRaNgoai` phải đổi scope server-side, không chỉ xác minh password rồi trả `ok`. Mọi action child kiểm enrollment ACTIVE, parent ownership và rate limit; suggestion tạo task chỉ ở action parent.

## 7. Acceptance criteria

- Child gửi mọi option lạ/rác → reject, không DB side effect.
- Child gửi CARE_WISH → đúng một suggestion PENDING, không task/notify farm.
- Parent khác owner → không đọc/approve được.
- Parent approve hai tab → tối đa một semantic task, suggestion idempotent.
- Family flock → không xuất hiện MEAT/RENEW, kể cả crafted POST.
- Không moment có giá, tiền, địa chỉ, thuốc, leaderboard, streak, quảng cáo hoặc câu dọa.
- Khi enrollment PAUSED/withdrawn, khu trẻ và nudge dừng; chăm thật của đàn không dừng.
