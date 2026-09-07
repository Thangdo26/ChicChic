# Đối soát thanh toán - khách chuyển khoản xong thì chuyện gì xảy ra

> **Review note 2026-09-06:** payment runbook này mô tả PoC reconciliation. Khi thêm lifecycle/renew/retire/market, dùng pricing snapshot + UAT trong [economics](docs/ba/2026-09-06/08-ECONOMICS-PRICING.md) và [UAT](docs/ba/2026-09-06/10-UAT-TEST-PLAN.md). Không coi payment confirmed là đủ để giao lot nếu safety hold hoặc proof delivery chưa pass.

> Tài liệu này mô tả **đúng những gì code đang làm**, không phải những gì nên làm.
> Nguồn: [api/webhooks/sepay/route.ts](src/app/api/webhooks/sepay/route.ts) ·
> [lib/payments.ts](src/lib/payments.ts) · [lib/decor.ts](src/lib/decor.ts) (phần mã chuyển khoản) ·
> [lib/vietqr.ts](src/lib/vietqr.ts) · [api/thanh-toan/route.ts](src/app/api/thanh-toan/route.ts).
> Bản đồ tổng thể ở [CODEMAP §7.5](CODEMAP.md); các bất biến liên quan là **§9.19 - §9.24** và **§9.34**.

---

## 0. Ba câu phải đọc trước, kẻo hiểu ngược

**① Nút "Tôi đã chuyển khoản" KHÔNG xác nhận tiền.** Nó chỉ là *lời khách nói*. Trạng thái đơn
chuyển từ `UNPAID` sang **`REPORTED`** - nghĩa là "khách bảo đã chuyển, nông trại chưa thấy tiền".
Không một đồng nào được coi là đã về vì người ta bấm một cái nút.

**② Hệ thống KHÔNG gọi sang SePay để hỏi.** Không có một lời gọi API nào đi ra phía SePay để tra
giao dịch. Chiều dữ liệu là **ngược lại**: SePay thấy tiền vào tài khoản ngân hàng thì **tự POST**
vào endpoint của mình. App là bên *nhận*, không phải bên *hỏi*. Vì thế phần "xác thực" ở đây là
xác thực **người gọi tới**, chứ không phải xác thực một câu trả lời mình xin về.

**③ Sợi dây duy nhất nối tiền với đơn là NỘI DUNG CHUYỂN KHOẢN.** Không phải số tiền, không phải
tên người chuyển, không phải thời điểm. Mã `CHIC…` trong nội dung chuyển khoản là toàn bộ những gì
webhook có để biết khoản tiền này của ai. Gõ sai mã ⟹ tiền vẫn về tài khoản nhưng **rơi về đối soát
tay**, không tự khớp.

---

## 1. Mã chuyển khoản `payCode` - sợi dây nối tiền với đơn

Sinh **một lần duy nhất** lúc tạo đơn, bằng `newPayCode(kind)` trong
[lib/decor.ts](src/lib/decor.ts), rồi lưu vào cột `payCode` (**`@unique`**) của bảng tương ứng.
Không bao giờ sửa lại, không bao giờ suy ra từ `id`.

```
CHIC   C      YVFPM7
└─┬─┘  └┬┘    └──┬──┘
  │     │        └── 6 ký tự ngẫu nhiên, bảng chữ BỎ  0 O 1 I L
  │     │            (người ta đọc mã trên màn hình rồi gõ tay vào app ngân hàng)
  │     └─────────── ký tự phân loại đơn
  └───────────────── tiền tố cố định  PAY_PREFIX = "CHIC"
```

| Ký tự | `PayKind` | Bảng | Cái gì đang được trả tiền |
|---|---|---|---|
| `C` | `COC` | `Reservation` | Cọc giữ chỗ chuồng |
| `D` | `DECOR` | `DecorOrder` | Hoá đơn món trang trí |
| `M` | `MARKET` | `MarketOrder` | Đơn mua ở chợ |
| `R` | `CARE` | `CareOrder` | Phí nuôi dưỡng đàn nghỉ hưu |
| `N` | `INVOICE` | `BarnInvoice` | Tiền nuôi theo kỳ |

