# Kế hoạch đợt tiếp theo - Yếm cho gà · Chợ nông trại · QR chuyển khoản

**Tiến độ 08/09/2026:** đã triển khai CC-B08 server scope và phần CC-B06 Family task transaction/CAS, vá dependency và thêm gate PG/HTTP trong CI. Các ưu tiên còn mở và phụ thuộc PO nằm ở [backlog hiện hành](09-BACKLOG-TRACEABILITY.md); [runbook security](docs/engineering/CC-B08-SECURITY.md) ghi bằng chứng và hạn chế. Không coi việc deploy được là đã hoàn tất toàn bộ pilot.

> **Review note 2026-09-06:** các hạng mục trong file này là backlog lịch sử. Hạng mục hiện hành và thứ tự P0/P1 được chuẩn hóa trong [backlog traceability](docs/ba/2026-09-06/09-BACKLOG-TRACEABILITY.md); trước khi code phải xử lý các finding `CC-F01…CC-F09` và giữ các quyết định Family `LOCKED`.

> Viết 2026-08-05, sửa sau khi chốt 4 quyết định của chủ dự án.
> Đối chiếu `CODEMAP.md` (§8 tra ngược · §9 bất biến · §10 bẫy · §11 khoảng trống).
> **Chưa có dòng code nào** - file này là phân tích + thứ tự làm. CODEMAP chỉ cập nhật khi code vào.

---

## 0. Kết luận trước, lý do sau

| Đợt | Việc | Quy mô | Chặn bởi |
|---|---|---|---|
| **1** | QR chuyển khoản | nhỏ (2–3 ngày) | - |
| **2** | Yếm cho gà | vừa (1 tuần) | - |
| **3a** | Sổ thu hoạch | vừa (1 tuần) | - |
| **3b** | Bảng giá niêm yết + sửa `BASE_PRICES` | nhỏ | - |
| **3c** | Chợ + ký quỹ + chi trả | lớn (2–3 tuần) | **3a + 3b, bắt buộc** |

🔴 **Chợ KHÔNG được mở cho người lạ trước khi sửa `BASE_PRICES`.** Lý do ở §2.3 - không phải chuyện thẩm mỹ, đây là một lỗ hổng chênh lệch giá tính được bằng số. §2.6 đã có sẵn bộ số mẫu ăn khớp, nên việc này giờ là **sửa 6 con số trong `data/catalog.ts`**, không còn là một đề tài nghiên cứu.

Một việc nền phải xen vào: **repo vẫn 0 file test** (§11.18). Ba tính năng dưới đây đụng vào **tiền, tồn kho và quyền sở hữu** - mức mà "mở trang xem thử" không còn đủ.

Và trước khi tối ưu bất cứ thứ gì: DB vừa dời Mumbai → Singapore, mọi con số §11.23 (`/chuong/[id]` ~9–10s) đã lỗi thời. **Đo lại đường cơ sở** rồi mới quyết chỗ nào đáng gọt.

---

## 1. Yếm cho gà

### 1.1 Vì sao món này đáng làm (không phải vì nó dễ thương)

Repo cho chủ chuồng **đặt tên từng con gà** (`Bird.name`, chỉ layer). Nhưng trong ảnh cô Lan gửi về mỗi ngày, **không ai phân biệt được con nào là con Miu.** Tên gà hiện là một lời hứa rỗng: người dùng gõ tên lúc nhận chuồng rồi không bao giờ gặp lại cái tên đó trong đời sống thật của chuồng.

Yếm màu biến tên thành thứ **nhận ra được bằng mắt**. "Con Miu là con đeo yếm đỏ" - từ đó mọi tấm ảnh đều đọc được.

Và nó là **món có thật**: yếm gà (chicken saddle) bảo vệ lưng gà mái khỏi bị trống đạp trụi lông. Sáng màu → dễ thấy trong vườn và trong ảnh. Tối màu → ít lộ bẩn. Vậy nó thuộc nhóm `tien-nghi` ("món gà thực sự dùng hằng ngày"), không phải nhóm trang trí thuần.

### 1.2 Ba quyết định thiết kế

**QĐ1. Yếm gắn vào `Bird`, không gắn vào `Barn`.** Đây là toàn bộ giá trị của tính năng. Gắn vào chuồng thì nó chỉ là món decor thứ 11.

**QĐ2. Chỉ cho LAYER.** Broiler không đặt tên từng con, gà thịt đeo yếm là vô nghĩa. Cổng: `flock.productLine === "LAYER"`.

**QĐ3. Sáu màu tượng trưng trước, nông trại trang bị hàng thật sau** *(chốt)*.
Hệ quả kỹ thuật: hình vẽ là `svgKey: "yem"` + `colorHex`, nên thêm/bớt/đổi màu về sau chỉ là sửa `data/catalog.ts` + chạy seed - **không đụng schema, không migrate**. Sáu SKU riêng (3 sáng, 3 tối) chứ không phải một món + ô chọn màu: kho phải trả lời được "còn mấy cái yếm đỏ", không phải "còn mấy cái yếm".

⚠️ Hệ quả vận hành phải nói trước với nông trại: chủ chuồng đặt màu mà **nông trại chưa có màu đó** thì nông dân bấm `declineTask` kèm lý do - luồng này đã có sẵn, không cần code thêm. Nhưng phải ghi rõ trong mô tả món rằng màu là *mong muốn*, nông trại xác nhận khi mặc thật. Đừng để người dùng tưởng bấm là có.

### 1.3 Yếm là món trả tiền - **25.000đ/cái** *(chốt)*

