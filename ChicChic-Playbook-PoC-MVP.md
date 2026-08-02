# ChicChic — Playbook triển khai PoC & MVP
### Từ ý tưởng đến vòng lặp khép kín đầu tiên có người trả tiền thật

> Tài liệu này gộp toàn bộ các quyết định đã chốt qua quá trình bàn bạc, kèm khung số liệu để điền, roadmap, bộ câu hỏi phỏng vấn, kế hoạch PoC, scope app/web demo, và bảng giá thử nghiệm. Mục tiêu: triển khai dần, chứng minh nhu cầu **trước khi** đổ tiền vào hệ thống.

---

## 0. Decision Log — những gì đã chốt

| # | Vấn đề | Quyết định |
|---|--------|-----------|
| D1 | Bản chất sản phẩm | Consumer agritech **có game hóa**, không phải game thuần. Farm thật, sản phẩm thật, người thật. |
| D2 | Đơn vị sở hữu | **Chuồng (barn/pen)** là đơn vị sở hữu, decorable + watchable. Gà là "nội dung" bên trong, trứng/thịt là "output". |
| D3 | Loại sở hữu | **Sở hữu thật** (không phải biểu tượng): mỗi user gắn với gà thật, gắn tag/chip theo chuồng. |
| D4 | Hai dòng, hai tông cảm xúc | **Broiler** = "đồng hành một mùa vụ, farm-to-table"; **Layer** = "nuôi pet có ích". Không copy-paste chung UX. |
| D5 | Broiler | Nhận nuôi ≥2–3 con/chuồng, gắn theo **chuồng** (không đặt tên từng con), thả vườn có kiểm soát → bắt lại theo tag. |
| D6 | Layer | **Đặt tên từng con**, thẻ ghi mã chuồng + tên + chip. Phòng bệnh baseline bao gồm; chăm sóc nâng cao là tùy chọn. |
| D7 | Decor | Trụ cột trải nghiệm + cỗ máy nội dung. **Catalog module hoá** (prefab), không custom vô hạn. |
| D8 | Feeding | Gameplay lever, đóng thành **2–3 preset** (vd 20% cám : 80% ngô/thóc), mỗi preset gắn giá + thời gian + câu chuyện. |
| D9 | Nông dân | "Farmer-in-the-loop" là **lớp niềm tin chống-đa-cấp**. Có mặt thật, tên thật, công bằng, có đồng thuận lên hình. |
| D10 | PoC | Chạy **cả broiler + layer** ở quy mô nhỏ, một farm, một khu giao. |
| D11 | App/Web | Có build (đã có logo). Nhưng **web-first, mỏng nhất**, thanh toán để ngoài app ở PoC. |
| D12 | Chip RFID | **Hoãn tới MVP.** PoC dùng vòng chân màu + số dập. |
| D13 | Layer cuối chu kỳ đẻ | Sau khi hết năng suất, offer **3 lựa chọn có phẩm giá**: nhận thịt (món hầm) / cho nghỉ hưu ở farm / nuôi lứa mới. Opt-in, không nudge. Là **MVP+** — bake schema + probe Phase 0 ngay. |
| D14 | Sức khỏe (chung 2 dòng) | Tiêm phòng úm **baseline free (bắt buộc theo QĐ)**. Bệnh về sau: user trả thuốc, farm tiêm — **tính giá gốc + bằng chứng** (chống optics "moi tiền"). Chết sau chữa: báo minh bạch, user chấp nhận (đặt kỳ vọng từ đầu). Khuyến nghị **gói "An tâm" trả trước**. Tuân thủ **withdrawal period**. |

---

## 1. Định vị & chiến lược chống-đa-cấp (quan trọng nhất)

**Bối cảnh rủi ro:** ở VN, cụm "nuôi gà/bò online → nạp tiền → nhận lợi ích" đã bị đốt cháy bởi hàng loạt app đa cấp lừa đảo (Trang trại tiết kiệm, nuôi bò online, ấp trứng…). Dân văn phòng 22–35, có học, đọc báo mạng nhiều → **càng cảnh giác với đúng mô típ này**. Đây vừa là rào cản niềm tin, vừa là cơ hội khác biệt hóa.

**One-liner định vị:**
> *ChicChic — nhận nuôi một chuồng gà thật ở nông trại quê, chăm qua app, nhận nông sản thật do các cô chú nông dân chăm giúp.*
> Bản chất pháp lý: **đặt mua trước nông sản (CSA/pre-order) + dịch vụ nuôi hộ + trải nghiệm số**. KHÔNG phải đầu tư, KHÔNG phải góp vốn, KHÔNG hứa lợi nhuận.

**Bảng ngôn ngữ NÊN / KHÔNG NÊN:**

| Nên dùng | Tuyệt đối tránh |
|----------|-----------------|
| đặt nuôi, nhận nuôi, đặt mua trước | đầu tư, góp vốn |
| phí dịch vụ nuôi hộ, phí trải nghiệm | lãi, lợi nhuận, hoàn vốn, sinh lời |
| nhận trứng/gà thật | "tiền đẻ ra tiền", "thu nhập thụ động" |
| công của cô/chú nông dân | hoa hồng giới thiệu nhiều tầng |