**Vì sao có ký tự phân loại:** webhook nhận về `CHICABC123` thì không biết tra bảng nào - mà tra
nhầm bảng nghĩa là **cộng tiền cho đơn của người khác**.

**Vì sao mã ngẫu nhiên chứ không cắt đuôi `id`:** bản cũ cắt 6 ký tự cuối của cuid, dẫn tới (a) tra
đơn phải dùng `LIKE '%…'` quét cả bảng mỗi lần tiền về, và (b) không có gì bảo đảm duy nhất. Cột
`payCode` unique giải quyết cả hai: tra bằng chỉ mục, DB tự chặn trùng.

### Bóc mã ra khỏi nội dung ngân hàng

Ngân hàng trả về đại loại `"CT tu 0123456 CHICCYVFPM7 GD 987654-060825"`. Hàm `parsePayCode`
nhận diện **rộng rãi có chủ đích** (chữ hoa/thường, có chèn `. - _` giữa các phần) rồi dựng lại mã
ở dạng chuẩn để tra thẳng cột `payCode`.

> ⚠️ **`parsePayCode` trả `null` là MỆNH LỆNH DỪNG, không phải gợi ý đoán tiếp** (§9.22).
> Đoán bừa rồi tự xác nhận = mở khoá chuồng cho người chưa trả tiền.

### QR - cách tốt nhất để mã không bị gõ sai

[lib/vietqr.ts](src/lib/vietqr.ts) dựng URL ảnh QR chuẩn **VietQR / NAPAS 247**, khách quét thì
**cả số tiền lẫn nội dung do máy điền**, không còn khe cho lỗi gõ.

- Endpoint ảnh là `https://vietqr.app/img` - của **chính SePay**, tức không thêm bên thứ ba nào
  vào đường tiền.
- Cần ba biến **build-time**: `NEXT_PUBLIC_HOLD_BANK_CODE`, `NEXT_PUBLIC_HOLD_ACCOUNT`,
  `NEXT_PUBLIC_HOLD_NAME`. Đổi trên Vercel phải **Redeploy**, restart không ăn thua.
- Thiếu cấu hình hoặc ảnh tải hỏng ⟹ ô QR **tự biến mất**, khách quay về lối gõ tay.
  QR là *thêm* một lối, không *thay* lối cũ - xem [PayQR.tsx](src/components/PayQR.tsx).
- Đây là **lời gọi mạng ra ngoài duy nhất** liên quan tới SePay, và nó chỉ để **lấy một tấm ảnh**.
  Không có xác thực, không mang bí mật gì, không dính tới việc xác nhận tiền.

---

## 2. Toàn cảnh - từ lúc khách bấm chuyển khoản

```
KHÁCH                          APP                        SEPAY            NGÂN HÀNG
  │                             │                           │                  │
  │  mở màn hình thanh toán     │                           │                  │
  │ ◄─── payCode + số tiền + QR │                           │                  │
  │                             │                           │                  │
  │  quét QR / gõ tay ─────────────────────────────────────────────────────►  │
  │                             │                           │   tiền vào TK    │
  │                             │                           │ ◄────────────────┤
  │  bấm "Tôi đã chuyển khoản"  │                           │                  │
  ├────────────────────────────►│  đơn → REPORTED           │                  │
  │                             │  (CHƯA xác nhận tiền)     │                  │
  │                             │                           │                  │
  │                             │ ◄── POST /api/webhooks/sepay                 │
  │                             │     Authorization: Apikey │                  │
  │                             │                           │                  │
  │                             │  ① ghi BankTxn (sổ)       │                  │
  │                             │  ② bóc mã · tra đơn       │                  │
  │                             │  ③ đủ tiền → CONFIRMED    │                  │
  │                             │                           │                  │
  │  usePayWatch hỏi lại ──────►│                           │                  │
  │ ◄─── { paid: true }         │                           │                  │
  │  màn hình tự đổi            │                           │                  │
```

