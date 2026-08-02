# 🐔 ChicChic

**Nhận nuôi một chuồng gà thật ở quê, chăm qua app.** Đặt mua trước nông sản + dịch vụ nuôi hộ — *không phải đầu tư, không hứa lợi nhuận*.

Scaffold Next.js (App Router) + TypeScript + Prisma/PostgreSQL, dựng từ prototype demo. Đây là **nền để vibe-code tiếp**, không phải sản phẩm hoàn chỉnh.

![CI](https://github.com/<user>/chicchic/actions/workflows/ci.yml/badge.svg)

> 🗺️ **Sắp sửa code? Đọc [`CODEMAP.md`](./CODEMAP.md) trước** — bản đồ module/hàm/luồng dữ liệu:
> route nào qua cổng quyền nào, chỗ nào được ghi DB, sửa một thứ thì kéo theo những gì.
> 🚀 **Deploy lên chạy thật** (Vercel + Supabase): [`HUONG-DAN-SETUP-DEPLOY.md`](./HUONG-DAN-SETUP-DEPLOY.md) (chi tiết, từ số 0) · [`DEPLOY.md`](./DEPLOY.md) (bản ngắn).
> ✅ **CI** tự chạy type-check + lint + `prisma db push` + build trên mỗi push/PR (`.github/workflows/ci.yml`).

---

## Chạy nhanh

```bash
# 1. Cài deps
npm install

# 2. Tạo file env
cp .env.example .env
#   Sửa DATABASE_URL + DIRECT_URL. Local dùng chung 1 giá trị. DB nhanh nhất bằng Docker:
docker run --name chicchic-db -e POSTGRES_PASSWORD=chic -e POSTGRES_DB=chicchic -p 5432:5432 -d postgres:16
#   Hoặc dán connection string Supabase/Neon vào .env

# 3. Tạo schema + seed dữ liệu demo (4 nông dân, giống, decor, 3 chuồng, ảnh/video, nhiệm vụ)
npm run db:push
npm run db:seed

# 4. Chạy
npm run dev     # http://localhost:3000
```

> Chỉ landing (`/`) chạy được khi chưa có DB. Mọi trang còn lại đều cần bước 2–3 —
> kể cả `/nhan-chuong`, vì nó phải đọc danh sách nông dân còn chỗ.
>
> Tài khoản seed (mật khẩu đều `chicchic123`): chủ chuồng `demo@chicchic.vn` ·
> nông dân đăng nhập bằng **tên đăng nhập** `colan` `chutam` `anhdung` (`chihoa` đang bị tạm dừng).
>
> 📸 **Muốn nông dân chụp ảnh thẳng từ điện thoại** thì đặt thêm `SUPABASE_URL` ·
> `SUPABASE_SERVICE_ROLE_KEY` · `SUPABASE_BUCKET` (hướng dẫn trong `.env.example`, chi tiết ở
> [HUONG-DAN-SETUP-DEPLOY.md mục D2](./HUONG-DAN-SETUP-DEPLOY.md)). Bỏ trống thì nút chụp ảnh
> tự đổi thành ô dán đường dẫn — chạy thử được, nhưng **không dùng thật được**.

## Ba vai

| Vai | Vào bằng | Làm gì |
|---|---|---|
| **Khách / chủ chuồng** | tự đăng ký bằng email (OTP 6 số) | nhận nuôi chuồng, trang trí, giao việc, xem ảnh mỗi ngày |
| **Nông dân** | tài khoản **do admin cấp** (tên đăng nhập + mật khẩu), không tự đăng ký | nhận việc, làm xong gửi ảnh minh chứng, gửi tin hằng ngày, sửa hồ sơ cá nhân |
| **Admin (nông trại)** | `ADMIN_PASSWORD` qua HTTP Basic Auth | cấp tài khoản nông dân, đối soát cọc, đăng ảnh/ghi chú, xem nhịp 7 ngày |

## Các trang chính

| Đường dẫn | Màn | Ai vào được |
|-----------|-----|---------|
| `/` | Landing — định vị chống-scam, trust strip | công khai |
| `/dang-ky` · `/dang-nhap` · `/quen-mat-khau` | Tài khoản; ô đăng nhập nhận **email hoặc tên đăng nhập** | công khai |
| `/chuong` | **Cửa vào khu chuồng** — có chuồng thì chọn, chưa có thì mời nhận chuồng đầu tiên | đã đăng nhập |
| `/tai-khoan` | Chuồng của tôi + hoàn trả chuồng | chủ chuồng |
| `/nhan-chuong` | Chọn gà đẻ/thịt, giống, cám, đặt tên, **chọn nông dân** (bấm ⋯ xem hồ sơ), bảng "tiền đi về đâu" | đã đăng nhập |
| `/chuong/[slug]` | Dashboard chuồng: trạng thái, ra vườn/gọi về, giao việc, nhật ký | chủ chuồng · nông dân phụ trách · admin |
| `/chuong/[slug]/trang-tri` | Decor — xếp xong sinh việc "lắp trang trí" cho nông dân | ↑ (lắp/lưu cần xong cọc) |
| `/chuong/[slug]/nhat-ky` | Ảnh & video gom theo ngày | ↑ |
| `/chuong/[slug]/truy-xuat` | Truy xuất + QR + **thời gian ngừng thuốc** | ↑ |
| `/chuong/[slug]/ket-chu-ky` | **Kết chu kỳ đẻ**: thịt / nghỉ hưu / lứa mới — 3 lựa chọn ngang hàng | ↑ |
| `/nong-dan/[id]` | Hồ sơ nông dân + ảnh tự giới thiệu + phần công được trả | đã đăng nhập |
| `/nong-trai` | **Cổng nông dân** — chuồng phụ trách kèm trạng thái việc từng chuồng, hộp việc | nông dân |
| `/nong-trai/ho-so` | Hồ sơ cá nhân + ảnh/video tự giới thiệu | nông dân |
| `/admin` | **📊 Nhịp 7 ngày** · tài khoản nông dân · đối soát cọc · gửi ảnh · đăng cập nhật | `ADMIN_PASSWORD` |

Ba endpoint HTTP: `POST /api/reservations` (tạo chuồng) · `GET /api/barns/[slug]/payment` (poll trạng thái cọc — **chỉ chủ chuồng**) · `GET /api/notifications` (chuông 🔔 poll 20 giây).

## Cấu trúc

```
prisma/schema.prisma   # DATA MODEL: Farm→Zone→Barn→Flock→Bird + Breed/Feeding/Decor/
                       #   HealthEvent/Reservation/FarmUpdate (farmer stamp)/BarnTask/
                       #   Notification (chuông)/WorkerMedia (nông dân tự giới thiệu)
prisma/seed.ts         # Dữ liệu demo
src/data/catalog.ts    # Giống, feeding preset, decor SKU, GIÁ MINH HOẠ (đổi ở đây)
src/lib/pricing.ts     # Single source of truth cho giá + tách 3 phần minh bạch
src/lib/db.ts          # Prisma client singleton — CỬA DUY NHẤT xuống DB
src/lib/auth.ts        # ⭐ Cổng quyền: requireUser / canViewBarn / requireWorker / activeWorkerSession
src/lib/admin.ts       # isAdmin() cho server action của /admin — fail-closed ở production
src/lib/notify.ts      # Cửa duy nhất ghi Notification
src/lib/track.ts       # Cửa duy nhất ghi Event (đo phễu & giữ chân) — nuốt lỗi như notify
src/lib/storage.ts     # Ký URL tải ảnh lên Supabase Storage (fetch trần, 0 dependency)
src/lib/task-store.ts  # Cửa duy nhất tạo BarnTask (gộp việc cùng loại đang chờ)
src/app/*-actions.ts   # ⭐ Biên giới an ninh: kiểm quyền RỒI mới ghi
src/components/Illustrations.tsx  # SVG: Coop, Chick, FarmerAvatar, DecorFigure, QR
src/app/globals.css    # Design tokens (xanh lúa + vàng lòng đỏ), font Be Vietnam Pro + Lora
```

Chi tiết đầy đủ (ai gọi hàm nào, sửa gì thì gãy gì): [`CODEMAP.md`](./CODEMAP.md).

## Việc cần làm tiếp

✅ **Đợt 0 đã xong**: vá lỗ quyền admin · upload ảnh thật (Supabase Storage) · bảng `Event` đo đạc ·
gói "An tâm" bán được · bỏ claim tiêm phòng viết cứng.

Còn lại, xếp theo mức chặn:

1. 🔴 **Đàn gà không bao giờ lớn lên** — `Flock.stage` luôn ở `BROODING`, không có job nào đẩy sang
   `LAYING`/`END_OF_LAY` theo `cycleDays`. **Chuồng layer thật sẽ không bao giờ tới giai đoạn đẻ.**
2. 🔴 **Số trứng là số chết** — `Product.qty` không có lệnh `update` nào trong `src/`; ô "Trứng chu kỳ này"
   của mọi chuồng thật vĩnh viễn là 0.
3. 🔴 **Không có `Order`/`Delivery`/`Subscription`** — cọc xong là hết luồng: trứng/thịt không bao giờ
   được giao trong hệ thống, không có chu kỳ thu tiền tháng thứ hai.
4. 🟠 **Thay số giá thật** → `src/data/catalog.ts` (`BASE_PRICES`). Hiện LAYER thu ~1.750đ/quả trứng và
   BROILER 80k/con — **thấp hơn giá trị nông sản thị trường khoảng 3 lần**.
5. 🟠 **Nguồn thu hiển thị giá mà không thu**: decor (tối đa 460k/chuồng), phí nghỉ hưu 60k/tháng.
6. 🟠 **Bàn giao chuồng sang nông dân khác** — tạm dừng một cô/chú đang giữ chuồng thì chuồng đó
   im tin, mà chưa có nút chuyển người; hiện phải sửa `Barn.workerId` tay.
7. 🟡 **Thông báo đẩy thật**: chuông đang **poll 20 giây**, đóng tab là không nhận được gì.
8. 🟡 **Thanh toán vẫn ngoài app** — `transferCode()` đã sẵn sàng để webhook SePay/Casso khớp tự động.
9. 🟡 **QR truy xuất không quét được** (SVG tĩnh) và trang truy xuất nằm sau đăng nhập.
10. 🟡 **Chưa có test tự động**; `Bird.chipId` để sẵn cho RFID (MVP+).

Danh sách đầy đủ kèm vị trí dòng: [CODEMAP §11](./CODEMAP.md#11-khoảng-trống-đã-biết).

## Nguyên tắc giữ khi mở rộng

- **Không minh chứng thì không xong.** `BarnTask.status = DONE` luôn kèm `proofMediaId` —
  nút "hoàn thành" khoá ở giao diện *và* server từ chối khi thiếu ảnh/video.
  Kéo theo: **không bao giờ đưa lại nút "ảnh mẫu"** vào luồng hoàn thành việc. Ảnh dựng sẵn
  biến bất biến này thành hình thức; ảnh mẫu chỉ được nằm trong `prisma/seed.ts`.
- **Nói đúng những gì có trong sổ.** Không viết cứng khẳng định về nghiệp vụ ngoài đời
  (tiêm phòng, kiểm dịch) vào JSX — chưa có dữ liệu thì hiện "chưa cập nhật".
- **App không đổi hiện thực.** Nút của người dùng **tạo việc** cho nông dân, không tự đổi trạng thái.
  `Barn.outside` chỉ đổi bên trong `completeTask`, sau khi có người làm thật và gửi ảnh.
- **Đăng nhập trước mọi trang chuồng** — không có "xem thử ẩn danh", kể cả chuồng demo.
- **Decor gắn ở CHUỒNG** (`BarnDecor`), không ở con gà → không vỡ khi 1 con chết.
- **Mọi cập nhật đóng dấu nông dân** (`FarmUpdate.workerId`) — lớp niềm tin chống-đa-cấp.
- **Sức khỏe minh bạch**: thuốc tính giá gốc (`HealthEvent.medsCostVnd` + `vetNote`), có `evidenceUrl`, tôn trọng `withdrawalUntil`.
- **Ngôn ngữ chống-scam**: "đặt mua trước / nuôi hộ", tránh "đầu tư / lãi / lợi nhuận".

## Push lên GitHub của bạn

```bash
git remote add origin https://github.com/<user>/chicchic.git
git branch -M main
git push -u origin main
```

> Xem thử màn kết chu kỳ: `/chuong/demo-cuoi-ky` (đã seed ở END_OF_LAY), hoặc vào `/admin` bấm
> **Đặt END_OF_LAY** cho một chuồng — nút đó **chỉ hiện khi `NODE_ENV !== "production"`**.