**Ba trụ niềm tin (biến điểm yếu ngành thành vũ khí):**
1. **Farm thật, mặt thật** — pháp nhân rõ, địa chỉ farm thật, chủ farm lộ diện. Scam không bao giờ có.
2. **Người thật** — mỗi chuồng gắn với một nông dân có tên (cô Lan, chú Hùng); tiền user trả *nhìn thấy được* đang nuôi sống ai.
3. **Minh bạch cả tin xấu** — báo thật khi gà ốm/chết. Kẻ lừa đảo không bao giờ tự báo tin xấu → chính sự trung thực là tín hiệu chống-scam mạnh nhất.

---

## 2. Thiết kế sản phẩm

### 2.1 Đơn vị sở hữu: Chuồng
- User "sở hữu" một **chuồng** (không phải từng con rời rạc). Decor gắn vào **chuồng** → không vỡ khi một con gà chết.
- Trong chuồng có N con gà (broiler ≥2–3; layer theo gói).
- Mỗi con có tag/vòng chân ghi **mã chuồng** (+ tên nếu là layer).

### 2.2 Broiler (gà thịt) — tông "đồng hành một mùa vụ"
- **Gắn bó ở mức đàn/chuồng**, không khuyến khích đặt tên từng con (để "ngày harvest" không kỳ cục).
- Khung câu chuyện: *đồng hành một lứa từ úm đến ngày thu hoạch → nhận thành quả*. Thành thật kiểu farm-to-table.
- Thả vườn có kiểm soát: diện tích vừa phải, **giới hạn số chuồng/khu quây** để bắt lại khả thi. User có thể bấm "cho ra vườn" / "gọi về chuồng" như một hành động chơi; nông dân thực thi, chụp ảnh.
- **Compliance bắt buộc trước khi bán ra:** giết mổ + kiểm dịch + an toàn thực phẩm. Xác nhận với thú y + chính quyền địa phương *trước*, không phải "nuôi xong ship".
- Endpoint: 1 lần "harvest" → giao thịt sơ chế 1 lần. Vòng kinh tế khép kín.

### 2.3 Layer (gà đẻ) — tông "pet có ích"
- **Đặt tên từng con.** Thẻ ghi: mã chuồng + tên gà (+ chip ở MVP).
- Đây là dòng cho retention/subscription dài hạn: user nhận trứng định kỳ, nông dân nhặt trứng + chụp/quay update.
- **Sức khỏe:** áp dụng **chính sách sức khỏe chung** (mục 2.7). Vì layer là pet-có-tên nên phần điều trị nhạy cảm hơn → ưu tiên gói "An tâm" trả trước để tránh quyết định lúc khẩn cấp.

### 2.3.5 Kết thúc chu kỳ đẻ — option "thịt" hoặc "nghỉ hưu" (dignified end-of-journey)
- **Thực tế nông nghiệp:** gà mái sau ~12–18 tháng đẻ sẽ hết năng suất (gà đẻ loại). Minh bạch cả vòng đời **thành thật hơn** giấu nó, và mở thêm option thịt tương tự broiler.
- **⚠️ Điểm cảm xúc căng nhất toàn sản phẩm:** layer được *cố tình cho đặt tên* → user gắn bó cả năm với "Miu". Đề nghị giết mổ một **pet có tên** khác hẳn broiler. Làm ẩu sẽ đập vỡ niềm tin.
- **Nguyên tắc: opt-in, KHÔNG mặc định, KHÔNG nudge/upsell.** Tại mốc cuối chu kỳ, trình bày trung tính **3 lựa chọn có phẩm giá**:
  1. **Nhận thịt** — farm-to-table trọn vẹn. Sản phẩm: gà mái già hợp **món hầm/tiềm** (gà mái dầu, tiềm thuốc bắc) — kể đúng câu chuyện, không bán như gà tơ.
  2. **Cho "nghỉ hưu"/tặng lại farm** — để gà sống tiếp (có thể phí nhỏ nuôi dưỡng). *Lựa chọn phi-tận-thu này là tín hiệu thương hiệu rất mạnh cho nhóm gắn bó sâu, đúng tinh thần kết nối nông thôn + giúp cô chú.*
  3. **Nuôi lứa mới / đổi chuồng** — mở "chương mới" → điểm re-engagement tự nhiên cho retention.
- **Kinh tế:** phần thịt gà loại là revenue line nhỏ cuối chu kỳ + giảm chi phí cull → cộng nhẹ vào unit economics layer.
- **Compliance:** giết mổ/kiểm dịch/an toàn thực phẩm như broiler.
- **Phạm vi = MVP+.** KHÔNG test được trong PoC 6–8 tuần (chưa tới cuối chu kỳ đẻ). Nhưng: (a) **bake vào schema + story ngay** (lifecycle state cho Bird), (b) **đo khẩu vị ở phỏng vấn Phase 0**.