Hai sự kiện **"khách bấm nút"** và **"tiền về tài khoản"** là hai đường độc lập, và **thứ tự không
bảo đảm**. Tiền hoàn toàn có thể về **trước** khi khách kịp bấm nút - đó chính là lúc màn hình đứng
im lâu nhất nếu không xử lý đúng.

---

## 3. Bước "Tôi đã chuyển khoản" thực sự làm gì

Mỗi loại đơn có một action riêng, nhưng **cùng một khuôn**:

| Loại | Action |
|---|---|
| Cọc chuồng | [actions.reportTransfer](src/app/actions.ts) |
| Trang trí | [decor-actions](src/app/decor-actions.ts) |
| Chợ | [market-actions.baoDaChuyenKhoan](src/app/market-actions.ts) |
| Nuôi dưỡng | [care-actions](src/app/care-actions.ts) |
| Tiền nuôi | [billing-actions](src/app/billing-actions.ts) |

Việc nó làm:

1. **Kiểm quyền** - đúng chủ đơn (`ownedBarn()` / `buyerId === me.id`).
2. **Từ chối bấm lại** - đã `REPORTED` hoặc đã `CONFIRMED` thì trả lời tử tế, không ghi gì.
3. **Đổi trạng thái** sang `REPORTED` + đóng dấu `reportedAt`, bằng **so-sánh-rồi-đặt**
   (`updateMany` có điều kiện trong `WHERE`) - vì webhook có thể vừa xác nhận xong đúng lúc này,
   và kéo một đơn đã `PAID` ngược về `REPORTED` là làm nông dân mất việc vừa nhận.
4. **Ghi `Event`** (`deposit_reported` / `market_reported`) để đo ma sát khâu chuyển khoản.

Bấm nút đổi lại được **ba** thứ có giá trị thật cho khách:

- **Đóng băng chỗ giữ (§9.34).** Từ đây **không việc nền nào huỷ đơn nữa**. Người đã chuyển tiền
  thật không được mất hàng chỉ vì ngân hàng chậm.
- **Vào hàng đợi ở `/admin`** - đơn `REPORTED` được xếp **lên đầu** mọi bàn đối soát.
- **Kích hoạt lời nhắc**: quá `DECOR_REPORTED_NUDGE_HOURS` / `MARKET_REPORTED_NUDGE_HOURS` mà chưa
  ai đối soát thì [lib/jobs.ts](src/lib/jobs.ts) dội chuông cho quản trị.

> ⚠️ `REPORTED` **không** được xếp vào nhóm "đã trả". Trong `resolvePayCode`, `alreadyPaid` chỉ
> đúng khi trạng thái là `PAID`/`CONFIRMED`/`DELIVERED`. Xếp `REPORTED` vào "đã trả" thì webhook
> coi tiền thật về sau đó là khoản trùng và bỏ qua - **tiền về mà đơn không mở**.

---

## 4. Liên kết với SePay - cấu hình và xác thực

### 4.1 Nối một lần trên trang SePay

Theo [.env.example](.env.example) và [HUONG-DAN-SETUP-DEPLOY.md](HUONG-DAN-SETUP-DEPLOY.md) mục D4:

| Ô trên SePay | Giá trị |
|---|---|
| URL | `https://<domain>/api/webhooks/sepay` |
| Sự kiện | Có tiền vào |
| Kiểu dữ liệu | JSON |
| Gửi lại khi lỗi | **BẬT** (SePay thử lại tối đa **7 lần**) |
| Xác thực | **API Key** - tuyệt đối không chọn "Không xác thực" |
| Cảnh báo khi lỗi liên tiếp | **BẬT** (luồng tiền hỏng im lặng là tệ nhất) |

Khoá sinh bằng `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`, dán
**cùng một giá trị** vào ô của SePay và vào biến `SEPAY_WEBHOOK_KEY` trên Vercel.

### 4.2 Xác thực từng lời gọi

SePay gửi khoá ở header `Authorization: Apikey <KEY>`. Phía app:

