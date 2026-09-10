# ChicChic — PRD vòng đời đàn và output

**Cập nhật triển khai 09/09/2026:** parent có thể tự mở Family trên chuồng LAYER đủ điều kiện, xác nhận cam kết rồi ghi policy một chiều trong transaction. Không cần admin mời; không vượt MEAT đang xử lý, không tự mở PAUSED. RETIRE/MEAT vẫn cần proof trước terminal và RENEW vẫn đóng. Xóa chuồng có đàn/lịch sử bị chặn. [runbook trải nghiệm 09/09](docs/engineering/CC-EXPERIENCE-20260909.md) ghi delta và kiểm thử; các đề xuất multi-flock bên dưới chưa tự trở thành tính năng.

## 1. Mục tiêu

Biến vòng đời từ một chuỗi stage trong app thành một **sổ sự thật có provenance**. Lịch chỉ tạo nhắc việc/ước tính; worker proof và record có thẩm quyền mới đổi trạng thái nghiệp vụ. Người dùng luôn biết: đàn nào, lứa nào, đang ở đâu, ai chăm, việc gì đang chờ, output nào của lứa nào.

## 2. Khái niệm bắt buộc

| Khái niệm | Định nghĩa |
|---|---|
| Flock cycle | Một lứa bất biến; không reset identity để dùng lại |
| Expected stage | stage dự kiến từ lịch, có confidence/source |
| Observed stage | stage đã được worker/admin xác nhận, có proof/record |
| Lifecycle request | ý định của chủ; chưa phải kết quả ngoài đời |
| Outcome | kết quả đã thực hiện: retired/harvested/yield/exception |
| Lot | output của một flock cycle, có proof, safety state và custody |
| Safety hold | tập điều kiện ngăn lot dùng/bán/giao |

## 3. State machine đề xuất

`PLANNED → BROODING → GROWING → LAYING/FINISHING → END_OF_LAY_REVIEW → {ACTIVE_EXECUTION → COMPLETED_OUTCOME | DECLINED | CANCELLED}`.

`RETIRED` và `HARVESTED` chỉ là terminal outcome sau execution. `END_OF_LAY` theo lịch chỉ tạo review due; không được tự nói đàn đã ngừng đẻ hoặc đã giết mổ.

### Rules

1. Một transition có `expectedVersion`/CAS và actor.
2. Mọi transition thực tế phải liên kết proof hoặc record được policy cho phép.
3. Không xóa Flock/Bird/Health/Lot history khi bắt đầu lứa mới.
4. Family enrollment với `FAMILY_RETIRE_ONLY` không thể chọn MEAT/RENEW; giữ FL-D13.
5. First EGG lot có proof mới cho phép observed `LAYING`; không bật bằng ngày.
6. `MEAT` chỉ hoàn tất khi harvest lot có count/weight/proof và safety policy pass.
7. `RETIRE` chỉ hoàn tất khi farm nhận chăm tiếp, owner funding/term hoặc policy miễn phí đã được ghi.
8. `RENEW` chỉ mở khi đã có model multi-flock và decision PO; tạo Flock mới.

## 4. User stories và acceptance

### LC-01 — thấy sự khác nhau giữa dự kiến và thật

**As** owner, **I want** thấy expected/observed tách biệt, **so that** không bị app hứa sai.

**AC:** màn hình hiển thị source, timestamp, confidence; nếu chưa observed thì dùng “dự kiến/đang chờ”; không có copy “đã qua úm/đã kiểm dịch” nếu thiếu record.

### LC-02 — yêu cầu kết thúc chu kỳ an toàn

**As** owner, **I want** gửi request MEAT/RETIRE/RENEW hợp lệ, **so that** app không tự giả vờ đã làm.

**AC:** request idempotent; stage vẫn review/active cho tới proof; worker thấy target flockId; parent Family chỉ RETIRE; decline có reason và next action.

### LC-03 — bắt đầu lứa mới không mất lịch sử

**AC:** old Flock/Bird/Lot/Health/WeighIn/DomainEvent đọc được; new Flock có cycleNo + actual/estimated intake; billing/order snapshot không trỏ nhầm; trace code cũ vẫn xem lứa cũ.

### LC-04 — lot đúng nguồn và an toàn

**AC:** lot bắt buộc flockId, proofMedia, quantity; type phải hợp product line/stage; safety hold union chặn list/cart/claim/confirm/deliver; public trace chỉ lộ field được duyệt.

## 5. Output journey

### Layer

`brooding → growing → first egg proof → laying journal → end-of-lay review → retire (Family) hoặc adult policy → next cycle only with new Flock`.

Không dùng “ngày thứ X chắc chắn đẻ” làm promise; một ngày không có log là **unknown**, không tự suy ra zero egg.

### Broiler

`brooding → growing → finishing review → owner request → farmer harvest proof/count/weight → safety hold release → owner delivery or market → payout after delivery`.

Không cho Family flow đi vào meat. Adult meat flow phải có safety/weight/trace trước khi bán.

## 6. Product decisions cần PO

- lứa mới có giữ nguyên barn capacity hay tạo reservation mới;
- ai được ký observed stage và safety release;
- term/fee retire, feed/medicine coverage, refund/exception;
- local SOP use-by theo EGG/CHILLED/FROZEN/MEAT;
- có cho owner yêu cầu partial harvest/partial retire không (khuyến nghị chưa mở).
