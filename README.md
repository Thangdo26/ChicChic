# 🐔 ChicChic

**Nhận nuôi một chuồng gà thật ở quê, chăm qua app.** Đặt mua trước nông sản + dịch vụ nuôi hộ — *không phải đầu tư, không hứa lợi nhuận*.

[![CI](https://github.com/Thangdo26/ChicChic/actions/workflows/ci.yml/badge.svg)](https://github.com/Thangdo26/ChicChic/actions/workflows/ci.yml)

Next.js 14 (App Router) · TypeScript · Prisma + PostgreSQL. **Chỉ 4 runtime dependency**
(`next` `react` `react-dom` `@prisma/client`) — xác thực, mật khẩu scrypt, OTP, phiên đăng nhập,
đo đạc và ký URL tải ảnh đều tự viết bằng `node:crypto` + `fetch`.

**Trạng thái:** PoC chạy được với 3 vai đầy đủ. Vận hành thật được cho một cohort nhỏ, **chưa
thương mại hoá được** — xem [Việc cần làm tiếp](#việc-cần-làm-tiếp) để biết 3 thứ còn chặn.

> 🗺️ **Sắp sửa code? Đọc [`CODEMAP.md`](./CODEMAP.md) trước** — bản đồ module/hàm/luồng dữ liệu:
> route nào qua cổng quyền nào, chỗ nào được ghi DB, sửa một thứ thì kéo theo những gì.
> 🚀 **Deploy lên chạy thật** (Vercel + Supabase): [`HUONG-DAN-SETUP-DEPLOY.md`](./HUONG-DAN-SETUP-DEPLOY.md) (chi tiết, từ số 0) · [`DEPLOY.md`](./DEPLOY.md) (bản ngắn).
> 🧭 **Định vị sản phẩm & chiến lược**: [`ChicChic-Playbook-PoC-MVP.md`](./ChicChic-Playbook-PoC-MVP.md) — §8.6 đối chiếu cái đã build với cái đã hoạch định.
> ✅ **CI** tự chạy type-check + lint + `prisma db push` + build trên mỗi push vào `main` và mọi PR.

---

## Ý tưởng cốt lõi — đọc cái này trước

> **App không đổi hiện thực.** Người dùng bấm nút → *tạo việc* cho nông dân.
> Nông dân làm ngoài đời → **bắt buộc đính ảnh/video** mới đóng được việc.
> `Barn.outside` chỉ đổi bên trong `completeTask`.

Đây vừa là **lá chắn chống-đa-cấp** (ở VN, mô típ "nuôi gà online → nạp tiền" đã bị hàng loạt app
lừa đảo đốt cháy) vừa là **cỗ máy nội dung**: mỗi thao tác của người dùng đẻ ra một ảnh thật.
Ràng buộc này được cưỡng chế ở tầng code (`BarnTask.proofMediaId` unique), không phải chỉ nằm
trong lời hứa marketing. **Giữ nguyên nó khi mở rộng.**

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

# 3. Tạo schema + seed dữ liệu demo
#    (5 nông dân, 2 giống, 3 feeding preset, 10 SKU decor, 3 chuồng demo, ảnh/video, nhiệm vụ)
npm run db:push
npm run db:seed

# 4. Chạy
npm run dev     # http://localhost:3000
```

**Lệnh hay dùng**

| Lệnh | Việc |
|---|---|
| `npm run dev` | chạy ở `localhost:3000` |
| `npx tsc --noEmit` | **bắt buộc chạy trước khi commit** |
| `npm run lint` | ESLint |
| `npm run build` | `prisma generate` + `next build` |
| `npm run db:push` | đẩy schema (không dùng migration file) |
| `npm run db:seed` | seed lại — **toàn `upsert`, không xoá gì** |
| `npm run db:reset` | ⚠️ `--force-reset` — **xoá sạch DB** rồi seed lại. Đừng chạy trên DB thật. |

> Chỉ landing (`/`) chạy được khi chưa có DB. Mọi trang còn lại đều cần bước 2–3 —
> kể cả `/nhan-chuong`, vì nó phải đọc danh sách nông dân còn chỗ.
>
> Tài khoản seed (mật khẩu đều `chicchic123`): chủ chuồng `demo@chicchic.vn` ·
> nông dân đăng nhập bằng **tên đăng nhập** `colan` `chutam` `anhdung` (`chihoa` đang bị tạm dừng
> để thử luồng khoá tài khoản). Chuồng demo: `/chuong/demo` (gà đẻ) · `/chuong/demo-thit` (gà thịt) ·
> `/chuong/demo-cuoi-ky` (đang ở `END_OF_LAY`).

### Biến môi trường

Mẫu đầy đủ kèm chú thích ở [`.env.example`](./.env.example). Tóm tắt:

| Biến | Bắt buộc? | Bỏ trống thì sao |
|---|---|---|
| `DATABASE_URL` · `DIRECT_URL` | ✅ | không trang nào ngoài `/` chạy được |
| `ADMIN_PASSWORD` | ✅ ở production | **`/admin` trả 503** và mọi action admin bị từ chối (fail-closed) |
| `SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` · `SUPABASE_BUCKET` | ✅ nếu có nông dân thật | nút 📸 chụp ảnh tự đổi thành ô dán URL — chạy thử được, **không dùng thật được** |
| `RESEND_API_KEY` · `RESEND_FROM` | — | mã OTP hiện thẳng trên màn hình (chế độ demo) |
| `NEXT_PUBLIC_HOLD_BANK` · `NEXT_PUBLIC_HOLD_MOMO` | — | banner cọc hiện chuỗi mặc định |

⚠️ `SUPABASE_SERVICE_ROLE_KEY` **đi vòng qua toàn bộ Row Level Security**. Chỉ đọc ở server
(`lib/storage.ts`); **đừng bao giờ** đặt tiền tố `NEXT_PUBLIC_` cho nó.

⚠️ `NODE_ENV` quyết định 3 thứ: fail-closed của `/admin` · nhãn "Bản demo" ở thanh trên ·
nút dev "Đặt END_OF_LAY". Đừng chạy production với `NODE_ENV=development`.

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
prisma/schema.prisma   # 24 model. Trục chính: Farm→Zone→Barn→Flock→Bird
                       #   Catalog:  Breed · FeedingPlan · DecorItem · HealthPackage
                       #   Nghiệp vụ: Reservation · BarnTask (proofMediaId ⭐) · BarnDecor ·
                       #             FarmUpdate (farmer stamp) · BarnMedia · HealthEvent ·
                       #             Product · LifecycleDecision
                       #   Người dùng: User · Session · EmailCode · FarmWorker · WorkerMedia
                       #   Hệ thống:  Notification (chuông) · Event (đo đạc)
prisma/seed.ts         # Dữ liệu demo — toàn upsert, chạy lại bao nhiêu lần cũng được
src/data/catalog.ts    # Giống, feeding preset, decor SKU, GIÁ MINH HOẠ (đổi ở đây)
src/lib/pricing.ts     # Single source of truth cho giá + tách 3 phần minh bạch
src/lib/db.ts          # Prisma client singleton — CỬA DUY NHẤT xuống DB
src/lib/auth.ts        # ⭐ Cổng quyền: requireUser / canViewBarn / requireWorker / activeWorkerSession
src/lib/admin.ts       # isAdmin() cho server action của /admin — fail-closed ở production
src/lib/notify.ts      # Cửa duy nhất ghi Notification
src/lib/track.ts       # Cửa duy nhất ghi Event (đo phễu & giữ chân) — nuốt lỗi như notify
src/lib/storage.ts     # Ký URL tải ảnh lên Supabase Storage (fetch trần, 0 dependency)
src/lib/task-store.ts  # Cửa duy nhất tạo BarnTask (gộp việc cùng loại đang chờ)
src/middleware.ts      # Basic Auth cho /admin — chỉ khoá RENDER, không khoá server action
src/app/*-actions.ts   # ⭐ Biên giới an ninh: kiểm quyền RỒI mới ghi
src/app/upload-actions.ts         # Ký URL tải lên — KHÔNG nhận file (body serverless ~4,5MB)
src/components/MediaUpload.tsx    # 📸 Chụp từ điện thoại, nén ảnh ≤1600px trước khi tải
src/components/Illustrations.tsx  # SVG: Coop, Chick, FarmerAvatar, DecorFigure, QR
src/app/globals.css    # Design tokens (xanh lúa + vàng lòng đỏ), font Be Vietnam Pro + Lora
```

**Bốn cửa duy nhất** — mọi thứ đi qua đây, đừng mở đường vòng:
`lib/db.ts` (xuống DB) · `lib/auth.ts` (cổng quyền) · `lib/task-store.ts` (tạo việc) ·
`lib/notify.ts` (thông báo) · `lib/track.ts` (đo đạc).

Chi tiết đầy đủ (ai gọi hàm nào, sửa gì thì gãy gì): [`CODEMAP.md`](./CODEMAP.md).

## Ảnh & video

Nông dân bấm 📸 → điện thoại mở **camera sau** → ảnh **nén ngay trên máy** về ≤1600px/JPEG 0.82
(12MP ~4MB → ~250KB) → tải **thẳng lên Supabase Storage** bằng URL đã ký, không đi qua hàm
serverless (body Vercel giới hạn ~4,5MB, một video 30 giây vượt xa mức đó).

| | |
|---|---|
| Ảnh | tự nén, có thanh phần trăm (cô chú đứng ngoài vườn sóng yếu) |
| Video | **không nén được** trên trình duyệt → chặn cứng **25MB** |
| Định dạng | jpg · jpeg · png · webp · heic · mp4 · mov · webm. **Không nhận SVG** |
| Chưa cấu hình kho | nút chụp tự đổi thành ô dán đường dẫn, app không kẹt |
| Còn thiếu | chưa có đường **xoá file khỏi kho** — xoá media chỉ xoá dòng DB, file vẫn nằm lại |

## Đo đạc

Bảng `Event` + [`src/lib/track.ts`](./src/lib/track.ts) ghi 11 sự kiện có tên cố định
(`barn_reserved` `deposit_confirmed` `task_done` `decor_installed` `barn_opened`…).
Hiện ở khối **📊 Nhịp 7 ngày** đầu trang `/admin`: người mở app · giữ chỗ · cọc đã xác nhận ·
việc đã giao · việc xong có ảnh · decor đã lắp, kèm tỉ lệ chuyển đổi giữ-chỗ → trả-tiền.

Tự làm thay vì gắn PostHog/GA: giữ kỷ luật ít phụ thuộc, và dữ liệu người dùng không rời khỏi DB
của mình. `track()` gọi **sau khi** ghi DB xong và tự nuốt lỗi — y hệt `notify()`.

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

## Quy ước khi sửa code

Bắt buộc, ghi ở [`CLAUDE.md`](./CLAUDE.md) và [CODEMAP §8](./CODEMAP.md#8-sửa-x-thì-đụng-vào-đâu):

1. **Đọc [`CODEMAP.md`](./CODEMAP.md) trước khi gõ dòng đầu tiên** — nhất là §8 (bảng tra cứu ngược),
   §9 (bất biến), §10 (bẫy đã gặp).
2. Thêm route / server action / bảng mới → **cập nhật CODEMAP §2/§3/§6/§8 trong cùng commit**.
   File đó lệch thực tế còn tệ hơn không có.
3. Action mới: dòng đầu là cổng quyền (`ownedBarn()` / `isAdmin()` / `activeWorkerSession()`),
   dòng cuối là `revalidateBarn()` + `notify()` cho phía bên kia.
4. Hằng số dùng chung để ở `lib/` client-safe — **không `export const` trong file `"use server"`**
   (Next chỉ cho export hàm async; `tsc` và `lint` **không bắt được**, chỉ mở trang mới lộ).
5. Action cần test tự động → nhận **tham số thường, không `FormData`**.
6. Trước khi commit: `npx tsc --noEmit` + `npm run lint` + **mở thử trang thật**.
7. Ngôn ngữ của repo là **tiếng Việt** — comment, thông báo cho người dùng, commit message.

> Xem thử màn kết chu kỳ: `/chuong/demo-cuoi-ky` (đã seed ở `END_OF_LAY`), hoặc vào `/admin` bấm
> **Đặt END_OF_LAY** cho một chuồng — nút đó **chỉ hiện khi `NODE_ENV !== "production"`**.