```ts
function apiKeyOk(header: string | null, expected: string): boolean {
  const m = String(header ?? "").match(/^Apikey\s+(.+)$/i);
  if (!m) return false;
  const a = Buffer.from(m[1].trim());
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

Hai chi tiết cố ý:

- **`timingSafeEqual`** - so sánh theo thời gian hằng, để không rò rỉ qua thời gian phản hồi rằng
  đoán được bao nhiêu ký tự đầu.
- **Kiểm `a.length === b.length` trước** - `timingSafeEqual` ném lỗi khi hai buffer khác độ dài.

### 4.3 Không có khoá thì ĐÓNG, không phải mở (§9.20)

```ts
const expected = process.env.SEPAY_WEBHOOK_KEY;
if (!expected) return NextResponse.json({ … }, { status: 503 });
```

Quên đặt biến trên Vercel là **lỗi cấu hình**, không được biến thành cửa cho ai cũng tự xác nhận
thanh toán. Cùng nếp với `ADMIN_PASSWORD` ở middleware và `CRON_SECRET` ở `/api/cron`.

Khi đó app **vẫn chạy bình thường**, chỉ là mọi khoản tiền phải đối soát tay ở `/admin` - và bảng
điều khiển hiện rõ nhãn *"webhook chưa cấu hình"* thay vì im lặng.

---

## 5. Webhook xử lý một khoản tiền - từng bước

```
POST /api/webhooks/sepay
  │
  ├─ ① thiếu SEPAY_WEBHOOK_KEY ............................. 503  (ĐÓNG)
  ├─ ② Authorization: Apikey sai ............................ 401
  ├─ ③ body không phải JSON ................................. 400
  ├─ ④ thiếu body.id ........................................ 400
  ├─ ⑤ transferType ≠ "in"  hoặc  số tiền ≤ 0 ............... 200  "bỏ qua"
  │      (tiền RA không liên quan đơn nào - trả 200 để SePay đừng gửi lại)
  │
  ├─ ⑥ gom nội dung:  body.code + body.content + body.description  (cắt 2000 ký tự)
  ├─ ⑦ parsePayCode(nội dung)
  │
  ├─ ⑧ ⭐ GHI BankTxn  ── status = UNMATCHED, raw = nguyên payload
  │      └─ providerId trùng (P2002) ........................ 200  "đã ghi nhận trước đó"  ⟵ CHỐNG TRÙNG
  │      └─ ghi không được ................................... 500  (để SePay gửi lại)
  │
  │   ─── từ đây trở đi MỌI kết cục đều ghi vào sổ và trả 200 ───
  │
  ├─ ⑨ không bóc được mã ..................... UNMATCHED  "Không bóc được mã…"
  ├─ ⑩ resolvePayCode → không có đơn ......... UNMATCHED  "Không có đơn … mang mã này."
  ├─ ⑪ đơn đã trả rồi ........................ DUPLICATE  "kiểm xem có chuyển thừa không"
  ├─ ⑫ tiền về < số tiền đơn ................. MISMATCH   "thiếu, chưa xác nhận"
  │
  └─ ⑬ ĐỦ ĐIỀU KIỆN → gọi lib/payments.confirm*Paid(id, "WEBHOOK")
         └─ ok → MATCHED   (chuyển thừa thì ghi chú lại số dư)
         └─ không ok → UNMATCHED + lý do