### 2.4 Decor — vòng lặp cảm xúc & cỗ máy nội dung
- **Vì sao là moat:** gà thật update chậm → decor lấp "boredom gap" bằng sự kiện thường xuyên do user chủ động. Mỗi đơn decor = 1 hành động chơi + 1 ảnh/video update thật → không đối thủ nào (kể cả Adopt a Cow) làm.
- **Nguyên tắc chống-vỡ-trận ở quy mô:** decor = **bộ sticker cho chuồng thật**, prefab, lắp ≤5 phút, chụp 1 ảnh. Hữu hạn, đẹp, nhanh.
- Gợi ý SKU khởi đầu: biển tên chuồng, bảng gỗ nhỏ khắc chữ, máng ăn theo theme, backdrop mùa (Tết/Noel/Trung thu), chậu cây mini, đèn/dây trang trí.

### 2.5 Feeding như gameplay lever
- Đóng thành **2–3 preset**, mỗi preset gắn giá + thời gian nuôi + câu chuyện:

| Preset (ví dụ) | Tỉ lệ | Vibe | Ảnh hưởng |
|----------------|-------|------|-----------|
| Chuẩn | cám công nghiệp cao | nhanh, kinh tế | harvest sớm, giá thấp |
| Quê | 20% cám : 80% ngô/thóc | "gà thả vườn ăn ngô" | chậm hơn, giá cao hơn |
| Đặc sản | ngô/thóc + rau | premium, biếu tặng | chậm nhất, giá cao nhất |

- User thấy được "quyền quyết định cách nuôi", ông vẫn kiểm soát biến số cost/timeline.

### 2.6 Chip/tag: PoC vs MVP
- **PoC:** vòng chân **màu + số dập** (mỗi màu = 1 chuồng/1 khu). Rẻ, mắt thường phân biệt ngay.
- **MVP:** cân nhắc RFID leg band + đầu đọc **chỉ khi** mật độ đàn đủ lớn để việc bắt-lại-đúng-chuồng cần tự động hóa.

### 2.7 Chính sách sức khỏe (CHUNG cho cả broiler & layer)
- **Tiêm phòng bắt buộc theo quy định** khi úm / những ngày tuổi đầu → **BAO GỒM trong phí** (baseline, trách nhiệm của farm).
- **Khi gà mắc bệnh về sau:** user trả thêm tiền thuốc, farm tiêm/cho uống. Hợp pháp & bình thường (như hóa đơn thú y của thú cưng). Rủi ro duy nhất là **optics**: farm vừa chẩn đoán vừa bán thuốc → user (đã bị scam làm cho cảnh giác) có thể nghĩ "cố báo bệnh để moi tiền". Vì vậy **bắt buộc**:
  - **Tính thuốc ở giá gốc/gần gốc, ghi rõ từng khoản** (thuốc gì – giá – công tiêm). Farm **không lấy lãi trên bệnh tật** → điểm chống-scam.
  - **Kèm bằng chứng**: ảnh/video con gà bệnh + ghi chú thú y, không chỉ nhắn suông "gà bạn bị bệnh, chuyển tiền".
- **Nếu chữa mà gà không qua khỏi:** **báo minh bạch** (ảnh/nhật ký điều trị); user chấp nhận kết quả. Đặt kỳ vọng này **rõ trong điều khoản từ lúc đăng ký**, không để tới lúc đó mới nói → cái chết không trở thành "cú phản bội bất ngờ".
- **★ Khuyến nghị — gói "An tâm" trả trước (tùy chọn):** thay vì bắt user quyết định trả tiền *đúng lúc pet đang ốm* (friction cao + cảm giác bị moi tiền), chào **gói bảo hiểm sức khỏe trả trước từ đầu** bao chi phí thuốc nếu cần. Biến quyết định đau lòng lúc khẩn cấp thành lựa chọn bình tĩnh lúc đăng ký; doanh thu định kỳ sạch hơn; xóa hẳn optics "moi tiền". Ai không mua gói mới rơi vào cơ chế trả-theo-lần.
- **⚠️ Thời gian ngừng thuốc (withdrawal period):** gà đã dùng kháng sinh/thuốc thì **trứng/thịt trong thời gian ngừng thuốc KHÔNG được giao như "sạch"**. Chạm thẳng lời hứa "thực phẩm an toàn + traceability" → phải tuân thủ & minh bạch (ghi rõ trên trang traceability), nếu không sẽ tự phá giá trị cốt lõi.
- **Tinh chỉnh broiler vs layer:** broiler gắn bó mức đàn + con rẻ → charge từng lần chữa 1 con có thể tốn goodwill hơn giá trị con gà; cân nhắc **absorb chữa trị lặt vặt cho broiler**, chỉ surface quyết định trả tiền cho ca nặng / cho layer.

---

## 3. Risk register — rủi ro & cách xử

