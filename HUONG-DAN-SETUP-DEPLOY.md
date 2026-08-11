# 🐔 ChicChic - Hướng dẫn setup & deploy (từ 0 đến chạy thật)

Làm lần lượt A → H. Ước tính ~30 phút. Miễn phí cho giai đoạn PoC.
Kiến trúc: **Vercel** (host Next.js) + **Supabase** (Postgres) + **GitHub** (code + CI).

---

## ✅ Checklist tổng
- [ ] A. Cài công cụ + chạy thử ở máy (local)
- [ ] B. Đưa code lên GitHub
- [ ] C. Tạo database Supabase, lấy 2 connection string ⚠️ **cả hai đều dùng pooler**
- [ ] D. Đẩy schema + seed lên Supabase
- [ ] D2. Tạo bucket Storage cho ảnh/video ⚠️ **bắt buộc nếu có nông dân thật** - không có thì cô chú không gửi được ảnh minh chứng
- [ ] D3. Cấu hình Resend để gửi email mã xác minh thật
- [ ] D4. Webhook ngân hàng SePay - *tuỳ chọn*; không có thì mọi khoản tiền phải đối soát tay
- [ ] E. Deploy lên Vercel + set biến môi trường
- [ ] F. Kiểm tra + khóa `/admin` bằng `ADMIN_PASSWORD`
- [ ] G. Thử **cổng nông dân** `/nong-trai` - giao việc, làm xong kèm ảnh minh chứng
- [ ] H. Chạy trọn **ba vai**: admin cấp tài khoản → khách nhận chuồng → nông dân làm việc
- [ ] I. **Niêm yết giá chợ + nhập kho trang trí** ⚠️ chưa làm thì chợ nằm im và khách không mua được decor; kèm việc **chi trả tay** cho người bán mỗi tuần