```

### Bốn cửa phải qua hết mới tự xác nhận (§9.22)

| Cửa | Không qua thì |
|---|---|
| Bóc được mã trong nội dung chuyển khoản | `UNMATCHED` |
| Tra ra **đúng một** đơn (`payCode` unique nên chắc chắn 0 hoặc 1) | `UNMATCHED` |
| Đơn **chưa** được trả | `DUPLICATE` |
| Tiền về **≥** số tiền đơn | `MISMATCH` |

> **Thiếu bất kỳ điều nào thì chỉ ghi vào sổ cho người trực xử lý - tuyệt đối không tự xác nhận.**

Chuyển **thừa** thì vẫn xác nhận (đơn đã đủ tiền), nhưng ghi chú lại số dư:
`"Khách chuyển thừa 20.000đ."` để nông trại còn biết mà trả lại.

### `resolvePayCode` - tra đơn theo mã

Trong [lib/payments.ts](src/lib/payments.ts). Mỗi loại một nhánh, đều tra thẳng cột `payCode`
unique nên đi bằng chỉ mục, và trả về đúng ba thứ webhook cần:

```ts
type ResolvedOrder = {
  kind: PayKind;
  id: string;
  expectedVnd: number;   // đơn này đang chờ bao nhiêu
  alreadyPaid: boolean;  // đã trả rồi hay chưa
};
```

Riêng nhánh **chợ** tra hai chỗ: `MarketOrder.payCode` (mã từ Đợt 13 trở đi), và nếu không thấy
thì `MarketListing.payCode` - **mã cũ nằm trong lịch sử chuyển khoản của người mua**, bỏ nhánh này
đi thì tiền về mà không tra ra đơn, thành một khoản treo không ai biết của ai. Cả hai nhánh đều
trả về **ĐƠN**, để chỉ có một đường xử lý tiền chứ không hai.

---

## 6. Sổ giao dịch `BankTxn` - và vì sao ghi TRƯỚC khi xử lý

```prisma
model BankTxn {
  providerId    String        @unique   // id giao dịch bên SePay - CHỐNG TRÙNG
  gateway       String                  // tên ngân hàng
  accountNumber String?
  amountVnd     Int
  content       String                  // nội dung chuyển khoản thô
  code          String?                 // mã bóc được, null nếu không bóc được
  matchedKind   String?
  matchedId     String?
  status        BankTxnStatus @default(UNMATCHED)
  note          String?                 // lý do không khớp, cho người trực đọc
  raw           Json                    // payload gốc - để đối chất với nhà cung cấp
  createdAt     DateTime      @default(now())
}
```

**Ba lý do dòng này phải ra đời trước khi xử lý bất cứ thứ gì:**

1. **Chống trùng.** SePay gửi lại tối đa **7 lần** khi server lỗi. `providerId` unique + ghi trước
   ⟹ lần gửi lại đâm vào ràng buộc unique (P2002) và **dừng ngay tại đó**, trả 200. Không có chốt
   này thì một lần server hụt hơi = **cộng tiền hai lần**.
2. **Bằng chứng.** Đây là thứ duy nhất phía app chứng minh tiền đã về, khi khách gọi *"em chuyển
   rồi mà"*. Vì thế **ghi cả khoản không khớp** (§9.21) - người gõ sai nội dung chuyển khoản là
   chuyện thường; chỉ ghi khoản khớp thì khi có chuyện, nông trại không có gì để tra.
3. **`raw`** giữ nguyên payload gốc để còn đối chất với nhà cung cấp khi có tranh chấp.

### Bốn trạng thái

| Trạng thái | Nghĩa | Ai xử lý tiếp |
|---|---|---|
| `MATCHED` | Bóc được mã, đúng đơn, đủ tiền → **đã tự xác nhận** | Không ai cả, xong |
| `UNMATCHED` | Không bóc được mã, hoặc không đơn nào khớp | Người trực, tay |
| `DUPLICATE` | Đơn đã xác nhận trước đó (chuyển thừa / bấm nhầm) | Người trực, tay |
| `MISMATCH` | Đúng đơn nhưng **thiếu tiền** | Người trực, tay |

### Quy ước mã HTTP

> **Ghi được vào sổ rồi thì LUÔN trả 200.** Tới lúc đó giao dịch đã nằm trong `BankTxn`, SePay gửi
> lại cũng không đổi được gì - chỉ tốn thêm 7 lượt chạy vào nhánh xử lý (§10).
>
> **5xx chỉ dành cho hỏng hóc TRƯỚC khi ghi được dòng nào** (mạng, cold start, DB nghẽn) - và đúng
> những lần đó thì việc SePay gửi lại mới có ích.

---

## 7. Xác nhận tiền chỉ có MỘT lõi (§9.19)

Có **hai đường** dẫn tới `CONFIRMED`, và cả hai đều đổ về [lib/payments.ts](src/lib/payments.ts):

```
 (a) TAY:      /admin → confirmPayment(id)     → isAdmin()          ─┐
 (b) TỰ ĐỘNG:  POST /api/webhooks/sepay        → khoá API của SePay ─┤
                                                                     │
                          ┌──────────────────────────────────────────┘
                          ▼
                 lib/payments.ts   ⭐ CỬA DUY NHẤT
                   ├ confirmReservationPaid   (cọc)
                   ├ confirmDecorPaid         (trang trí)
                   ├ confirmMarketPaid        (chợ)
                   ├ confirmCarePaid          (nuôi dưỡng)
                   └ confirmInvoicePaid       (tiền nuôi)