| Rủi ro | Mức | Cách giảm |
|--------|-----|-----------|
| **Bị nhầm là app đa cấp/lừa đảo** | Cao | Toàn bộ mục 1: ngôn ngữ phản-scam, farm thật/mặt thật, minh bạch tin xấu. |
| **Pháp lý — bị hiểu là đầu tư/góp vốn** | Cao | Hợp đồng/điều khoản khung "đặt mua trước + dịch vụ nuôi hộ". Tham vấn luật sư trước khi bán. |
| **An toàn thực phẩm / giết mổ (broiler)** | Cao | Xác nhận điều kiện giết mổ + kiểm dịch với thú y & chính quyền TRƯỚC khi bán broiler. |
| **Gà chết/bệnh** | Trung–cao | Broiler: hao hụt tính vào giá, gắn bó mức đàn. Layer: chính sách bù minh bạch (thay/hoàn). Phòng bệnh baseline miễn phí. |
| **Experience mismatch** (app cute nhưng ops kém → mất niềm tin nhanh) | Cao | Ưu tiên "thật – minh bạch – có quy trình". Decor/feeding hữu hạn để ops theo kịp. Bài học Adopt a Cow: đừng hứa thứ ops không giao được 1:1. |
| **Unit economics âm** (nhất là giao trứng) | Cao | Mục 4. Đo chi phí giao thật ở PoC; nghiêng về giao gộp/pickup point. |
| **Boredom gap tháng 2–3** | Trung | Decor + feeding + sự kiện + mốc sinh học. Đo % tương tác tuần 6–8. |
| **Optics: farm vừa chẩn bệnh vừa bán thuốc → nghi "moi tiền"** | Cao | Tính thuốc giá gốc + ghi rõ từng khoản + bằng chứng ảnh/video/thú y; khuyến nghị gói "An tâm" trả trước; đặt kỳ vọng chết-sau-chữa từ đầu. |
| **Withdrawal period thuốc vs lời hứa "sạch"** | Trung–cao | Không giao trứng/thịt trong thời gian ngừng thuốc; minh bạch trên trang traceability. |
| **Cảm xúc: harvest layer đã đặt tên (cuối chu kỳ)** | Trung–cao | 3 lựa chọn có phẩm giá (thịt/nghỉ hưu/lứa mới); opt-in, không mặc định, không nudge; kể chuyện tôn trọng. |
| **Quyền riêng tư nông dân** | Trung | Đồng thuận lên hình, công bằng, không biến thành "đạo cụ marketing". |
| **Biosecurity** | Trung | SOP phân vùng, khử trùng, kiểm soát ra vào; hạn chế tiếp xúc chéo đàn. |

---

## 4. Unit economics — khung để điền số thật

> **Số dưới đây là minh hoạ để soi cấu trúc — thay bằng số thật của farm ông.** Câu hỏi sống-còn không phải "app có đẹp không" mà **"còn margin sau khi trừ giao hàng không?"**

### 4.1 Chuồng LAYER (định kỳ)
| Khoản | Ước tính minh hoạ / tháng |
|-------|---------------------------|
| Giá trị trứng (10 mái × ~20–25 trứng × 5–7k) | ~1.000.000–1.700.000đ [thay số] |
| — Thức ăn | [ ] |
| — Công nông dân (nhặt trứng, chăm, chụp) | [ ] |
| — Điện/wifi/camera phân bổ | [ ] |
| — Đóng gói | [ ] |
| — **Giao hàng** (chỗ giết margin) | ship nội thành ~20–35k/lần × số lần [ ] |
| — Hao hụt/thú y | [ ] |
| — Phí thanh toán + app | [ ] |
| **= Giá bán gói/tháng cần thiết** | [tính ngược ra] |

**Đòn bẩy quan trọng nhất: mô hình giao.** Giao tuần (4×) có thể ăn 80–140k/tháng chỉ riêng ship → nghiêng về **giao gộp theo tháng**, **pickup point tại toà văn phòng**, hoặc **gộp đơn theo cụm địa lý**.

### 4.2 Chuồng BROILER (một lứa, khép kín)
| Khoản | Ước tính / lứa (~60–90 ngày) |
|-------|------------------------------|
| Giá gà sơ chế tương đương thị trường (theo preset feeding) | [ ] |
| — Con giống | [ ] |
| — Thức ăn (khác theo preset) | [ ] |
| — Công nông dân | [ ] |
| — Hao hụt | [ ] |
| — Giết mổ + sơ chế + đóng gói | [ ] |
| — Giao 1 lần | [ ] |
| **= Giá gói broiler/lứa** | [tính ngược] |

**Ưu điểm broiler cho PoC:** 1 con – 1 giá – 1 lần giao → lãi/lỗ minh bạch trong đúng 1 chu kỳ.

### 4.3 Biến số PHẢI đo trong PoC
1. Conversion **xem → trả tiền thật**.
2. Layer: **% còn tương tác + đặt lại** ở tuần 6–8; **chi phí giao trứng thật/đơn**.
3. Broiler: có ai chịu "harvest" và nhận không; **chi phí giao/con**.
4. **Tỉ lệ mua decor** + ảnh hưởng lên retention.
5. Chi phí **nuôi + công nông dân thật/đầu**.
→ Có 5 số này là biết nên build MVP hay pivot — tốn vài triệu, không tốn vài tháng code.

---

## 5. Roadmap tổng thể

