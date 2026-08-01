# 🐔 ChicChic — Hướng dẫn setup & deploy (từ 0 đến chạy thật)

Làm lần lượt A → H. Ước tính ~30 phút. Miễn phí cho giai đoạn PoC.
Kiến trúc: **Vercel** (host Next.js) + **Supabase** (Postgres) + **GitHub** (code + CI).

---

## ✅ Checklist tổng
- [ ] A. Cài công cụ + chạy thử ở máy (local)
- [ ] B. Đưa code lên GitHub
- [ ] C. Tạo database Supabase, lấy 2 connection string ⚠️ **cả hai đều dùng pooler**
- [ ] D. Đẩy schema + seed lên Supabase
- [ ] D2. Tạo bucket Storage cho ảnh/video (tuỳ chọn, làm khi có ảnh thật)
- [ ] D3. Cấu hình Resend để gửi email mã xác minh thật
- [ ] E. Deploy lên Vercel + set biến môi trường
- [ ] F. Kiểm tra + khóa `/admin` bằng `ADMIN_PASSWORD`
- [ ] G. Thử **cổng nông dân** `/nong-trai` — giao việc, làm xong kèm ảnh minh chứng
- [ ] H. Chạy trọn **ba vai**: admin cấp tài khoản → khách nhận chuồng → nông dân làm việc