```

Route webhook và server action được phép làm **đúng một việc: kiểm quyền rồi gọi vào**. Trong route
webhook, cả phần "chọn cửa" cũng chỉ là một bảng tra:

```ts
const CUA = {
  COC: confirmReservationPaid,
  MARKET: confirmMarketPaid,
  CARE: confirmCarePaid,
  INVOICE: confirmInvoicePaid,
  DECOR: confirmDecorPaid,
} as const;
const res = await CUA[found.kind](found.id, "WEBHOOK");
```

**Vì sao gắt chuyện này:** nếu mỗi đường tự viết phần "đổi trạng thái + ghi nhật ký + báo chuông +
đặt việc" thì sớm muộn hai đường lệch nhau, và **bên lệch sẽ là bên người dùng đã trả tiền mà chuồng
vẫn khoá**.

`lib/payments.ts` **không tự kiểm quyền** - đó là việc của chỗ gọi (`isAdmin()` cho action, khoá API
cho webhook). Tham số `source: "ADMIN" | "WEBHOOK"` đi thẳng vào `Event` để so hai đường với nhau.

### So-sánh-rồi-đặt, luôn luôn (§9.24)

Hai đường xác nhận chạy **độc lập và có thể đồng thời**. Nên mọi lần đổi trạng thái đều gói điều
kiện vào ngay trong `WHERE`:

```ts
const { count } = await prisma.reservation.updateMany({
  where: { id: r.id, paymentStatus: { not: "CONFIRMED" } },
  data: { paymentStatus: "CONFIRMED", paidAt: new Date(), status: "CONFIRMED" },
});
if (count === 0) return nope("Đơn này đã được xác nhận trước đó.");
```

Kiểm bằng `if` rồi mới `update` là **để hở đúng khe giữa hai câu lệnh** - và bên thua sẽ ghi nhật ký
lần hai, rung chuông lần hai, tạo lại `BarnDecor` lần hai. Lỗi này đã dựng lại được bằng hai lời gọi
song song.

### Xác nhận xong thì kéo theo những gì

Không chỉ đổi một cột. Ví dụ `confirmReservationPaid`:

- `Reservation` → `CONFIRMED` + `paidAt`
- `Event` `deposit_confirmed` (kèm `hoursToPay` - đo ma sát khâu chuyển khoản, và `source`)
- `FarmUpdate` mốc son: *"Đã nhận được cọc của bạn - chuồng chính thức kích hoạt!"*
- Thông báo `PAYMENT` cho chủ chuồng
- `revalidatePath` các trang chuồng
- Trang trí **mở khoá** (`barnActivated()` đọc chính trạng thái này)

Mỗi loại đơn kéo theo việc khác nhau: `confirmDecorPaid` tạo `BarnDecor` + giao việc lắp cho nông
dân trong cùng transaction; `confirmMarketPaid` chuyển lô sang `SOLD` + sinh việc `DELIVER`;
`confirmInvoicePaid` mở khoá trang chuồng nếu đang khoá vì hoá đơn quá hạn.

---

## 8. Màn hình khách tự cập nhật thế nào

Webhook xác nhận ở **phía server**. Tab đang mở trên máy khách **không biết gì cả** - và
`revalidatePath` **không** cứu được, vì nó chỉ dọn cache cho lần điều hướng sau, không đẩy gì xuống
tab đang mở.

Nên mọi ô chờ tiền dùng chung [usePayWatch](src/components/usePayWatch.ts):

```
<PaymentBanner> / <DecorStudio> / <MarketPayBox> / <CarePayBox>
        │
        └─ usePayWatch(payCode, chưaTrả, onPaid)
              └─ GET /api/thanh-toan?code=CHICC…  →  { status, paid }
