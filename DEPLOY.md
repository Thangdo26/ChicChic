# 🚀 Deploy ChicChic — Vercel + Supabase

Đưa scaffold lên chạy thật, miễn phí cho giai đoạn PoC. Thời gian: ~20 phút.

Kiến trúc: **Vercel** (host Next.js) + **Supabase** (Postgres quản lý). Prisma nối tới
Supabase qua *pooled connection* lúc runtime và *direct connection* lúc `db push`/migrate.

---

## 1. Tạo database trên Supabase

1. Tạo project tại https://supabase.com (chọn region gần VN, vd Singapore).
2. Đặt **Database Password** (nhớ lại để dán vào connection string).
3. Vào **Project Settings → Database → Connection string → chọn tab "URI"**. Bạn cần **2** chuỗi:

| Dùng cho | Lấy ở | Ghi chú |
|----------|-------|---------|
| `DATABASE_URL` | **Connection pooling** (Transaction), cổng **6543** | thêm `?pgbouncer=true&connection_limit=1` vào cuối |
| `DIRECT_URL`   | **Direct connection**, cổng **5432** | dùng cho `db push` / migrate |

Ví dụ:
```
DATABASE_URL="postgresql://postgres.<ref>:<pass>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.<ref>:<pass>@aws-0-<region>.pooler.supabase.com:5432/postgres"
```
> Vì sao tách 2 URL: serverless (Vercel) mở rất nhiều kết nối ngắn → phải đi qua **pgBouncer** (pooled).
> Nhưng migrate/`db push` cần kết nối **direct** (pgBouncer không chạy được lệnh DDL nền). Prisma
> đọc `directUrl` cho các lệnh này — đã cấu hình sẵn trong `prisma/schema.prisma`.

## 2. Đẩy schema + seed lên Supabase (chạy 1 lần, từ máy bạn)

```bash
cp .env.example .env      # dán 2 URL Supabase ở trên vào
npm install
npm run db:push           # tạo bảng trên Supabase (dùng DIRECT_URL)
npm run db:seed           # tạo cô Lan, giống, decor, chuồng demo
```

## 3. Deploy lên Vercel

1. Push repo lên GitHub (xem README).
2. Vào https://vercel.com → **Add New → Project → Import** repo này. Next.js được nhận diện tự động.
3. Ở bước **Environment Variables**, thêm:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | chuỗi **pooled** (6543, có `?pgbouncer=true...`) |
| `DIRECT_URL` | chuỗi **direct** (5432) |
| `NEXT_PUBLIC_HOLD_BANK` | vd `Vietcombank · 0123456789 · DO DINH THANG` |
| `NEXT_PUBLIC_HOLD_MOMO` | số MoMo nhận cọc |

4. **Deploy**. Build script `prisma generate && next build` chạy sẵn. Các trang đọc DB đã
   `force-dynamic` nên build **không cần** kết nối DB — chỉ runtime mới nối.

Xong: mở URL Vercel → `/` (landing), `/nhan-chuong`, `/chuong/demo`, `/admin`.

## 4. Vòng lặp về sau

- **Đổi schema** → sửa `prisma/schema.prisma` → `npm run db:push` (hoặc chuyển sang migrate, mục dưới) → Vercel tự deploy lại khi push GitHub.
- **CI** (`.github/workflows/ci.yml`) tự chạy trên mỗi push/PR: `npm ci` → `prisma db push` (lên Postgres tạm) → type-check → lint → build. PR đỏ = biết ngay trước khi merge.

## 5. (Tùy chọn) Chuyển từ `db push` sang migrations có lịch sử

Khi muốn versioning schema nghiêm túc (khuyến nghị trước khi có user thật):
```bash
npx prisma migrate dev --name init      # tạo prisma/migrations/, commit vào repo
```
Rồi đổi build script thành `prisma generate && prisma migrate deploy && next build`
để mỗi lần deploy tự áp migration. `db push` phù hợp lúc đang thử nghiệm nhanh.

## Bảo mật nhắc nhở
- Không commit `.env` (đã có trong `.gitignore`).
- Bật **Row Level Security** trên Supabase khi mở API công khai (giai đoạn có auth).
- `/admin` hiện **chưa có auth** — thêm bảo vệ trước khi deploy công khai (xem README, việc số 2).