| Phase | Thời gian | Mục tiêu | Đầu ra |
|-------|-----------|----------|--------|
| **Phase 0 — Validation** | 2 tuần | Có nhu cầu thật không? Có phản xạ "đa cấp" không? | 30 phỏng vấn, landing giữ chỗ, tín hiệu cọc thật |
| **PoC v0** | 6–8 tuần | Đóng vòng khép kín có người trả tiền thật; lấy 5 số | ~8–10 broiler + ~8–10 layer, web demo mỏng, 5 chỉ số |
| **MVP** | sau PoC | Bán thật, có hệ thống | app/web bilingual, payment, dashboard farm, ops nông dân cơ bản |
| **MVP v2+** | sau | Mở rộng | breeding, RFID, IoT, thêm loài, thêm farm/khu giao |

---

## 6. PHASE 0 — Validation (Tuần 1–2)

### 6.1 Mục tiêu — trả lời 3 câu
1. Dân văn phòng có **thật sự thích** ý tưởng, hay chỉ tò mò?
2. Họ có **trả tiền lặp lại** không?
3. Họ có phản xạ nghi ngờ "đa cấp/lừa đảo" không, và mức nào?

### 6.2 Business checklist
- [x] Chốt tên ChicChic
- [x] Logo
- [x] Web demo (vượt scope §8.2 — xem [§8.6](#86-đối-chiếu-thực-tế-thi-công--cập-nhật-2026-08-02))
- [ ] Mua domain
- [ ] Brand guideline tối giản (màu, font, tone chống-scam)
- [ ] Pitch deck ngắn (10–12 slide)
- [ ] Landing page **giữ chỗ** (Framer/Carrd, 1–2 ngày)

### 6.3 Bộ câu hỏi phỏng vấn — kiểu "phản-đa-cấp"
> Nguyên tắc: **không** mở màn bằng "bỏ 300k nuôi gà nhận trứng" (câu này kích hoạt phản xạ scam). Đào nhu cầu nền trước, lộ concept trung tính sau, đo **hành vi** thay vì lời nói. Phỏng vấn ≥30 nhân viên văn phòng.

**A. Phân khúc / khởi động**
1. Bạn làm nghề gì, ngày làm mấy tiếng?
2. Có chơi game nông trại/nuôi thú kiểu Hay Day, Pou… bao giờ không?
3. Có nuôi thú cưng không? Nếu không, vì sao?
4. Tần suất mua "thực phẩm sạch"? Mua ở đâu?
5. Bạn có gốc gác/kỷ niệm với nông thôn không?

**B. Đào nhu cầu (chưa lộ sản phẩm)**
6. Sau giờ làm, điều gì khiến bạn thấy thư giãn/dễ chịu?
7. Bạn có **tin** nguồn thực phẩm mình đang mua không? Vì sao có/không?
8. Từng muốn nuôi con gì mà không nuôi được (vì ở chung cư, bận…) không?

**C. Lộ concept — trung tính, không dùng từ đầu tư**
> "Có một dịch vụ cho bạn **nhận nuôi một chuồng gà thật** ở nông trại quê. Bạn xem qua app, **trang trí chuồng**, chọn cách cho ăn, và định kỳ **nhận trứng/gà thật** do các cô chú nông dân chăm giúp. Không phải đầu tư sinh lời — là đặt mua nông sản kèm trải nghiệm."

9. Phản ứng đầu tiên của bạn là gì?
10. **(đo scam-suspicion trực diện)** Nghe tới đây bạn có nghĩ nó giống mấy "app nuôi bò/gà online" không? Vì sao? Điều gì sẽ khiến bạn **tin** đây là thật?
11. Chi tiết nào hấp dẫn nhất: trang trí chuồng / đặt tên gà / xem video / các cô chú nông dân / nhận sản phẩm thật?

**D. Willingness to pay — đo hành vi**
12. Bạn nghĩ một trải nghiệm thế này **đáng bao nhiêu/tháng** (layer) hoặc **/lứa** (broiler)? (hỏi mở trước, đừng mồi số)
13. **(cam kết thật)** "Tụi mình sắp mở 10 suất thử. Bạn có muốn **giữ chỗ bằng khoản cọc nhỏ hoàn lại** không?" → *đây là tín hiệu vàng, không phải câu "sẽ thử".*

**E. Deal-breakers**
14. Điều gì khiến bạn **KHÔNG** dùng?
15. Nếu con gà bạn nuôi bị ốm/chết, bạn muốn tụi mình xử lý thế nào?
16. **(cuối vòng đời layer)** Sau khi một con gà mái đẻ đủ lâu và hết năng suất, bạn muốn: nhận thịt (món hầm), cho nó "nghỉ hưu" ở farm, hay nuôi lứa mới? Điều đó ảnh hưởng thế nào tới cảm nhận của bạn về dịch vụ?
17. **(mô hình sức khỏe)** Nếu gà bị bệnh, bạn muốn trả tiền thuốc **theo từng lần**, hay mua **gói "an tâm" trả trước** bao chi phí chữa? Mức nào bạn thấy hợp lý? Bạn có thấy phiền nếu farm vừa báo bệnh vừa bán thuốc không?

### 6.4 Ngưỡng pivot (nghiêm khắc hơn "20/30 nói sẽ thử")
- **Lời nói rẻ.** Ưu tiên tín hiệu hành vi: ≥ [X, gợi ý 8–10] người **để lại cọc/đăng ký thật**.
- Scam-suspicion phải **quản lý được** (đa số nói "tin nếu thấy farm/người thật").
- Nếu dưới ngưỡng → **pivot trước khi code**.

---

## 7. PoC v0 — kế hoạch chi tiết (Tuần 3–10)

### 7.1 Nguyên tắc
- **Nhỏ, thủ công-nhưng-thật, đo 5 số.** Concierge/Wizard-of-Oz: giả lập trải nghiệm bằng tay, chỉ số vẫn thật.
- Cohort nhỏ, một farm, một khu giao. Thanh toán **thật**.

### 7.2 Scope & checklist — tách 2 track

**Chung (farm + ops)**
- [ ] Chuẩn bị khu nuôi, chia chuồng, **quây khu giới hạn số chuồng** (để bắt-lại khả thi)
- [ ] Vòng chân màu + số dập theo chuồng (KHÔNG RFID)
- [ ] Chọn & thống nhất với nông dân (tên, công, đồng thuận lên hình)
- [ ] SOP biosecurity tối thiểu
- [ ] 1 camera/điện thoại để quay update; QR traceability = trang tĩnh làm tay
- [ ] Quy trình chụp/quay + đăng update (nhịp cố định, vd 2–3 lần/tuần)

**Track BROILER (~8–10 user)**
- [ ] 2 giống (vd gà Mía, gà Đông Tảo), ≥2–3 con/chuồng
- [ ] 2–3 feeding preset
- [ ] Xác nhận pháp lý giết mổ/kiểm dịch trước ngày harvest
- [ ] 1 lần harvest → giao thịt sơ chế 1 lần
- [ ] Đo: chịu nhận harvest?, chi phí giao/con, margin/lứa

**Track LAYER (~8–10 user)**
- [ ] Gói 10 con/chuồng, đặt tên từng con, thẻ mã chuồng + tên
- [ ] Tiêm phòng baseline (free) + 1 gói chăm sóc nâng cao opt-in để test
- [ ] Nhặt trứng + update ảnh/video cô chú nhặt trứng
- [ ] Giao trứng **thử nhiều mô hình**: gộp tháng / pickup point / cụm địa lý → đo chi phí thật
- [ ] Đo: retention tuần 6–8, đặt lại, chi phí giao/đơn

**Decor (cả 2 track)**
- [ ] 3–4 SKU prefab + giá
- [ ] Test: tỉ lệ mua + ảnh "đã lắp decor cho chuồng bạn" có kéo tương tác không

### 7.3 5 chỉ số thành công (+ ngưỡng gợi ý — ông tự chốt)
1. Conversion xem→trả tiền ≥ [ ]%
2. Layer retention tuần 6–8 ≥ [ ]% và có ≥ [ ] người đặt lại
3. Chi phí giao ≤ [ ] → margin dương
4. Tỉ lệ mua decor ≥ [ ]%
5. Có ≥ [ ] người trả tiền **lần thứ hai**

### 7.4 Timeline PoC (gợi ý)
| Tuần | Việc |
|------|------|
| 3–4 | Setup farm, chuồng, tag, nông dân, SOP; dựng web demo mỏng (song song) |
| 5 | Onboard cohort, thu tiền thật, gửi welcome + update đầu tiên |
| 6–8 | Vận hành, decor, đo tương tác; layer chạy nhịp giao trứng |
| 9 | Broiler tới mốc harvest (tùy giống/preset), giao thịt |
| 10 | Tổng kết 5 số → quyết định build MVP / điều chỉnh / pivot |

---

## 8. App/Web DEMO — scope cho vibe coding

> Ông muốn build và đã có logo — OK. Nhưng ở PoC, app **không phải để test "farm chạy được không"** (cái đó test bằng tay). App demo để: (a) test phản ứng UX/định vị, (b) làm mặt tiền chuyên nghiệp chống-scam. Vì thế → **mỏng nhất có thể**.

### 8.1 Nguyên tắc
- **Web-first**, chưa làm mobile app (web demo nhanh hơn nhiều để cho user xem).
- **Admin (ông) nhập liệu tay** — không cần pipeline/backend phức tạp. "Fake real": dữ liệu thật nhưng nhập thủ công.
- **Thanh toán để NGOÀI app** ở PoC: nút "Giữ chỗ" → link MoMo/chuyển khoản → đối soát tay. (Tránh tích hợp cổng thanh toán sớm.)

### 8.2 Màn hình tối thiểu (demo)
1. **Landing** — định vị chống-scam, farm thật, mặt nông dân, CTA "Nhận một chuồng".
2. **Chọn chuồng** — Broiler vs Layer; chọn giống; chọn feeding preset; (layer) đặt tên gà.
3. **Chuồng của tôi (dashboard)** — ảnh/video update, timeline, trạng thái đàn, nút "decor", (broiler) nút cho ra vườn/gọi về.
4. **Decor store** — 3–4 SKU, đặt → hiện "đang lắp cho chuồng bạn".
5. **Traceability** — trang lô nuôi + QR (tĩnh).
6. **Nông dân của chuồng này** — profile cô/chú (đồng thuận), phần công được trả.
7. **Admin (ẩn)** — ông đăng update, đổi trạng thái, upload ảnh.

### 8.3 Data model tối giản (khớp platform model để MVP không phải làm lại)
```
Farm → Zone → Barn(Chuồng) → Flock(Đàn) → Bird(Gà)
                    │              │           └─ tag_code, (name nếu layer), chip_id (MVP)
                    │              └─ species, breed, feeding_plan_id, batch
                    ├─ owner_user_id
                    ├─ decor_items[]  (Decor gắn ở CHUỒNG, không ở Bird)
                    └─ media[] (ảnh/video update), care_logs[]
Product (Trứng | Thịt) ── từ Flock/Batch
Order / Payment (PoC: ngoài app) / Delivery
HealthPackage (baseline free | premium opt-in)
FeedingPlan (2–3 preset)
FarmWorker(Nông dân) ── gắn vào Barn
BirdLifecycle (layer): laying → end_of_lay → { harvest | retire | renew }   ← bake ngay, dùng ở MVP+
```
> Giữ mô hình tổng quát này **trong schema**, nhưng **đừng hiện thực hoá lớp trừu tượng đa-loài** khi demand còn = 0. Species/Breed để enum đơn giản trước.

### 8.4 Tech gợi ý cho DEMO (nhẹ hơn stack production ở proposal cũ)
- **Next.js** (web) + một DB đơn giản (Postgres hosted / Supabase).
- Storage ảnh/video: bucket đơn giản.
- **Chưa cần** ở demo: NestJS đầy đủ, Cognito, Redis, Flutter, cổng thanh toán, livestream, RFID.

### 8.5 Cái KHÔNG build ở demo
❌ Google/Apple login · ❌ marketplace lao động (PoC làm tay) · ❌ breeding · ❌ AI/IoT · ❌ camera từng chuồng real-time · ❌ nhiều farm.

---

### 8.6 Đối chiếu thực tế thi công — cập nhật 2026-08-02

> Mục này KHÔNG sửa quyết định nào ở trên. Nó chỉ ghi lại **cái đã build so với cái đã hoạch định**,
> để lần đọc sau không phải đoán. Chi tiết kỹ thuật: [CODEMAP.md](CODEMAP.md) §11.

**Đã vượt scope §8.2 "màn hình tối thiểu"** — repo hiện có 3 vai đầy đủ (chủ chuồng · nông dân · admin),
đăng nhập OTP email, cổng nông dân với hộp việc, chuông thông báo, hồ sơ nông dân, và **một cơ chế
không có trong bản hoạch định ban đầu**:

> **App không đổi hiện thực.** Người dùng bấm nút → *tạo việc* cho nông dân. Nông dân làm ngoài đời →
> **bắt buộc đính ảnh/video** mới đóng được việc. `Barn.outside` chỉ đổi bên trong `completeTask`.

Đây chính là §1 "ba trụ niềm tin" và §2.4 "decor = cỗ máy nội dung" được cưỡng chế ở tầng code
thay vì chỉ nằm trong lời hứa. Giữ nguyên bất biến này khi mở rộng.

**Ba thứ trong hoạch định chưa chạy được ngoài đời:**

| Hoạch định | Thực tế trong code |
|---|---|
| §2.3 layer "nhận trứng định kỳ" | 🔴 `Flock.stage` luôn ở `BROODING`, **không có cơ chế tự chuyển giai đoạn** → chuồng layer thật không bao giờ tới lúc đẻ. Và `Product.qty` (số trứng) không có lệnh cập nhật nào → ô "Trứng chu kỳ này" vĩnh viễn hiện 0. |
| §4 "còn margin sau khi trừ giao hàng không?" | 🔴 **Không có model `Order`/`Delivery`/`Address`** — trứng/thịt chưa bao giờ được giao trong hệ thống, nên chi phí giao **chưa đo được**. |
| §7.3 chỉ số 5 "có người trả tiền lần thứ hai" | 🔴 Không có `Subscription`/chu kỳ thu tiền → **chỉ số này hiện không đo được**, vì hệ thống chưa có khái niệm lần thứ hai. |

**Đã có để đo 5 chỉ số §7.3:** bảng `Event` + `lib/track.ts` ghi lại hành vi thật
(`barn_reserved` `deposit_confirmed` `task_requested` `task_done` `decor_installed` `barn_opened`
`end_of_lay_decided` `barn_returned`), hiện ở khối **📊 Nhịp 7 ngày** trong `/admin`.
Chỉ số 1 (conversion xem→trả tiền) và 4 (tỉ lệ mua decor) đã tự tính được.

**⚠️ §9 Pricing — số hiện tại thấp hơn giá trị nông sản khoảng 3 lần.**
`data/catalog.ts:BASE_PRICES` đang là số minh hoạ:

| Dòng | Đang thu | Giá trị nông sản thị trường |
|---|---|---|
| LAYER 6 mái | 210.000đ/tháng → ~120 trứng → **~1.750đ/quả** | trứng gà ta thả vườn 4.500–7.000đ/quả |
| BROILER 6 con | 480.000đ/lứa → **80.000đ/con** | gà Mía ~1,8–2kg × 120–150k/kg → 220–300k/con |

§4.1 của chính tài liệu này ước 10 mái = 1–1,7 triệu/tháng; bảng giá hiện tại cho 10 mái = 350.000đ.
**Phải điền unit economics thật và sửa `BASE_PRICES` trước khi thu tiền của người lạ** — bán dưới
giá vốn thì càng giữ chân được nhiều càng lỗ nặng.

**Các khoản đã định giá nhưng chưa có cơ chế thu:** decor (10 SKU, tối đa 460.000đ/chuồng) ·
phí nghỉ hưu `RETIRE_CARE_VND` 60.000đ/tháng. Riêng gói "An tâm" 40.000đ (§2.7) **đã nối vào
luồng đặt chuồng** và cộng đúng vào `priceEstimateVnd`.

**§2.6 chip/tag:** đúng như hoạch định — `Bird.tagCode` dùng ở PoC, `Bird.chipId` để trống chờ MVP.

---

## 9. Pricing & gói decor để test (chống-scam trong cách trình bày)

> Trình bày giá **tách bạch** để nhấn "đây là dịch vụ + sản phẩm, không phải đầu tư".

**Cấu trúc giá gợi ý (điền số sau khi có unit economics ở mục 4):**

| Gói | Gồm | Giá thử |
|-----|-----|---------|
| Chuồng Layer / tháng | 10 mái, đặt tên, tiêm phòng baseline, update định kỳ, nhận trứng | [ ] |
| Chuồng Broiler / lứa | ≥2–3 con, feeding preset, đồng hành đến harvest, nhận thịt sơ chế | [ ] |
| Decor SKU | biển tên / bảng gỗ / máng theme / backdrop mùa | mỗi món [ ]k |
| Gói "An tâm" sức khỏe (trả trước, cả 2 dòng, opt-in) | bao chi phí thuốc nếu gà bệnh cần chữa | [ ] |
| Chăm sóc nâng cao (layer, opt-in) | vitamin/chế độ đặc biệt (KHÔNG phải phí cứu-mạng) | [ ] |
| Feeding upgrade | preset "Quê"/"Đặc sản" | chênh [ ] |

**Cách hiển thị minh bạch (ví dụ dòng nhỏ dưới giá):**
> "Phí này gồm: chi phí nuôi & sản phẩm • **công chăm sóc của cô Lan** • trải nghiệm số. Đây là đặt mua nông sản + dịch vụ nuôi hộ, không phải đầu tư sinh lời."

---

## 10. Việc cần làm NGAY (2 tuần tới)

1. [ ] Mua domain + dựng landing giữ chỗ (chống-scam messaging).
2. [ ] Soạn pitch deck ngắn + kịch bản phỏng vấn (mục 6.3).
3. [ ] Đi phỏng vấn 30 người — **đo tín hiệu cọc thật**, không chỉ "sẽ thử".
4. [ ] Điền unit economics (mục 4) bằng **số thật của farm**.
5. [ ] Hỏi thú y + chính quyền địa phương về điều kiện giết mổ/kiểm dịch broiler.
6. [x] Chốt 2 giống + 2–3 feeding preset + 3–4 SKU decor → đã có trong `src/data/catalog.ts`
   (2 giống · 3 preset · **10 SKU decor**).
7. [x] Bắt đầu vibe-code web demo theo scope mục 8 → đã vượt scope, xem [§8.6](#86-đối-chiếu-thực-tế-thi-công--cập-nhật-2026-08-02).
8. [ ] ⚠️ **Sửa `BASE_PRICES` theo số thật ở mục 4** — việc số 4 ở trên chặn việc này, và việc này
   chặn mọi thứ khác. Giá hiện tại thu ~⅓ giá trị nông sản.

---

### Phụ lục — 2 user journey mẫu

**Layer (Minh, 28t, nhân viên marketing):** thấy landing → tin vì có mặt cô Lan + farm thật → giữ chỗ cọc → nhận chuồng 10 mái, đặt tên "Gấu, Miu…" → tuần 1 mua biển tên (decor) → hôm sau nhận ảnh cô Lan treo biển → tuần 3 nhận mẻ trứng đầu (giao gộp) → tuần 5 "Miu" ốm, được báo thật + đề nghị thay/hoàn → Minh cảm động vì trung thực → **đặt lại tháng 2**. *(Đo: retention, decor, xử lý sự cố.)*

**Broiler (Hà, 31t, dev):** chọn chuồng 5 gà Mía + 5 Đông Tảo, feeding "Quê 80% ngô" → đồng hành 75 ngày, thỉnh thoảng bấm "cho ra vườn" → nhận video đàn chạy vườn → tới ngày harvest, nhận thịt sơ chế 1 lần, kèm ảnh cô chú + trang traceability → hài lòng vì "biết rõ con gà mình ăn từ đâu". *(Đo: chịu nhận harvest, chi phí giao, margin/lứa.)*