> Ba vai trong hệ thống: **admin** (nông trại, vào `/admin` bằng mật khẩu) ·
> **khách/chủ chuồng** (tự đăng ký bằng email) · **nông dân** (tài khoản do admin cấp, không tự đăng ký).
> Xem [mục H](#h-ba-vai--luồng-hoạt-động-đầy-đủ) để chạy đúng thứ tự.

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

*Cách 1 — Docker (nhanh nhất):*
```bash
docker run --name chicchic-db -e POSTGRES_PASSWORD=chic -e POSTGRES_DB=chicchic -p 5432:5432 -d postgres:16
```
Lúc này giữ nguyên `DATABASE_URL` và `DIRECT_URL` mặc định trong `.env` (đã trỏ localhost).

*Cách 2 — bỏ qua Postgres local:* trỏ thẳng `.env` vào Supabase (làm mục C trước rồi quay lại).

```bash
# 4. Tạo bảng + seed dữ liệu demo (4 nông dân, giống, decor, 3 chuồng, ảnh/video, nhiệm vụ)
npm run db:push
npm run db:seed

# 5. Chạy
npm run dev      # mở http://localhost:3000
```
> Chỉ trang `/` chạy được khi chưa có DB. Mọi trang còn lại (`/chuong`, `/nhan-chuong`,
> `/chuong/demo`, `/nong-trai`, `/admin`) đều cần bước 4 — kể cả `/nhan-chuong` vì nó phải
> đọc danh sách nông dân còn chỗ.

---

## B. Đưa code lên GitHub

Tạo một repo rỗng trên GitHub (vd tên `chicchic`), rồi:
```bash
git remote add origin https://github.com/<tên-github>/chicchic.git
git branch -M main
git push -u origin main
```
> Repo đã `git init` + commit sẵn. Ngay sau khi push, **CI tự chạy** (type-check + lint + build) — vào tab **Actions** trên GitHub để xem.

---

## C. Tạo database Supabase + lấy connection string

1. Tạo project tại [supabase.com](https://supabase.com). Chọn region gần VN (vd **Singapore**).
2. Đặt **Database Password** — **nhớ lại** (sẽ dán vào URL).
3. Bấm nút **Connect** ở đầu trang dashboard. Cần **2 chuỗi**, và **cả hai đều phải là bản pooler**:

| Biến | Lấy từ | Cổng | Xử lý thêm |
|------|--------|------|-----------|
| `DATABASE_URL` | **Transaction pooler** | **6543** | thêm `?pgbouncer=true&connection_limit=5` vào cuối |
| `DIRECT_URL` | **Session pooler** | **5432** | giữ nguyên |

Cả hai đều có host dạng `aws-<n>-<region>.pooler.supabase.com` và username dạng
`postgres.<project-ref>` (project-ref là chuỗi ~20 ký tự riêng của project ông, **không phải** chữ `abcd`).

```
DATABASE_URL="postgresql://postgres.xxxxxxxxxxxx:MẬT_KHẨU@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5"
DIRECT_URL="postgresql://postgres.xxxxxxxxxxxx:MẬT_KHẨU@aws-1-ap-south-1.pooler.supabase.com:5432/postgres"
```

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
> session pooler (5432). Prisma đọc `directUrl` cho các lệnh đó — đã cấu hình sẵn trong
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
> `npm run db:seed` lần 2, lần 3 vẫn ra đúng một bộ dữ liệu — không nhân đôi, không lỗi
> `Unique constraint failed`. Mốc thời gian tính tương đối so với lúc chạy, nên demo luôn
> có nội dung "hôm nay".

Sau khi seed có sẵn 3 chuồng để xem:

| Đường dẫn | Xem được gì |
|-----------|-------------|
| `/chuong/demo` | Gà đẻ đang đẻ — 5 món decor đã sắp, 7 ảnh/video, nhật ký nhiều ngày |
| `/chuong/demo-thit` | Gà thịt — tiến độ nuôi thật, nút thả vườn, đang trong **thời gian ngừng thuốc** |
| `/chuong/demo-cuoi-ky` | Cuối chu kỳ đẻ — mở được màn chọn thịt / nghỉ hưu / lứa mới |

---

## D2. Kho ảnh & video (Supabase Storage) — để gửi hiện trạng chuồng

App có sẵn màn **Ảnh & video** (`/chuong/<slug>/nhat-ky`): gom theo ngày, có khu "Hôm nay",
bấm vào xem toàn màn hình, video có nút play và thời lượng.

Cách đưa ảnh/video thật lên:

1. Supabase → **Storage → New bucket**, đặt tên `barn-media`, bật **Public bucket**.
2. Upload ảnh/video vào bucket đó.
3. Bấm vào file → **Copy URL** (dạng `https://<ref>.supabase.co/storage/v1/object/public/barn-media/...`).
4. Vào `/admin` → khối **📷 Gửi ảnh / video cho chủ chuồng** → chọn chuồng, chọn Ảnh/Video, dán URL, thêm chú thích → **Gửi lên chuồng**.

Dán được cả **link YouTube** (`youtu.be/...`, `youtube.com/watch?v=...`) — app tự đổi sang dạng nhúng
không-cookie. File `.mp4` / `.webm` thì phát bằng trình phát sẵn có.

> Ảnh/video demo trong repo nằm ở `public/demo/` (do mình vẽ bằng SVG, video là SVG động).
> Khi có ảnh thật thì xoá các mục demo ở `/admin` rồi thêm mục mới.

---

## D3. Email mã xác minh (đăng ký & quên mật khẩu)

App có hệ thống tài khoản: đăng ký phải **nhập đúng mã 6 số gửi về email**, quên mật khẩu cũng
dùng mã tương tự. Mã sống 10 phút, sai quá 5 lần thì phải xin mã mới.

- **Chưa cấu hình gì** → app chạy *chế độ demo*: mã hiện thẳng trên màn hình (ô vàng).
  Luồng test được từ đầu tới cuối, nhưng **không dùng được khi mở cho người thật**.
- **Gửi email thật** (miễn phí, ~5 phút) → làm theo 5 bước dưới đây.

### 1. Tài khoản & API key (nếu cần tạo lại)

1. [resend.com](https://resend.com) → đăng ký (free tier ~3.000 email/tháng, 100/ngày).
   Xác minh email đăng ký — **nhớ kỹ địa chỉ này**, mục 2 cần tới.
2. **API Keys** → *Create API Key*:
   - Name: `chicchic-dev`
   - Permission: **Sending access** (đừng chọn Full access — app chỉ cần gửi)
   - Domain: *All domains*
3. Key dạng `re_…` **chỉ hiện đúng một lần**. Mất thì tạo key mới, không xem lại được.

### 2. Cái bẫy lớn nhất: `onboarding@resend.dev`

`RESEND_FROM` mặc định là `ChicChic <onboarding@resend.dev>` — địa chỉ dùng chung của Resend,
không cần domain riêng. Nhưng Resend chặn: **địa chỉ này chỉ gửi được tới đúng email đã đăng ký
tài khoản Resend.**

Gửi tới email khác sẽ trả 403 `validation_error`: *"You can only send testing emails to your own
email address"*. Trong app, [mailer.ts:43](src/lib/mailer.ts#L43) sẽ `throw`, và người dùng chỉ
thấy *"Không gửi được email lúc này. Thử lại sau ít phút nhé."* — không nói lý do. Lý do thật nằm
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

Không có domain thì cứ để nguyên `onboarding@resend.dev` và test theo mục 2 — vẫn đủ cho PoC.

### 4. Đặt biến

**Local** — `.env` đã có sẵn cả hai dòng:

```
RESEND_API_KEY="re_xxxxxxxx"
RESEND_FROM="ChicChic <onboarding@resend.dev>"
```

Sửa xong **phải khởi động lại `npm run dev`**: Next chỉ đọc `.env` lúc boot, sửa file mà không
restart thì `process.env.RESEND_API_KEY` vẫn là giá trị cũ.

**Vercel** — Settings → Environment Variables → thêm `RESEND_API_KEY` và `RESEND_FROM` cho cả
Production/Preview/Development → **Redeploy** (biến mới chỉ vào bản build sau đó).
Nhớ đặt luôn `ADMIN_PASSWORD` trước khi chia link.

### 5. Test luồng

Vào `/dang-ky` → nhập email → bấm gửi mã. Phân biệt các kết quả ở
[auth-actions.ts:45-46](src/app/auth-actions.ts#L45-L46):

| Thông báo trên màn hình | Nghĩa là |
|---|---|
| "Đã gửi mã 6 số tới … — kiểm tra cả mục Spam nhé." | Resend nhận đơn, gửi thật |
| "Bản demo chưa cấu hình gửi email — dùng mã hiển thị bên dưới." + ô mã 6 số | `RESEND_API_KEY` rỗng/không đọc được → chế độ demo |
| "Không gửi được email lúc này." | Resend trả lỗi — **xem terminal** để biết mã lỗi |

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

## E. Deploy lên Vercel

1. Vào [vercel.com](https://vercel.com) → **Add New → Project → Import** repo `chicchic`. Next.js được nhận diện tự động (giữ nguyên build/output mặc định).
2. Mở **Environment Variables**, thêm đủ 7 biến (dán **không có dấu nháy kép**):

| Key | Value |
|-----|-------|
| `DATABASE_URL` | chuỗi **Transaction pooler** (6543, có `?pgbouncer=true&connection_limit=5`) |
| `DIRECT_URL` | chuỗi **Session pooler** (5432, host `…pooler.supabase.com`) |
| `NEXT_PUBLIC_HOLD_BANK` | vd `Vietcombank · 0123456789 · DO DINH THANG` |
| `NEXT_PUBLIC_HOLD_MOMO` | số MoMo nhận cọc |
| `ADMIN_PASSWORD` | mật khẩu vào `/admin` — **đặt trước khi chia link** |
| `RESEND_API_KEY` | gửi email mã xác minh thật (xem mục D3). Bỏ trống → mã hiện trên màn hình |
| `RESEND_FROM` | vd `ChicChic <onboarding@resend.dev>` |

3. Bấm **Deploy**. Xong → mở URL Vercel: `/`, `/chuong`, `/nhan-chuong`, `/chuong/demo`, `/admin`.

> Build **không cần** kết nối DB (các trang đọc DB đã `force-dynamic`), chỉ runtime mới nối Supabase.
> Về sau đổi schema: sửa `prisma/schema.prisma` → `npm run db:push` → push GitHub, Vercel tự deploy lại.
> ⚠️ **Đổi schema thì phải làm cả hai:** `db push` (đổi bảng ở Supabase) **và** deploy lại Vercel
> (đổi code). Làm một nửa thì bản đang chạy sẽ đọc cột chưa có, hoặc ngược lại.

---

## F. Kiểm tra & khóa /admin (quan trọng)

- [ ] Mở `/nhan-chuong`, chọn chuồng, bấm giữ chỗ → app **tạo luôn một chuồng riêng** cho email đó
      và đưa thẳng vào `/chuong/<slug-mới>`. Kiểm tra Supabase có dòng `Reservation` + `Barn` mới.
- [ ] **Luồng cọc:** chuồng mới hiện banner 🔒 với STK/MoMo + **nội dung CK** (dạng `CHIC XXXXXX`).
      Khách bấm "Tôi đã chuyển khoản" → banner chuyển "đang chờ đối soát". Ông vào `/admin` →
      khối **💰 Đối soát cọc** → kiểm tra tài khoản có đúng khoản + nội dung CK → bấm **Đã nhận tiền**.
      Trang bên khách **tự cập nhật trong ~10 giây** (không cần tải lại) và mở khoá trang trí.
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
- [ ] ⚠️ Đặt `ADMIN_PASSWORD` trên Vercel **trước khi** đưa link ra ngoài. Chưa đặt thì `/admin`
      mở tự do và tự hiện cảnh báo đỏ. Đặt rồi, trình duyệt sẽ hỏi mật khẩu (bỏ trống ô tên đăng nhập).

---

## G. Cổng nông dân (`/nong-trai`) — vòng lặp quan trọng nhất

Mỗi chuồng thuộc về **đúng một** cô/chú nông dân, và mỗi người nhận **tối đa 15 chuồng**
(`FarmWorker.maxBarns`) để còn nhớ được tên từng đàn. Khi khách nhận chuồng mới, họ **tự chọn**
người chăm trong danh sách còn chỗ — người đã kín hoặc đang tạm nghỉ (`active = false`) bị làm mờ,
và server kiểm lại sức chứa **ngay trước khi** tạo chuồng nên không thể lách bằng devtools.

### Tài khoản nông dân do admin cấp

Nông dân **không tự đăng ký được** — không có luồng OTP nào tạo ra `role = WORKER`.
Admin vào `/admin` → khối **👩‍🌾 Tài khoản nông dân** → đặt **tên đăng nhập + mật khẩu** rồi
đưa tận tay cô/chú. Đây là chủ ý thiết kế: người chăm gà là nhân sự của nông trại, không phải
người dùng tự do đăng ký.

Về mặt dữ liệu: một `User` có `role = WORKER` + `username`, nối 1–1 với `FarmWorker.userId`.
Các cô chú **không cần email** — hệ thống tự sinh địa chỉ nội bộ `<username>@nong-dan.chicchic.vn`
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
| `chihoa` | `hoa@chicchic.vn` | Chị Hoa | `active = false` — **tài khoản đang tạm dừng, đăng nhập thử sẽ bị từ chối** |

Tên đăng nhập: 3–32 ký tự, **chữ thường không dấu**, số, và `. _ -`. Mật khẩu ≥ 8 ký tự
(có nút 🎲 **Tạo** sinh mật khẩu ngẫu nhiên dễ đọc — đã bỏ các ký tự hay nhầm như `0/O`, `1/l/I`).

#### Xem lại thông tin đăng nhập của một cô/chú

Trong bảng ở `/admin`, **bấm vào tên** một nông dân → popup hiện:

- **Tên đăng nhập** đầy đủ, có nút *Sao chép*.
- Khu vực, số chuồng đang giữ, trạng thái nhận chuồng.
- Ô **đặt mật khẩu mới** ngay tại chỗ (nút 🎲 tạo hộ) → **Lưu mật khẩu mới** ghi thẳng vào
  database và hiện lại mật khẩu vừa đặt để chép đưa cho cô/chú.

Nút **Đổi mật khẩu** ở cuối hàng mở đúng popup đó và nhảy sẵn con trỏ vào ô mật khẩu.

> ⚠️ **Mật khẩu đang dùng không xem lại được.** Database chỉ lưu bản băm `scrypt` (`salt:hash`) —
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

Quy tắc cứng: **không có ảnh/video thì không tích hoàn thành được** — nút bị khoá ở giao diện và
`completeTask` từ chối ở server. Xong việc, app tự tạo một mục nhật ký + một ảnh/video trong chuồng
của khách, nên "đã xong" luôn đi kèm bằng chứng. Nông dân không làm được thì bấm
**Không làm được** kèm lý do — lý do đó hiện thẳng cho chủ chuồng, đúng tinh thần "tin xấu cũng báo thật".

### Màn hình `/nong-trai` có gì

Xếp theo thứ tự từ trên xuống:

1. **Hồ sơ + 3 số**: việc đang chờ · xong hôm nay · chuồng chưa gửi tin.
2. **Chuồng tôi phụ trách** — phần chính. Mỗi chuồng là một thẻ hiện **trạng thái việc**:
   | Dấu hiệu | Nghĩa |
   |---|---|
   | 🔴 + viền đỏ nhạt | chuồng có việc **quá giờ hẹn** — xếp lên đầu danh sách |
   | ⚠️ + viền vàng | còn việc chưa xong |
   | `✓ Xong hết việc` nền xanh | sạch việc |
   | `✅ N xong hôm nay` | đã hoàn thành N việc trong ngày |
   | `N mới` nền vàng | việc vừa được giao, chưa mở xem |
   | dòng `Cần làm: 🌿 Thả đàn ra vườn · 🎨 Lắp trang trí` | liệt kê loại việc đang chờ |
   | `🟢 Đã gửi tin hôm nay` / `⚠️ Tin gần nhất 5 giờ trước` | tình trạng ảnh gửi cho chủ chuồng |

   Bấm vào thẻ → `/nong-trai/chuong/<slug>` để làm việc của đúng chuồng đó.
3. **Hộp việc** — toàn bộ việc gộp từ mọi chuồng, quá hạn xếp trước.
4. **Gửi cập nhật hôm nay** — đăng ảnh/ghi chú không cần ai giao việc.
5. **Vừa hoàn thành** — 5 việc gần nhất.

### Checklist thử cổng nông dân

- [ ] Đăng nhập bằng **tên đăng nhập** `colan` / `chicchic123` → vào thẳng `/nong-trai`.
- [ ] Đăng nhập lại bằng email `lan@chicchic.vn` → cùng kết quả (hai cách đều chạy).
- [ ] Danh sách chuồng: chuồng còn việc có **⚠️ / 🔴** và nhãn `N việc chưa xong`;
      chuồng sạch việc hiện `✓ Xong hết việc`. Chuồng quá hạn phải nằm **trên cùng**.
- [ ] Bấm **Đã làm xong — gửi ảnh** khi chưa dán đường dẫn → nút *Hoàn thành* vẫn xám.
      Bấm một ảnh mẫu (`Cữ ăn sáng`, `Clip thả vườn`…) → nút bật.
- [ ] Hoàn thành xong: việc rời hộp việc sang **Vừa hoàn thành**, thẻ chuồng đổi sang
      `✓ Xong hết việc`, và bên chủ chuồng hiện `✓ Đã xong · có ảnh minh chứng` kèm ảnh
      thu nhỏ bấm xem được — **đồng thời chuông 🔔 của chủ chuồng nhảy số**.
- [ ] Ô **Gửi cập nhật hôm nay** đăng được ảnh/ghi chú mà không cần ai giao việc —
      đây mới là thứ khách mở app mỗi ngày để xem.
- [ ] Nông dân mở `/nong-trai/chuong/<chuồng người khác>` → bị đẩy về `/nong-trai`.
- [ ] **Hồ sơ:** `/nong-trai/ho-so` → sửa năm sinh, bấm **Lưu hồ sơ** → mở `/nhan-chuong` bằng
      tài khoản khách, bấm ⋯ ở đúng cô/chú đó → thấy tuổi mới. Thêm một ảnh mẫu → hiện ngay
      trong popup và ở `/nong-dan/<id>`.
- [ ] **Tạm dừng khoá được đăng nhập:** đăng nhập thử `chihoa` / `chicchic123` → bị từ chối
      kèm lý do. Vào `/admin` bấm **Tạm dừng** một cô/chú đang đăng nhập ở tab khác →
      tab đó tải lại là văng ra `/dang-nhap`, và đăng nhập lại cũng không vào được.
      Bấm **Mở lại** → vào bình thường ngay.

---

## H. Ba vai — luồng hoạt động đầy đủ

Chạy đúng thứ tự dưới đây là nghiệm thu được toàn bộ sản phẩm. Mở **hai trình duyệt khác nhau**
(hoặc một cửa sổ ẩn danh) để đóng hai vai cùng lúc — sẽ thấy rõ hai bên nhận thông báo của nhau.

### 🔔 Trước hết: chuông thông báo

Góc **trái** thanh trên có hình chuông (chỉ hiện khi đã đăng nhập), chấm đỏ đếm số chưa đọc.
**Mọi hành động một bên làm xong đều đẩy một dòng sang bên kia** — không phải chờ ai kể lại.

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

Chuông **tự làm mới mỗi 20 giây** khi tab đang mở, và làm mới ngay khi quay lại tab —
không cần F5. Mở chuông ra là đánh dấu đã đọc; bấm một dòng thì nhảy tới đúng chuồng.

> Đây là **poll 20 giây**, chưa phải push thật. Đóng tab thì không nhận được gì, mở lại mới thấy.
> Việc gộp vào một việc cùng loại đang chờ thì **không** báo lại lần nữa (tránh dội chuông).

### Vai 1 — Admin (nông trại)

Vào `/admin`, trình duyệt hỏi mật khẩu: **bỏ trống ô tên đăng nhập**, gõ `ADMIN_PASSWORD`.

1. **Cấp tài khoản nông dân** — khối 👩‍🌾:
   - Tab *Nông dân đã có*: chọn người đã có hồ sơ nhưng chưa có login (vd người vừa import).
   - Tab *Thêm người mới*: nhập tên, khu vực, số năm kinh nghiệm, số chuồng nhận tối đa.
   - Đặt **tên đăng nhập + mật khẩu** (nút 🎲 tạo hộ) → **Cấp tài khoản** → màn hình hiện lại
     đủ cặp đăng nhập kèm nút sao chép; ghi lại rồi đưa tận tay cô/chú.
   - **Bấm vào tên** một cô/chú → popup xem tên đăng nhập và đặt mật khẩu mới
     (xem [mục G](#tài-khoản-nông-dân-do-admin-cấp) — mật khẩu cũ không xem lại được).
   - **Tạm dừng** = **khoá tài khoản**: cô/chú không đăng nhập được nữa và bị đăng xuất
     khỏi mọi thiết bị ngay lập tức, đồng thời biến mất khỏi danh sách chọn ở `/nhan-chuong`.
     Bấm **Mở lại** là vào được ngay.

     > ⚠️ Chuồng đang chăm **không** bị gỡ khỏi cô/chú, nên trong thời gian tạm dừng những
     > chuồng đó **sẽ không có tin mới** gửi cho chủ chuồng. App bấm nút sẽ hỏi lại và nói rõ
     > số chuồng bị ảnh hưởng. Muốn chuyển chuồng sang người khác thì hiện phải sửa
     > `Barn.workerId` tay trong Supabase — chưa có nút bàn giao.
2. **Đối soát cọc** — khối 💰: đối chiếu số tiền + **nội dung CK** `CHIC XXXXXX` trong tài khoản
   ngân hàng thật → **Đã nhận tiền**. Chuồng của khách mở khoá ngay, khách nhận 💰 trên chuông.
3. **Gửi ảnh/video** và **đăng cập nhật** cho bất kỳ chuồng nào (dùng khi nông dân gửi ảnh
   qua Zalo cho nông trại thay vì tự đăng).
4. **Đơn giữ chỗ** và khối *Dev* (đặt `END_OF_LAY` để thử màn kết chu kỳ).

> ⚠️ `/admin` chỉ được khoá bằng `ADMIN_PASSWORD`. Chưa đặt biến này thì trang mở tự do và
> tự hiện cảnh báo đỏ. Các thao tác cấp/đổi tài khoản nông dân còn kiểm quyền **lần nữa ở server**.

### Vai 2 — Khách / chủ chuồng

1. `/` → **Tạo tài khoản & nhận chuồng** → `/dang-ky`: nhập email → nhận **mã 6 số**
   (chưa cấu hình Resend thì mã hiện luôn trên màn hình) → đặt mật khẩu → vào thẳng.
2. `/chuong` — cửa vào khu chuồng:
   - Chưa có chuồng nào → màn **"Hãy nhận nuôi chuồng đầu tiên"** + nút xem thử chuồng mô phỏng.
   - Đã có → danh sách chuồng kèm trạng thái để chọn.
3. `/nhan-chuong`: chọn kiểu nuôi → giống → cám → số con → **đặt tên từng con gà** →
   **chọn cô/chú nông dân** (người kín chỗ hoặc tạm nghỉ bị làm mờ) → xem bảng giá minh bạch → giữ chỗ.
   Trong danh sách nông dân, bấm dấu **⋯** ở mỗi người để mở **hồ sơ**: tên, tuổi, số năm nuôi gà,
   khu vực, lời tự giới thiệu và **ảnh/video cô chú tự quay**. Bấm được cả với người đang kín chỗ.
4. Chuồng mới hiện banner 🔒 kèm STK/MoMo và **nội dung CK**. Chuyển khoản xong bấm
   *Tôi đã chuyển khoản* → chờ admin đối soát. Trang **tự cập nhật trong ~10 giây**, không cần F5.
5. Cọc xong: mở khoá `/chuong/<slug>/trang-tri` — kéo thả decor rồi **Lưu bố cục** →
   sinh **một** việc "Lắp trang trí" cho nông dân.
6. Giao việc khác ở trang chuồng: cho ăn theo giờ, ngó chuồng, **nhờ thả đàn ra vườn / gọi về**.
   Tối đa **6 việc đang chờ** mỗi chuồng.
7. Nhận 🔔 khi nông dân làm xong, xem ảnh minh chứng ở `/chuong/<slug>/nhat-ky`.
8. `/tai-khoan`: xem tất cả chuồng, hoặc `⋯` → **Hoàn trả chuồng** (phải gõ đúng nguyên văn câu xác nhận).

### Vai 3 — Nông dân

1. `/dang-nhap` → gõ **tên đăng nhập** admin cấp (vd `colan`) + mật khẩu → vào thẳng `/nong-trai`.
2. Nhìn danh sách chuồng: chuồng nào **⚠️/🔴** thì bấm vào làm trước.
3. Trong trang chuồng: xem **bản vẽ trang trí** chủ chuồng gửi, **tên từng con gà**, việc đang chờ.
4. Làm xong ngoài đời → **Đã làm xong — gửi ảnh** → dán link ảnh/video → *Hoàn thành*.
   **Không có ảnh thì không tích xong được** — nút khoá ở giao diện và server cũng từ chối.
5. Không làm được (mưa bão, đàn ốm) → **Không làm được** + lý do → lý do hiện thẳng cho chủ chuồng.
6. Mỗi ngày: **Gửi cập nhật hôm nay** — một tấm ảnh là đủ, đây là thứ giữ chân khách.
7. **🪪 Hồ sơ của tôi** (thẻ ngay dưới tên ở `/nong-trai`, hoặc `/nong-trai/ho-so`):
   sửa tên hiển thị, **năm sinh** (app tự tính tuổi), số năm nuôi gà, khu vực, lời tự giới thiệu,
   và ô đồng ý xuất hiện trong ảnh/video. Thêm tối đa **8 ảnh/video giới thiệu bản thân** —
   đây chính là thứ khách xem ở dấu ⋯ khi chọn người chăm chuồng. Nút **👀 Xem thử** cho cô/chú
   nhìn đúng khung mà khách sẽ thấy.

   > Ảnh/video vẫn theo cách **dán đường dẫn** như khi gửi minh chứng việc (repo chưa có chỗ tải
   > file trực tiếp — xem mục D2). Có sẵn nút ảnh mẫu để thao tác thử ngay. Thực tế PoC: cô chú
   > gửi ảnh cho nông trại qua Zalo, nông trại đưa lên Supabase Storage rồi đưa lại đường dẫn.

### Nghiệm thu chéo (làm một lần cho chắc)

- [ ] Cửa sổ A đăng nhập khách, cửa sổ B đăng nhập nông dân phụ trách đúng chuồng đó.
- [ ] A giao một việc → trong ≤20 giây chuông của B nhảy 🔔1, nội dung `📋 Việc mới: …`.
- [ ] B hoàn thành kèm ảnh → chuông của A nhảy `✅ … đã xong "…"`, bấm vào nhảy đúng chuồng.
- [ ] A bấm *Nhờ thả đàn ra vườn* → **hình chuồng chưa đổi**; chỉ sau khi B làm xong và gửi ảnh
      thì đàn mới ra vườn. Đây là bất biến quan trọng nhất của sản phẩm.
- [ ] Admin xác nhận cọc → chuông của A nhảy 💰 và trang trí mở khoá.

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
| Vercel lỗi `column User.username does not exist` (hoặc bảng `Notification`) | Đã deploy code mới nhưng **quên `npm run db:push`** lên Supabase — hoặc ngược lại. Đổi schema thì phải làm **cả hai**. |
| Nông dân quên mật khẩu, `/quen-mat-khau` báo không có tài khoản | Đúng như thiết kế: tài khoản nông dân dùng **email nội bộ**, không nhận được thư. Admin vào `/admin` → bấm tên cô/chú → **đặt mật khẩu mới**. |
| Muốn xem lại mật khẩu cũ của nông dân | **Không có cách nào** — DB chỉ lưu bản băm scrypt một chiều. Đặt mật khẩu mới trong popup rồi chép ngay lúc nó còn hiện. |
| Nông dân báo *"tài khoản đang được nông trại tạm dừng"* | Đúng như thiết kế — ai đó đã bấm **Tạm dừng** ở `/admin`. Bấm **Mở lại** là vào được ngay, không cần đổi mật khẩu. |
| Tạm dừng rồi mà chuồng của cô/chú đó vẫn còn tên họ | Cố ý: tạm dừng **không** gỡ chuồng. Nhưng chuồng đó sẽ không có tin mới. Muốn đổi người chăm thì sửa `Barn.workerId` trong Supabase — chưa có nút bàn giao. |
| Tạo tài khoản nông dân báo "tên đăng nhập đã có người dùng" | Username là duy nhất toàn hệ thống. Chọn tên khác (vd thêm khu vực: `colan-bavi`). |
| Chuông không nhảy số | Chuông poll **20 giây/lần và chỉ khi tab đang mở**. Đợi đủ 20 giây hoặc bấm sang tab khác rồi quay lại. Chưa đăng nhập thì không có chuông. |
| Giao lại đúng loại việc đang chờ mà chuông không báo | Cố ý: việc cùng loại đang OPEN được **gộp** vào việc cũ (chỉ cập nhật lời nhắn) nên không báo lại, tránh dội chuông. |

---

## Lệnh hay dùng (cheat sheet)

```bash
npm run dev         # chạy local
npm run db:push     # áp schema hiện tại lên DB
npm run db:seed     # nạp dữ liệu demo (chạy lại nhiều lần vô tư)
npm run db:reset    # xóa sạch + push + seed lại
npm run build       # build production (như Vercel) — nhớ tắt dev server trước
npm run lint        # kiểm tra lint
npx tsc --noEmit    # type-check
```

---

## 🗺️ Bản đồ màn hình & endpoint

### Trang (ai vào được)

| Đường dẫn | Vai | Nội dung |
|---|---|---|
| `/` | công khai | Trang giới thiệu, 4 điểm tin cậy |
| `/dang-ky` · `/dang-nhap` · `/quen-mat-khau` | công khai | Đăng ký qua mã email · đăng nhập (**email hoặc tên đăng nhập**) · đặt lại mật khẩu |
| **`/chuong`** | đã đăng nhập | **Cửa vào khu chuồng** — có chuồng thì chọn, chưa có thì mời nhận chuồng đầu tiên + xem chuồng mô phỏng. Nông dân bị chuyển sang `/nong-trai` |
| `/tai-khoan` | chủ chuồng | Chuồng của tôi + menu `⋯` hoàn trả chuồng |
| `/nhan-chuong` | đã đăng nhập | Chọn kiểu nuôi/giống/cám, đặt tên gà, **chọn nông dân**, bảng giá, giữ chỗ |
| `/chuong/<slug>` | chủ chuồng · nông dân phụ trách · admin | Bảng điều khiển chuồng: decor, tiến độ, ảnh/video hôm nay, giao việc, nhật ký |
| `/chuong/<slug>/trang-tri` | ↑ — **lắp/lưu** cần xong cọc | Kéo-thả decor, phóng to/thu nhỏ, lật, đổi lớp, gỡ món |
| `/chuong/<slug>/nhat-ky` | ↑ | Ảnh & video gom theo ngày + nhật ký chăm sóc |
| `/chuong/<slug>/truy-xuat` | ↑ | Mã lô, QR, lịch sử sức khoẻ, thời gian ngừng thuốc |
| `/chuong/<slug>/ket-chu-ky` | ↑ | Cuối chu kỳ đẻ: nhận thịt / nghỉ hưu / lứa mới |
| `/nong-dan/<id>` | đã đăng nhập | Hồ sơ nông dân, chuồng đang chăm, ảnh & ghi chép gần đây |
| **`/nong-trai`** | **nông dân** | Chuồng phụ trách + **trạng thái việc từng chuồng**, hộp việc, gửi cập nhật hằng ngày |
| **`/nong-trai/ho-so`** | nông dân | Hồ sơ cá nhân: tên, năm sinh, kinh nghiệm, lời giới thiệu + **ảnh/video tự giới thiệu (≤8)** |
| **`/nong-trai/chuong/<slug>`** | nông dân **đúng chuồng đó** | Bản vẽ decor phải lắp, tên đàn, việc đang chờ, làm xong kèm ảnh |
| `/admin` | `ADMIN_PASSWORD` | Tài khoản nông dân · đối soát cọc · gửi ảnh · đăng cập nhật · đơn giữ chỗ |

> Mọi trang chuồng **bắt buộc đăng nhập** — kể cả chuồng demo. Vào khi chưa đăng nhập sẽ bị đưa
> sang `/dang-nhap?next=<trang cũ>` và quay lại **đúng chỗ** sau khi vào. Chuồng của người khác
> hiện màn 🔐 *"Chuồng này của một bạn khác"*.

### Endpoint HTTP

| Endpoint | Cổng quyền | Dùng để |
|---|---|---|
| `POST /api/reservations` | phải đăng nhập → chưa thì **401 `{needAuth, loginPath}`** | Tạo chuồng + đàn + đơn giữ chỗ. Kiểm **sức chứa nông dân** và **tính lại giá ở server**; gửi cùng `idemKey` hai lần chỉ ra một đơn |
| `GET /api/barns/<slug>/payment` | *(chưa kiểm quyền — chỉ trả trạng thái cọc)* | Trang chuồng poll để tự mở khoá khi admin xác nhận cọc |
| `GET /api/notifications` | phải đăng nhập → chưa thì `{list:[]}` | Chuông 🔔 poll mỗi 20 giây; chỉ trả thông báo **của chính mình** |

### Hành động ghi dữ liệu (server action)

Không phải URL để gõ tay — đây là bảng tra khi cần biết *thao tác nào ghi cái gì*:

| Nhóm | Ai gọi được | Việc |
|---|---|---|
| `actions.ts` | **chủ chuồng** chuồng đó | thả vườn/gọi về · lắp–gỡ–xếp decor · báo đã chuyển khoản |
| `actions.ts` (nhánh admin) | admin | xác nhận cọc · gửi ảnh/video · đăng cập nhật · xoá media |
| `task-actions.ts` | **chủ chuồng** | giao việc (≤6 việc chờ/chuồng) · rút lại việc chưa ai làm |
| `worker-actions.ts` | **nông dân đúng việc** | hoàn thành (**bắt buộc ảnh/video**) · báo không làm được · gửi cập nhật ngày |
| `worker-profile-actions.ts` | **nông dân, hồ sơ của chính mình** | sửa hồ sơ cá nhân · thêm/xoá ảnh–video tự giới thiệu |
| `auth-actions.ts` | công khai / chủ chuồng | đăng ký OTP · đăng nhập · quên mật khẩu · hoàn trả chuồng |
| `admin-actions.ts` | **admin** (`ADMIN_PASSWORD` hoặc role ADMIN) | cấp tài khoản nông dân · đổi mật khẩu · tạm dừng nhận chuồng |
| `notification-actions.ts` | người đang đăng nhập | đánh dấu đã đọc · xoá thông báo của mình |

> Chi tiết từng hàm, ai gọi, sửa thì kéo theo gì: xem [CODEMAP.md](CODEMAP.md) §2, §3, §6.
