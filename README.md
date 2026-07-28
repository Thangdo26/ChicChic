# 🐔 ChicChic

**Nhận nuôi một chuồng gà thật ở quê, chăm qua app.** Đặt mua trước nông sản + dịch vụ nuôi hộ — *không phải đầu tư, không hứa lợi nhuận*.

Scaffold Next.js (App Router) + TypeScript + Prisma/PostgreSQL, dựng từ prototype demo. Đây là **nền để vibe-code tiếp**, không phải sản phẩm hoàn chỉnh.

---

## Chạy nhanh

```bash
# 1. Cài deps
npm install

# 2. Tạo file env
cp .env.example .env
#   Sửa DATABASE_URL. DB nhanh nhất bằng Docker:
docker run --name chicchic-db -e POSTGRES_PASSWORD=chic -e POSTGRES_DB=chicchic -p 5432:5432 -d postgres:16
#   Hoặc dán connection string Supabase/Neon vào .env

# 3. Tạo schema + seed dữ liệu demo (cô Lan, giống, decor, 1 chuồng)
npm run db:push
npm run db:seed

# 4. Chạy
npm run dev     # http://localhost:3000
```

> Landing (`/`) và trang chọn chuồng (`/nhan-chuong`) chạy **không cần DB** (dùng catalog tĩnh).
> Các trang có backend cần bước 2–3: `/chuong/demo`, `/admin`.

## Các trang chính

| Đường dẫn | Màn | Backend |
|-----------|-----|---------|
| `/` | Landing — định vị chống-scam, trust strip, cô Lan | tĩnh |
| `/nhan-chuong` | Chọn chuồng: gà đẻ/thịt, giống, feeding, đặt tên, **bảng "tiền đi về đâu"**, giữ chỗ | POST `/api/reservations` |
| `/chuong/[slug]` | Dashboard chuồng: trạng thái, ra vườn/gọi về, cập nhật đóng dấu nông dân | Prisma |
| `/chuong/[slug]/trang-tri` | Decor — đặt món → "cô Lan lắp" + hiện lên chuồng | server action |
| `/chuong/[slug]/truy-xuat` | Truy xuất + QR + ghi chú **thời gian ngừng thuốc** | Prisma |
| `/nong-dan/[id]` | Hồ sơ nông dân + phần công được trả | Prisma |
| `/admin` | Nhập cập nhật tay (PoC) — *chưa có auth, thêm ở MVP* | server action |

## Cấu trúc

```
prisma/schema.prisma   # DATA MODEL: Farm→Zone→Barn→Flock→Bird + Breed/Feeding/Decor/
                       #   HealthPackage/HealthEvent/Reservation/FarmUpdate (farmer stamp)
prisma/seed.ts         # Dữ liệu demo
src/data/catalog.ts    # Giống, feeding preset, decor SKU, GIÁ MINH HOẠ (đổi ở đây)
src/lib/pricing.ts     # Single source of truth cho giá + tách 3 phần minh bạch
src/lib/db.ts          # Prisma client singleton
src/components/Illustrations.tsx  # SVG: Coop, Chick, FarmerAvatar, DecorFigure, QR
src/app/globals.css    # Design tokens (xanh lúa + vàng lòng đỏ), font Be Vietnam Pro + Lora
src/app/actions.ts     # Server actions: toggleRange, installDecor, postUpdate
```

## Việc cần làm tiếp (gợi ý thứ tự vibe-code)

1. **Thay số giá thật** → `src/data/catalog.ts` (`BASE_PRICES`) sau khi điền unit economics.
2. **Auth**: thêm cho `/admin` (và user login ở MVP — PoC không cần).
3. **Thanh toán vẫn ngoài app** ở PoC: nút giữ chỗ đã ghi `Reservation(status=HELD)`; đối soát tay, đổi sang `CONFIRMED`. Tích hợp MoMo/VNPay để sau.
4. **Media thật**: hiện `mediaUrl` là string. Cắm Supabase Storage / S3 cho ảnh/video update.
5. **Lifecycle layer cuối chu kỳ** (thịt/nghỉ hưu/lứa mới): đã có `FlockStage.END_OF_LAY` + `BirdStatus.RETIRED/HARVESTED` trong schema — dựng UI ở MVP+.
6. **Chip/tag**: field `Bird.chipId` để sẵn cho RFID (MVP+); PoC dùng `tagCode` (vòng chân màu + số).

## Nguyên tắc giữ khi mở rộng

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