Đi qua đúng `DecorOrder` như decor: nông trại phải bỏ tiền mua vật thật, nên người dùng trả tiền là nhất quán với §9.18. Giá thấp vì nó nhỏ và mục đích là để nhiều con cùng đeo - 6 mái mỗi con một yếm là 150.000đ, vẫn nằm dưới ngưỡng "mua thêm cho vui".

### 1.4 Bất biến phải giữ

- **§9.2 - app không đổi hiện thực.** Chủ chuồng bấm "mặc yếm đỏ cho con Miu" chỉ **tạo việc**. `BirdGear` sang `WORN` **chỉ bên trong `completeTask`**, y hệt `Barn.outside`.
- **§9.1 - không minh chứng thì không xong.** Việc GEAR xong phải có ảnh/video, và đó là **ảnh con gà đó đang đeo yếm** *(chốt: y hệt mọi task khác)*. Phần thưởng kèm theo: tính năng này *ép ra ảnh cận từng con* - đúng loại nội dung giữ chân mà app đang thiếu.
- **§9.18 - trả tiền trước.** Yếm đi qua đúng `DecorOrder`, không mở đường thanh toán thứ hai.
- **§9.23 - định danh bằng id, luôn lọc kèm chuồng.** `wearGear` nhận `birdId`, phải xác minh con đó thuộc `flock` của chuồng mình.

### 1.5 Schema (delta nhỏ nhất có thể)

```prisma
enum TaskKind { DECOR RANGE_OUT RANGE_IN FEED CHECK GEAR }   // +1

enum GearStatus {
  PENDING_ON   // chủ chuồng đã chọn, chờ nông dân mặc
  WORN         // đã mặc, có ảnh minh chứng
  PENDING_OFF  // chủ chuồng bấm tháo, chờ nông dân tháo
  OFF          // đã tháo → về kho
}

model DecorItem {
  // ...
  wearable Boolean @default(false)  // mặc lên gà, KHÔNG lắp vào chuồng
  colorHex String?                  // vẽ sprite + chấm màu cạnh tên gà
  tone     String?                  // "sang" | "toi" - chia tab ở cửa hàng
}

model BirdGear {
  id        String     @id @default(cuid())
  bird      Bird       @relation(fields: [birdId], references: [id], onDelete: Cascade)
  birdId    String
  item      DecorItem  @relation(fields: [itemId], references: [id])
  itemId    String
  status    GearStatus @default(PENDING_ON)
  photoUrl  String?    // ảnh/video con gà đó đang đeo - do completeTask ghi
  wornAt    DateTime?
  removedAt DateTime?
  createdAt DateTime   @default(now())

  @@index([birdId, status])
}
```

Quan hệ ngược: `Bird.gear BirdGear[]` · `DecorItem.wornOn BirdGear[]`.

### 1.6 Vì sao KHÔNG tạo model đơn hàng mới

`DecorItem` = danh mục hàng bán. `DecorOrderItem` = đã trả tiền bao nhiêu cái. Yếm khác decor **đúng một chỗ**: hàng đi đâu sau khi tiền về.

```
confirmDecorPaid()
   ├ wearable = false → tạo BarnDecor như hiện nay
   └ wearable = true  → KHÔNG tạo gì cả, hàng nằm trong kho
                        chủ chuồng chọn con gà sau
```

Sửa ~10 dòng trong `lib/payments.confirmDecorPaid`, **trong cùng cái lõi duy nhất** - giữ §9.19 và khuôn so-sánh-rồi-đặt §9.24.

### 1.7 Tồn kho

`lib/decor-store.ts` hiện tính `installed = COUNT(BarnDecor)`. Thêm con số thứ ba:

```
sở hữu   = SUM(DecorOrderItem.qty) hoá đơn CONFIRMED     ← không đổi
đang lắp = COUNT(BarnDecor)                               ← món chuồng
đang đeo = COUNT(BirdGear) status ∈ {PENDING_ON, WORN, PENDING_OFF}
còn kho  = sở hữu − đang lắp − đang đeo
```

`PENDING_OFF` vẫn chiếm chỗ: yếm chưa tháo khỏi con gà thì chưa mặc cho con khác được. Chỉ `OFF` mới trả về kho.

⚠️ Thêm `groupBy` thứ ba **vào trong `Promise.all` sẵn có** của `decorStock()` - 1 truy vấn song song, **không thêm tầng**.

### 1.8 Luồng

```
mua yếm (cùng giỏ decor) → tiền về → confirmDecorPaid → KHO

/chuong/<slug>/dan-ga  (trang mới)
   chọn con Miu → chọn yếm đỏ (còn kho > 0)
   → wearGear(birdId, itemSlug)          [actions.ts, ownedBarn() dòng đầu]
        ├ flock.productLine === "LAYER"
        ├ bird thuộc flock của CHUỒNG NÀY          ← §9.23
        ├ gearStock(slug).free > 0
        ├ con này chưa có yếm nào ≠ OFF            ← một con một yếm
        └ BirdGear{PENDING_ON} + upsertTask(GEAR)

/nong-trai → việc "Mặc yếm cho đàn (2 con)" → chụp ảnh/quay video → completeTask
        ├ mọi BirdGear PENDING_ON của chuồng  → WORN + wornAt + photoUrl   ⭐ chỉ ở đây
        └ mọi BirdGear PENDING_OFF của chuồng → OFF  + removedAt

tháo: removeGear(gearId) → PENDING_OFF → upsertTask(GEAR) → về kho khi nông dân xong
không có màu đó ngoài đời: declineTask(lý do) → chủ chuồng đổi màu khác
```

