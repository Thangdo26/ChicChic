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
| `DATABASE_URL` | chuỗi **Transaction pooler** (6543, có `?pgbouncer=true&connection_limit=5`) |
| `DIRECT_URL` | chuỗi **Session pooler** (5432, host `…pooler.supabase.com`) |
| `NEXT_PUBLIC_HOLD_BANK` | vd `Vietcombank · 0123456789 · DO DINH THANG` |
| `NEXT_PUBLIC_HOLD_MOMO` | số MoMo nhận cọc |
| `ADMIN_PASSWORD` | mật khẩu vào `/admin` — **bắt buộc**: production thiếu biến này thì `/admin` trả **503** và mọi action admin bị từ chối |
| `RESEND_API_KEY` · `RESEND_FROM` | gửi email mã xác minh thật; bỏ trống → mã hiện trên màn hình (chế độ demo) |
| `SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` · `SUPABASE_BUCKET` | **kho ảnh/video**. Bỏ trống → nút "chụp ảnh" tự đổi thành ô dán đường dẫn (cô chú ngoài vườn không dùng được). Xem mục 3b. |
| `SEPAY_WEBHOOK_KEY` | **webhook ngân hàng**. Bỏ trống → `/api/webhooks/sepay` trả **503 (đóng)** và mọi khoản tiền quay về đối soát tay ở `/admin`. Xem mục 3c. |

4. **Deploy**. Build script `prisma generate && next build` chạy sẵn. Các trang đọc DB đã
   `force-dynamic` nên build **không cần** kết nối DB — chỉ runtime mới nối.

Xong: mở URL Vercel → `/` (landing), `/chuong`, `/nhan-chuong`, `/chuong/demo`, `/nong-trai`, `/admin`.

> ⚠️ Đổi schema thì phải làm **cả hai**: `npm run db:push` (đổi bảng ở Supabase) **và** deploy lại
> Vercel (đổi code). Làm một nửa thì bản đang chạy đọc cột chưa tồn tại → 500.

## 3b. Kho ảnh/video (Supabase Storage)

Không có bước này thì nông dân **không gửi được ảnh minh chứng** — mà "không minh chứng thì không xong"
là bất biến của sản phẩm. Cùng project Supabase ở mục 2, không cần nhà cung cấp mới:

1. Supabase → **Storage → New bucket**, tên `chicchic`, **bật "Public bucket"**
   (ảnh chuồng hiện trong thẻ `<img>` bình thường nên bucket phải đọc được tự do).
2. **Settings → API** → chép **Project URL** vào `SUPABASE_URL`.
3. Cùng trang, mục **service_role** → chép vào `SUPABASE_SERVICE_ROLE_KEY`.
   ⚠️ Key này **không bao giờ** để lộ ra client — chỉ dùng ở server để ký URL tải lên.
4. Đặt cả 3 biến trên Vercel rồi **deploy lại** (`next.config.mjs` đọc `SUPABASE_URL` lúc build
   để chốt danh sách host ảnh được phép).

Cách nó chạy: server chỉ **ký một URL dùng-một-lần**, file đi thẳng từ điện thoại lên Supabase —
không qua hàm serverless (body Vercel giới hạn ~4,5MB, một video 30 giây vượt xa mức đó).
Ảnh được **nén ngay trên máy** xuống ≤1600px trước khi tải; video không nén được trên trình duyệt
nên bị chặn ở **25MB**.

## 3c. Webhook ngân hàng (SePay) — tiền về là tự xác nhận

Bỏ qua được: không cấu hình thì app quay về đối soát tay, vẫn chạy đúng. Hướng dẫn đầy đủ (4 màn
của SePay, cách test, cách đọc kết quả) ở **[mục D4 của HUONG-DAN-SETUP-DEPLOY.md](./HUONG-DAN-SETUP-DEPLOY.md#d4-webhook-ngân-hàng-sepay--tiền-về-là-tự-xác-nhận)**. Bản rút gọn:

1. Sinh khoá: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Đặt cùng giá trị đó vào `SEPAY_WEBHOOK_KEY` trên Vercel **và** vào ô của SePay, rồi **deploy lại**
   (biến môi trường chỉ có hiệu lực từ lần build kế tiếp).
3. SePay → Tích hợp webhooks → Thêm Webhook:
   URL `https://<domain>/api/webhooks/sepay` · **Tiền vào** · **JSON** ·
   **bật** gửi lại khi lỗi · **bật** cảnh báo lỗi liên tiếp · xác thực **API Key**.
4. Kiểm: `curl -i -X POST https://<domain>/api/webhooks/sepay -d '{"id":"probe"}'` phải trả **401**.
   Trả 503 = chưa đặt biến; trả **200** = dừng lại, có gì đó rất sai.

⚠️ **Đừng chọn "Không xác thực".** Endpoint này mở khoá hàng đã trả tiền và nằm công khai trên
internet — để trống thì ai đoán được URL cũng POST được một giao dịch giả rồi tự kích hoạt chuồng.
Code đã fail-closed (thiếu khoá thì 503), nhưng cấu hình sai phía SePay thì code không cứu được.

Kết quả đối soát hiện ở khối **🏦 Tiền về tài khoản** trong `/admin` — ghi **mọi** khoản tiền vào,
kể cả khoản không bóc được mã, vì đó là bằng chứng duy nhất phía app khi khách nói "em chuyển rồi".

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
- `/admin` được khoá bằng **HTTP Basic Auth** (`middleware.ts` + `ADMIN_PASSWORD`).
  **Fail-closed**: production mà thiếu biến này thì trang trả 503 và `isAdmin()` từ chối mọi action.
  Chạy dev cục bộ thì vẫn vào được và hiện cảnh báo đỏ.
- `/api/webhooks/sepay` cũng **fail-closed**: thiếu `SEPAY_WEBHOOK_KEY` thì trả 503 chứ không mở tự do.
  Nếu khoá webhook bị lộ (dán nhầm vào chat, ảnh chụp màn hình, issue), **tạo lại khoá mới** trong
  SePay, cập nhật Vercel, deploy lại — khoá cũ mở khoá được hàng chưa trả tiền.
- Lưu ý: middleware chỉ khoá việc *render* trang `/admin`. Mỗi server action là một endpoint
  riêng, nên action ghi dữ liệu ở `/admin` phải tự gọi `isAdmin()` — 5 action trong `actions.ts`
  dùng `denyIfNotAdmin()`, `admin-actions.ts` gọi `isAdmin()` trực tiếp.
- **`NODE_ENV` phải là `production` trên Vercel** (mặc định đã đúng). Nó quyết định 3 thứ:
  fail-closed của `/admin`, nhãn "Bản demo" ở thanh trên, và nút dev "Đặt END_OF_LAY".
- `SUPABASE_SERVICE_ROLE_KEY` chỉ được đọc ở server (`lib/storage.ts`). Không đặt tên biến bắt đầu
  bằng `NEXT_PUBLIC_` cho key này — làm thế là đẩy quyền ghi toàn bộ kho ảnh ra trình duyệt.
