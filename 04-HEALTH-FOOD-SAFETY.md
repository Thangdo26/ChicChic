# ChicChic — sức khỏe, phúc lợi và an toàn thực phẩm

Tài liệu này là product/operations control, không thay thế bác sĩ thú y, cơ quan thú y, quy chuẩn giết mổ hay tư vấn pháp lý địa phương. Mọi SOP phải có người chịu trách nhiệm ký, phiên bản, ngày hiệu lực và vùng áp dụng.

## 1. Tách ba loại sự thật

| Lớp | Ví dụ | Ai ghi | Có thể dùng để |
|---|---|---|---|
| Health observation | ăn/uống, phân, hành vi, chết, thương tích | farmer | cảnh báo/triage, không tự chẩn đoán |
| Treatment record | thuốc/vaccine, liều theo vet, batch, người kê, thời điểm | vet/farm lead | audit và tính hold |
| Food-safety disposition | hold, release, reject, recall | safety owner | chặn/cho phép lot |

Không cho UI biến observation thành diagnosis; không cho AI kê thuốc hoặc tự tính lịch vaccine.

## 2. Mô hình đề xuất

`HealthCase(id, flockId, severity, openedAt, owner, status)`

`Treatment(id, caseId, product, vetInstructionRef, administeredAt, batch, evidenceMediaId)`

`WithdrawalHold(id, treatmentId, flockId, lotId?, startsAt, eligibleAt, releasedAt?, releasedBy, policyVersion, reasonCode)`

`LotSafety(id, lotId, status=UNKNOWN|CLEAR|HOLD|REJECT|RECALLED, temperatureLogRef, dispositionBy, policyVersion)`

Giữ `HealthEvent` cũ để migration/history. Một flock có nhiều hold; safety query lấy union mọi hold chưa release, không chỉ event mới nhất. Hold phải gắn product/lot exposure nếu có thể; nếu không chắc chắn thì hold rộng hơn, không hẹp hơn.

## 3. Gate bắt buộc

Các cửa `logHarvest`, `listLot`, `claimLot`, cart/reserve, confirm payment, `completeTask` DELIVER/HANDOVER và public trace phải gọi cùng `assertLotSafety(lotId, action)`. Kết quả gồm `allowed`, `reasonCode`, `nextReviewAt`, `policyVersion`; UI chỉ diễn đạt reason đã duyệt.

- `HOLD/UNKNOWN`: không list/bán/giao; owner thấy “đang chờ kiểm tra”.
- `CLEAR`: được phép theo storage/use-by policy.
- `REJECT/RECALLED`: khóa mọi đường; tạo incident và thông báo owner/admin.
- hết `eligibleAt` chỉ đủ điều kiện **review**, không tự release.

## 4. Phúc lợi và chăm thật

Daily update nên có checklist tối thiểu theo stage: nước sạch, thức ăn theo plan đã duyệt, thông gió/nhiệt, mật độ, hành vi bất thường, vệ sinh, dead/injured count. Checklist là nhắc và bằng chứng công việc; không thay thế निरीक्षण trực tiếp. Nếu worker đánh dấu bất thường, task triage phải có SLA và owner escalation.

Không dùng thử thách trẻ để thúc ép chạm gà, vào chuồng, cho ăn thuốc hoặc xử lý con chết. Parent-mediated và offline observation là mặc định.

## 5. Custody, storage, use-by

Tách các mốc:

- `collectedAt`: lúc thu/sơ chế;
- `custodyDueAt`: farm cam kết giữ hộ đến lúc nào;
- `packedAt`, `storageMode`, `temperatureBand`;
- `useByAt`: theo SOP được duyệt cho loại lô, bao bì và nhiệt độ;
- `deliveredAt`, `consumerHandlingAcceptedAt`.

`LOT_KEEP_DAYS = 7` hiện tại chỉ là giữ hộ/market expiry. Không dùng nó làm hạn ăn. Quy định tham khảo quốc tế khác nhau theo loại hàng; local safety owner phải phê duyệt SOP Việt Nam và copy hiển thị. Trace phải trả lời được lô nào, flock nào, treatment/hold nào, ai release.

## 6. Incident runbook

1. Worker/admin mở incident và đặt hold ngay khi nghi ngờ.
2. Khóa listing/cart/delivery/payout liên quan; không xóa event/media.
3. Safety owner phân loại, liên hệ farm/vet, ghi quyết định và thời hạn review.
4. Nếu recall: map toàn bộ lot/order/owner, gửi thông báo, ghi refund/replacement policy.
5. Post-mortem sau khi đóng: nguyên nhân, ảnh hưởng, control test mới.

## 7. Acceptance criteria

- Hai treatment chồng hold: lot vẫn HOLD tới khi cả hai clear.
- Event mới hơn không che được hold cũ.
- Không có route thương mại nào bypass gate bằng FormData crafted.
- Public trace không lộ thuốc/PII không cần thiết nhưng vẫn nói đúng “đang hold/đã clear” theo policy.
- Mọi release có actor, timestamp, policyVersion, reason và audit event.