Cách `completeTask` xử lý GEAR **giống hệt cách nó đang xử lý DECOR** (`updateMany` những cái chưa có ảnh) - không cần thêm cột nào lên `BarnTask`, và `upsertTask` vẫn gộp được nhiều con vào một việc.

### 1.9 File phải sửa

| File | Sửa gì |
|---|---|
| `prisma/schema.prisma` | `GearStatus` · `BirdGear` · 3 cột `DecorItem` · `TaskKind.GEAR` → `db push` |
| `src/data/catalog.ts` | 6 SKU yếm (`wearable: true`, `colorHex`, `tone`) |
| `prisma/seed.ts` | seed 6 món mới |
| `src/lib/tasks.ts` | `TASK_META.GEAR` (emoji · label · **doing** · **proof**) - thiếu key là crash runtime |
| `src/lib/decor-store.ts` | `wornCounts()` + `free` trừ thêm |
| `src/lib/payments.ts` | `confirmDecorPaid` bỏ qua món `wearable` khi tạo `BarnDecor` |
| `src/app/actions.ts` | `wearGear` · `removeGear` (mở đầu `ownedBarn()`, kết `revalidateBarn()`) |
| `src/app/worker-actions.ts` | `UPDATE_KIND.GEAR = "CARE"` · nhánh GEAR trong `completeTask` |
| `src/app/chuong/[id]/dan-ga/page.tsx` | **trang mới** - `requireUser` dòng đầu → query → `canViewBarn` |
| `src/app/actions.ts:revalidateBarn` | thêm `/chuong/<slug>/dan-ga` |
| `src/components/Illustrations.tsx` | `DecorSprite` vẽ `yem` theo `colorHex` |
| `src/lib/track.ts` | `gear_worn` vào union đóng |
| `CODEMAP.md` | §2 · §3 · §6 · §8 · §9 - **cùng commit** |

### 1.10 Hiệu năng

- **Trang chuồng chính không được đụng tới yếm.** `/chuong/[id]` đã có ~15 quan hệ xếp 3 tầng (§11.23). Include `flock.birds.gear` là thêm 2 tầng × N con. Chỉ hiện chip *"3/6 con có yếm"* từ **1 `groupBy`** gộp vào `Promise.all` sẵn có.
- **Trang `/dan-ga` phẳng một tầng:** `Promise.all([ bird.findMany(...), birdGear.findMany({ where: { bird: { flockId } } }), cachedDecorItems() ])` rồi ghép trong Node. Đừng `include` lồng từ Bird xuống gear.
- Danh mục yếm nằm trong `DecorItem` → đã được `cachedDecorItems()` phục vụ (TTL 1h) → **0 lượt đi–về**.

---

## 2. Chợ nông trại

> Gọi là **chợ**, không phải "sàn" *(chốt)*. Đúng hơn về bản chất, và tránh xa liên tưởng "sàn giao dịch" -
> thứ mà cả sản phẩm này được thiết kế để không giống. Route: `/cho`.

### 2.1 Điều phải thấy trước tiên: chợ này hiện không có hàng

- §11.11 - `Product.qty` **không có một lệnh `update` nào trong `src/`**. Mọi chuồng thật vĩnh viễn 0 quả trứng.
- §11.12 - không có `Order` / `Delivery` / `Address`. Sau khi cọc `CONFIRMED` là hết luồng.

Chuỗi *"trứng tồn tại → thuộc về chủ chuồng → bán lại"* **đứt ngay mắt xích đầu**. Nên đợt 3a (sổ thu hoạch) không phải phần chuẩn bị, nó là điều kiện tồn tại.

### 2.2 Insight: hàng không rời nông trại

Theo đúng mô tả của ông: người bán *không nhận ship từ nông trại được* nên bán lại - nghĩa là **hàng vẫn nằm ở nông trại**, và nông trại giao thẳng cho người mua.

Đây là điều làm chợ này khả thi trong khi hầu hết chợ C2C thực phẩm đều chết:

- Không có giao tay giữa hai cá nhân → không có khoảng trống an toàn thực phẩm.
- **Truy xuất không đứt.** Lô vẫn gắn `barnSlug`, vẫn có ảnh nông dân chụp, vẫn chịu `HealthEvent.withdrawalUntil` của đàn đó. Người mua nhận được **đúng thứ ChicChic đang bán**.
- Nông trại là bên duy nhất chạm vào hàng → 20% phí có việc thật để biện minh: bảo quản + đóng gói + giao.

⟹ Chợ này **không phải chỗ rao vặt**. Nó là **chuyển quyền nhận một lô đang giữ ở nông trại**. Phải viết đúng như thế trong giao diện, không thì người dùng tưởng họ phải tự đóng gói gửi đi.

### 2.3 🔴 Rủi ro số một: giá cố định biến sản phẩm thành kênh đầu tư

Ông chốt **giá do hệ thống quy định**. Điều đó xoá sạch rủi ro đầu cơ giá - rất tốt. Nhưng nó tạo ra một thứ nguy hiểm hơn: **một mức giá đầu ra công khai, do nền tảng bảo đảm.** Người ta sẽ lấy nó nhân với sản lượng và chia cho chi phí nuôi.

Lấy đúng số đang có trong repo:

| | Chi phí nuôi (`BASE_PRICES`) | Sản lượng | Giá thị trường | Bán lại thu về (sau 20%) |
|---|---|---|---|---|
| **LAYER** | 35.000đ/mái/tháng | ~20 trứng/tháng (gà Mía) | 4.500–7.000đ/quả | 72.000–112.000đ |
| **BROILER** | 80.000đ/con/lứa 75 ngày | 1 con ~1,8kg | 120.000–150.000đ/kg | ~173.000–216.000đ |

