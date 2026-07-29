# 🐔 ChicChic — Hướng dẫn setup & deploy (từ 0 đến chạy thật)

Làm lần lượt A → F. Ước tính ~30 phút. Miễn phí cho giai đoạn PoC.
Kiến trúc: **Vercel** (host Next.js) + **Supabase** (Postgres) + **GitHub** (code + CI).

---

## ✅ Checklist tổng
- [ ] A. Cài công cụ + chạy thử ở máy (local)
- [ ] B. Đưa code lên GitHub
- [ ] C. Tạo database Supabase, lấy 2 connection string
- [ ] D. Đẩy schema + seed lên Supabase
- [ ] E. Deploy lên Vercel + set biến môi trường
- [ ] F. Kiểm tra + khóa `/admin`

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
3. Vào **Project Settings → Database → Connection string → tab "URI"**. Cần **2 chuỗi**:

| Biến | Lấy từ | Cổng | Xử lý thêm |
|------|--------|------|-----------|
| `DATABASE_URL` | **Connection pooling** (Transaction mode) | **6543** | thêm `?pgbouncer=true&connection_limit=1` vào cuối |
| `DIRECT_URL` | **Direct connection** | **5432** | giữ nguyên |

Kết quả trông như:
```
DATABASE_URL="postgresql://postgres.abcd:MẬT_KHẨU@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.abcd:MẬT_KHẨU@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"
```

> **Vì sao 2 URL?** Vercel (serverless) mở rất nhiều kết nối ngắn → phải đi qua **pgBouncer** (pooled, 6543).
> Nhưng lệnh tạo bảng/migrate cần kết nối **direct** (5432). Prisma đọc `directUrl` cho các lệnh đó —
> đã cấu hình sẵn trong `prisma/schema.prisma`, ông chỉ cần điền đúng 2 giá trị.

---

## D. Đẩy schema + seed lên Supabase (chạy 1 lần, từ máy)

Dán 2 URL Supabase ở trên vào `.env`, rồi:
```bash
npm run db:push     # tạo bảng trên Supabase (qua DIRECT_URL)
npm run db:seed     # tạo cô Lan, giống, decor, chuồng demo
```
Kiểm tra: vào Supabase → **Table Editor**, thấy các bảng `Barn`, `Flock`, `FarmWorker`… là ok.

---

## E. Deploy lên Vercel

1. Vào [vercel.com](https://vercel.com) → **Add New → Project → Import** repo `chicchic`. Next.js được nhận diện tự động (giữ nguyên build/output mặc định).
2. Mở **Environment Variables**, thêm đủ 4 biến:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | chuỗi **pooled** (6543, có `?pgbouncer=true...`) |
| `DIRECT_URL` | chuỗi **direct** (5432) |
| `NEXT_PUBLIC_HOLD_BANK` | vd `Vietcombank · 0123456789 · DO DINH THANG` |
| `NEXT_PUBLIC_HOLD_MOMO` | số MoMo nhận cọc |

3. Bấm **Deploy**. Xong → mở URL Vercel: `/`, `/nhan-chuong`, `/chuong/demo`, `/admin`.

> Build **không cần** kết nối DB (các trang đọc DB đã `force-dynamic`), chỉ runtime mới nối Supabase.
> Về sau đổi schema: sửa `prisma/schema.prisma` → `npm run db:push` → push GitHub, Vercel tự deploy lại.

---

## F. Kiểm tra & khóa /admin (quan trọng)

- [ ] Mở `/nhan-chuong`, chọn chuồng, bấm giữ chỗ → kiểm tra Supabase có dòng `Reservation` mới.
- [ ] `/admin` đăng thử 1 update → `/chuong/demo` thấy update hiện lên.
- [ ] ⚠️ **`/admin` chưa có auth** — ai biết URL cũng đăng được. Khóa lại **trước khi** đưa link ra ngoài
  (tối thiểu một mật khẩu qua middleware, hoặc Vercel Password Protection ở bản trả phí).

---

## 🛠️ Lỗi thường gặp

| Triệu chứng | Nguyên nhân & cách sửa |
|-------------|------------------------|
| `P1001: Can't reach database server` | Sai host/mật khẩu/region trong URL, hoặc chưa thay `MẬT_KHẨU`. Copy lại từ Supabase. |
| `prepared statement "s0" already exists` | Thiếu `?pgbouncer=true` ở `DATABASE_URL` (pooled). Thêm vào là hết. |
| `Error validating datasource: the URL must start with postgresql://` | Dán nhầm ô, hoặc thiếu `DIRECT_URL`. Điền đủ cả 2. |
| `db push`/migrate treo hoặc lỗi qua pooler | Đảm bảo `DIRECT_URL` là bản **5432 direct**, không phải 6543. |
| Vercel build lỗi `prisma generate` | Hiếm; thử **Redeploy**. Đảm bảo `prisma` nằm ở devDependencies (đã có). |
| Seed báo `Unique constraint failed` (chạy lại lần 2) | Reset sạch: `npm run db:reset` (xóa + push + seed lại). |
| Chữ tiếng Việt bị vỡ dấu | Không xảy ra ở bản này (dùng Be Vietnam Pro + Lora, subset `vietnamese`). |

---

## Lệnh hay dùng (cheat sheet)

```bash
npm run dev         # chạy local
npm run db:push     # áp schema hiện tại lên DB
npm run db:seed     # nạp dữ liệu demo
npm run db:reset    # xóa sạch + push + seed lại
npm run build       # build production (như Vercel)
npm run lint        # kiểm tra lint
npx tsc --noEmit    # type-check
```
