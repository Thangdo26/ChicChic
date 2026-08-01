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

## Ba vai

| Vai | Vào bằng | Làm gì |
|---|---|---|
| **Khách / chủ chuồng** | tự đăng ký bằng email (OTP 6 số) | nhận nuôi chuồng, trang trí, giao việc, xem ảnh mỗi ngày |
| **Nông dân** | tài khoản **do admin cấp** (tên đăng nhập + mật khẩu), không tự đăng ký | nhận việc, làm xong gửi ảnh minh chứng, gửi tin hằng ngày, sửa hồ sơ cá nhân |
| **Admin (nông trại)** | `ADMIN_PASSWORD` qua HTTP Basic Auth | cấp tài khoản nông dân, đối soát cọc, đăng ảnh/ghi chú |

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
| `/admin` | Tài khoản nông dân · đối soát cọc · gửi ảnh · đăng cập nhật | `ADMIN_PASSWORD` |

Ba endpoint HTTP: `POST /api/reservations` (tạo chuồng) · `GET /api/barns/[slug]/payment` (poll trạng thái cọc) · `GET /api/notifications` (chuông 🔔 poll 20 giây).

## Cấu trúc

```
prisma/schema.prisma   # DATA MODEL: Farm→Zone→Barn→Flock→Bird + Breed/Feeding/Decor/
                       #   HealthEvent/Reservation/FarmUpdate (farmer stamp)/BarnTask/
                       #   Notification (chuông)/WorkerMedia (nông dân tự giới thiệu)
prisma/seed.ts         # Dữ liệu demo
src/data/catalog.ts    # Giống, feeding preset, decor SKU, GIÁ MINH HOẠ (đổi ở đây)
src/lib/pricing.ts     # Single source of truth cho giá + tách 3 phần minh bạch
src/lib/db.ts          # Prisma client singleton — CỬA DUY NHẤT xuống DB
src/lib/auth.ts        # ⭐ Cổng quyền: requireUser / canViewBarn / requireWorker
src/lib/admin.ts       # isAdmin() cho server action của /admin
src/lib/notify.ts      # Cửa duy nhất ghi Notification
src/lib/task-store.ts  # Cửa duy nhất tạo BarnTask (gộp việc cùng loại đang chờ)
src/app/*-actions.ts   # ⭐ Biên giới an ninh: kiểm quyền RỒI mới ghi
src/components/Illustrations.tsx  # SVG: Coop, Chick, FarmerAvatar, DecorFigure, QR
src/app/globals.css    # Design tokens (xanh lúa + vàng lòng đỏ), font Be Vietnam Pro + Lora
```

Chi tiết đầy đủ (ai gọi hàm nào, sửa gì thì gãy gì): [`CODEMAP.md`](./CODEMAP.md).

## Việc cần làm tiếp (gợi ý thứ tự vibe-code)

1. **Thay số giá thật** → `src/data/catalog.ts` (`BASE_PRICES`) sau khi điền unit economics.
2. **Vá 3 lỗ quyền còn lại** — `confirmPayment/addMedia/deleteMedia/postUpdate/setEndOfLay`
   trong `actions.ts` chưa kiểm role, `decideEndOfLay` chưa kiểm sở hữu, `GET /api/barns/[slug]/payment`
   chưa kiểm quyền. Xem [CODEMAP §11](./CODEMAP.md).
3. **Bàn giao chuồng sang nông dân khác** — tạm dừng một cô/chú đang giữ chuồng thì chuồng đó
   im tin, mà chưa có nút chuyển người; hiện phải sửa `Barn.workerId` tay.
4. **Upload media thật**: mọi ảnh/video hiện là **dán URL** (Supabase Storage / YouTube).
   Cắm luồng upload trực tiếp để nông dân chụp xong gửi thẳng từ điện thoại.
5. **Thông báo đẩy thật**: chuông đang **poll 20 giây**, đóng tab là không nhận được gì.
6. **Thanh toán vẫn ngoài app**: giữ chỗ ghi `Reservation(status=HELD)`, đối soát tay ở `/admin`.
   Tích hợp MoMo/VNPay để sau.
7. **Chip/tag**: field `Bird.chipId` để sẵn cho RFID (MVP+); PoC dùng `tagCode` (vòng chân màu + số).

## Nguyên tắc giữ khi mở rộng

- **Không minh chứng thì không xong.** `BarnTask.status = DONE` luôn kèm `proofMediaId` —
  nút "hoàn thành" khoá ở giao diện *và* server từ chối khi thiếu ảnh/video.
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

> Xem thử màn kết chu kỳ: `/chuong/demo-cuoi-ky` (đã seed ở END_OF_LAY), hoặc vào `/admin` bấm **Đặt END_OF_LAY** cho một chuồng.