**Bỏ 35.000đ vào, rút 72.000đ ra mỗi tháng. Bỏ 80.000đ vào, rút ~173.000đ ra mỗi lứa.**

Đây không phải suy đoán - §11.14 đã ghi sẵn *"Bảng giá đang thấp hơn giá trị nông sản… phải sửa trước khi bán cho người lạ"*. Chợ **biến khoảng trống đó thành tiền rút được**, tự động, ai cũng làm được, không giới hạn. Và một sản phẩm mà "nộp tiền vào, tháng sau rút nhiều hơn" thì **chính xác là thứ mà toàn bộ trụ chống-đa-cấp của ChicChic được dựng lên để không phải là**.

**Bốn hàng rào, cả bốn đều bắt buộc:**

1. **Sửa `BASE_PRICES` trước khi chợ lên (đợt 3b).** Đây là hàng rào duy nhất thật sự đóng lỗ hổng; ba cái còn lại chỉ làm chậm. Sau khi sửa, thực nhận sau phí phải **≤ chi phí nuôi** - bán lại là cách *không phí đồ ăn*, không phải cách kiếm lời.
2. **Trần số lô bán được:** đề xuất **≤2 lô/người/tháng**. Chợ là chỗ thoát hàng khi bận, không phải kênh kinh doanh.
3. **Không bao giờ hiện tổng thu tích luỹ.** Không có màn "bạn đã bán được X đồng", không biểu đồ thu nhập, không xếp hạng người bán. Ngày có màn đó là ngày app thành ứng dụng đầu tư.
4. **Không cam kết bán được.** Giá là giá niêm yết, không phải lời hứa có người mua. Phải in câu này ngay cạnh nút đăng bán.

### 2.4 Hai rủi ro còn lại

**R2 - Chợ ăn mất vòng lặp chính.** Mua lại dễ hơn nhận nuôi thì người ta bỏ nhận nuôi.
⟹ **Chỉ chủ chuồng đang hoạt động mới được MUA** *(chốt: "cho các người nhận nuôi gà mua bán trên đó")*. Chặn ở cả trang **và** cửa ghi DB, cùng khuôn §9.14.

**R3 - Gian lận, tranh chấp.** Người bán nhận tiền rồi hàng hỏng / không có.
⟹ **Ký quỹ bắt buộc, không ngoại lệ: tiền chỉ chi trả sau khi nông trại xác nhận đã giao.** Xác nhận đó là một `BarnTask` có ảnh minh chứng, không phải một nút admin bấm.

### 2.5 Đợt 3a - Sổ thu hoạch (làm trước, độc lập)

Nông dân ghi *"hôm nay chuồng X thu 12 quả"* kèm ảnh. Vừa vá §11.11, vừa là **nội dung hằng ngày mạnh nhất chưa khai thác** - thông báo *"Hôm nay chuồng bạn được 5 quả 🥚"* là lý do mở app tốt hơn mọi thứ đang có.

```prisma
enum LotStatus { AT_FARM  LISTED  SOLD  DELIVERED  EXPIRED }

model HarvestLot {
  id           String      @id @default(cuid())
  barn         Barn        @relation(fields: [barnId], references: [id])
  barnId       String
  flockId      String
  type         ProductType // EGG | MEAT
  qty          Int         // EGG: số quả · MEAT: số con
  // MEAT tính tiền theo CÂN *(chốt)*. Nông dân cân lúc mổ rồi báo số - đây là con số
  // DUY NHẤT dùng để tính giá bán trên chợ, nên nó phải đi kèm ảnh cân (§9.1).
  weightKg     Float?
  // EGG: lúc nhặt trứng · MEAT: lúc mổ *(chốt)*. Hạn 7 ngày đếm từ mốc này, không
  // phải từ lúc đăng bán - xem §2.7.
  collectedAt  DateTime    @default(now())
  worker       FarmWorker  @relation(fields: [workerId], references: [id])
  workerId     String
  proofMedia   BarnMedia?  @relation(fields: [proofMediaId], references: [id])
  proofMediaId String?     @unique
  // Lô là TÀI SẢN - phải có chủ, và chủ không đổi khi chuồng đổi chủ sau này.
  ownerId      String?
  status       LotStatus   @default(AT_FARM)
  createdAt    DateTime    @default(now())

  @@index([barnId, collectedAt])
  @@index([ownerId, status])
}
```

Ghi qua `TaskKind.HARVEST` → `completeTask` tạo `HarvestLot` + `BarnMedia` + `FarmUpdate` trong cùng transaction. §9.1 nguyên vẹn: **không ảnh thì không có lô**.

⚠️ **Không có cột `bestBefore`.** Hạn là **`collectedAt + 7 ngày`**, suy ra chứ không lưu - lưu thì sớm muộn có dòng lệch với `collectedAt`. Xem §2.7.

`Product` giữ nguyên (dữ liệu seed cũ) nhưng từ nay số trứng hiển thị suy từ `HarvestLot`. Ghi rõ trong CODEMAP để không ai đọc nhầm bảng.

### 2.6 Đợt 3b - Bảng giá niêm yết *(chốt: giá do hệ thống quy định)*