> Ba vai trong hệ thống: **admin** (nông trại, vào `/admin` bằng mật khẩu) ·
> **khách/chủ chuồng** (tự đăng ký bằng email) · **nông dân** (tài khoản do admin cấp, không tự đăng ký).
> Xem [mục H](#h-ba-vai--luồng-hoạt-động-đầy-đủ) để chạy đúng thứ tự.

---

## 👀 Nghiệm thu bằng trình duyệt - phần máy KHÔNG kiểm được

A→I ở trên là dựng hệ thống, làm một lần. Danh sách dưới đây là thứ khác hẳn: mỗi đợt làm
xong để lại một ít việc **chỉ mắt người mới thấy** - chữ hiện sai, khối nhảy chỗ, nút bấm
xong không đổi. `npm test` và `npm run build` xanh **không** nói gì về những thứ đó.

Các mục nằm rải trong file (thứ tự chữ cái không khớp thứ tự làm) - tìm chuỗi `### O.`,
`### P.`, `### Q.`, `### R.`:

- [x] **O. Khung chờ** (đợt 8) - ✅ chủ dự án xác nhận 2026-08-11.
- [x] **P. Chín mục đợt 9** - ✅ chủ dự án xác nhận 2026-08-11.
- [x] **Q. Hoàn tiền + lứa mới** (đợt 10) - ✅ chủ dự án xác nhận 2026-08-11.
- [ ] **R. Chợ mở · dọn chuồng · xoá chuồng** (đợt 12, ~10 phút) - ⚠️ có một bước **xoá
      chuồng thật, không hoàn tác được**. Đọc cảnh báo ở đầu mục trước khi bấm.
- [ ] **S. Vùng giao · phí ship · giỏ hàng** (đợt 13, ~12 phút) - cần **hai tài khoản mua**
      để kiểm chỗ quan trọng nhất: hai người mua cùng một chuồng phải có hai việc giao riêng.

> Đợt 11 (bộ kiểm cổng quyền) **không có mục riêng**: nó không đổi màn hình nào. Thứ duy
> nhất người dùng chạm được là nút *"Tra tên"* ở ô số tài khoản nhận tiền, nay bắt đăng
> nhập - đã nằm trong bước 7 của mục P.

---

## A. Chạy thử ở máy trước (khuyên làm, để chắc mọi thứ ổn)

**Cần có:** Node.js ≥ 20 ([nodejs.org](https://nodejs.org)), Git, và (tùy chọn) Docker để chạy Postgres local.

```bash
# 1. Giải nén repo, vào thư mục
cd chicchic

# 2. Cài dependencies (postinstall sẽ tự chạy `prisma generate`)
npm install

# 3. Tạo file .env từ mẫu
cp .env.example .env
```

**Chọn 1 trong 2 cách có Postgres local:**

*Cách 1 - Docker (nhanh nhất):*
```bash
docker run --name chicchic-db -e POSTGRES_PASSWORD=chic -e POSTGRES_DB=chicchic -p 5432:5432 -d postgres:16
```
Lúc này giữ nguyên `DATABASE_URL` và `DIRECT_URL` mặc định trong `.env` (đã trỏ localhost).

*Cách 2 - bỏ qua Postgres local:* trỏ thẳng `.env` vào Supabase (làm mục C trước rồi quay lại).

```bash
# 4. Tạo bảng + seed dữ liệu demo (4 nông dân, giống, decor, 3 chuồng, ảnh/video, nhiệm vụ)
npm run db:push
npm run db:seed

# 5. Chạy
npm run dev      # mở http://localhost:3000
```
> Chỉ trang `/` chạy được khi chưa có DB. Mọi trang còn lại (`/chuong`, `/nhan-chuong`,
> `/chuong/demo`, `/nong-trai`, `/admin`) đều cần bước 4 - kể cả `/nhan-chuong` vì nó phải
> đọc danh sách nông dân còn chỗ.

---

## B. Đưa code lên GitHub

Tạo một repo rỗng trên GitHub (vd tên `chicchic`), rồi:
```bash
git remote add origin https://github.com/<tên-github>/chicchic.git
git branch -M main
git push -u origin main
```
> Repo đã `git init` + commit sẵn. Ngay sau khi push, **CI tự chạy** (type-check + lint + build) - vào tab **Actions** trên GitHub để xem.

---

## C. Tạo database Supabase + lấy connection string

1. Tạo project tại [supabase.com](https://supabase.com). Chọn region gần VN (vd **Singapore**).
2. Đặt **Database Password** - **nhớ lại** (sẽ dán vào URL).
3. Bấm nút **Connect** ở đầu trang dashboard. Cần **2 chuỗi**, và **cả hai đều phải là bản pooler**:

| Biến | Lấy từ | Cổng | Xử lý thêm |
|------|--------|------|-----------|
| `DATABASE_URL` | **Transaction pooler** | **6543** | thêm `?pgbouncer=true&connection_limit=5` vào cuối |
| `DIRECT_URL` | **Session pooler** | **5432** | giữ nguyên |

Cả hai đều có host dạng `aws-<n>-<region>.pooler.supabase.com` và username dạng
`postgres.<project-ref>` (project-ref là chuỗi ~20 ký tự riêng của project ông, **không phải** chữ `abcd`).

```
DATABASE_URL="postgresql://postgres.xxxxxxxxxxxx:MẬT_KHẨU@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5"
DIRECT_URL="postgresql://postgres.xxxxxxxxxxxx:MẬT_KHẨU@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres"
```

> 🌏 Phần `ap-southeast-1` trong host là **vùng đặt database**, và nó phải là Singapore.
> Bản chạy thật đã từng ở `ap-south-1` (Mumbai): mỗi lượt đi–về DB tốn **~1,3s** thay vì
> **~282ms**, và không một phép tối ưu truy vấn nào bù lại được khoảng cách đó. Thấy
> `ap-south-1` trong chuỗi kết nối thì tạo project mới ở Singapore rồi chuyển dữ liệu sang -
> đừng ngồi gọt query trước (CODEMAP §11.23).

> ### ⚠️ Cạm bẫy lớn nhất: đừng dùng "Direct connection"
> Supabase còn đưa thêm lựa chọn **Direct connection** với host `db.<project-ref>.supabase.co`.
> Từ 2024 host này **chỉ phân giải ra địa chỉ IPv6**. Phần lớn mạng gia đình/văn phòng ở VN
> chưa có IPv6 → `npm run db:push` sẽ treo rồi báo **`P1001: Can't reach database server`**.
>
> Cách kiểm tra máy ông có IPv6 hay không (PowerShell):
> ```powershell
> Test-NetConnection -ComputerName "db.<project-ref>.supabase.co" -Port 5432
> ```
> `TcpTestSucceeded : False` nghĩa là không đi được → **dùng Session pooler (5432) cho `DIRECT_URL`** như bảng trên.
> Session pooler chạy trên IPv4 nên vào được từ mọi mạng, và vẫn hỗ trợ đầy đủ lệnh tạo bảng.

> **Vì sao cần 2 URL?** Vercel (serverless) mở rất nhiều kết nối ngắn → phải đi qua **pgBouncer**
> ở chế độ transaction (6543). Còn lệnh tạo bảng/migrate cần một kết nối giữ nguyên phiên → dùng
> session pooler (5432). Prisma đọc `directUrl` cho các lệnh đó - đã cấu hình sẵn trong
> `prisma/schema.prisma`, ông chỉ cần điền đúng 2 giá trị.

---

## D. Đẩy schema + seed lên Supabase (chạy 1 lần, từ máy)

Dán 2 URL Supabase ở trên vào `.env`, rồi:
```bash
npm run db:push     # tạo bảng trên Supabase (qua DIRECT_URL)
npm run db:seed     # nạp nông trại, 2 nông dân, 3 chuồng demo, ảnh/video, decor đã sắp
```
Kiểm tra: vào Supabase → **Table Editor**, thấy các bảng `Barn`, `Flock`, `BarnMedia`… là ok.

> **Seed chạy lại bao nhiêu lần cũng được.** Mọi bản ghi dùng ID cố định + `upsert`, nên
> `npm run db:seed` lần 2, lần 3 vẫn ra đúng một bộ dữ liệu - không nhân đôi, không lỗi
> `Unique constraint failed`. Mốc thời gian tính tương đối so với lúc chạy, nên demo luôn
> có nội dung "hôm nay".

Sau khi seed có sẵn 3 chuồng để xem:

| Đường dẫn | Xem được gì |
|-----------|-------------|
| `/chuong/demo` | Gà đẻ đang đẻ - 5 món decor đã sắp, 7 ảnh/video, nhật ký nhiều ngày |
| `/chuong/demo-thit` | Gà thịt - tiến độ nuôi thật, nút thả vườn, đang trong **thời gian ngừng thuốc** |
| `/chuong/demo-cuoi-ky` | Cuối chu kỳ đẻ - mở được màn chọn thịt / nghỉ hưu / lứa mới |

---

## D2. Kho ảnh & video (Supabase Storage) - ⚠️ BẮT BUỘC nếu có nông dân thật

App có sẵn màn **Ảnh & video** (`/chuong/<slug>/nhat-ky`): gom theo ngày, có khu "Hôm nay",
bấm vào xem toàn màn hình, video có nút play và thời lượng.

**Vì sao bắt buộc:** nông dân đứng giữa vườn với cái điện thoại **không dán URL được**.
Mà "không có ảnh minh chứng thì không tích xong việc" là bất biến của sản phẩm - thiếu bước
này thì cổng nông dân coi như không dùng được ngoài đời.

### Cấu hình (3 phút, cùng project Supabase ở mục C)

1. Supabase → **Storage → New bucket**, tên **`chicchic`**, bật **Public bucket**.
   (Ảnh chuồng hiện trong thẻ `<img>` bình thường nên bucket phải đọc được tự do.)
2. **Settings → API** → chép **Project URL** vào biến `SUPABASE_URL`.
3. Cùng trang, mục **service_role** (hoặc **Secret key** ở giao diện mới) → chép vào
   `SUPABASE_SERVICE_ROLE_KEY`.
   ⚠️ Key này **không bao giờ** để lộ ra trình duyệt - chỉ server dùng để ký URL tải lên.
   Đừng đặt tên biến bắt đầu bằng `NEXT_PUBLIC_`.
   💡 Supabase có **hai đời key** và app nhận cả hai: đời cũ là chuỗi JWT dài (`eyJ…`,
   khoảng 220 ký tự), đời mới ngắn hơn nhiều (`sb_secret_…`, khoảng 40 ký tự). Chép đời
   nào cũng được - nhưng đọc mục **L** bên dưới trước khi kết luận "key hỏng".
4. Thêm cả 3 biến (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET=chicchic`)
   vào `.env` ở máy **và** vào Vercel (mục E), rồi deploy lại.

### Sau khi cấu hình xong thì dùng thế nào

- **Nông dân (điện thoại)**: `/nong-trai` → **📸 Chụp ảnh ngay** mở thẳng camera sau;
  hoặc **🖼️ Chọn ảnh có sẵn trong máy** để lấy ảnh/video đã quay sẵn trong thư viện.
  Chụp xong app **tự nén** ảnh rồi tải lên, có thanh phần trăm.
- **Máy tính**: chỉ hiện một nút **📸 Chọn ảnh từ máy** - máy tính không có camera sau
  nên bày hai nút là thừa.
- **Admin**: `/admin` → khối **📷 Gửi ảnh / video** → nút **Tải ảnh/video từ máy**, hoặc vẫn dán URL.

### Giới hạn cần biết trước khi hứa với ai

| Thứ | Giới hạn | Vì sao |
|---|---|---|
| Ảnh | tự nén về cạnh dài ≤1600px | ảnh 12MP ~4MB xuống ~250KB, tải nhanh gấp chục lần trên sóng 3G |
| Video | **tối đa 45MB** | trần thật của kho là 50MB (đã đo: 45MB lên được, 60MB kho trả `413`). Chặn ngay lúc chọn file để không ai đợi hết ba phút tải rồi mới nhận lỗi |
| Định dạng ảnh | JPG · PNG · WEBP | **không nhận SVG** - SVG chạy được script, mà ảnh này hiện cho người khác xem |
| Ảnh **HEIC** của iPhone | bị từ chối ngay tại máy | máy khác Safari mở không lên ⟹ ảnh minh chứng thành ô vỡ. Sửa: iPhone → *Cài đặt › Camera › Định dạng › "Tương thích nhất"* |
| Định dạng video | MP4 · MOV · WEBM | |
| Video **H.265/HEVC** | bị từ chối ngay lúc chọn | iPhone để *"High Efficiency"* quay ra HEVC: máy Apple xem tốt, **Windows/Android thường chỉ nghe được tiếng, màn hình đen**. Sửa: iPhone → *Cài đặt › Camera › Định dạng › "Tương thích nhất"* - đổi một lần, những lần sau không phải làm nữa |

> ⚠️ **Hai dòng cuối bảng là CÙNG MỘT công tắc trên iPhone.** "High Efficiency" đẻ ra cả
> ảnh HEIC lẫn video HEVC. Nếu nông dân nào báo *"gửi ảnh không được"* hoặc *"video không
> có hình"*, bảo họ đổi đúng một chỗ đó là hết cả hai.

Vẫn dán được **link YouTube** (`youtu.be/...`) - app tự đổi sang dạng nhúng không-cookie.

### Giới hạn cần biết

| | |
|---|---|
| Ảnh | **tự nén** về cạnh dài ≤1600px, JPEG chất lượng 0,82 (ảnh 12MP ~4MB → ~250KB) |
| Video | **không nén được** trên trình duyệt → chặn cứng ở **25MB**. Dặn cô chú quay 15–30 giây. |
| Định dạng | jpg · jpeg · png · webp · heic · mp4 · mov · webm. **Không nhận SVG** (SVG chạy được script). |
| Chưa cấu hình | nút chụp ảnh **tự đổi thành ô dán đường dẫn** - app không kẹt, nhưng cô chú không dùng được. |
| Kho miễn phí | 1GB. Ảnh đã nén ~250KB/tấm → khoảng 4.000 tấm. |

> ⚠️ **Chưa có đường xoá file khỏi kho.** Xoá một mục media trong app chỉ xoá dòng trong DB,
> file vẫn nằm lại Supabase. Định kỳ dọn tay cho tới khi có luồng xoá thật.

> Ảnh/video demo trong repo nằm ở `public/demo/` (SVG vẽ tay) và **chỉ còn dùng trong `prisma/seed.ts`**.
> Nút "ảnh mẫu" trong form nông dân đã bị gỡ - cho chọn ảnh dựng sẵn là phá thẳng luật minh chứng.

---

## D3. Email mã xác minh (đăng ký & quên mật khẩu)

App có hệ thống tài khoản: đăng ký phải **nhập đúng mã 6 số gửi về email**, quên mật khẩu cũng
dùng mã tương tự. Mã sống 10 phút, sai quá 5 lần thì phải xin mã mới.

- **Chưa cấu hình gì** → app chạy *chế độ demo*: mã hiện thẳng trên màn hình (ô vàng).
  Luồng test được từ đầu tới cuối, nhưng **không dùng được khi mở cho người thật**.
- **Gửi email thật** (miễn phí, ~5 phút) → làm theo 5 bước dưới đây.

### 1. Tài khoản & API key (nếu cần tạo lại)

1. [resend.com](https://resend.com) → đăng ký (free tier ~3.000 email/tháng, 100/ngày).
   Xác minh email đăng ký - **nhớ kỹ địa chỉ này**, mục 2 cần tới.
2. **API Keys** → *Create API Key*:
   - Name: `chicchic-dev`
   - Permission: **Sending access** (đừng chọn Full access - app chỉ cần gửi)
   - Domain: *All domains*
3. Key dạng `re_…` **chỉ hiện đúng một lần**. Mất thì tạo key mới, không xem lại được.

### 2. Cái bẫy lớn nhất: `onboarding@resend.dev`

`RESEND_FROM` mặc định là `ChicChic <onboarding@resend.dev>` - địa chỉ dùng chung của Resend,
không cần domain riêng. Nhưng Resend chặn: **địa chỉ này chỉ gửi được tới đúng email đã đăng ký
tài khoản Resend.**

Gửi tới email khác sẽ trả 403 `validation_error`: *"You can only send testing emails to your own
email address"*. Trong app, [mailer.ts:43](src/lib/mailer.ts#L43) sẽ `throw`, và người dùng chỉ
thấy *"Không gửi được email lúc này. Thử lại sau ít phút nhé."* - không nói lý do. Lý do thật nằm
ở terminal chạy `npm run dev`, dòng `[mailer] Resend lỗi 403 …`.

Nên khi test đăng ký, **dùng chính email đã đăng ký Resend**, hoặc làm bước 3.

### 3. Gửi được cho mọi người → phải có domain riêng

Resend → **Domains** → *Add Domain* → nhập domain của ông. Resend đưa 3–4 bản ghi DNS
(TXT cho DKIM, TXT SPF, MX cho vùng `send.`) → thêm ở nơi quản lý DNS (Cloudflare/Namecheap/…)
→ bấm *Verify*. DNS thường ngấm sau vài phút tới vài tiếng.

Xong thì đổi:

```
RESEND_FROM="ChicChic <no-reply@tenmiencuaban.com>"
```

Không có domain thì cứ để nguyên `onboarding@resend.dev` và test theo mục 2 - vẫn đủ cho PoC.

### 4. Đặt biến

**Local** - `.env` đã có sẵn cả hai dòng:

```
RESEND_API_KEY="re_xxxxxxxx"
RESEND_FROM="ChicChic <onboarding@resend.dev>"
```

Sửa xong **phải khởi động lại `npm run dev`**: Next chỉ đọc `.env` lúc boot, sửa file mà không
restart thì `process.env.RESEND_API_KEY` vẫn là giá trị cũ.

**Vercel** - Settings → Environment Variables → thêm `RESEND_API_KEY` và `RESEND_FROM` cho cả
Production/Preview/Development → **Redeploy** (biến mới chỉ vào bản build sau đó).
Nhớ đặt luôn `ADMIN_PASSWORD` trước khi chia link.

### 5. Test luồng

Vào `/dang-ky` → nhập email → bấm gửi mã. Phân biệt các kết quả ở
[auth-actions.ts:45-46](src/app/auth-actions.ts#L45-L46):

| Thông báo trên màn hình | Nghĩa là |
|---|---|
| "Đã gửi mã 6 số tới … - kiểm tra cả mục Spam nhé." | Resend nhận đơn, gửi thật |
| "Bản demo chưa cấu hình gửi email - dùng mã hiển thị bên dưới." + ô mã 6 số | `RESEND_API_KEY` rỗng/không đọc được → chế độ demo |
| "Không gửi được email lúc này." | Resend trả lỗi - **xem terminal** để biết mã lỗi |

Đối chiếu thêm ở Resend dashboard → **Emails**: mỗi lần gửi có một dòng với trạng thái
`delivered` / `bounced` / `complained`.

Muốn thử API key tách khỏi app (thay `EMAIL_CUA_BAN`):

```bash
K=$(grep '^RESEND_API_KEY' .env | sed -E 's/^RESEND_API_KEY="?([^"]*)"?/\1/')
curl -s -X POST https://api.resend.com/emails -H "Authorization: Bearer $K" \
  -H "Content-Type: application/json" \
  -d '{"from":"ChicChic <onboarding@resend.dev>","to":["EMAIL_CUA_BAN"],"subject":"Test ChicChic","html":"<p>ok</p>"}'
```

Trả `{"id":"…"}` là thông. Trả `403` là dính đúng mục 2.

> Tài khoản demo có sẵn sau khi seed: **demo@chicchic.vn / chicchic123** (sở hữu 2 chuồng).

---

## D4. Webhook ngân hàng (SePay) - tiền về là tự xác nhận

**Bỏ qua được không?** Được. Không cấu hình thì `POST /api/webhooks/sepay` trả **503 (đóng)** và
app quay về đối soát tay ở `/admin` - vẫn chạy đúng, chỉ là khách chuyển khoản lúc 10 giờ đêm thì
chuồng nằm khoá tới sáng hôm sau.

**Nguyên tắc phải hiểu trước khi làm:** endpoint này **mở khoá hàng đã trả tiền**. Nó nằm công khai
trên internet và URL thì ai cũng đoán được. Nếu để "không xác thực", bất kỳ ai cũng POST được một
JSON giả *"đã nhận 460.000đ"* rồi tự kích hoạt chuồng. Vì vậy code **fail-closed**: thiếu khoá thì
đóng, không phải mở tự do - cùng nếp với `ADMIN_PASSWORD`.

### 1. Sinh khoá

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Một chuỗi 64 ký tự. Dùng **đúng một giá trị này** cho cả SePay và Vercel. Coi nó như mật khẩu:
đừng dán vào chat, vào issue, vào ảnh chụp màn hình.

### 2. Đặt biến

| Nơi | Làm gì |
|---|---|
| `.env` ở máy | `SEPAY_WEBHOOK_KEY="<khoá vừa sinh>"` |
| Vercel | Settings → Environment Variables → thêm `SEPAY_WEBHOOK_KEY`, tích cả Production/Preview/Development |

⚠️ Biến môi trường chỉ có hiệu lực **từ lần build kế tiếp**. Đặt xong phải deploy lại (push code,
hoặc Deployments → ⋯ → Redeploy).

### 3. Tạo webhook trên [sepay.vn](https://sepay.vn)

Đăng ký → liên kết tài khoản ngân hàng nhận tiền → **Tích hợp webhooks → Thêm Webhook**. Bốn màn:

**Màn 1 - Cơ bản**

| Trường | Đặt |
|---|---|
| Tên | tuỳ ý, vd `Xác nhận thanh toán` |
| **URL** | `https://<domain-vercel>/api/webhooks/sepay` - domain **đầy đủ**, không phải tên project |
| Loại giao dịch | **Tiền vào** (tiền ra không liên quan tới đơn nào, mà vẫn tốn hạn mức) |
| Kiểu dữ liệu | **JSON** |
| **Tự động gửi lại khi server trả lỗi** | **BẬT** |

Cái gạt cuối là tiền thật, không phải tuỳ chọn cho đẹp: server hụt hơi 2 giây hoặc Vercel cold start
chậm mà không có retry thì khách chuyển tiền xong **chuồng không bao giờ mở**, và không có gì báo cho
ai. Bật lên, SePay thử lại tối đa 7 lần trong 5 giờ.

**Màn 2 - Tài khoản**

- Chọn **Tuỳ chọn** rồi chỉ đúng tài khoản nhận tiền của nông trại. Gói miễn phí chỉ **50 giao dịch/
  tháng**, mà "Tất cả tài khoản" nghĩa là lương, bạn bè trả nợ… cũng tính vào hạn mức.
- *Dùng để xác thực thanh toán*: **BẬT**.
- *Chỉ gửi khi có mã thanh toán*: **TẮT**. Bật lên nghe gọn hơn, nhưng giao dịch nào khách **gõ sai
  mã** sẽ không bao giờ tới server - khách gọi *"em chuyển rồi mà"* mà mình không có bản ghi nào để
  tra. Tắt thì mọi khoản tiền vào đều về, code tự quyết: khớp thì xác nhận, không khớp thì ghi sổ cho
  người trực.

**Màn 3 - Bảo mật** ⚠️

- Chọn **API Key**, dán khoá ở bước 1. SePay sẽ gửi kèm header `Authorization: Apikey <KEY>`.
- **Đừng chọn "Không xác thực"** - xem lại đoạn đầu mục này.
- HMAC-SHA256 mạnh hơn (khoá không đi trên đường truyền) và là khuyến nghị của SePay, nhưng code
  **chưa hỗ trợ**: chưa xác minh được SePay ký vào header nào và ký trên chuỗi gì. Đoán mò chỗ này
  là hỏng luồng tiền theo kiểu khó phát hiện.

**Màn 4 - Cảnh báo**

**BẬT** *cảnh báo khi webhook gặp lỗi liên tiếp*. Chế độ hỏng tệ nhất của luồng tiền là hỏng **im
lặng**: webhook chết, tiền vẫn về tài khoản đều đều, nhưng không đơn nào được xác nhận.

> Mục *Cấu hình chung → Cấu trúc mã thanh toán* để tiền tố `CHIC` cũng được, **không bắt buộc** -
> code đọc cả trường `content` nên không phụ thuộc vào việc SePay bóc mã hộ.

### 4. Test

**a. Lớp bảo vệ** - chạy ngay sau khi deploy, không tốn đồng nào:

```bash
curl -i -X POST https://<domain>/api/webhooks/sepay \
  -H "Content-Type: application/json" -d '{"id":"probe"}'
```

| Trả về | Nghĩa là |
|---|---|
| **401** | ✅ đúng - endpoint sống và đang khoá |
| 503 | chưa đặt `SEPAY_WEBHOOK_KEY`, hoặc đặt rồi mà chưa redeploy |
| 404 | deploy chưa xong / sai đường dẫn |
| **200** | 🔴 dừng lại, có gì đó rất sai |

**b. Đường truyền** - payload giả với khoá đúng, nội dung vô nghĩa để rơi vào `UNMATCHED`:

```bash
curl -s -X POST https://<domain>/api/webhooks/sepay \
  -H "Content-Type: application/json" -H "Authorization: Apikey <KEY>" \
  -d '{"id":"probe-1","gateway":"Test","transferType":"in","transferAmount":10000,"content":"kiem tra duong truyen"}'
```

Phải trả `{"success":true,"status":"UNMATCHED"}`. Rồi mở `/admin` → khối **🏦 Tiền về tài khoản**
phải hiện dòng đó với nhãn *không khớp đơn*. Đó là bằng chứng cả chuỗi đã chạy trên production.

**c. Tiền thật.** Tạo một hoá đơn trang trí trên chuồng của chính mình rồi chuyển đúng số tiền với
đúng nội dung - tiền đi từ tài khoản bạn về tài khoản bạn nên chi phí bằng 0. Món phải **tự** vào
chuồng, chuông phải kêu, `/admin` hiện *đã tự xác nhận*. **Đừng bấm nút xác nhận tay** - để webhook
làm, đó mới là thứ đang thử.

### 5. Đọc kết quả ở `/admin`

Khối **🏦 Tiền về tài khoản** ghi **mọi** khoản tiền vào, kể cả khoản không khớp - người gõ sai nội
dung chuyển khoản là chuyện thường, và khi khách nói *"em chuyển rồi"* thì đây là bằng chứng duy nhất
phía app.

| Nhãn | Nghĩa | Phải làm gì |
|---|---|---|
| **đã tự xác nhận** | khớp đơn, đủ tiền, đã mở khoá | không cần làm gì |
| **không khớp đơn** | không bóc được mã, hoặc mã trùng nhiều đơn | tự tìm đơn tương ứng rồi bấm xác nhận tay ở hàng đợi bên dưới |
| **thiếu tiền** | đúng đơn nhưng tiền về ít hơn | liên hệ khách; hệ thống **cố ý** không tự xác nhận |
| **đơn đã thanh toán** | trùng, hoặc khách chuyển thừa lần hai | kiểm tra xem có phải hoàn tiền không |

### 6. Nội dung chuyển khoản

Mã do app sinh, khách chỉ việc chép:

| Loại | Dạng | Ví dụ |
|---|---|---|
| Cọc giữ chỗ chuồng | `CHICC` + 6 ký tự | `CHICCAYVFPM` |
| Hoá đơn trang trí | `CHICD` + 6 ký tự | `CHICDK3M9QZ` |

Không khoảng trắng (mỗi app ngân hàng xử lý khoảng trắng một kiểu), và ký tự thứ 5 phân biệt hai
bảng khác nhau - thiếu nó thì webhook không biết tra `Reservation` hay `DecorOrder`, tra nhầm là cộng
tiền cho đơn của người khác. Đổi định dạng thì phải sửa `payCode` **và** `parsePayCode` trong
[src/lib/decor.ts](src/lib/decor.ts) cùng lúc.

### 7. Giới hạn cần biết

- Gói miễn phí SePay: **50 giao dịch/tháng**. Vượt là webhook im lặng - phải theo dõi.
- Chưa có luồng **hoàn tiền / đổi trả**.
- Mã chỉ dài 6 ký tự nên **về lý thuyết có thể trùng**. Gặp trùng thì hệ thống từ chối tự xác nhận
  (đúng ý) nhưng khách phải chờ người trực.
- SePay **không gọi được `localhost`**. Muốn thử ở máy thì dùng `curl` như mục 4.

---

## E. Deploy lên Vercel

1. Vào [vercel.com](https://vercel.com) → **Add New → Project → Import** repo `chicchic`. Next.js được nhận diện tự động (giữ nguyên build/output mặc định).
2. Mở **Environment Variables**, thêm các biến sau (dán **không có dấu nháy kép**):

| Key | Value |
|-----|-------|
| `DATABASE_URL` | chuỗi **Transaction pooler** (6543, có `?pgbouncer=true&connection_limit=5`) |
| `DIRECT_URL` | chuỗi **Session pooler** (5432, host `…pooler.supabase.com`) |
| `NEXT_PUBLIC_HOLD_BANK` | vd `Vietcombank · 0123456789 · DO DINH THANG` |
| `NEXT_PUBLIC_HOLD_MOMO` | số MoMo nhận cọc |
| `NEXT_PUBLIC_HOLD_BANK_CODE` | mã ngân hàng cho **QR chuyển khoản** - mã ngắn / BIN / tên đều được (`VCB`, `970436`, `Vietcombank`). Tra ở [vietqr.app/banks.json](https://vietqr.app/banks.json) |
| `NEXT_PUBLIC_HOLD_ACCOUNT` | số tài khoản nhận tiền, chỉ chữ và số |
| `NEXT_PUBLIC_HOLD_NAME` | tên chủ tài khoản, **không dấu** - in dưới ảnh QR |
| `ADMIN_PASSWORD` | mật khẩu vào `/admin` - **bắt buộc**: production thiếu biến này thì `/admin` trả **503** và mọi thao tác admin bị từ chối |
| `RESEND_API_KEY` | gửi email mã xác minh thật (xem mục D3). Bỏ trống → mã hiện trên màn hình |
| `RESEND_FROM` | vd `ChicChic <onboarding@resend.dev>` |
| `SUPABASE_URL` | Project URL của Supabase - kho ảnh (mục D2) |
| `SUPABASE_SERVICE_ROLE_KEY` | key `service_role` - **chỉ server dùng**, đừng đặt tiền tố `NEXT_PUBLIC_` |
| `SUPABASE_BUCKET` | `chicchic` |
| `SEPAY_WEBHOOK_KEY` | khoá webhook ngân hàng (mục D4). Bỏ trống → `/api/webhooks/sepay` trả **503, đóng** và mọi khoản tiền quay về đối soát tay |
| `CRON_SECRET` | khoá việc nền theo ngày (mục J). Bỏ trống → `/api/cron` trả **503, đóng** và **đàn gà không bao giờ lớn lên**, chỗ giữ trên chợ không tự nhả, hoá đơn bỏ quên giữ hàng mãi |

3. Bấm **Deploy**. Xong → mở URL Vercel: `/`, `/chuong`, `/nhan-chuong`, `/chuong/demo`, `/admin`.

> Build **không cần** kết nối DB (các trang đọc DB đã `force-dynamic`), chỉ runtime mới nối Supabase.
> Về sau đổi schema: sửa `prisma/schema.prisma` → `npm run db:push` → push GitHub, Vercel tự deploy lại.
> ⚠️ **Đổi schema thì phải làm cả hai:** `db push` (đổi bảng ở Supabase) **và** deploy lại Vercel
> (đổi code). Làm một nửa thì bản đang chạy sẽ đọc cột chưa có, hoặc ngược lại.

---

## F. Kiểm tra & khóa /admin (quan trọng)

- [ ] Mở `/nhan-chuong`, chọn chuồng, bấm giữ chỗ → app **tạo luôn một chuồng riêng** cho email đó
      và đưa thẳng vào `/chuong/<slug-mới>`. Kiểm tra Supabase có dòng `Reservation` + `Barn` mới.
- [ ] **Luồng cọc:** chuồng mới hiện banner 🔒 với STK/MoMo + **nội dung CK** (dạng `CHICCXXXXXX`,
      liền một chuỗi, không khoảng trắng). Khách bấm "Tôi đã chuyển khoản" → banner chuyển "đang chờ
      đối soát". Ông vào `/admin` → khối **💰 Đối soát cọc** → kiểm tra tài khoản có đúng khoản +
      nội dung CK → bấm **Đã nhận tiền**. Trang bên khách **tự cập nhật trong ~10 giây** (không cần
      tải lại) và mở khoá trang trí.
      *Có webhook (mục D4) thì bước bấm tay này tự chạy* - nhưng nút vẫn còn đó cho khoản không khớp.
- [ ] **Trang trí là món trả tiền trước:** chọn món → **Đặt mua** → hiện hoá đơn với mã `CHICDXXXXXX`.
      Chưa xác nhận thanh toán thì **không lắp được** - thử gọi thẳng `installDecor` bằng devtools
      cũng phải bị từ chối, chặn ở giao diện chỉ là mỹ quan.
- [ ] **Mua thêm & tồn kho:** mua 3 chậu cây → xác nhận tiền → **3 cái** hiện trong chuồng (không
      phải 1). Gỡ một cái → nó về khối **📦 Trong kho của bạn**, bấm lắp lại **không mất tiền lần hai**.
      Lắp hết kho rồi thì nút "Lắp lại" biến mất, phải mua thêm. Thẻ món hiện *"Đang có N cái"*.
- [ ] **Đặt tên:** `/nhan-chuong` có ô **Đặt tên chuồng** (bỏ trống → tên mặc định). Đổi lại ở
      `/tai-khoan` → menu `⋯` → **Đổi tên chuồng**. Thử tên có emoji và dấu tiếng Việt: phải hiện
      đúng trên thẻ chuồng **và** trên biển tên trong hình vẽ, không vỡ ký tự.
- [ ] **Khắc chữ lên biển:** chạm vào biển tên trong khung trang trí → **✎ Sửa chữ** → gõ chữ riêng.
      Bảng phấn cũng vậy. Món không có mặt chữ (chậu cây…) thì không hiện nút đó.
      ⚠️ Đổi tên chuồng **không** đổi chữ trên biển đã khắc riêng - đúng thiết kế, biển thật chỉ
      đổi khi chủ chuồng chủ động sửa (app không tự đổi hiện thực).
- [ ] Khi chưa xong cọc: khách **không đặt được chuồng thứ hai** cùng email, và trang
      **Trang trí bị khoá** (cả giao diện lẫn server).
- [ ] **Tài khoản:** `/dang-ky` → nhập email → nhận mã 6 số → đặt mật khẩu → vào thẳng `/tai-khoan`.
      Thử `/quen-mat-khau` để đổi mật khẩu bằng mã.
- [ ] **Bắt buộc đăng nhập:** đăng xuất rồi mở `/chuong`, `/chuong/demo`, `/nhan-chuong`, `/nong-trai` →
      cả bốn đều nhảy sang `/dang-nhap?next=…`, đăng nhập xong quay lại đúng trang cũ.
- [ ] **Cửa vào khu chuồng:** tài khoản mới tinh mở `/chuong` → màn *"Hãy nhận nuôi chuồng đầu tiên"*
      + nút **Xem thử chuồng mô phỏng**. Tài khoản đã có chuồng → thấy danh sách để chọn.
- [ ] **Chuông 🔔:** đăng nhập xong thấy chuông ở góc trái thanh trên. Làm một thao tác bất kỳ
      ở tài khoản kia → trong ≤20 giây chuông nhảy số, bấm vào nhảy đúng trang.
- [ ] **Riêng tư:** đăng nhập bằng tài khoản khác rồi mở chuồng của người ta → màn 🔐
      "Chuồng này của một bạn khác". 3 chuồng demo (`isPublic`) thì tài khoản nào cũng xem được,
      còn nông dân đang phụ trách vẫn vào được chuồng mình chăm.
- [ ] **Hoàn trả chuồng:** `/tai-khoan` → bấm `⋯` ở chuồng → *Hoàn trả chuồng cho trang trại* →
      phải **gõ đúng nguyên văn** câu `Xác nhận hoàn trả chuồng cho trang trại` thì nút mới bật.
- [ ] Mở `/chuong/demo/trang-tri` → kéo thử một món decor sang chỗ khác → **Lưu bố cục này** →
      quay lại `/chuong/demo` thấy món đó nằm đúng chỗ vừa xếp.
- [ ] `/admin` gửi thử 1 ảnh → `/chuong/demo` thấy ảnh trong khu **Hôm nay**.
- [ ] **📊 Nhịp 7 ngày** ở đầu `/admin` có số: sau khi chạy thử vài thao tác trên, ô *Chủ chuồng mở app*,
      *Giữ chỗ*, *Cọc đã xác nhận* phải nhảy lên. Đó là dữ liệu thật từ bảng `Event`, không phải đếm tay.
- [ ] **Kho ảnh chạy thật** (sau mục D2): vào `/nong-trai` **bằng điện thoại**, bấm 📸 → camera mở →
      chụp → thấy thanh phần trăm → ảnh hiện ngay ở `/chuong/<slug>/nhat-ky` bên chủ chuồng.
- [ ] ⚠️ Đặt `ADMIN_PASSWORD` trên Vercel **trước khi** đưa link ra ngoài. Thiếu biến này ở production
      thì `/admin` trả **503** (đóng hẳn, không phải mở tự do). Đặt rồi, trình duyệt sẽ hỏi mật khẩu
      (bỏ trống ô tên đăng nhập).
- [ ] **Thử lỗ quyền:** đăng nhập bằng tài khoản khách thường, mở
      `/api/barns/<slug-chuồng-người-khác>/payment` → phải trả **404**; chưa đăng nhập → **401**.

---

## G. Cổng nông dân (`/nong-trai`) - vòng lặp quan trọng nhất

Mỗi chuồng thuộc về **đúng một** cô/chú nông dân, và mỗi người nhận **tối đa 15 chuồng**
(`FarmWorker.maxBarns`) để còn nhớ được tên từng đàn. Khi khách nhận chuồng mới, họ **tự chọn**
người chăm trong danh sách còn chỗ - người đã kín hoặc đang tạm nghỉ (`active = false`) bị làm mờ,
và server kiểm lại sức chứa **ngay trước khi** tạo chuồng nên không thể lách bằng devtools.

### Tài khoản nông dân do admin cấp

Nông dân **không tự đăng ký được** - không có luồng OTP nào tạo ra `role = WORKER`.
Admin vào `/admin` → khối **👩‍🌾 Tài khoản nông dân** → đặt **tên đăng nhập + mật khẩu** rồi
đưa tận tay cô/chú. Đây là chủ ý thiết kế: người chăm gà là nhân sự của nông trại, không phải
người dùng tự do đăng ký.

Về mặt dữ liệu: một `User` có `role = WORKER` + `username`, nối 1–1 với `FarmWorker.userId`.
Các cô chú **không cần email** - hệ thống tự sinh địa chỉ nội bộ `<username>@nong-dan.chicchic.vn`
chỉ để thoả ràng buộc cột `User.email`, **không bao giờ gửi thư tới đó**. Hệ quả: quên mật khẩu thì
**không** dùng `/quen-mat-khau` được, admin phải bấm **Đổi mật khẩu** trong `/admin` (thao tác này
huỷ mọi phiên đang đăng nhập của người đó).

Đăng nhập ở đúng trang `/dang-nhap` như khách, chung một ô "email hoặc tên đăng nhập":
có `@` thì hệ thống tra theo email, không có thì tra theo username. Nông dân đăng nhập xong
vào thẳng `/nong-trai`.

Seed sẵn 4 người (mật khẩu đều là `chicchic123`):

| Tên đăng nhập | Email (vẫn dùng được) | Tên | Trạng thái |
|---|---|---|---|
| `colan` | `lan@chicchic.vn` | Cô Lan | đang chăm các chuồng demo |
| `chutam` | `tam@chicchic.vn` | Chú Tám | phụ trách khu gà thịt |
| `anhdung` | `dung@chicchic.vn` | Anh Dũng | còn trống, để thử luồng "nhận chuồng mới" |
| `chihoa` | `hoa@chicchic.vn` | Chị Hoa | `active = false` - **tài khoản đang tạm dừng, đăng nhập thử sẽ bị từ chối** |

Tên đăng nhập: 3–32 ký tự, **chữ thường không dấu**, số, và `. _ -`. Mật khẩu ≥ 8 ký tự
(có nút 🎲 **Tạo** sinh mật khẩu ngẫu nhiên dễ đọc - đã bỏ các ký tự hay nhầm như `0/O`, `1/l/I`).

#### Xem lại thông tin đăng nhập của một cô/chú

Trong bảng ở `/admin`, **bấm vào tên** một nông dân → popup hiện:

- **Tên đăng nhập** đầy đủ, có nút *Sao chép*.
- Khu vực, số chuồng đang giữ, trạng thái nhận chuồng.
- Ô **đặt mật khẩu mới** ngay tại chỗ (nút 🎲 tạo hộ) → **Lưu mật khẩu mới** ghi thẳng vào
  database và hiện lại mật khẩu vừa đặt để chép đưa cho cô/chú.

Nút **Đổi mật khẩu** ở cuối hàng mở đúng popup đó và nhảy sẵn con trỏ vào ô mật khẩu.

> ⚠️ **Mật khẩu đang dùng không xem lại được.** Database chỉ lưu bản băm `scrypt` (`salt:hash`) -
> một chiều, không có đường giải ngược, kể cả admin cũng không đọc ra được. Đây là cách lưu
> mật khẩu đúng chuẩn, không phải thiếu tính năng. Cô chú quên mật khẩu thì **đặt cái mới** ở
> popup rồi đọc cho họ; mật khẩu mới chỉ hiện **một lần** ngay sau khi lưu, đóng popup là mất.
>
> Đổi mật khẩu xong, **mọi phiên đang đăng nhập của người đó bị huỷ ngay** (đã đo: 3 phiên → 0)
> và họ phải vào lại bằng mật khẩu mới. Họ cũng nhận một thông báo 🔑 trên chuông.

**Nhiệm vụ (`BarnTask`)** sinh ra từ 3 chỗ:

1. Khách bấm **Giao việc** trên trang chuồng → cho ăn theo giờ hẹn, hoặc nhờ ngó chuồng.
2. Khách bấm **Nhờ thả đàn ra vườn / gọi về chuồng** → app *không* tự đổi trạng thái đàn;
   `Barn.outside` chỉ đổi **sau khi** nông dân làm thật và gửi ảnh về.
3. Khách lưu bố cục ở màn **Trang trí** → gộp thành một việc "Lắp trang trí".

Quy tắc cứng: **không có ảnh/video thì không tích hoàn thành được** - nút bị khoá ở giao diện và
`completeTask` từ chối ở server. Xong việc, app tự tạo một mục nhật ký + một ảnh/video trong chuồng
của khách, nên "đã xong" luôn đi kèm bằng chứng. Nông dân không làm được thì bấm
**Không làm được** kèm lý do - lý do đó hiện thẳng cho chủ chuồng, đúng tinh thần "tin xấu cũng báo thật".

### Màn hình `/nong-trai` có gì

Xếp theo thứ tự từ trên xuống:

1. **Hồ sơ + 3 số**: việc đang chờ · xong hôm nay · chuồng chưa gửi tin.
2. **Chuồng tôi phụ trách** - phần chính. Mỗi chuồng là một thẻ hiện **trạng thái việc**:
   | Dấu hiệu | Nghĩa |
   |---|---|
   | 🔴 + viền đỏ nhạt | chuồng có việc **quá giờ hẹn** - xếp lên đầu danh sách |
   | ⚠️ + viền vàng | còn việc chưa xong |
   | `✓ Xong hết việc` nền xanh | sạch việc |
   | `✅ N xong hôm nay` | đã hoàn thành N việc trong ngày |
   | `N mới` nền vàng | việc vừa được giao, chưa mở xem |
   | dòng `Cần làm: 🌿 Thả đàn ra vườn · 🎨 Lắp trang trí` | liệt kê loại việc đang chờ |
   | `🟢 Đã gửi tin hôm nay` / `⚠️ Tin gần nhất 5 giờ trước` | tình trạng ảnh gửi cho chủ chuồng |

   Bấm vào thẻ → `/nong-trai/chuong/<slug>` để làm việc của đúng chuồng đó.
3. **Hộp việc** - toàn bộ việc gộp từ mọi chuồng, quá hạn xếp trước.
4. **Gửi cập nhật hôm nay** - đăng ảnh/ghi chú không cần ai giao việc.
5. **Vừa hoàn thành** - 5 việc gần nhất.

### Checklist thử cổng nông dân

- [ ] Đăng nhập bằng **tên đăng nhập** `colan` / `chicchic123` → vào thẳng `/nong-trai`.
- [ ] Đăng nhập lại bằng email `lan@chicchic.vn` → cùng kết quả (hai cách đều chạy).
- [ ] Danh sách chuồng: chuồng còn việc có **⚠️ / 🔴** và nhãn `N việc chưa xong`;
      chuồng sạch việc hiện `✓ Xong hết việc`. Chuồng quá hạn phải nằm **trên cùng**.
- [ ] Bấm **Đã làm xong - gửi ảnh** khi chưa có ảnh → nút *Hoàn thành* vẫn xám.
      Bấm **📸 Chụp/chọn ảnh**, chọn một tấm → tải xong hiện thẻ xem trước → nút bật.
      (Không còn nút "ảnh mẫu" - minh chứng phải là ảnh chụp thật. Cần dán URL thì mở
      dòng *"Hoặc dán đường dẫn có sẵn"*.)
- [ ] Hoàn thành xong: việc rời hộp việc sang **Vừa hoàn thành**, thẻ chuồng đổi sang
      `✓ Xong hết việc`, và bên chủ chuồng hiện `✓ Đã xong · có ảnh minh chứng` kèm ảnh
      thu nhỏ bấm xem được - **đồng thời chuông 🔔 của chủ chuồng nhảy số**.
- [ ] Ô **Gửi cập nhật hôm nay** đăng được ảnh/ghi chú mà không cần ai giao việc -
      đây mới là thứ khách mở app mỗi ngày để xem.
- [ ] Nông dân mở `/nong-trai/chuong/<chuồng người khác>` → bị đẩy về `/nong-trai`.
- [ ] **Hồ sơ:** `/nong-trai/ho-so` → sửa năm sinh, bấm **Lưu hồ sơ** → mở `/nhan-chuong` bằng
      tài khoản khách, bấm ⋯ ở đúng cô/chú đó → thấy tuổi mới. Thêm một ảnh giới thiệu → hiện ngay
      trong popup và ở `/nong-dan/<id>`.
- [ ] **Tạm dừng khoá được đăng nhập:** đăng nhập thử `chihoa` / `chicchic123` → bị từ chối
      kèm lý do. Vào `/admin` bấm **Tạm dừng** một cô/chú đang đăng nhập ở tab khác →
      tab đó tải lại là văng ra `/dang-nhap`, và đăng nhập lại cũng không vào được.
      Bấm **Mở lại** → vào bình thường ngay.
- [ ] **Bàn giao chuồng:** tạm dừng một cô/chú **đang giữ chuồng** → tải lại `/admin`, khối
      **"🔄 Chuồng đang không có người chăm"** hiện đúng những chuồng đó kèm số việc đang treo.
      Chọn một cô/chú khác → **Bàn giao** → mở `/nong-trai` bằng tài khoản người nhận: thấy
      chuồng mới **và** việc đang chờ. Mở `/chuong/<slug>/nhat-ky` bằng tài khoản chủ chuồng:
      có một dòng ghi rõ đã chuyển từ ai sang ai.
- [ ] **Nhận thịt tạo việc thật:** ở một chuồng đang `END_OF_LAY`, chọn **Nhận thịt** ở
      `/ket-chu-ky` → đăng nhập bằng nông dân phụ trách, hộp việc có 🍲 **"Sơ chế đàn & ghi lô
      vào sổ"**. Thử tích xong **trước khi** ghi lô → phải bị từ chối. Ghi một lô gà thịt
      (có số cân + ảnh) rồi tích lại → xong, và ô "Sổ thu hoạch" của chủ chuồng có lô đó.

---

## H. Ba vai - luồng hoạt động đầy đủ

Chạy đúng thứ tự dưới đây là nghiệm thu được toàn bộ sản phẩm. Mở **hai trình duyệt khác nhau**
(hoặc một cửa sổ ẩn danh) để đóng hai vai cùng lúc - sẽ thấy rõ hai bên nhận thông báo của nhau.

### 🔔 Trước hết: chuông thông báo

Góc **trái** thanh trên có hình chuông (chỉ hiện khi đã đăng nhập), chấm đỏ đếm số chưa đọc.
**Mọi hành động một bên làm xong đều đẩy một dòng sang bên kia** - không phải chờ ai kể lại.

| Ai làm gì | Ai nhận thông báo |
|---|---|
| Chủ chuồng giao việc / nhờ thả vườn / lưu bố cục trang trí | 📋 nông dân phụ trách |
| Chủ chuồng rút lại việc | ↩️ nông dân |
| Chủ chuồng quyết định cuối chu kỳ đẻ | 🎉 nông dân |
| Chủ chuồng hoàn trả chuồng | 🌾 nông dân |
| Khách nhận chuồng mới | 🏡 nông dân được giao |
| Nông dân báo xong việc (kèm ảnh) | ✅ chủ chuồng |
| Nông dân báo không làm được | ⚠️ chủ chuồng |
| Nông dân gửi cập nhật hằng ngày | 📷 chủ chuồng |
| Admin xác nhận cọc | 💰 chủ chuồng |
| Admin đăng ảnh/ghi chú lên chuồng | 📷 chủ chuồng |
| Admin cấp tài khoản nông dân | 🔑 nông dân đó |

Chuông **tự làm mới mỗi 20 giây** khi tab đang mở, và làm mới ngay khi quay lại tab -
không cần F5. Mở chuông ra là đánh dấu đã đọc; bấm một dòng thì nhảy tới đúng chuồng.

> Đây là **poll 20 giây**, chưa phải push thật. Đóng tab thì không nhận được gì, mở lại mới thấy.
> Việc gộp vào một việc cùng loại đang chờ thì **không** báo lại lần nữa (tránh dội chuông).

### Vai 1 - Admin (nông trại)

Vào `/admin`, trình duyệt hỏi mật khẩu: **bỏ trống ô tên đăng nhập**, gõ `ADMIN_PASSWORD`.

1. **Cấp tài khoản nông dân** - khối 👩‍🌾:
   - Tab *Nông dân đã có*: chọn người đã có hồ sơ nhưng chưa có login (vd người vừa import).
   - Tab *Thêm người mới*: nhập tên, khu vực, số năm kinh nghiệm, số chuồng nhận tối đa.
   - Đặt **tên đăng nhập + mật khẩu** (nút 🎲 tạo hộ) → **Cấp tài khoản** → màn hình hiện lại
     đủ cặp đăng nhập kèm nút sao chép; ghi lại rồi đưa tận tay cô/chú.
   - **Bấm vào tên** một cô/chú → popup xem tên đăng nhập và đặt mật khẩu mới
     (xem [mục G](#tài-khoản-nông-dân-do-admin-cấp) - mật khẩu cũ không xem lại được).
   - **Tạm dừng** = **khoá tài khoản**: cô/chú không đăng nhập được nữa và bị đăng xuất
     khỏi mọi thiết bị ngay lập tức, đồng thời biến mất khỏi danh sách chọn ở `/nhan-chuong`.
     Bấm **Mở lại** là vào được ngay.

     > ⚠️ Chuồng đang chăm **không** bị gỡ khỏi cô/chú, nên trong thời gian tạm dừng những
     > chuồng đó **sẽ không có tin mới** gửi cho chủ chuồng. App bấm nút sẽ hỏi lại và nói rõ
     > số chuồng bị ảnh hưởng.
     >
     > 🔄 **Bàn giao chuồng:** ngay phía trên khối tài khoản có khối
     > **"🔄 Chuồng đang không có người chăm"** - nó chỉ hiện khi thật sự có chuồng đang
     > gắn tên một cô/chú đang tạm dừng. Mỗi dòng cho chọn người nhận rồi bấm **Bàn giao**:
     > chuồng và **mọi việc đang chờ** chuyển sang cô/chú mới, chủ chuồng nhận được thông báo
     > kèm một dòng trong nhật ký chuồng, còn ảnh cũ và sổ thu hoạch vẫn giữ tên người đã làm.
     > Tạm dừng vài giờ rồi mở lại thì **không cần bàn giao** - chuồng vẫn ở đúng người cũ.
2. **Đối soát cọc** - khối 💰: đối chiếu số tiền + **nội dung CK** `CHICCXXXXXX` trong tài khoản
   ngân hàng thật → **Đã nhận tiền**. Chuồng của khách mở khoá ngay, khách nhận 💰 trên chuông.
   Hoá đơn trang trí (`CHICDXXXXXX`) nằm ở khối 🎨 ngay trên, cùng một cách làm.
   *Có webhook (mục D4) thì hai khối này tự vơi đi* - chỉ còn lại khoản không khớp.
3. **🏦 Tiền về tài khoản** - sổ giao dịch ngân hàng. Ghi **mọi** khoản tiền vào, kể cả khoản
   không bóc được mã; đây là bằng chứng duy nhất phía app khi khách nói *"em chuyển rồi mà"*.
4. **Gửi ảnh/video** và **đăng cập nhật** cho bất kỳ chuồng nào (dùng khi nông dân gửi ảnh
   qua Zalo cho nông trại thay vì tự đăng).
5. **🚩 Tin nhắn cần xem lại** - chỉ hiện tin bị gắn cờ hoặc bị báo cáo. Nông trại **không** đọc
   hộp thư sạch, và luật đó được in ngay trong hộp thư cho cả hai bên đọc.
6. **Đơn giữ chỗ** và khối *Dev* (đặt `END_OF_LAY` để thử màn kết chu kỳ).

> ⚠️ `/admin` được khoá bằng `ADMIN_PASSWORD`. **Production thiếu biến này thì trang trả 503**
> (đóng hẳn); chỉ khi chạy dev cục bộ mới vào được và hiện cảnh báo đỏ.
> Mọi thao tác ghi dữ liệu ở `/admin` - cấp/đổi tài khoản nông dân, đối soát cọc, gửi ảnh,
> đăng cập nhật - đều kiểm quyền **lần nữa ở server**, vì middleware chỉ khoá việc mở trang.

### Vai 2 - Khách / chủ chuồng

1. `/` → **Tạo tài khoản & nhận chuồng** → `/dang-ky`: nhập email → nhận **mã 6 số**
   (chưa cấu hình Resend thì mã hiện luôn trên màn hình) → đặt mật khẩu → vào thẳng.
2. `/chuong` - cửa vào khu chuồng:
   - Chưa có chuồng nào → màn **"Hãy nhận nuôi chuồng đầu tiên"** + nút xem thử chuồng mô phỏng.
   - Đã có → danh sách chuồng kèm trạng thái để chọn.
3. `/nhan-chuong`: chọn kiểu nuôi → giống → cám → số con → **đặt tên từng con gà** →
   **chọn cô/chú nông dân** (người kín chỗ hoặc tạm nghỉ bị làm mờ) → xem bảng giá minh bạch → giữ chỗ.
   Trong danh sách nông dân, bấm dấu **⋯** ở mỗi người để mở **hồ sơ**: tên, tuổi, số năm nuôi gà,
   khu vực, lời tự giới thiệu và **ảnh/video cô chú tự quay**. Bấm được cả với người đang kín chỗ.
4. Chuồng mới hiện banner 🔒 kèm STK/MoMo và **nội dung CK**. Chuyển khoản xong bấm
   *Tôi đã chuyển khoản* → chờ admin đối soát. Trang **tự cập nhật trong ~10 giây**, không cần F5.
5. Cọc xong: mở khoá `/chuong/<slug>/trang-tri` - kéo thả decor rồi **Lưu bố cục** →
   sinh **một** việc "Lắp trang trí" cho nông dân.
6. Giao việc khác ở trang chuồng: cho ăn theo giờ, ngó chuồng, **nhờ thả đàn ra vườn / gọi về**.
   Tối đa **6 việc đang chờ** mỗi chuồng.
7. Nhận 🔔 khi nông dân làm xong, xem ảnh minh chứng ở `/chuong/<slug>/nhat-ky`.
8. `/tai-khoan`: xem tất cả chuồng, hoặc `⋯` → **Hoàn trả chuồng** (phải gõ đúng nguyên văn câu xác nhận).

### Vai 3 - Nông dân

1. `/dang-nhap` → gõ **tên đăng nhập** admin cấp (vd `colan`) + mật khẩu → vào thẳng `/nong-trai`.
2. Nhìn danh sách chuồng: chuồng nào **⚠️/🔴** thì bấm vào làm trước.
3. Trong trang chuồng: xem **bản vẽ trang trí** chủ chuồng gửi, **tên từng con gà**, việc đang chờ.
4. Làm xong ngoài đời → **Đã làm xong - gửi ảnh** → dán link ảnh/video → *Hoàn thành*.
   **Không có ảnh thì không tích xong được** - nút khoá ở giao diện và server cũng từ chối.
5. Không làm được (mưa bão, đàn ốm) → **Không làm được** + lý do → lý do hiện thẳng cho chủ chuồng.
6. Mỗi ngày: **Gửi cập nhật hôm nay** - một tấm ảnh là đủ, đây là thứ giữ chân khách.
6b. **Nhặt trứng / mổ gà xong thì ghi vào sổ thu hoạch** (khối 🥚/🍗 trong trang chuồng):
   số lượng, cách bảo quản, **một tấm ảnh giỏ trứng** - ảnh là bắt buộc. Gà thịt phải **cân** và
   ghi số kg: số đó nhân thẳng vào tiền nếu chủ chuồng bán lại trên chợ, nên gõ sai một chữ số là
   sai tiền. **Không cần ai giao việc** - nhặt trứng là việc hằng ngày, ghi luôn cho nhanh.
7. **🪪 Hồ sơ của tôi** (thẻ ngay dưới tên ở `/nong-trai`, hoặc `/nong-trai/ho-so`):
   sửa tên hiển thị, **năm sinh** (app tự tính tuổi), số năm nuôi gà, khu vực, lời tự giới thiệu,
   và ô đồng ý xuất hiện trong ảnh/video. Thêm tối đa **8 ảnh/video giới thiệu bản thân** -
   đây chính là thứ khách xem ở dấu ⋯ khi chọn người chăm chuồng. Nút **👀 Xem thử** cho cô/chú
   nhìn đúng khung mà khách sẽ thấy.

   > Cô chú **chụp thẳng từ điện thoại** (mục D2 đã cấu hình). Vẫn giữ lối dán đường dẫn ở
   > dòng *"Hoặc dán đường dẫn có sẵn"* cho ai muốn dùng link YouTube.
   > Chưa cấu hình kho ảnh thì ô dán đường dẫn tự hiện ra thay cho nút chụp.

### Nghiệm thu chéo (làm một lần cho chắc)

- [ ] Cửa sổ A đăng nhập khách, cửa sổ B đăng nhập nông dân phụ trách đúng chuồng đó.
- [ ] A giao một việc → trong ≤20 giây chuông của B nhảy 🔔1, nội dung `📋 Việc mới: …`.
- [ ] B hoàn thành kèm ảnh → chuông của A nhảy `✅ … đã xong "…"`, bấm vào nhảy đúng chuồng.
- [ ] A bấm *Nhờ thả đàn ra vườn* → **hình chuồng chưa đổi**; chỉ sau khi B làm xong và gửi ảnh
      thì đàn mới ra vườn. Đây là bất biến quan trọng nhất của sản phẩm.
- [ ] Admin xác nhận cọc → chuông của A nhảy 💰 và trang trí mở khoá.

---

## I. Sổ thu hoạch & Chợ nông trại - việc vận hành hằng ngày

Đây là phần **nông trại phải làm tay mỗi tuần**, không phải phần cấu hình một lần rồi quên.
Bỏ qua mục này thì chợ nằm im và người bán không nhận được tiền.

### I1. Ba thứ phải bật trước, không có thì tính năng nằm im

| Việc | Ở đâu | Không làm thì sao |
|------|-------|-------------------|
| **Niêm yết giá** trứng & gà thịt | `/admin` → khối **💰 Giá niêm yết trên chợ** | Nút *Bán lại trên chợ* báo *"Nông trại chưa niêm yết giá"* - **không ai đăng bán được** |
| **Nhập kho** trang trí & yếm | `/admin` → khối **Kho nông trại** | Kho = 0 thì món đó hiện *"tạm hết"*, khách không mua được |
| **Nông dân ghi lô thu hoạch** | `/nong-trai/chuong/<slug>` → khối 🥚/🍗 | Ô *"Trứng chu kỳ này"* đứng yên ở 0 và chợ không có hàng |

`npm run db:seed` có đặt sẵn **giá mẫu** (trứng 5.500đ/quả · gà thịt 130k/kg, gà Mía 150k, gà Đông Tảo 350k)
để chạy thử được ngay. **Đó là số minh hoạ - thay bằng giá thật trước khi mở cho người lạ.**
Seed chỉ chèn khi bảng còn trống, nên chạy lại seed sẽ không ghi đè giá ông vừa đặt.

> ⚠️ **Đổi giá chợ thì phải xem lại giá nhận nuôi** (`src/data/catalog.ts` → `BASE_PRICES`).
> Hai bảng này phải khớp nhau: **thực nhận sau phí ≈ chi phí nuôi**. Hiện đo được 0,98× và 0,99×,
> tức bán lại hơi thiệt hơn tự nuôi - đúng ý. Nếu ông nâng giá chợ mà quên nâng giá nhận nuôi,
> bán lại sẽ lời hơn nuôi, và sản phẩm biến thành **kênh đầu tư** - đúng thứ mà toàn bộ định vị
> chống-đa-cấp được dựng để không phải là.
>
> Đổi giá là **thêm dòng mới**, không sửa dòng cũ: tin đăng đã ra chợ giữ nguyên giá lúc đăng.

### I2. Đường đi của một lô hàng

```
Nông dân nhặt trứng → ghi lô + ẢNH (bắt buộc)   → nông trại giữ hộ 7 NGÀY
Chủ chuồng bận      → "Bán lại trên chợ"        → thấy đủ giá / phí 20% / thực nhận
Người mua (phải đang nuôi ≥1 chuồng) bấm Mua    → giữ chỗ 24h + mã CHICM…
Tiền về (webhook hoặc admin bấm tay)            → lô "đã bán" + nông dân nhận việc GIAO
Nông dân giao tận tay + chụp ảnh lúc trao       → sinh khoản CHI TRẢ chờ ở /admin
Nông trại chuyển khoản + dán ảnh biên lai       → xong
```

**Hàng không rời nông trại.** Chợ chuyển *quyền nhận* một lô đang giữ ở kho, nên không có khoảng
trống an toàn thực phẩm khi đổi chủ, và truy xuất không đứt.

### I3. 💸 Chi trả cho người bán - việc phải làm tay

`/admin` → khối **💸 Chờ chuyển tiền cho người bán**. Mỗi dòng có sẵn ngân hàng, số tài khoản,
tên chủ tài khoản và số tiền.

1. Mở app ngân hàng, chuyển đúng số tiền tới đúng tài khoản trên dòng đó.
2. Chụp màn hình biên lai → bấm **Ghi nhận đã chuyển** → tải ảnh lên → xác nhận.
3. Người bán nhận chuông 💸 và xem được ảnh biên lai trong `/cho/cua-toi`.

> **Vì sao không tự động?** Đẩy tiền ra khỏi hệ thống mà sai một lần là mất tiền thật, không hoàn
> tác được. Ở quy mô này, một người trực bấm tay vài phút mỗi tuần rẻ hơn nhiều so với một con bug
> chuyển nhầm. Nút bị **khoá tới khi có ảnh biên lai** - không có bằng chứng thì khoản chi chỉ là lời nói.
>
> Khoản chi **chỉ sinh ra sau khi nông dân đã giao và có ảnh trao tay**. Chưa giao thì chưa có gì để chi.

### I4. Checklist thử chợ (một lần, trước khi mở cho người thật)

- [ ] `/admin` → niêm yết giá trứng → mở `/chuong/<slug>/thu-hoach`, nút *Bán lại* hiện đủ 3 con số.
- [ ] Nông dân ghi một lô kèm ảnh → ô *"Trứng chu kỳ này"* ở trang chuồng **nhảy số**.
- [ ] Đăng bán → mở `/cho` bằng **tài khoản chưa có chuồng nào** → nút mua phải **bị khoá**.
- [ ] Mua bằng tài khoản có chuồng → hiện mã `CHICM…` + QR.
- [ ] Chuyển khoản thật một khoản nhỏ (hoặc admin bấm tay) → lô sang *"đã bán"*, nông dân có việc **📦 Giao lô đã bán**.
- [ ] Nông dân hoàn thành **kèm ảnh** → `/admin` xuất hiện khoản chi trả chờ.
- [ ] Chi trả + dán biên lai → người bán thấy *"Đã chuyển"* kèm link biên lai.
- [ ] Thử đăng **lô thứ 3 trong tháng** → phải bị từ chối (trần 2 lô/30 ngày).
- [ ] **Nhận hàng tận nhà:** ở `/chuong/<slug>/thu-hoach`, bấm **🏠 Nhận về nhà** khi *chưa* điền
      địa chỉ → chỗ đó phải hiện lời nhắc điền địa chỉ, không phải một nút chết. Điền địa chỉ → nhận
      **hai lô** → mở `/nong-trai` bằng tài khoản nông dân: đúng **một** việc 🏠 *"Giao lô về nhà chủ
      chuồng"*, ghi chú liệt kê cả hai lô kèm tên–số điện thoại–địa chỉ. Rút một lô → việc vẫn còn;
      rút nốt lô cuối → việc biến mất. Nông dân hoàn thành **kèm ảnh trao tay** → lô sang *"Đã trao tay"*.

---

## J. Việc nền theo ngày (Vercel Cron) - thứ giữ cho hệ thống không đứng im

Một số thứ trong ChicChic chỉ xảy ra khi **thời gian trôi qua**, chứ không có ai bấm nút:

| Việc | Không có cron thì sao |
|---|---|
| 🔔 **Vòng nhắc** | Năm chuyện im lặng tuyệt đối: đàn hết chu kỳ mà chủ chuồng chưa quyết định gì · **lô sắp hết hạn giữ hộ** · việc giao cho nông dân nằm im nhiều ngày · hoá đơn *"đã báo chuyển khoản"* chưa ai đối soát · chuồng có nông dân đang tạm dừng. Xem **J5**. |
| 🐔 **Đàn gà lớn lên** | Đàn kẹt ở *"đang úm"* vĩnh viễn. **Không chuồng nào tới được màn kết chu kỳ** - gà đẻ hết chu kỳ, gà thịt tới ngày xuất chuồng, chủ chuồng đều không được hỏi muốn nhận thịt, cho nghỉ hưu hay nuôi lứa mới. |
| ⌛ **Nhả chỗ giữ trên chợ** | Người bấm mua rồi không trả tiền vẫn giữ lô. Chỗ đó chỉ được nhả khi **tình cờ có người khác bấm mua** - không ai vào chợ thì lô nằm treo tới hết hạn. |
| 📕 **Đóng sổ lô quá hạn** | Lô đã quá 7 ngày nông trại giữ hộ vẫn nằm trong sổ như còn hàng. |
| 🧾 **Huỷ hoá đơn trang trí bỏ quên** | Đặt hoá đơn là **trừ kho ngay** để giữ hàng. Bỏ quên 5 đoạn hàng rào là 5 đoạn thật nằm treo mãi, người khác không mua được, và không ai biết cho tới lúc màn hình báo hết hàng trong khi kệ vẫn đầy. |

### J1. Bật (2 phút)

1. Sinh khoá:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Vercel → **Settings → Environment Variables** → thêm `CRON_SECRET` (đúng tên này) = giá trị vừa sinh.
   Dán cả vào `.env` ở máy nếu muốn thử local.
3. **Redeploy.** Lịch đã nằm sẵn trong `vercel.json`:
   ```json
   "crons": [{ "path": "/api/cron", "schedule": "0 1 * * *" }]
   ```
   `0 1 * * *` là 01:00 UTC = **8 giờ sáng giờ VN**.
4. Vào tab **Cron Jobs** của project để xem lần chạy gần nhất và kết quả.

> ⚠️ **Chưa đặt `CRON_SECRET` thì `/api/cron` trả 503 (ĐÓNG)**, cùng luật với webhook ngân hàng.
> Endpoint này đổi trạng thái đàn, rút tin đăng và huỷ hoá đơn - để mở tự do là ai đoán được URL
> cũng bấm huỷ hoá đơn của người khác. Vercel **tự gắn** header `Authorization: Bearer $CRON_SECRET`
> khi biến tồn tại, không phải cấu hình gì thêm.

### J2. Thử ngay, không cần đợi tới 8 giờ sáng

```bash
curl -H "Authorization: Bearer <khoá>" https://<domain>/api/cron
```

Trả về đúng những gì nó vừa làm - dán vào đây là đọc được ngay:

```json
{"ok":true,"ms":2971,"flocksAdvanced":{"GROWING":1,"END_OF_LAY":1},
 "holdsReleased":1,"listingsWithdrawn":1,"lotsExpired":2,"decorOrdersCancelled":1,
 "nudges":{"end_of_lay":2,"lot_expiring":1,"task_stale":5,"decor_reported":1,"orphan_barn":1},
 "orphanBarns":1,"decorReportedPending":1,"errors":[]}
```

`nudges` = số lời nhắc **vừa gửi**. `orphanBarns` và `decorReportedPending` là **hiện trạng**, in ra
mỗi lần chạy kể cả khi không nhắc ai - hai chuyện đó chỉ nông trại xử lý được, nên chúng phải có mặt
trong log dù hệ thống chưa có tài khoản quản trị nào để gửi chuông tới.

Chạy lại bao nhiêu lần cũng **vô hại**: mọi việc đều so-sánh-rồi-đặt, lần thứ hai không còn gì để làm
(mọi số về 0, và `nudges` thành `{}`). Có việc hỏng thì trả **500** kèm `errors` - những việc còn lại
**vẫn chạy xong**.

### J3. Hai chỗ cron KHÔNG được đụng vào

Đây không phải thiếu sót, mà là ranh giới cố ý:

- **Không tự đặt "đàn đang đẻ".** Nhãn *Đang đẻ* chỉ bật khi nông dân ghi **quả trứng đầu tiên** vào
  sổ thu hoạch - mà lô đó bắt buộc kèm ảnh. Một cái nhãn bật lên chỉ vì hôm nay là ngày thứ 140 là
  lời khẳng định không có gì bảo chứng, đúng thứ sản phẩm này được dựng để không làm.
  *(Cùng lý do: cron không tự đặt "đã thu hoạch" - đó là quyết định của chủ chuồng ở màn kết chu kỳ.)*
- **Không đụng vào tiền đã trả.** Hoá đơn ở trạng thái *"đã báo chuyển khoản"* (`REPORTED`), lô đã bán,
  tin đăng đã thanh toán - cron bỏ qua hết. Người đã nói *"tôi chuyển rồi"* thì phải để người thật đối
  soát; tự huỷ là cách chắc chắn nhất để một hôm nào đó nuốt mất tiền của khách.

### J4. Giới hạn cần biết

- **Gói Hobby của Vercel chỉ chạy cron 1 lần/ngày.** Nghĩa là chỗ giữ trên chợ (hạn 24 giờ) có thể
  nằm thêm tối đa một ngày nữa mới được nhả. Chấp nhận được ở quy mô này - và `reserveListing` vẫn tự
  nhả ngay khi có người khác bấm mua. Lên gói Pro thì đổi lịch thành `"0 * * * *"` (mỗi giờ).
- Lịch cron đọc theo **UTC**, không phải giờ VN.
- Đổi vùng chạy hàm (`regions` trong `vercel.json`) thì cron chạy theo vùng đó luôn.

### K. Mã QR truy xuất - nghiệm thu bằng điện thoại thật

Đây là bước **không tự động được**: không có bộ giải mã QR nào chạy trong CI, nên
`npm test` chỉ khoá được mọi thứ *quanh* cái mã (URL đúng, cỡ đủ nhỏ, đổi nội dung thì
đổi hình). Việc "điện thoại quét ra đúng trang" phải có người cầm máy lên thử.

- [ ] Đăng nhập bằng tài khoản nông dân → **Ghi lô thu hoạch** (có ảnh) cho một chuồng.
- [ ] Đăng nhập bằng chủ chuồng → `/chuong/<slug>/thu-hoach` → mở **🔖 Mã truy xuất**.
- [ ] **Mở camera điện thoại quét thẳng vào màn hình.** Phải ra đường dẫn `…/tx/<mã>`.
- [ ] Mở đường dẫn đó bằng **tab ẩn danh / máy chưa đăng nhập bao giờ**: phải thấy ảnh
      cô chú chụp lúc thu, giống gà, chế độ ăn, tên người chăm - và **không** thấy tên
      chuồng, không thấy tên bạn.
- [ ] Sửa một ký tự trong mã rồi mở lại → phải ra màn *"Không đọc được mã này"*.

> ⚠️ Mã QR mang **tên miền của chính request lúc mở trang**. Xem trên `localhost` thì mã
> trỏ về `localhost` - đúng như vậy, không phải lỗi. Muốn mã dùng được ngoài đời thì
> lấy mã trên đúng tên miền thật.

### J5. Vòng nhắc - cron gõ cửa những chuyện đang nằm im

Bốn việc trên **đổi dữ liệu**. Việc thứ năm không đổi gì cả, nó chỉ **nói** - dành cho những chuyện
app không được phép tự quyết thay người dùng:

| Nhắc ai | Khi nào | Nội dung |
|---|---|---|
| **Chủ chuồng** | đàn ở *"hết chu kỳ"* đã **5 ngày** mà chưa chọn gì | "Đàn đang chờ bạn chọn chặng tiếp theo" → `/ket-chu-ky` |
| **Chủ lô** | lô còn **≤2 ngày** nông trại giữ hộ | "Lô còn 2 ngày" → `/cho/cua-toi`. Nhiều lô thì **gộp một tin** |
| **Nông dân** | việc để *đang chờ* quá **4 ngày** | "Việc này đã chờ N ngày" → hộp việc |
| **Quản trị** | hoá đơn *"đã báo chuyển khoản"* quá **24 giờ** | Kèm mã chuyển khoản để đối chiếu → `/admin` |
| **Quản trị** | chuồng có nông dân đang tạm dừng | Kèm tên chuồng → `/admin` bàn giao |

Ba điều cố ý, đừng tưởng là thiếu sót:

- **Nhắc một lần, không nhắc mỗi ngày.** Cron chạy hằng ngày trên cùng dữ liệu, nên có một bảng ghi
  dấu *"đã nhắc chuyện này rồi"*. Chuyện vẫn chưa xử lý sau **14 ngày** thì mới gõ cửa lần nữa.
  Người bị dội chuông sẽ tắt chuông, mà tắt chuông là mất luôn lý do mở app mỗi ngày.
- **Việc nằm im thì nhắc NÔNG DÂN, không mách chủ chuồng.** Mách trước khi hỏi là cách nhanh nhất
  làm hỏng quan hệ giữa hai bên - thứ mà sản phẩm này bán.
- **Nhắc TRƯỚC khi lô hết hạn, không báo sau.** *"Lô của bạn đã hết hạn"* là tin không làm gì được nữa.
- Hai dòng cuối bảng chỉ gửi được tới tài khoản có **role ADMIN**. Nếu bạn chỉ dùng `ADMIN_PASSWORD`
  (Basic Auth) mà chưa có tài khoản nào như vậy thì hai con số đó **chỉ nằm trong log Vercel** -
  xem `orphanBarns` / `decorReportedPending` ở J2.

---

### N. Tiền nuôi - hoá đơn sau khi nhận chuồng

Cọc 50.000đ **chỉ là bước giữ chỗ**. Tiền nuôi thật thu bằng hoá đơn riêng.

| | Gà thịt | Gà đẻ |
|---|---|---|
| Nhịp thu | **một lần**, trọn lứa | **mỗi tháng một hoá đơn** |
| Vì sao | bảng giá in "/ lứa" | bảng giá in "/ tháng" - gộp trọn 140 ngày vào một hoá đơn ~970.000đ là nói khác với thứ người mua đã đọc |

**Cách nó chạy:**

1. Cọc được xác nhận → chuồng kích hoạt. **Một ngày sau**, hoá đơn đầu được phát hành -
   cố ý chậm một ngày, để người ta xem chuồng và nhận tấm ảnh đầu rồi mới nói chuyện tiền.
2. Hoá đơn đầu đã **trừ tiền cọc**: `giá kỳ − 50.000đ`. Cọc đi vào tiền hàng, không giữ riêng.
3. Mã chuyển khoản **`CHICN…`** (chữ **N** = *nuôi*) + mã QR, ngay trên trang chuồng.
4. Tiền về khớp mã và đủ số → webhook tự xác nhận. Không khớp → `/admin` khối **🌾 Tiền nuôi**.
5. **Hạn 7 ngày.** Còn ≤3 ngày thì app nhắc một lần. Quá hạn thì trang chuồng tạm khoá.

**Hoá đơn được phát hành ở hai chỗ**, cố ý: khi chủ chuồng mở trang chuồng, **và** trong
việc nền hằng ngày. Chỉ dựa vào cái đầu thì "không mở app" thành cách trốn tiền.

> 🔴 **"Khoá chuồng" nghĩa là gì - nói rõ để không ai hiểu nhầm** (CODEMAP §9.33):
>
> | Bị khoá | KHÔNG bị đụng |
> |---|---|
> | trang chuồng của chủ chuồng | **việc chăm đàn ngoài đời** |
> | giao việc, mua trang trí | **cổng nông dân** - cô chú vẫn nhận việc, vẫn gửi ảnh |
> | | sổ thu hoạch, lô hàng, tiền đã có |
>
> **Đàn gà không bao giờ bị đụng tới vì chuyện tiền.** Không ngừng cho ăn, không thu hồi
> đàn, không đổi trạng thái. Màn khoá nói thẳng điều đó với người dùng, và có lối nhắn
> cho nông trại.
>
> 💡 **Có người gọi tới nói hoàn cảnh?** `/admin` → khối **🌾 Tiền nuôi** → nút **Gia hạn
> 14 ngày**. Chuồng mở lại ngay. Nút này có để bạn đừng phải đi sửa DB bằng tay - và để
> mỗi lần giúp ai đó đều có dấu vết.

> ⚠️ **Chưa có đường hoàn tiền.** Ai trả tiền tháng này rồi hôm sau hoàn trả chuồng thì
> khoản đó ở lại nông trại, app không tự trả lại theo tỉ lệ. Gặp ca đó thì xử lý tay và
> chuyển khoản lại cho người ta - đừng để im.

---

### M. Đàn nghỉ hưu - thu phí nuôi dưỡng

Chủ chuồng chọn **"cho nghỉ hưu"** ở màn kết chu kỳ thì đàn ở lại vườn, và có **phí nuôi
dưỡng 60.000đ/tháng**. Trước bản này khoản đó chỉ nằm trong DB chứ không có hoá đơn nào -
nông trại nuôi tiếp mà không có gì để đối soát.

**Cách nó chạy:**

1. Chủ chuồng vào `/chuong/<slug>/nghi-huu` → chọn kỳ **3 / 6 / 12 tháng**.
2. App sinh mã chuyển khoản **`CHICR…`** (chữ **R** = *retire*, phân biệt với `CHICC` cọc,
   `CHICD` trang trí, `CHICM` chợ) + mã QR.
3. Tiền về khớp mã và **đủ số** → webhook tự xác nhận. Không khớp thì rơi vào
   `/admin` → khối **🌾 Nuôi dưỡng đàn nghỉ hưu** để đối soát tay.
4. Xác nhận xong: kỳ được cộng thêm, **và nông dân nhận việc "Chụp ảnh đàn gà nghỉ hưu"** -
   vẫn phải đính ảnh mới tích xong được. Đây mới là thứ chủ chuồng thật sự mua.
5. Cron nhắc **một lần** khi kỳ còn ≤14 ngày.

**Mua nối tiếp không mất tiền:** đóng kỳ mới lúc còn hạn thì kỳ mới bắt đầu từ **lúc hạn cũ
hết**, không phải từ hôm nay.

**Không giảm giá cho kỳ dài.** 12 tháng đúng bằng 4 lần 3 tháng. Cố ý: giảm giá ở đây đẩy
người ta cam kết xa hơn mức họ thật sự muốn cho một con vật đang sống.

> 🔴 **Luật cứng, đừng phá kể cả khi có người đề nghị** (CODEMAP §9.32): **quá hạn thì đàn
> vẫn được chăm bình thường.** Không ngừng chăm, không ngừng gửi ảnh, không khoá trang, không
> truy thu quãng đã qua, không đếm ngược, không "nếu không đóng thì…". App nhắc đúng một lần
> trước hạn rồi thôi - nhắc tiếp mỗi ngày là đòi nợ.
>
> Lý do không phải lòng tốt suông: cả sản phẩm bán một quan hệ tin cậy. Ngày đầu tiên app
> nói *"đóng tiền không thì gà của bạn…"* là ngày quan hệ đó thành một hợp đồng con tin, và
> không có tính năng nào sau đó mua lại được.
>
> ⚠️ Hệ quả phải biết trước: **nông trại gánh chi phí nếu ai đó lặng lẽ bỏ.** Lối ra đúng là
> **một cuộc gọi của người thật**, không phải một tính năng. `/admin` hiện chưa có danh sách
> "kỳ quá hạn" để ai đó gọi - nếu vận hành thật thì đây là thứ cần thêm sớm.

---

### Q. Đường hoàn tiền (Đợt 10) - nghiệm thu bằng trình duyệt thật (12 phút)

Phần server đã kiểm tròn vòng trên DB thật (38 phép, kể cả phép âm tính). Phần dưới đây là
thứ **chỉ mắt người mới thấy**. Cần **hai tài khoản** và một lần vào `/admin`.

> ⚠️ **Cảnh báo trước khi bắt đầu:** bước 3 **hoàn trả chuồng thật** và không hoàn tác được.
> Dựng một chuồng thử để làm, đừng làm trên chuồng mình đang thích.

**① Lỗ rò đã đóng chưa (2 phút - làm trước tiên):**

1. Mở **tab ẩn danh**, vào `/chuong/chuong-vt7tgo` (hoặc `chuong-qi4ofm`, `chuong-yktkna` -
   ba chuồng đã hoàn trả). Phải bị **đẩy sang trang đăng nhập**, không được thấy tên chuồng
   hay tấm ảnh nào. Thử luôn `/nhat-ky` và `/truy-xuat` của chính chuồng đó.
2. Vẫn tab ẩn danh, vào `/chuong/demo`. Cái này thì **phải xem được** - nếu nó cũng bị đá về
   đăng nhập nghĩa là bản vá đã đóng nhầm cả chuồng trưng bày.

**② Số tiền nói trước khi bấm (4 phút):**

3. Đăng nhập bằng tài khoản có chuồng **đã trả ít nhất một hoá đơn tiền nuôi**. Vào
   `/tai-khoan` → dấu **⋯** trên thẻ chuồng → **Hoàn trả chuồng cho trang trại**.
4. Trong ô xác nhận phải thấy dòng **"Nông trại trả lại bạn …đ"** với một con số cụ thể, kèm
   câu về tiền cọc 50.000đ. **Không được** có chữ *"theo chính sách"* ở bất cứ đâu - đó
   chính là lời hứa rỗng của bản cũ. Kỳ nào đã nuôi trọn thì con số phải là **0đ** kèm câu
   *"các kỳ bạn đã trả đều đã được nuôi trọn"*.
5. Gõ đúng câu xác nhận rồi bấm. Toast phải **nhắc lại đúng con số đó**.
6. Vẫn ở `/tai-khoan`: khối **↩️ Nông trại hoàn lại cho bạn** phải hiện ngay trên danh sách
   chuồng, đúng số tiền, trạng thái *"Nông trại đã ghi nhận, đang xem lại"*. Chưa điền tài
   khoản nhận tiền thì phải có dòng cảnh báo vàng kèm lối đi tới ô điền.

**③ Bàn của người trực (4 phút):**

7. Mở `/admin`, cuộn tới khối **↩️ Hoàn tiền**. Khoản vừa tạo phải có mặt, kèm tên người,
   tên chuồng, và tài khoản nhận tiền (hoặc cảnh báo *"chưa có tài khoản nhận tiền"*).
8. Bấm **Xem và quyết** → thử **Từ chối** khi ô lý do còn trống: nút phải **mờ, không bấm
   được**. Gõ lý do vào thì mới bấm được.
9. Bấm **Duyệt**. Dòng đổi sang có dấu ✅ và nút đổi thành **Ghi nhận đã chuyển**.
10. Bấm nút đó: ô số tiền phải **điền sẵn số đề xuất**. Thử gõ một số gấp mười rồi bấm - phải
    bị chặn. Sửa về số đúng, tải ảnh biên lai, bấm **Đã chuyển xong**.
11. Quay lại `/tai-khoan` bằng tài khoản kia: trạng thái phải là **"Đã chuyển trả"** kèm ngày.

**⑤ Lứa mới hết miễn phí (3 phút):**

14. Mở một chuồng đang ở **cuối chu kỳ** → `/chuong/<slug>/ket-chu-ky`. Thẻ **🐣 Nuôi lứa mới**
    phải có một dòng xanh **"Tiền nuôi lứa mới: …đ/lứa"** (gà đẻ thì `/tháng`) và câu *"hoá đơn
    tới sau một ngày"*. Trước bản này chỗ đó **im lặng hoàn toàn về tiền**.
15. Bấm **Chọn** → ô xác nhận cũng phải nhắc lại con số đó trước nút xanh.
16. Nếu bấm thật: một ngày sau, mở lại trang chuồng → phải có **hoá đơn mới** mang nhãn
    *"Tiền nuôi lứa 2"* (gà thịt), **trọn giá, không trừ cọc**. Đây là thứ trước đây không
    bao giờ xuất hiện.

**④ Báo hàng chợ không đúng (2 phút):**

12. Bằng tài khoản đã **mua** một lô trong 3 ngày gần đây, mở `/cho/cua-toi`. Dưới lô đó phải
    có dòng **"Hàng không đúng? Báo nông trại ›"**. Lô mua từ hơn 3 ngày trước thì **không**
    được có dòng này.
13. Bấm vào, gõ dưới 10 ký tự → nút gửi phải mờ. Gõ đủ rồi gửi. Dòng đổi thành trạng thái
    ↩️, và **không còn nút xin lần nữa**.

---

### S. Vùng giao · phí ship · giỏ hàng (Đợt 13) - nghiệm thu bằng trình duyệt (12 phút)

Phần server đã kiểm tròn vòng trên DB thật (**39 + 54 phép**, kể cả rất nhiều phép âm tính).
Phần dưới là thứ **chỉ mắt người mới thấy**.

> ⚠️ **Làm bước ① trước tiên.** Nếu nông trại không có vùng giao nào đang mở thì **không ai
> đặt hàng trên chợ được** - đó là mặc định cố ý, nhưng phải biết trước khi tưởng chợ hỏng.

**① Khai vùng giao (2 phút):**

1. Mở `/admin` → khối **🚚 Vùng giao hàng**. Phải thấy sẵn **Hà Nội** (nhãn xanh *miễn phí
   giao*) và mấy tỉnh lân cận có phí. Con số bên cạnh mỗi vùng là **số địa chỉ** đang trỏ vào.
2. Sửa phí một vùng rồi **Lưu phí** - nút chỉ sáng khi số có đổi. Thử gõ một số âm hoặc
   `99999999`: lưu xong mở lại phải thấy **0đ** hoặc **2.000.000đ**, không nhận số bừa.
3. Bấm **Tắt** một vùng: hộp xác nhận phải nói rõ *"N người đang để địa chỉ ở vùng này sẽ
   KHÔNG đặt hàng được"*. Bấm **Mở lại** để trả về như cũ.

**② Địa chỉ cũ phải chọn lại khu vực (2 phút):**

4. Bằng tài khoản **đã từng điền địa chỉ trước hôm nay**, mở sổ thu hoạch một chuồng có lô.
   Ô địa chỉ phải **tự bung ra** kèm câu *"có từ trước khi nông trại chia khu vực giao"*.
   Nút **Lưu địa chỉ** phải **mờ** cho tới khi chọn khu vực.
5. Ô chọn phải hiện phí ngay trong từng dòng (*"Hoà Bình · phí giao 30.000đ"*, *"Hà Nội ·
   miễn phí giao"*). Chọn xong lưu → ô thu gọn lại, hiện dòng **🚚 Hà Nội · miễn phí giao**.
6. Bấm **Nhận về nhà** một lô: phải qua được. (Trước khi chọn khu vực thì nó bị từ chối
   kèm đúng lý do - đó là chỗ dễ tưởng là lỗi.)

**③ Giỏ hàng - chỗ đáng xem nhất (5 phút):**

7. Bằng một tài khoản **có địa chỉ ở vùng CÓ PHÍ**, mở `/cho`. Nút dưới mỗi lô nay ghi
   **"Bỏ vào giỏ"**, không phải "Mua".
8. Bỏ **hai lô** vào giỏ. Thẻ **🧺 Giỏ của bạn** hiện lên trên đầu, và hai lô đó **vẫn nằm
   trong danh sách** bên dưới với dấu *"✓ Đang trong giỏ của bạn"* kèm nút **Bỏ ra**.
9. ⭐ **Phép quan trọng nhất:** trong thẻ giỏ, dòng **Phí giao** phải là **một lần**, không
   nhân đôi theo số lô. Bỏ thêm lô thứ ba vào → tiền hàng tăng, **phí giao đứng yên**. Có
   một dòng chữ nói đúng điều đó ngay dưới bảng tiền.
10. Bấm **Chốt đơn**. Toast phải nói đúng số lô, tổng tiền và mã `CHICM…`.
11. Mở `/cho/cua-toi` → khối **Đơn tôi đã đặt**: một thẻ duy nhất cho cả đơn, liệt kê từng
    lô, rồi ba dòng **Tiền hàng · Phí giao · Tổng**. Ô QR chuyển khoản phải mang **tổng đã
    gồm phí giao**, không phải riêng tiền hàng.
12. Thử bằng tài khoản ở **Hà Nội**: dòng phí giao phải ghi **"miễn phí"** chứ không để
    trống - im lặng ở chỗ có tiền là chỗ người đọc tự suy ra con số sai.

**④ Hai người mua, cùng một chuồng (3 phút) - chỗ vá lỗ:**

13. Bằng **hai tài khoản khác nhau**, mỗi người mua một lô **của cùng một chuồng**, rồi
    nhờ `/admin` xác nhận đã nhận tiền cho **cả hai** đơn.
14. Vào cổng nông dân của chuồng đó: phải thấy **HAI việc "Giao đơn đã bán"** riêng biệt,
    mỗi việc mang **địa chỉ và số điện thoại khác nhau**. Trước bản này chỉ có **một** việc,
    và ghi chú của người sau đè lên người trước.
15. ⭐ Tích **một** việc kèm ảnh. Quay lại `/cho/cua-toi` bằng tài khoản **người kia**: đơn
    của họ phải **vẫn là "Đã thanh toán · chờ nông dân giao"**, tuyệt đối không được nhảy
    sang "Đã giao". Đây là lỗ đã vá: một tấm ảnh từng đóng cả hai đơn và trả tiền cho cả
    hai người bán, trong khi người thứ hai chưa nhận được gì.

---

### R. Chợ mở · dọn chuồng · xoá chuồng (Đợt 12) - nghiệm thu bằng trình duyệt (10 phút)

Phần server đã kiểm tròn vòng trên DB thật (**47 phép, kể cả 6 phép âm tính**): mua bằng
tài khoản không chuồng, chuồng hoàn trả biến mất phía nông dân, và xoá chuồng đủ bộ rồi
đếm lại từng bảng. Phần dưới là thứ **chỉ mắt người mới thấy**.

**① Chợ mở cửa mua (3 phút):**

1. Lập một **tài khoản mới hoàn toàn**, chưa nhận chuồng nào. Vào `/cho`. Khối vàng
   *"cần có một chuồng mới mua được"* phải **biến mất**, thay bằng khối xanh *"Bạn mua được
   ngay, không cần nuôi chuồng nào"*.
2. Nút dưới mỗi lô phải là **"Mua · …đ"** bấm được, không còn nút xám *"Cần có chuồng mới
   mua được"*. Bấm thử → phải ra mã chuyển khoản `CHICM…`.
3. Vẫn tài khoản đó: khối *"🧺 Tôi có gì để bán"* **không** hiện (đúng - chưa có chuồng thì
   chưa có gì để bán). Muốn bán thì vẫn phải nhận nuôi.

**② Chuồng đã hoàn trả biến mất khỏi cô chú (3 phút):**

4. Đăng nhập **tài khoản nông dân** đang giữ một chuồng vừa bị hoàn trả (mục Q đã tạo ra
   một chuồng như vậy). Ở `/nong-trai`: chuồng đó phải **không còn trong danh sách**, và
   **không còn việc nào của nó** trong hộp việc.
5. Chuồng còn chủ thì vẫn phải hiện đủ - nếu danh sách trống trơn là lọc quá tay.
6. Gõ tay đường dẫn `/nong-trai/chuong/<slug đã hoàn trả>` → phải bị đá về `/nong-trai`.
7. Mở chuông của cô chú: tin *"…đã được hoàn trả về nông trại"* bấm vào phải về **danh
   sách**, không rơi vào một trang rồi bị đá đi tiếp.

**③ Xoá chuồng (4 phút):**

> ⚠️ **Bước 10 xoá thật và KHÔNG hoàn tác được.** Ảnh, video, việc đã làm, sổ thu hoạch và
> hộp thư của chuồng đó mất hẳn. Dựng một chuồng thử, đừng làm trên chuồng của người thật.

8. Mở `/admin` → khối **Các chuồng**. Mỗi dòng nay có tên chủ chuồng và một nút **Xoá** màu
   đỏ nhạt. Bấm → mở ra bảng liệt kê **đích danh** số ảnh, số lô, số tin nhắn sắp mất.
9. Thử bấm **Xoá hẳn** khi ô còn trống hoặc gõ sai slug: nút phải **mờ, không bấm được**.
10. Gõ đúng slug → **Xoá hẳn**. Câu trả về phải nói đúng số ảnh/lô/hoá đơn, và nếu chuồng
    còn chủ thì phải kèm *"Đã ghi nợ …đ hoàn lại cho chủ chuồng"*.
11. **Kiểm phần tiền sống sót** - đây là bước quan trọng nhất của cả mục: cuộn xuống khối
    **↩️ Hoàn tiền** ở chính `/admin`, phải thấy khoản vừa ghi **kèm tên chuồng vừa xoá**.
    Mở `/tai-khoan` bằng tài khoản chủ chuồng: thẻ chuồng đã biến mất, nhưng dòng *"Tiền
    nuôi chưa dùng hết · <tên chuồng>"* thì **vẫn còn**.
12. Thử xoá một chuồng **đang có đơn chợ đã trả tiền** → phải bị **từ chối**, và chuồng còn
    nguyên. Đây là hàng rào giữ cho tiền của người mua và người bán không bị xoá theo.

---

### P. Chín mục Đợt 9 - nghiệm thu bằng trình duyệt thật (15 phút)

Phần server đã kiểm tròn vòng trên DB thật (40 phép, kể cả phép âm tính). Phần dưới đây
là thứ **chỉ mắt người mới thấy** - làm theo đúng thứ tự này thì đi hết một vòng.

**Bằng tab ẩn danh (chưa đăng nhập):**

1. Mở trang chủ. **Bốn dòng cam kết phải bấm được**, mỗi dòng có một dòng chữ xanh
   (*"Xem ảnh đã gửi về ›"*…). Bấm từng dòng - phải mở ra chuồng thật, **không** rơi vào
   màn đăng nhập.
2. Ở trang chuồng đó phải thấy **băng xanh "Đây là chuồng để xem thử"** kèm nút tạo tài
   khoản. Lưới lối tắt chỉ còn **Ảnh & video** và **Truy xuất & QR**; ba ô kia (trang trí,
   đàn gà, sổ thu hoạch) đã ẩn, và có một dòng nói rõ những gì còn ở bên trong.
3. Gõ tay đường dẫn một chuồng **của người dùng thật** (`/chuong/<slug bất kỳ khác>`) -
   phải bị đá về đăng nhập, **không** lộ chữ nào.

**Đăng nhập bằng tài khoản đã có chuồng:**

4. Thanh điều hướng (mở trên laptop) **không** còn mục *"Nhận chuồng"*. Trang chủ đổi nút
   chính thành *"Vào chuồng của tôi"*. Lối vào nhận thêm chuồng còn đúng một dòng chữ ở
   `/tai-khoan`.
5. `/chuong/<của bạn>/dan-ga` → bấm nút **✎** cạnh tên một con gà, đặt tên có dấu và emoji,
   Lưu. Tên phải đổi ngay. Bấm ✎ lại → **Bỏ tên** → con đó quay về gọi theo vòng chân.
6. Sổ thu hoạch, một lô còn trong hạn: phải thấy **ba nút** - Nhận về nhà · 🧊 Nhờ cấp đông ·
   Bán lại trên chợ. Bấm cấp đông → hiện hộp xác nhận → đồng ý → **nhãn lô vẫn là "ngăn mát"**
   (đúng: app chưa đổi gì, cô chú phải làm thật trước). Vào cổng nông dân, tích việc kèm ảnh →
   quay lại xem nhãn đã thành **"cấp đông"**.
7. Vẫn ở sổ thu hoạch, **bằng tài khoản chưa từng điền số tài khoản**: nút bán ghi *"cần số
   tài khoản"* → bấm → ô điền mở **ngay tại chỗ**, ngân hàng là **ô chọn** chứ không phải ô gõ.
   Lưu xong là bán được luôn, không phải rời trang.
   Trong ô đó bấm **Tra tên**: phải hiện đúng tên chủ tài khoản. Đợt 11 vừa bắt lời gọi này
   phải đăng nhập (trước đó người lạ bắn được thoải mái bằng khoá VietQR của nông trại), nên
   đây là chỗ duy nhất của đợt 11 có thể vỡ - hỏng thì sẽ ra *"Chưa tra được tên"*.

**Bằng tài khoản nông dân (cổng `/nong-trai`), chuồng gà thịt:**

8. Phải thấy khối **⚖️ Cân nặng tuần N**. Ghi thử `1800` gam, cân 3 con, kèm ảnh → gửi.
   Thử luôn `18000` → phải **bị từ chối** (lỗi gõ thừa số 0).
9. Quay lại trang chuồng bằng tài khoản chủ chuồng → phải thấy **biểu đồ cột "Đàn đang lớn"**.
   Ghi thêm một tuần nữa để xem dòng *"tăng … mỗi con"* hiện ra.

**Ví (cần có một lô đã bán và đã giao):**

10. `/cho/cua-toi` → thẻ **💰 Tiền bán hàng của bạn**: *rút được ngay* và *đang giữ hộ*.
    Bấm **Rút tiền** → nút đổi thành *"Đã gửi yêu cầu"*. Mở `/admin` → khoản đó lên đầu
    hàng đợi kèm dấu 🙋.
    ⚠️ Bấm rút **không** chuyển tiền - nông trại vẫn chuyển khoản tay kèm ảnh biên lai (§9.29).

> 💡 **Đáng làm ngay:** cân thử đàn `demo-thit` 2–3 lần. Chuồng trưng bày giờ là thứ khách
> vãng lai nhìn thấy đầu tiên, và một biểu đồ lớn lên **có thật** thuyết phục hơn mọi dòng chữ.

### O. Khung chờ - nghiệm thu bằng mắt (5 phút)

Mỗi lượt tải trang ở đây tốn **vài giây thật** và đó là trần hiệu năng không gọt được ở
tầng code (CODEMAP §11.23). Không sửa được thời gian chờ thì sửa **thứ người ta nhìn
trong lúc chờ** - đó là toàn bộ nội dung của đợt này. Phần máy kiểm được đã có
`npm test` lo (bộ `khung-cho`: thiếu file, đặt lạc chỗ, lỡ `await`, nhét chữ vào khung).
Phần **còn lại chỉ mắt người mới thấy**, và nó là phần quan trọng hơn:

1. Đăng nhập, rồi bấm qua lại giữa **Chuồng của tôi → Chợ → Tài khoản** trên thanh
   điều hướng. Mỗi trang phải hiện một khung xám **khác nhau** trong lúc chờ.
2. Câu hỏi nghiệm thu, hỏi ở từng trang: **lúc trang thật hiện ra, có bị "giật" một cái
   không?** Nếu các khối nhảy chỗ đáng kể thì khung đang sai hình - sửa file
   `loading.tsx` của đúng route đó cho khớp bố cục thật.
3. Mở `/chuong/<slug>` - khung phải có: ảnh lớn ở trên, **một dải sẫm màu** (dải trạng
   thái), rồi lưới ô vuông. Dải sẫm là chỗ dễ sai nhất: để nó màu xám nhạt thì lúc
   trang hiện ra sẽ có một mảng tối bật lên đúng chỗ mắt vừa nhìn.
4. Điện thoại, mạng 3G/4G thật (không WiFi), mở `/nong-trai`. Đây là màn cô chú dùng
   thật ngoài vườn và là chỗ thời gian chờ được cảm thấy rõ nhất trong cả app.
5. Bật **"giảm chuyển động"** trong cài đặt máy (iOS: Trợ năng → Chuyển động; Android:
   Trợ năng → Bỏ hoạt ảnh) rồi tải lại. Khung phải **vẫn hiện nhưng đứng yên** - nếu
   nó biến mất hoàn toàn thì người bật cài đặt đó đang nhìn một trang trắng.

> ⚠️ Có một thứ **chưa ai bấm thử**: nút *"Xác nhận lựa chọn này"* ở màn kết chu kỳ nay
> đổi thành *"Đang gửi tới nông trại…"* và khoá lại trong lúc chạy. Nút đó chỉ hiện ra
> **sau khi bấm "Chọn"**, nên không kiểm được từ dòng lệnh. Ai có một chuồng đang ở
> cuối chu kỳ thì bấm thử một lần: bấm xong nút phải **đổi chữ và mờ đi ngay**, cả nút
> *"Để mình suy nghĩ thêm"* cũng phải mờ theo.

### L. Kho ảnh - nghiệm thu và chẩn đoán khi "không tải ảnh lên được"

Mục này có vì kho ảnh **đã từng hỏng câm suốt một thời gian dài mà không ai biết**: biến
môi trường có đủ, build xanh, test xanh, và câu báo cho người dùng lại đổ lỗi cho **định
dạng ảnh** trong khi ảnh của họ chẳng có vấn đề gì. Đọc mục này trước khi đi đổi ảnh.

**Nghiệm thu (làm một lần sau khi dựng kho, và mỗi lần đổi key):**

1. Máy tính, `/nong-trai` → một việc bất kỳ → **📸 Chọn ảnh từ máy** → chọn một ảnh JPG.
   Phải thấy thanh phần trăm rồi *"Đã tải ảnh lên ✓"*.
2. Điện thoại, cùng chỗ đó → phải thấy **hai nút**: *Chụp ảnh ngay* và *Chọn ảnh có sẵn
   trong máy*. Thử **cả hai**.
3. Việc video: thử **🎞️ Chọn video đã quay sẵn** với một clip đã có trong máy. Xem xong
   phải thấy **cả hình lẫn tiếng** - chỉ nghe tiếng mà màn đen là video H.265, xem bảng
   giới hạn ở D2.
4. Mở lại trang bằng **tài khoản khác** (hoặc trình duyệt ẩn danh) - ảnh phải hiện lên,
   không phải ô vỡ. Đây là bước hay bị bỏ, và là bước duy nhất bắt được lỗi định dạng.
5. Supabase → **Storage → chicchic** → thấy file nằm trong thư mục đúng mục đích
   (`viec/`, `nhat-ky/`, `ho-so/`, `thu-hoach/`, `quan-tri/`).

> 💡 **Bucket rỗng trơn ở cả 5 thư mục** trong khi mọi người vẫn báo "đã gửi ảnh" nghĩa là
> chưa từng có tấm nào lên được - không phải người dùng lười.

**Khi có trục trặc, đọc câu báo trước - mỗi câu chỉ đúng một chuyện:**

| App nói gì | Nghĩa thật là gì | Làm gì |
|---|---|---|
| *"Nông trại chưa dựng kho ảnh - tạm thời dán đường dẫn…"* | thiếu `SUPABASE_URL` hoặc `SUPABASE_SERVICE_ROLE_KEY` | thêm biến vào Vercel rồi **Redeploy** (biến mới không tự áp vào bản đã deploy) |
| *"Kho ảnh của nông trại đang không nhận - ảnh của bạn không có lỗi gì đâu."* | **kho từ chối**, không liên quan tới ảnh | xem log Vercel, tìm dòng `[storage] kho từ chối ký URL tải lên` - nguyên văn lý do của Supabase nằm ngay đó |
| *"Định dạng này chưa nhận được…"* | đúng là đuôi file không nhận | dùng JPG/PNG/WEBP hoặc MP4/MOV/WEBM |
| *"Ảnh .heic này máy khác mở không lên…"* | ảnh iPhone định dạng HEIC | iPhone → *Cài đặt › Camera › Định dạng › "Tương thích nhất"*, rồi chụp lại |
| *"Video này 82MB, nặng quá (tối đa 45MB)."* | vượt trần kho | quay ngắn lại, hoặc hạ chất lượng quay xuống 1080p |
| *"Video này quay ở định dạng H.265 (HEVC)…"* | video iPhone chế độ "High Efficiency" | iPhone → *Cài đặt › Camera › Định dạng › "Tương thích nhất"*, quay lại |

**Video xem được nhưng chỉ có tiếng, màn hình đen:** đây là video **H.265/HEVC** đã tải lên
từ trước khi có bước chặn. Máy Apple mở là thấy hình bình thường. Bản hiện tại tự nhận ra
và in một dòng cảnh báo ngay dưới trình phát thay vì để người xem nhìn ô đen mà đoán. Muốn
xem được trên mọi máy thì phải **gửi lại** sau khi đổi cài đặt iPhone - không có cách sửa
tại chỗ, app không chuyển mã video được (xem CODEMAP §11.4).

> 💡 **Kiểm tra nhanh trong Supabase:** dashboard báo *"File size is too large to preview in
> the explorer"* thì **không phải lỗi** - đó chỉ là hạn mức xem trước của giao diện
> Supabase, file vẫn nguyên vẹn. Cứ mở bằng đường dẫn công khai của nó để xem thật.

**Nếu log hiện `Invalid Compact JWS`:** đây đúng là con bọ đã gây ra cả mục này. Lời gọi
tới Supabase Storage phải mang **cả hai** header `Authorization` **và** `apikey` - key đời
mới (`sb_secret_…`) mà thiếu `apikey` thì Supabase cố đọc nó như JWT rồi từ chối. Bản hiện
tại đã gửi đủ (`authHeaders()` trong `src/lib/storage.ts`); thấy lại lỗi này nghĩa là ai đó
vừa bỏ header đi cho gọn.

**Cạm bẫy khi tự thử key:** đừng kiểm bằng cách gọi endpoint liệt kê bucket rồi thấy `200`
mà kết luận "key vẫn tốt" - endpoint đó nhận `Authorization` trần, còn endpoint **ký URL
tải lên** thì không. Muốn thử thì thử đúng `object/upload/sign`.

---

## 🛠️ Lỗi thường gặp

| Triệu chứng | Nguyên nhân & cách sửa |
|-------------|------------------------|
| `P1001: Can't reach database server` với host `db.<ref>.supabase.co` | Host này **chỉ có IPv6**, mạng ông không đi được. Đổi `DIRECT_URL` sang **Session pooler** (`…pooler.supabase.com:5432`). Xem hộp cảnh báo ở mục C. |
| `FATAL: Tenant or user not found` | Username phải là `postgres.<project-ref>` (ref thật của project), không phải `postgres` hay `postgres.abcd`. Copy nguyên chuỗi từ nút **Connect**. |
| `prepared statement "s0" already exists` | Thiếu `?pgbouncer=true` ở `DATABASE_URL` (6543). Thêm vào là hết. |
| `Error validating datasource: the URL must start with postgresql://` | Dán nhầm ô, hoặc thiếu `DIRECT_URL`. Điền đủ cả 2. |
| `EPERM: operation not permitted, rename '…query_engine-windows.dll.node'` khi `prisma generate` / `npm run build` | **Dev server đang chạy và giữ file đó.** Tắt `npm run dev` (hoặc `taskkill /F /IM node.exe`) rồi chạy lại. Không phải lỗi OneDrive. |
| Vercel build lỗi `prisma generate` | Hiếm; thử **Redeploy**. Đảm bảo `prisma` nằm ở devDependencies (đã có). |
| Seed báo `Unique constraint failed` | Bản này seed đã idempotent nên không còn xảy ra. Nếu vẫn gặp (do dữ liệu cũ từ bản trước), reset sạch: `npm run db:reset`. |
| Bấm "Giữ chỗ" 2 lần ra 2 đơn | Không xảy ra: client gửi kèm `idemKey`, server trả lại đúng đơn cũ. |
| Chữ tiếng Việt bị vỡ dấu | Không xảy ra ở bản này (dùng Be Vietnam Pro + Lora, subset `vietnamese`). |
| `Timed out fetching a new connection from the connection pool` | `connection_limit=1` khiến mọi truy vấn xếp hàng. Đổi thành `connection_limit=5` ở `DATABASE_URL`. |
| Trang chuồng tải chậm (vài giây) | Phần lớn là **khoảng cách tới database**. Nếu project Supabase đang ở `ap-south-1` (Mumbai) mà người dùng ở VN, tạo project mới ở `ap-southeast-1` (Singapore) sẽ nhanh hơn hẳn. |
| `db push` đòi `--accept-data-loss` khi thêm cột **unique** | Bình thường với cột **mới + nullable** (chưa hàng nào có giá trị nên không thể trùng). Kiểm đúng hai điều đó rồi mới chạy `npx prisma db push --accept-data-loss`. Cột đã có dữ liệu thì **dừng lại**, dọn trùng trước. |
| Vercel lỗi `column User.username does not exist` (hoặc bảng `Notification`) | Đã deploy code mới nhưng **quên `npm run db:push`** lên Supabase - hoặc ngược lại. Đổi schema thì phải làm **cả hai**. |
| Nông dân quên mật khẩu, `/quen-mat-khau` báo không có tài khoản | Đúng như thiết kế: tài khoản nông dân dùng **email nội bộ**, không nhận được thư. Admin vào `/admin` → bấm tên cô/chú → **đặt mật khẩu mới**. |
| Muốn xem lại mật khẩu cũ của nông dân | **Không có cách nào** - DB chỉ lưu bản băm scrypt một chiều. Đặt mật khẩu mới trong popup rồi chép ngay lúc nó còn hiện. |
| Nông dân báo *"tài khoản đang được nông trại tạm dừng"* | Đúng như thiết kế - ai đó đã bấm **Tạm dừng** ở `/admin`. Bấm **Mở lại** là vào được ngay, không cần đổi mật khẩu. |
| Tạm dừng rồi mà chuồng của cô/chú đó vẫn còn tên họ | Cố ý: tạm dừng **không** gỡ chuồng (mở lại vài giờ sau thì chuồng phải về đúng người cũ). Nhưng trong lúc đó chuồng không có tin mới - nếu nghỉ dài thì bàn giao ở khối **"🔄 Chuồng đang không có người chăm"** trong `/admin`. |
| Bàn giao chuồng rồi mà việc cũ vẫn còn đó | Đúng: **việc đang chờ** đi theo chuồng sang người mới (và hiện lại dấu "MỚI"), còn **việc đã xong** giữ nguyên tên người đã làm - sổ cũ phải nói đúng ai làm gì. |
| Khối "🔄 Chuồng đang không có người chăm" không thấy đâu | Nó **tự ẩn** khi không có chuồng nào kẹt. Chỉ hiện khi có chuồng đang gắn tên một cô/chú `active = false`. |
| Tạo tài khoản nông dân báo "tên đăng nhập đã có người dùng" | Username là duy nhất toàn hệ thống. Chọn tên khác (vd thêm khu vực: `colan-bavi`). |
| Chuông không nhảy số | Chuông poll **20 giây/lần và chỉ khi tab đang mở**. Đợi đủ 20 giây hoặc bấm sang tab khác rồi quay lại. Chưa đăng nhập thì không có chuông. |
| Giao lại đúng loại việc đang chờ mà chuông không báo | Cố ý: việc cùng loại đang OPEN được **gộp** vào việc cũ (chỉ cập nhật lời nhắn) nên không báo lại, tránh dội chuông. |
| Đàn gà mãi ở *"Đang úm"*, không chuồng nào tới màn kết chu kỳ | Chưa đặt `CRON_SECRET` (⟹ `/api/cron` trả 503) hoặc chưa redeploy sau khi đặt. Xem mục **J**. Kiểm nhanh: `curl -H "Authorization: Bearer <khoá>" https://<domain>/api/cron` - nhận 503 là chưa có biến, 401 là sai khoá. |
| Nhãn đàn vẫn *"Đang lớn"* dù đã quá 140 ngày | **Đúng như thiết kế.** Nhãn *"Đang đẻ"* chỉ bật khi nông dân ghi **quả trứng đầu tiên kèm ảnh** vào sổ thu hoạch - app không tự khẳng định đàn đang đẻ theo cuốn lịch. Xem mục J3. |
| Chỗ giữ trên chợ quá 24 giờ vẫn chưa nhả | Gói **Hobby của Vercel chạy cron 1 lần/ngày**, nên có thể trễ thêm tối đa một ngày. Người khác bấm mua thì đoạt được ngay lập tức, không phải chờ cron. Lên Pro rồi đổi lịch thành `"0 * * * *"`. |
| Chọn đúng ảnh JPG mà app vẫn báo *"Định dạng này chưa nhận được"* | **Đã sửa.** Đây là câu báo sai: kho ảnh từ chối ký URL tải lên, nhưng app lại đổ lỗi cho định dạng. Bản hiện tại nói đúng chuyện gì hỏng. Còn gặp thì xem mục **L**. |
| Điện thoại không có chỗ chọn video đã quay sẵn, chỉ mở được máy quay | **Đã sửa.** Nút chụp thẳng nay đi kèm một nút thứ hai vào thư viện máy. Vẫn chỉ thấy một nút thì kéo lại trang (Ctrl+F5 / tải lại) - bản cũ còn nằm trong cache. |
| Ảnh tải lên xong nhưng người khác mở ra thấy ô vỡ | Ảnh **HEIC** của iPhone - máy khác Safari không mở được. Bản hiện tại chặn ngay lúc chọn. Ảnh cũ đã lỡ lên thì phải gửi lại: iPhone → *Cài đặt › Camera › Định dạng › "Tương thích nhất"*. |
| Hoá đơn trang trí biến mất | Hoá đơn **chưa chuyển khoản** quá 48 giờ thì tự huỷ và trả hàng về kho (hạn này in sẵn trong ô hoá đơn). Đặt lại là được. Hoá đơn đã bấm *"tôi đã chuyển khoản"* thì **không bao giờ** tự huỷ. |

---

## Lệnh hay dùng (cheat sheet)

```bash
npm run dev         # chạy local
npm run db:push     # áp schema hiện tại lên DB
npm run db:seed     # nạp dữ liệu demo (chạy lại nhiều lần vô tư)
npm run db:reset    # xóa sạch + push + seed lại
npm run build       # build production (như Vercel) - nhớ tắt dev server trước
npm run lint        # kiểm tra lint
npx tsc --noEmit    # type-check

# Chạy tay việc nền theo ngày (mục J) thay vì chờ tới 8h sáng. Chạy lại vô hại.
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron
```

---

## 🗺️ Bản đồ màn hình & endpoint

### Trang (ai vào được)

| Đường dẫn | Vai | Nội dung |
|---|---|---|
| `/` | công khai | Trang giới thiệu, 4 điểm tin cậy |
| `/dang-ky` · `/dang-nhap` · `/quen-mat-khau` | công khai | Đăng ký qua mã email · đăng nhập (**email hoặc tên đăng nhập**) · đặt lại mật khẩu |
| **`/chuong`** | đã đăng nhập | **Cửa vào khu chuồng** - có chuồng thì chọn, chưa có thì mời nhận chuồng đầu tiên + xem chuồng mô phỏng. Nông dân bị chuyển sang `/nong-trai` |
| `/tai-khoan` | chủ chuồng | Chuồng của tôi + menu `⋯` hoàn trả chuồng |
| `/nhan-chuong` | đã đăng nhập | Chọn kiểu nuôi/giống/cám, **đặt tên chuồng**, đặt tên gà, **chọn nông dân**, bảng giá, giữ chỗ |
| `/chuong/<slug>` | chủ chuồng · nông dân phụ trách · admin | Bảng điều khiển chuồng: decor, tiến độ, ảnh/video hôm nay, giao việc, nhật ký |
| `/chuong/<slug>/trang-tri` | ↑ - **lắp/lưu** cần xong cọc | Kéo-thả decor, phóng to/thu nhỏ, lật, đổi lớp, gỡ món · **mua theo số lượng + kho món đã mua** · **khắc chữ lên biển tên / bảng phấn** |
| `/chuong/<slug>/nhat-ky` | ↑ | Ảnh & video gom theo ngày + nhật ký chăm sóc |
| `/chuong/<slug>/truy-xuat` | ↑ | Mã lô, QR, lịch sử sức khoẻ, thời gian ngừng thuốc |
| `/chuong/<slug>/ket-chu-ky` | ↑ | Cuối chu kỳ - **cả hai dòng**: gà đẻ hết chu kỳ đẻ, gà thịt tới ngày xuất chuồng. Nhận thịt / nghỉ hưu / lứa mới |
| `/chuong/<slug>/tin-nhan` | chủ chuồng · nông dân phụ trách (**không** dùng luật xem chuồng - xem được ≠ vào được hộp thư riêng) | Hộp thư của chuồng: hỏi–đáp, trả lời nhanh, chuyển tin thành việc, báo cáo vi phạm |
| `/nong-dan/<id>` | đã đăng nhập | Hồ sơ nông dân, chuồng đang chăm, ảnh & ghi chép gần đây |
| **`/nong-trai`** | **nông dân** | Chuồng phụ trách + **trạng thái việc từng chuồng**, hộp việc, gửi cập nhật hằng ngày |
| **`/nong-trai/ho-so`** | nông dân | Hồ sơ cá nhân: tên, năm sinh, kinh nghiệm, lời giới thiệu + **ảnh/video tự giới thiệu (≤8)** |
| **`/nong-trai/chuong/<slug>`** | nông dân **đúng chuồng đó** | Bản vẽ decor phải lắp, tên đàn, việc đang chờ, làm xong kèm ảnh |
| `/admin` | `ADMIN_PASSWORD` (production thiếu → **503**) | **📊 Nhịp 7 ngày** · **🏦 Tiền về tài khoản** · tài khoản nông dân · đối soát cọc & hoá đơn trang trí · tin nhắn bị báo cáo · gửi ảnh · đăng cập nhật |
| `/admin/tin-nhan/<slug>` | ↑ - **và chỉ** hộp thư có tin bị gắn cờ / bị báo cáo | Đọc lại đoạn hội thoại bị báo cáo. Phải nằm dưới `/admin` vì trình duyệt chỉ gửi kèm Basic Auth cho đường dẫn cùng nhánh |

> Mọi trang chuồng **bắt buộc đăng nhập** - kể cả chuồng demo. Vào khi chưa đăng nhập sẽ bị đưa
> sang `/dang-nhap?next=<trang cũ>` và quay lại **đúng chỗ** sau khi vào. Chuồng của người khác
> hiện màn 🔐 *"Chuồng này của một bạn khác"*.

### Endpoint HTTP

| Endpoint | Cổng quyền | Dùng để |
|---|---|---|
| `POST /api/reservations` | phải đăng nhập → chưa thì **401 `{needAuth, loginPath}`** | Tạo chuồng + đàn + đơn giữ chỗ. Kiểm **sức chứa nông dân** và **tính lại giá ở server**; gửi cùng `idemKey` hai lần chỉ ra một đơn |
| `GET /api/barns/<slug>/payment` | phải đăng nhập (**401**) **và** là chủ chuồng - không phải thì **404**, không xác nhận chuồng có tồn tại hay không | Trang chuồng poll để tự mở khoá khi admin xác nhận cọc |
| `GET /api/barns/<slug>/messages` | `threadAccess()` - chủ chuồng hoặc nông dân phụ trách **đang hoạt động**; còn lại **403** | Hộp thư của chuồng poll mỗi 12 giây |
| `GET /api/notifications` | phải đăng nhập → chưa thì `{list:[]}` | Chuông 🔔 poll mỗi 20 giây; chỉ trả thông báo **của chính mình** |
| `GET /api/thanh-toan?code=` | phải đăng nhập (**401**) **và** đúng người của đơn đó - không phải thì **404** | Một cửa "ngóng tiền" cho cả ba loại đơn (cọc `CHICC…` · trang trí `CHICD…` · chợ `CHICM…`): tiền về là màn hình tự đổi, không cần F5 |
| `POST /api/webhooks/sepay` | **khoá API của SePay** (`Authorization: Apikey …`) - thiếu `SEPAY_WEBHOOK_KEY` thì **503, đóng** | Ngân hàng báo tiền về → ghi sổ `BankTxn` → tự xác nhận cọc/hoá đơn nếu khớp mã và đủ tiền (mục D4) |
| `GET /api/cron` | **`CRON_SECRET`** (`Authorization: Bearer …` - Vercel tự gắn) - thiếu biến thì **503, đóng** | Việc nền theo ngày: đàn gà lớn lên · nhả chỗ giữ trên chợ · đóng sổ lô hết hạn · huỷ hoá đơn trang trí bỏ quên (mục J) |

### Hành động ghi dữ liệu (server action)

Không phải URL để gõ tay - đây là bảng tra khi cần biết *thao tác nào ghi cái gì*:

| Nhóm | Ai gọi được | Việc |
|---|---|---|
| `actions.ts` | **chủ chuồng** chuồng đó | thả vườn/gọi về · lắp–gỡ–xếp decor · báo đã chuyển khoản |
| `actions.ts` (nhánh admin) | **admin** - `denyIfNotAdmin()` ở dòng đầu mỗi hàm | xác nhận cọc · gửi ảnh/video · đăng cập nhật · xoá media |
| `decor-actions.ts` | **chủ chuồng** đặt/huỷ/báo chuyển · **admin** xác nhận | hoá đơn trang trí (mua **nhiều cái** một loại). Món chỉ vào chuồng **sau khi** tiền được xác nhận - bởi admin hoặc bởi webhook (mục D4) |
| `message-actions.ts` | **chủ chuồng** · **nông dân phụ trách đang hoạt động** | gửi tin · đánh dấu đã đọc · báo cáo vi phạm · chuyển tin thành việc (chỉ chủ chuồng). Admin **chỉ đọc**, và chỉ khi có cờ |
| `upload-actions.ts` | nông dân đang hoạt động · chủ chuồng · admin | **ký URL tải ảnh/video** lên kho (không nhận file - file đi thẳng điện thoại → Supabase) |
| `task-actions.ts` | **chủ chuồng** | giao việc (≤6 việc chờ/chuồng) · rút lại việc chưa ai làm |
| `worker-actions.ts` | **nông dân đúng việc** | hoàn thành (**bắt buộc ảnh/video**) · báo không làm được · gửi cập nhật ngày |
| `worker-profile-actions.ts` | **nông dân, hồ sơ của chính mình** | sửa hồ sơ cá nhân · thêm/xoá ảnh–video tự giới thiệu |
| `auth-actions.ts` | công khai / chủ chuồng | đăng ký OTP · đăng nhập · quên mật khẩu · hoàn trả chuồng |
| `admin-actions.ts` | **admin** (`ADMIN_PASSWORD` hoặc role ADMIN) | cấp tài khoản nông dân · đổi mật khẩu · tạm dừng tài khoản · **bàn giao chuồng sang người khác** · nhập kho · giá chợ · chi trả |
| `notification-actions.ts` | người đang đăng nhập | đánh dấu đã đọc · xoá thông báo của mình |

> Chi tiết từng hàm, ai gọi, sửa thì kéo theo gì: xem [CODEMAP.md](CODEMAP.md) §2, §3, §6.
