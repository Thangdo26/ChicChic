# 🐔 ChicChic — Hướng dẫn setup & deploy (từ 0 đến chạy thật)

Làm lần lượt A → F. Ước tính ~30 phút. Miễn phí cho giai đoạn PoC.
Kiến trúc: **Vercel** (host Next.js) + **Supabase** (Postgres) + **GitHub** (code + CI).

---

## ✅ Checklist tổng
- [ ] A. Cài công cụ + chạy thử ở máy (local)
- [ ] B. Đưa code lên GitHub
- [ ] C. Tạo database Supabase, lấy 2 connection string ⚠️ **cả hai đều dùng pooler**
- [ ] D. Đẩy schema + seed lên Supabase
- [ ] D2. Tạo bucket Storage cho ảnh/video (tuỳ chọn, làm khi có ảnh thật)
- [ ] E. Deploy lên Vercel + set biến môi trường
- [ ] F. Kiểm tra + khóa `/admin` bằng `ADMIN_PASSWORD`

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
# 4. Tạo bảng + seed dữ liệu demo (cô Lan, giống, decor, 1 chuồng)
npm run db:push
npm run db:seed

# 5. Chạy
npm run dev      # mở http://localhost:3000
```
> Trang `/` và `/nhan-chuong` chạy **không cần DB**. Các trang `/chuong/demo`, `/admin` cần bước 4.

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
| `DATABASE_URL` | **Transaction pooler** | **6543** | thêm `?pgbouncer=true&connection_limit=1` vào cuối |
| `DIRECT_URL` | **Session pooler** | **5432** | giữ nguyên |

Cả hai đều có host dạng `aws-<n>-<region>.pooler.supabase.com` và username dạng
`postgres.<project-ref>` (project-ref là chuỗi ~20 ký tự riêng của project ông, **không phải** chữ `abcd`).

```
DATABASE_URL="postgresql://postgres.xxxxxxxxxxxx:MẬT_KHẨU@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
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
- **Gửi email thật** (miễn phí, ~5 phút):
  1. Tạo tài khoản ở [resend.com](https://resend.com) → **API Keys** → tạo key.
  2. Dán vào `.env` (và Environment Variables trên Vercel):
     ```
     RESEND_API_KEY="re_xxxxxxxx"
     RESEND_FROM="ChicChic <onboarding@resend.dev>"
     ```
  3. Chưa có domain riêng thì để nguyên `onboarding@resend.dev`. Có domain rồi thì verify
     domain trong Resend rồi đổi `RESEND_FROM` thành `ChicChic <no-reply@tên-miền-của-ông>`.

> Tài khoản demo có sẵn sau khi seed: **demo@chicchic.vn / chicchic123** (sở hữu 2 chuồng).

---

## E. Deploy lên Vercel

1. Vào [vercel.com](https://vercel.com) → **Add New → Project → Import** repo `chicchic`. Next.js được nhận diện tự động (giữ nguyên build/output mặc định).
2. Mở **Environment Variables**, thêm đủ 5 biến:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | chuỗi **Transaction pooler** (6543, có `?pgbouncer=true...`) |
| `DIRECT_URL` | chuỗi **Session pooler** (5432, host `…pooler.supabase.com`) |
| `NEXT_PUBLIC_HOLD_BANK` | vd `Vietcombank · 0123456789 · DO DINH THANG` |
| `NEXT_PUBLIC_HOLD_MOMO` | số MoMo nhận cọc |
| `ADMIN_PASSWORD` | mật khẩu vào `/admin` — **đặt trước khi chia link** |
| `RESEND_API_KEY` | gửi email mã xác minh thật (xem mục D3). Bỏ trống → mã hiện trên màn hình |

3. Bấm **Deploy**. Xong → mở URL Vercel: `/`, `/nhan-chuong`, `/chuong/demo`, `/admin`.

> Build **không cần** kết nối DB (các trang đọc DB đã `force-dynamic`), chỉ runtime mới nối Supabase.
> Về sau đổi schema: sửa `prisma/schema.prisma` → `npm run db:push` → push GitHub, Vercel tự deploy lại.

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
- [ ] **Riêng tư:** đăng xuất rồi mở chuồng của người khác → hiện màn 🔐 "Chuồng này của một bạn khác".
      3 chuồng demo (`isPublic`) vẫn công khai để ai cũng xem thử được.
- [ ] **Hoàn trả chuồng:** `/tai-khoan` → bấm `⋯` ở chuồng → *Hoàn trả chuồng cho trang trại* →
      phải **gõ đúng nguyên văn** câu `Xác nhận hoàn trả chuồng cho trang trại` thì nút mới bật.
- [ ] Mở `/chuong/demo/trang-tri` → kéo thử một món decor sang chỗ khác → **Lưu bố cục này** →
      quay lại `/chuong/demo` thấy món đó nằm đúng chỗ vừa xếp.
- [ ] `/admin` gửi thử 1 ảnh → `/chuong/demo` thấy ảnh trong khu **Hôm nay**.
- [ ] ⚠️ Đặt `ADMIN_PASSWORD` trên Vercel **trước khi** đưa link ra ngoài. Chưa đặt thì `/admin`
      mở tự do và tự hiện cảnh báo đỏ. Đặt rồi, trình duyệt sẽ hỏi mật khẩu (bỏ trống ô tên đăng nhập).

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

## 🗺️ Bản đồ màn hình

| Đường dẫn | Nội dung |
|-----------|----------|
| `/` | Trang giới thiệu, 4 điểm tin cậy |
| `/dang-ky` · `/dang-nhap` · `/quen-mat-khau` | Tài khoản: đăng ký qua mã email, đăng nhập, đặt lại mật khẩu |
| `/tai-khoan` | **Chuồng của tôi** — danh sách chuồng đã nhận nuôi, menu `⋯` để hoàn trả chuồng |
| `/nhan-chuong` | Chọn kiểu nuôi/giống/cám, đặt tên gà, bảng minh bạch giá, giữ chỗ |
| `/chuong/<slug>` | Bảng điều khiển chuồng: hình chuồng có decor, tiến độ, ảnh/video hôm nay, nhật ký |
| `/chuong/<slug>/trang-tri` | **Kéo-thả sắp xếp decor**, phóng to/thu nhỏ, lật, đổi lớp, gỡ món |
| `/chuong/<slug>/nhat-ky` | Toàn bộ ảnh & video gom theo ngày + tab nhật ký chăm sóc |
| `/chuong/<slug>/truy-xuat` | Mã lô, QR, lịch sử sức khoẻ, tiền thuốc giá gốc, thời gian ngừng thuốc |
| `/chuong/<slug>/ket-chu-ky` | Cuối chu kỳ đẻ: nhận thịt / cho nghỉ hưu / nuôi lứa mới |
| `/nong-dan/<id>` | Hồ sơ nông dân, các chuồng đang chăm, ảnh & ghi chép gần đây |
| `/admin` | Gửi ảnh/video, đăng cập nhật, xem đơn giữ chỗ (có khoá mật khẩu) |