```prisma
// Giá nông trại niêm yết. Admin đổi giá = THÊM DÒNG MỚI, không sửa dòng cũ -
// hoá đơn cũ phải tra lại được đúng giá lúc bán (cùng luật với DecorOrderItem.priceVnd).
model MarketPrice {
  id            String      @id @default(cuid())
  type          ProductType // EGG | MEAT
  // null = áp cho MỌI giống. Trứng dùng dòng null (giá như nhau);
  // gà thịt có dòng riêng theo từng giống (gà Mía ≠ gà Đông Tảo).
  breedSlug     String?
  // EGG: đồng/quả · MEAT: đồng/kg
  unitVnd       Int
  effectiveFrom DateTime    @default(now())
  note          String?
  createdAt     DateTime    @default(now())

  @@index([type, breedSlug, effectiveFrom])
}
```

Tra giá: dòng mới nhất có `effectiveFrom <= now`, khớp `breedSlug` trước, **không có thì rơi về dòng `breedSlug = null`**. Trứng chỉ cần một dòng null; gà thịt mỗi giống một dòng. Mô hình này cho đúng thứ ông cần hôm nay mà không khoá đường sau này muốn tính giá trứng theo giống.

Giá **chốt vào tin đăng lúc đăng** (`priceVnd`, `feePercent`, `feeVnd`, `netVnd`). Admin đổi giá hôm sau **không** đổi tin đăng hôm trước - đúng luật đang dùng cho `DecorOrderItem.priceVnd`.

Đọc bảng giá qua `lib/cache.ts` (TTL 1h như `cachedDecorItems`): danh mục tĩnh, đổi vài tuần một lần, **0 lượt đi–về mỗi lượt xem chợ**. Admin đổi giá thì `revalidateTag`.

Ở `/admin` cần khối "💰 Giá niêm yết": bảng giá hiện hành + ô nhập giá mới + lịch sử đổi giá. Ghi `Event("price_changed")` để về sau đối chiếu doanh số với lần đổi giá.

#### Giá mẫu để seed *(chốt: "tạm thời sample, tôi sẽ đổi sau")*

Số tham chiếu thị trường 2026, gà làm sạch, giao tại nông trại. Seed vào `MarketPrice` với `effectiveFrom` = ngày seed.

| `type` | `breedSlug` | `unitVnd` | Ghi chú |
|---|---|---|---|
| `EGG` | `null` | **5.500đ / quả** | Trứng cùng giá mọi giống *(chốt)*. Thị trường gà ta 4.500–7.000đ |
| `MEAT` | `null` | **130.000đ / kg** | Dòng rơi về - mọi giống chưa có dòng riêng ("gà ta" nói chung) |
| `MEAT` | `ga-mia` | **150.000đ / kg** | Gà cổ truyền, thịt chắc - có giá hơn gà ta thường |
| `MEAT` | `ga-dong-tao` | **350.000đ / kg** | Đặc sản tiến vua; hàng thương phẩm 300–600k/kg tuỳ con |

Ví dụ một con gà Mía 1,8kg: `150.000 × 1,8 = 270.000đ` → phí 20% = `54.000đ` → người bán thực nhận `216.000đ`.

⚠️ **Bảng giá này chỉ đứng vững nếu `BASE_PRICES` được sửa cùng lúc.** Với `BASE_PRICES.BROILER` hiện tại (80.000đ/con), con gà trên là **bỏ 80k thu 216k**. Bộ số ăn khớp với bảng trên:

| | Hiện tại | Đề xuất mẫu | Vì sao |
|---|---|---|---|
| `LAYER` (nuôi/công/tn) | 18k / 9k / 8k = **35.000đ**/mái/tháng | 46k / 24k / 20k = **90.000đ** | 20 trứng × 5.500 = 110k, trừ 20% = 88k ⟹ bán lại **hoà tới lỗ nhẹ** |
| `BROILER` | 42k / 21k / 17k = **80.000đ**/con/lứa | 115k / 57k / 46k = **218.000đ** | 1,8kg × 150k = 270k, trừ 20% = 216k ⟹ tương tự |

Nguyên tắc đằng sau: **thực nhận sau phí ≈ chi phí nuôi.** Bán lại là cách *không phí đồ ăn khi bận*, không phải cách kiếm lời. Đây cũng là bộ số §11.14 vẫn đang chờ (nó ghi thị trường 220–300k/con broiler - đề xuất trên nằm đúng trong khoảng).

### 2.7 Hạn bảo quản: 7 ngày kể từ lúc THU / lúc MỔ, không phải lúc đăng

*(chốt: trứng đếm từ lúc nhặt · gà thịt đếm từ lúc mổ)*

Đây là điểm dễ làm sai nhất: nếu đếm từ lúc đăng, người ta giữ lô 5 ngày rồi đăng thêm 7 ngày nữa → nông trại phải giữ 12 ngày, trái đúng cam kết vừa hứa. **Hạn tính từ `collectedAt`.**

⚠️ **Gà thịt giữ 7 ngày nghĩa là ĐÃ CẤP ĐÔNG - phải nói ra.** *(chốt: nông trại có khu cấp đông + tủ lạnh bảo quản.)* Gà làm sạch để ngăn mát chỉ được 2–3 ngày; 7 ngày là đông lạnh. Với người mua Việt Nam, "gà tươi" và "gà đông lạnh" là hai món hàng khác nhau cả về giá lẫn kỳ vọng, nên tin đăng gà thịt **bắt buộc** hiện *"đã cấp đông từ 05/08"* chứ không chỉ *"còn 3 ngày"*. Đây là §9.11 (nói đúng những gì có trong sổ) áp vào chỗ mới.

