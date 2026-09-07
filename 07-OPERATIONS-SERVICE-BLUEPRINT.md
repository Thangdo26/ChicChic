# ChicChic — service blueprint và SOP pilot

## 1. Vai trò và trách nhiệm

| Vai | Trách nhiệm | Không được làm |
|---|---|---|
| Owner/parent | chọn gói, duyệt care wish/lifecycle, xem proof, cung cấp địa chỉ | tự tuyên bố farm đã làm; child không xử lý tiền |
| Farmer | chăm ngoài đời, checklist, ảnh/video, lot/weight, decline có lý do | đóng task thiếu proof; tự đổi giá/payout |
| Farm lead/safety owner | duyệt SOP, hold/release/recall, phân worker, incident | bỏ qua health/temperature để kịp SLA |
| Admin | onboarding, reconciliation, support, audit | sửa trực tiếp state không có reason |
| Product/BA | policy/version, pilot metrics, content review | biến hypothesis thành claim |

## 2. Daily farm runbook

1. Mở task theo barn/target flock và kiểm due/exception.
2. Chăm theo SOP stage; ghi observation bất thường.
3. Chụp proof an toàn, không lộ trẻ/địa chỉ; upload media đã phân loại.
4. Ghi feed/water/health/harvest/weight theo form; đối chiếu số lượng.
5. Complete task; nếu không làm được, decline + reason + next attempt.
6. Cuối ca xem queue orphan, hold, overdue và retry upload.

## 3. SLA pilot đề xuất

| Sự kiện | Mục tiêu nội bộ | Escalate |
|---|---:|---|
| intake proof đầu tiên | 24h | farm lead sau 12h |
| daily update | 1 lần/ngày theo farm schedule | owner nếu >36h |
| health high severity | acknowledge 1h | safety owner ngay |
| harvest request | acknowledge 4h | admin sau 8h |
| delivery handover | schedule trong 24h | owner support |
| payment mismatch | triage 1 business day | admin lead |

SLA phải hiển thị là mục tiêu pilot, không hứa tuyệt đối trước khi có capacity data.

## 4. Proof checklist

Proof có target đúng, timestamp/capturedAt, worker, loại media, note ngắn và policy privacy. Harvest cần count/weight; delivery cần shipment ID + trao tay; freeze cần lot IDs; range cần barn state. Ảnh mẫu seed không được dùng hoàn task.

## 5. Exception matrix

| Exception | User state | Farm action | Product action |
|---|---|---|---|
| mưa/worker nghỉ | TASK OPEN/DECLINED | reason + next ETA | không giả DONE |
| upload lỗi | task OPEN | retry/offline queue | giữ idempotency |
| lot health hold | LOT HOLD | quarantine/notify lead | chặn list/cart/delivery |
| partial count | request IN_PROGRESS | record actual + variance | owner approve policy |
| payment mismatch | payment REVIEW | reconcile BankTxn | không mở service/stock sớm |
| lost delivery | shipment EXCEPTION | incident + evidence | refund/replacement policy |

## 6. Support script principles

Nói “chưa có bằng chứng/đang chờ xác minh” thay vì đổ lỗi. Không cam kết “sạch”, “đã tiêm”, “đã kiểm dịch” nếu record chưa có. Khi child hỏi chuyện nhạy cảm, trả về parent; không chat trực tiếp với trẻ.
