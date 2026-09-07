# ChicChic — economics, pricing và unit model

## 1. Nguyên tắc

Giá hiện trong catalog/MarketPrice/retire fee là số minh họa hoặc policy chưa đủ cost ledger; không dùng làm forecast. Mỗi order phải chụp `pricingVersion`, input, VAT/fee, coverage period, quantity và refund rule. Người dùng mua dịch vụ/output theo policy; không hứa lợi nhuận.

## 2. Công thức contribution

`Contribution / barn / period = revenue_service + net_output_fee - feed - chick/bird cost - worker_minutes × loaded_rate - vet/medicine - packaging - cold_storage - delivery - payment_fee - expected_loss - support - refund_reserve`.

Đo cả cash và accrual: tiền thu trước kỳ sau không phải doanh thu đã thực hiện; payout chỉ sau delivery proof; retirement phải có invoice/term hoặc được đánh dấu subsidy.

## 3. Cost ledger tối thiểu

| Input | Nguồn | Tần suất | Owner |
|---|---|---|---|
| con giống/đầu vào | invoice farm | mỗi flock | farm lead |
| cám/nước/điện | receipt + usage | tuần/tháng | ops |
| phút worker | task started/done + sample audit | tuần | ops |
| hao hụt/dead/variance | flock outcome | mỗi cycle | farm lead |
| thuốc/vet | treatment record | mỗi case | safety owner |
| bao bì/lạnh/giao | shipment | mỗi lot | logistics |
| payment/support/refund | ledger | tháng | finance |

Không nhập chi phí Mỹ/nguồn ngoài để suy ra giá Việt Nam; dùng chúng chỉ để nhận biết cost categories.

## 4. Pricing decisions cần PO

- service fee theo capacity hay theo đầu gà;
- health package là pass-through, allowance theo kỳ hay không bao gồm treatment;
- layer monthly có minimum term, pause, refund và output policy gì;
- broiler one-cycle price bao gồm packaging/cold/delivery tới đâu;
- market take rate, payout timing và seller loss;
- retire fee theo barn capacity hay animal count.

Khuyến nghị: order line frozen snapshot, không đọc lại `Reservation.priceEstimateVnd` cho lứa mới; lứa mới cần quote/version mới và explicit acceptance.

## 5. Bảng giá thử nghiệm (không phải giá công bố)

Dùng three-tier để phỏng vấn/conciege: `Core care`, `Core + family learning`, `Output add-on`. Chỉ sau 2–3 tuần cost data mới quyết định amount. Không dùng discount, gamification hoặc scarcity để che margin âm.

## 6. Metrics

`gross margin`, `contribution margin`, `cash conversion`, `refund rate`, `payout aging`, `worker minutes/farm/week`, `proof completion`, `cost per activated family`, `retention W6`, `output acceptance`. Báo cáo phải tách cohort layer/broiler, farm và storage; không gộp khiến một cohort che cohort lỗ.

## 7. Kill criteria

Nếu contribution âm sau cost thật hai kỳ liên tiếp, hoặc worker burden vượt ngưỡng pilot, đóng thêm acquisition và sửa offer/SOP trước khi tăng traffic. Nếu safety incident, dừng output commerce bất kể doanh thu.