Hệ quả: `HarvestLot` cần biết lô được giữ **kiểu gì**, vì trứng nằm tủ mát còn gà nằm tủ đông:

```prisma
enum StorageMode { CHILLED  FROZEN }   // ngăn mát · cấp đông
model HarvestLot { storage StorageMode?  /* … */ }
```

Nông dân chọn lúc ghi lô (mặc định: EGG → `CHILLED`, MEAT → `FROZEN`). Trang truy xuất và tin đăng đều đọc cột này - **đừng viết cứng "đã cấp đông" vào JSX** theo `type === MEAT`, vì hôm nào bán gà tươi trong ngày thì dòng chữ đó thành lời nói dối (§9.11).

Giao diện phải hiện *"nông trại giữ hộ thêm 3 ngày"*, không phải một ngày tháng khô khan - người mua cần biết mình đang mua trứng còn mấy ngày.

**Hết hạn xử lý lười (lazy), không cần cron.** Repo chưa có job nền nào (§11.10). Lọc ngay trong `WHERE`:

```ts
where: { status: "LISTED", lot: { collectedAt: { gt: new Date(Date.now() - 7*864e5) } } }
```

Lọc trong DB có chỉ mục đỡ, **không** kéo về Node rồi `.filter()`. Muốn dọn `status = EXPIRED` cho gọn sổ thì thêm Vercel Cron sau - nhưng luật hiển thị không được phụ thuộc vào job đó chạy đúng giờ.

❓ **Còn phải quyết:** hết 7 ngày thì lô đi đâu? Trứng vẫn còn đó ngoài đời. Đề xuất mặc định: `EXPIRED` + báo chủ lô + một `BarnTask` cho nông dân xử lý (giao tận nơi hoặc bỏ), và nói trước điều này lúc đăng bán.

### 2.8 Đợt 3c - Chợ

```prisma
enum ListingStatus { LISTED  RESERVED  PAID  DELIVERED  CANCELLED  EXPIRED }

model MarketListing {
  id          String        @id @default(cuid())
  lot         HarvestLot    @relation(fields: [lotId], references: [id])
  lotId       String        @unique          // một lô một tin đăng
  sellerId    String
  // Ba số CHỐT LÚC ĐĂNG từ MarketPrice - người bán không tự đặt giá.
  priceVnd    Int                            // tổng tiền người mua trả
  feePercent  Int                            // 20 lúc này
  feeVnd      Int
  netVnd      Int                            // feeVnd + netVnd === priceVnd, không lệch 1đ
  status      ListingStatus @default(LISTED)
  buyerId     String?
  payCode     String?       @unique          // CHICM…
  reservedAt  DateTime?
  paidAt      DateTime?
  deliveredAt DateTime?
  createdAt   DateTime      @default(now())

  @@index([status, createdAt])
}

enum PayoutStatus { PENDING  PAID  FAILED }

model Payout {
  id           String        @id @default(cuid())
  listing      MarketListing @relation(fields: [listingId], references: [id])
  listingId    String        @unique
  userId       String
  amountVnd    Int
  status       PayoutStatus  @default(PENDING)
  // STK LÚC CHI, không đọc lại hồ sơ - người ta đổi tài khoản sau thì sổ vẫn đúng.
  bankSnapshot Json
  proofUrl     String?       // ảnh biên lai chuyển khoản
  adminNote    String?
  paidAt       DateTime?
  createdAt    DateTime      @default(now())
}

model PayoutAccount {
  userId     String   @id
  bankName   String
  accountNo  String
  holderName String
  updatedAt  DateTime @updatedAt
}
```

**Giá cố định làm giao diện đơn giản hẳn.** Đăng bán là một chạm: chọn lô → hệ thống hiện *giá bán · phí 20% · thực nhận* → xác nhận. Không ô nhập giá, không mặc cả, không so giá giữa người bán.

**Giá một lô tính ở SERVER lúc đăng, từ hai con số người bán không chạm vào được** (§9.6):

```
EGG :  priceVnd = unitVnd(EGG, null)          × lot.qty
MEAT:  priceVnd = unitVnd(MEAT, breedSlug)    × lot.weightKg     ← cân do NÔNG DÂN báo
feeVnd = round(priceVnd × feePercent / 100)
netVnd = priceVnd − feeVnd                    ← trừ ra, KHÔNG tính riêng
```

`netVnd` phải **trừ ra** chứ không nhân `× 0,8` độc lập - hai phép làm tròn riêng sẽ lệch 1đ ở một số giá trị, và một đồng lệch trong sổ tiền là một giờ đối soát.

⭐ **`weightKg` là con số nhạy cảm nhất trong tính năng này**: nó do nông dân gõ tay và nó quyết định thẳng số tiền người mua trả. Ba lớp:
- phải kèm **ảnh cân** trong `completeTask` của việc HARVEST (§9.1 sẵn có);
- chặn khoảng hợp lý ở server (0,8–5,0 kg/con) - gõ nhầm `18` thay `1,8` là hoá đơn gấp mười;
- ghi vào `HarvestLot` **một lần lúc thu, không sửa được sau** - sửa cân sau khi đã đăng bán là đổi giá sau lưng người mua. Cần sửa thì admin huỷ lô và ghi lại, có lưu vết.

**Hệ quả: các tin đăng trở nên thay thế được lẫn nhau.** Trứng cùng giá thì người mua không chọn theo giá, chỉ chọn theo giống/chuồng/độ tươi. ⟹ **mặc định sắp xếp theo lô sắp hết hạn trước** - vừa công bằng cho người bán, vừa giảm hàng bỏ phí. Giữ bộ lọc theo giống và theo chuồng cho người muốn chọn nguồn.