```

Hai lớp hãm:

1. **Chỉ hỏi khi tab đang mở.** Không có nó thì một tab bỏ quên qua đêm bắn ~14.000 request - đủ
   để một mình làm cạn pool kết nối Supabase.
2. **Giãn dần 6s → 60s.** Người vừa bấm "đã chuyển khoản" cần biết ngay; người mở tab 20 phút rồi
   thì mỗi phút một lần là quá đủ. Quay lại tab thì hỏi ngay và đặt lại 6s.

> ⚠️ Điều kiện phải là **"đơn CHƯA được trả"**, KHÔNG phải "khách đã bấm tôi-đã-chuyển-khoản".
> Tiền có thể về **trước** khi người ta bấm nút - và đó chính là lúc màn hình đứng im lâu nhất.

`/api/thanh-toan` là **một cửa cho cả năm loại đơn** (tra theo mã, vì đơn chợ không thuộc chuồng nào
của người mua). Mã **không phải chứng chỉ sở hữu** - nó nằm trong nội dung chuyển khoản, in trên ảnh
QR, và ngắn - nên mỗi nhánh vẫn kiểm **đúng người** mới trả lời, nếu không thì đây thành chỗ dò
trạng thái đơn của người khác.

---

## 9. Đường dự phòng: đối soát tay ở `/admin`

Webhook là **TUỲ CHỌN**. Không nối thì app vẫn bán hàng được, chỉ chậm hơn - nên đường bấm tay là
đường **duy nhất chắc chắn luôn có**.

Khối **🏦 Tiền về tài khoản** ở [/admin](src/app/admin/page.tsx):

- Nhãn **"webhook đang bật" / "webhook chưa cấu hình"** đọc thẳng `!!process.env.SEPAY_WEBHOOK_KEY`.
- Số **"N khoản cần xem"** = `bankTxn.count({ status: { not: "MATCHED" } })`.
- 10 giao dịch gần nhất: trạng thái · ngân hàng · thời gian · số tiền · **nội dung thô** · ghi chú
  lý do không khớp.

Người trực đọc nội dung thô, tự tìm đơn tương ứng trong các hàng đợi bên dưới (cọc / trang trí /
tiền nuôi / nuôi dưỡng / chợ - đơn `REPORTED` luôn xếp **lên đầu**), rồi bấm xác nhận. Nút đó gọi
`confirm*Payment` trong [admin-actions.ts](src/app/admin-actions.ts) → `isAdmin()` →
**cùng hàm `lib/payments.confirm*Paid`** mà webhook gọi.

---

## 10. Bộ kiểm đang giữ những gì

`npm test` (§9.22, [tests/bat-bien.test.ts](tests/bat-bien.test.ts)) - **quét theo `PAY_KINDS`, không
viết cứng danh sách**:

- Mỗi loại đơn sinh ra một **ký tự phân loại khác nhau** (tra nhầm bảng = cộng tiền cho đơn người khác).
- Mã sinh ra thì **bóc lại đúng loại và đúng chuỗi**, kể cả khi nằm giữa nội dung ngân hàng thật,
  kể cả viết thường.
- Mã chỉ gồm `A-Z 0-9`, **không khoảng trắng**.
- Bảng chữ **bỏ `0 O 1 I L`**.
- Không bóc được thì **trả `null`** (kiểm cả `""`, `null`, `"CHIC"`, `"CHICX ABC123"`, `"CHICCABC"`).

[tests/giu-cho.test.ts](tests/giu-cho.test.ts) (§11.47) giữ việc **đơn chợ phải có bàn đối soát tay**
- đọc thân hàm `admin-actions.confirmMarketPayment` và bắt buộc nó chứa `isAdmin()` và
`confirmMarketPaid(`.

> Đây là **kiểm mã nguồn, không nối DB**. Việc bắn payload giả vào webhook rồi xem `BankTxn.status`
> vẫn phải làm bằng tay - công thức ở [CODEMAP §13](CODEMAP.md).

---

## 11. Những chỗ CHƯA có - đừng đi tìm

| Chỗ hở | Hiện trạng |
|---|---|
| **Xác thực bằng API Key, chưa phải HMAC-SHA256** | SePay khuyến nghị HMAC (khoá không đi trên đường truyền). Chưa xác minh được SePay ký vào header nào và ký trên chuỗi gì - đoán mò là hỏng luồng tiền, nên để nguyên API Key cho tới khi hỏi rõ. |
| **Không có nút xử lý một dòng `BankTxn` ngay tại `/admin`** | Khoản không khớp chỉ **hiện ra**; người trực phải tự tìm đơn tương ứng trong hàng đợi rồi bấm xác nhận tay. Không có thao tác "gán khoản tiền này cho đơn kia". |
| **Không đối chiếu số tài khoản nhận** | `accountNumber` được ghi vào sổ nhưng **không kiểm** xem có đúng tài khoản của nông trại không. Nối nhiều tài khoản trên SePay thì mọi khoản vào đều đổ về đây. |
| **Không có luồng hoàn tiền / đổi trả tự động** | Chuyển thừa chỉ được **ghi chú** lại. |
| **Tiền RA không vào sổ** | `transferType ≠ "in"` bị bỏ qua **trước** khi ghi `BankTxn`, nên không có dấu vết gì trong app. |
| **Gói miễn phí SePay giới hạn 50 giao dịch/tháng** | Vượt là **webhook im lặng**. Phải tự theo dõi - app không biết. |
| **Đối soát cuối ngày / cuối tháng** | Không có. Không có báo cáo khớp tổng tiền vào với tổng đơn đã xác nhận. |

---

## 12. Bảng tra nhanh

| Cần đụng vào | File |
|---|---|
| Nhận và xác thực webhook | [src/app/api/webhooks/sepay/route.ts](src/app/api/webhooks/sepay/route.ts) |
| Biến tiền thành "đơn đã thanh toán" | [src/lib/payments.ts](src/lib/payments.ts) |
| Sinh / bóc mã chuyển khoản | [src/lib/decor.ts](src/lib/decor.ts) (phần `PAY_PREFIX` → `parsePayCode`) |
| Ảnh QR | [src/lib/vietqr.ts](src/lib/vietqr.ts) · [src/components/PayQR.tsx](src/components/PayQR.tsx) |
| Màn hình tự cập nhật | [src/components/usePayWatch.ts](src/components/usePayWatch.ts) · [src/app/api/thanh-toan/route.ts](src/app/api/thanh-toan/route.ts) |
| Đối soát tay | [src/app/admin/page.tsx](src/app/admin/page.tsx) · [src/app/admin-actions.ts](src/app/admin-actions.ts) |
| Nhắc quản trị khi đơn `REPORTED` để lâu | [src/lib/jobs.ts](src/lib/jobs.ts) |
| Sổ giao dịch | `model BankTxn` trong [prisma/schema.prisma](prisma/schema.prisma) |
| Cấu hình | [.env.example](.env.example) mục *"Webhook ngân hàng (SePay)"* · [HUONG-DAN-SETUP-DEPLOY.md](HUONG-DAN-SETUP-DEPLOY.md) mục **D4** |

> **Thêm một nguồn thu mới thì phải sửa BỐN chỗ cùng lúc**, thiếu một là tiền về không ai nhận:
> `lib/decor.PayKind` + `KIND_CHAR`/`CHAR_KIND` · `payments.resolvePayCode` + một hàm `confirm…Paid`
> · bảng `CUA` trong route webhook · một nhánh trong `/api/thanh-toan` · một khối đối soát ở
> `/admin`. Xem [CODEMAP §8](CODEMAP.md).