### 2.9 Đường tiền - dùng lại nguyên hạ tầng, không dựng cái thứ hai

```
lib/decor.ts        PayKind += "MARKET" → ký tự 'M' → mã CHICM<6>
                    KIND_CHAR · CHAR_KIND · PAY_RE đổi [CD] → [CDM]
lib/payments.ts     resolvePayCode nhánh MARKET
                    confirmMarketPaid(listingId, source)   ← lõi thứ ba, cùng khuôn
api/webhooks/sepay  KHÔNG đổi gì ngoài việc mã M rơi vào đúng nhánh
```

`confirmMarketPaid` giữ §9.24 (`updateMany` với điều kiện trạng thái nằm trong `WHERE`) và §9.19 (action/route chỉ là cổng quyền). Cấu trúc mã bên SePay phải khớp tiền tố mới - xem §8 dòng "Đổi mã chuyển khoản".

**Chi trả KHÔNG tự động.** `Payout` sinh ở `PENDING` khi `deliveredAt` được đặt; admin chuyển khoản tay rồi bấm "đã chi" kèm ảnh biên lai. Ở PoC đây là đúng mức: tự động đẩy tiền ra là chỗ sai một lần mất tiền thật.

⚠️ **Pháp lý.** Nhận tiền người mua rồi trả người bán là hoạt động trung gian thanh toán. Quy mô PoC (vài đơn/tháng, chi tay) thì chấp nhận được, nhưng: **không** gọi số dư đó là "ví"/"tài khoản" - mỗi đơn là một khoản độc lập; **không** cho rút tự do; **không** cho nạp trước. Vượt vài chục đơn/tháng thì phải chuyển sang cổng thanh toán có giấy phép. Ghi ngưỡng này vào §11.

### 2.10 Giao hàng khép kín

`DELIVERED` do **nông dân** đặt, không phải admin: thêm `TaskKind.DELIVER` - *"Giao lô CC-L-0508-A3F1 cho <người mua>"*, ảnh chụp lúc trao tay.

```
không có ảnh  ⟹  không DELIVERED  ⟹  không chi trả
```

§9.1 nguyên vẹn, và 20% phí được biện minh bằng một công việc có thật, có bằng chứng.

### 2.11 Hiệu năng - đây là trang nguy hiểm nhất repo

`/cho` là **trang duy nhất đọc chéo nhiều chuồng**. Mọi trang khác đều khoá vào một `barnId`. Bốn luật bắt buộc:

1. **`take: 20` + con trỏ theo `createdAt`.** Không bao giờ `findMany` không giới hạn (§8: "danh sách thì luôn có `take`").
2. **`select` tường minh, không `include` lồng.** Mỗi quan hệ trong `include` là một truy vấn riêng. Lấy đúng: `priceVnd`, `lot.qty`, `lot.type`, `lot.weightKg`, `lot.collectedAt`, `barn.slug`, `barn.label`, `seller.name`, `proofMedia.url`. Ba quan hệ = 3 truy vấn cho **cả trang**, không phải cho mỗi dòng.
3. **Cache 60 giây** bằng `unstable_cache` như `cachedFarmProof`. Đây là trang có nguy cơ traffic cao nhất và rẻ nhất để cache; hàng nông sản không cần realtime tới giây. Đăng bán / mua xong thì `revalidateTag`.
4. **Bảng giá qua cache 1 giờ** (§2.6) - nếu không thì mỗi lượt xem chợ là thêm một lượt đi–về chỉ để tra một con số gần như không đổi.

Badge "có hàng mới" dùng `groupBy` đếm, **đừng** `findMany().length` (§10).
Chỉ mục bắt buộc: `MarketListing @@index([status, createdAt])` · `HarvestLot @@index([ownerId, status])` · `MarketPrice @@index([type, breedSlug, effectiveFrom])`.

---

## 3. QR chuyển khoản

### 3.1 Vì sao làm trước

Việc nhỏ nhất, lợi nhất: **không thêm bảng, không đụng bất biến nào**, và nó gỡ đúng chỗ ma sát lớn nhất còn lại của đường tiền - gõ tay số tài khoản rồi gõ tay mã `CHICCAYVFP`. Mỗi lần gõ sai là một lần `parsePayCode` trả `null` → `BankTxn.UNMATCHED` → rơi về đối soát tay (§11.21).

**Repo đã có sẵn thước đo.** `Event.deposit_confirmed.props.hoursToPay` và tỉ lệ `BankTxn.status = UNMATCHED` - so trung vị trước/sau là biết ngay có ăn thua không. Rất hiếm thay đổi nào đo được rẻ như vậy.

Ba chỗ dùng: banner cọc (`PaymentBanner`), hoá đơn trang trí (`DecorStudio`), và đơn chợ sau này - nghĩa là làm trước thì đợt 3c dùng lại luôn.

### 3.2 Hai đường, chọn (a) trước

**(a) Ảnh từ nhà cung cấp** - `qr.sepay.vn/img?…` hoặc `img.vietqr.io/image/…`.
0 dòng mã hoá, đúng chuẩn NAPAS 247, xong trong một buổi. Đổi lại: một phụ thuộc bên thứ ba **nằm trên đường tiền**, ảnh phải tải từ mạng ngoài. Dùng thẻ `<img>` thường nên `remotePatterns` không chặn - nhưng vẫn nên thêm host vào `next.config.mjs` cho `next/image` sau này (⚠️ biến build-time ⟹ **Redeploy** trên Vercel, không phải restart).

**(b) Tự sinh EMVCo/VietQR** - `lib/vietqr.ts` dựng chuỗi TLV + CRC16-CCITT (~60 dòng thuần, test được bằng bảng giá trị mẫu) + bộ mã hoá QR vẽ SVG (~200 dòng, byte mode, mức sửa lỗi M).
Không phụ thuộc, không request ngoài, render server-side nên **0 độ trễ thêm**, chạy được cả khi mạng người dùng chặn domain ngoài. Đúng triết lý 4 dependency của repo.

**Khuyến nghị:** làm (a) trước để có kết quả trong tuần, **giữ nguyên ba nút "Sao chép" làm đường lùi**. Chuyển sang (b) khi chợ lên, vì lúc đó QR xuất hiện ở nhiều nơi hơn và phụ thuộc ngoài đắt dần.

Làm (b) thì vá luôn §11.15: `Illustrations.QRCode` hiện là SVG tĩnh không encode gì.

### 3.3 Biến môi trường phải thêm

`NEXT_PUBLIC_HOLD_BANK` hiện là **một chuỗi tự do** - `"Vietcombank · 0123456789 · DO DINH THANG"` - không tách được thành mã ngân hàng + số tài khoản để sinh QR. Thêm ba biến, **giữ chuỗi cũ để hiển thị**:

```
NEXT_PUBLIC_HOLD_BANK_BIN=""      # mã BIN NAPAS của ngân hàng nhận
NEXT_PUBLIC_HOLD_ACCOUNT=""       # số tài khoản, chỉ chữ số
NEXT_PUBLIC_HOLD_NAME=""          # tên chủ tài khoản, không dấu
```

Cập nhật `.env.example`, `DEPLOY.md`, `HUONG-DAN-SETUP-DEPLOY.md`, `README.md` cùng lúc.

### 3.4 ⚠️ Phải xác minh trước khi ghép vào đường tiền

- Định dạng URL và tham số của SePay/VietQR - đọc tài liệu chính chủ, **không đoán từ trí nhớ**.
- Mã BIN của ngân hàng nhận.
- **Quét thử bằng ít nhất 3 app ngân hàng khác nhau, chuyển một khoản nhỏ thật**, kiểm `BankTxn` bóc đúng mã.

QR sai = tiền vào tài khoản người khác.

---

## 4. Việc nền phải xen vào

1. **Đo lại đường cơ sở sau khi dời DB sang Singapore.** Mọi con số §11.23 là số Mumbai. Đo `/chuong/[id]`, `/tai-khoan`, `/chuong/[id]/trang-tri` (best-of-3, bản production) rồi cập nhật §11.23 - không thì sẽ tối ưu nhầm chỗ.
2. **Sửa `connection_limit` trong `DATABASE_URL` về 5.** Bản mới đang để 15; đo được chỉ đỡ ~16% mà đổi lấy rủi ro cạn pool khi Vercel bung nhiều lambda (§10).
3. **Sửa `BASE_PRICES` (§11.14)** - không còn là việc "nên làm sớm", nó là **điều kiện để chợ lên được** (§2.3).
4. **Bốn test đầu tiên của repo** (§11.18), chọn đúng chỗ đắt nhất nếu sai:
   - `parsePayCode` / `newPayCode` / CRC16 của VietQR;
   - `decorStock` + `gearStock` (`free` không bao giờ được âm);
   - `feeVnd + netVnd === priceVnd` - không lệch một đồng do làm tròn;
   - tra `MarketPrice` (khớp giống → rơi về dòng null → chọn đúng `effectiveFrom` mới nhất).
5. **Bất biến mới cần thêm vào §9** khi code vào:
   - *Yếm chỉ đổi trạng thái trong `completeTask`* (mở rộng §9.2).
   - *Không có `DELIVERED` thì không có `Payout`* - tiền chỉ rời hệ thống sau khi có ảnh giao hàng.
   - *Chợ không chuyển hàng giữa hai người dùng* - chỉ chuyển quyền nhận lô đang giữ ở nông trại.
   - *Giá bán do `MarketPrice` quyết, chốt vào tin đăng lúc đăng* - người bán không bao giờ tự nhập giá, và đổi giá không hồi tố.
   - *Không hiện tổng thu tích luỹ ở bất kỳ đâu* (§2.3 hàng rào 3).

---

## 5. Còn phải quyết

1. **Hết hạn thì lô đi đâu?** (§2.7) - đề xuất: `EXPIRED` + báo chủ lô + `BarnTask` cho nông dân xử lý, và nói trước điều này lúc đăng bán.
2. **`BASE_PRICES` chốt khi nào.** Bộ số mẫu ở §2.6 đã ăn khớp với bảng giá chợ; ông đổi lúc nào cũng được, **miễn là trước khi chợ mở cho người lạ** (§2.3).

### Đã chốt

- Chợ (không phải "sàn"), route `/cho` · chỉ chủ chuồng đang hoạt động mới mua được
- Giá do hệ thống niêm yết · phí 20% trên giá bán · trứng cùng giá mọi giống, gà thịt theo giống
- **Gà thịt tính theo cân**, cân do nông dân báo lúc mổ
- Hạn 7 ngày tính từ lúc nhặt trứng / lúc mổ · nông trại có khu cấp đông + tủ mát, tin đăng phải ghi rõ lô đang giữ kiểu gì
- Yếm **25.000đ/cái**, 6 màu tượng trưng, nông trại trang bị hàng thật sau
- Nông dân chụp ảnh/quay video sau khi mặc yếm xong, y hệt mọi task khác
