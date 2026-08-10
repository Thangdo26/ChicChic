# MEMORY — bàn giao sang đoạn chat mới

> Cập nhật: 2026-08-10 · Đối chiếu đợt **khép hai mắt xích hở** (nhận thịt → việc thật · bàn giao chuồng).
> File này **cố ý không chép lại `CODEMAP.md`**. CODEMAP trả lời *"code nằm đâu, sửa thì gãy gì"*.
> File này trả lời: ***đang ở đâu, làm gì tiếp, và cách làm việc trong repo này.***

---

## 0. Đọc gì, theo thứ tự

1. [CLAUDE.md](CLAUDE.md) — luật ngắn.
2. [CODEMAP.md](CODEMAP.md) — **§8** (sửa X thì đụng đâu) · **§9** (bất biến) · **§10** (bẫy đã gặp). Ba mục này phải xem **trước khi gõ dòng đầu tiên**.
3. File này.

> `KE-HOACH-DOT-TIEP-THEO.md` là **tài liệu lịch sử** — kế hoạch cho QR / yếm / sổ thu hoạch / chợ, đã làm xong hết. Đừng đọc nó như việc còn phải làm.

---

## 1. Sản phẩm, trong một đoạn

**ChicChic** — nhận nuôi một chuồng gà thật ở Ba Vì, chăm qua app: giao việc cho nông dân, nhận ảnh mỗi ngày, cuối chu kỳ chọn nhận thịt / cho nghỉ hưu / nuôi lứa mới. **Không phải kênh đầu tư, không cam kết lợi nhuận.** Ba trụ giữ sản phẩm đứng: *việc chỉ xong khi có ảnh minh chứng* · *nông dân là người thật xem được mặt* · *tin xấu cũng báo thật*.

Next.js 14 App Router · Prisma 5.22 · Supabase Postgres `ap-southeast-1` (pooler 6543) · Vercel ghim vùng `sin1`. Ngôn ngữ của **mọi thứ** trong repo — giao diện, comment, commit — là **tiếng Việt**.

---

## 2. Ba đợt gần nhất

| Commit | Việc |
|---|---|
| *(đợt này)* | **Kho ảnh chưa từng chạy được lần nào.** Chủ dự án báo "chọn ảnh JPG mà app kêu sai định dạng" ở cả máy tính lẫn điện thoại. Nguyên nhân: `signUpload` gửi mỗi header `Authorization`, thiếu `apikey` ⟹ với key Supabase **đời mới** (`sb_secret_…`) endpoint ký URL trả `400 Invalid Compact JWS`. Lúc phát hiện, **kho rỗng cả 5 thư mục** — chưa tấm ảnh minh chứng nào từng lên được. Sửa kèm: `signUpload` trả `reason` **tách bạch** (câu báo cũ đổ lỗi cho ảnh của người dùng) · **hai ô chọn file** — `capture` *thay thế* hộp chọn file nên điện thoại không có đường vào thư viện · chặn HEIC tại máy · đặt `Content-Type` lúc PUT · video 25→45MB (trần kho **50MB, đã đo**) |
| `421d16c` | **QR truy xuất thật** — `Illustrations.QRCode` là lưới ô vuông ngẫu nhiên **không mã hoá gì**, nằm đúng trang bán niềm tin; và trang truy xuất lại sau `requireUser` nên **người được tặng — người duy nhất cần kiểm chứng — không xem được**. Nay mỗi lô có `publicCode` + mã QR thật (`lib/qr.ts`) quét ra `/tx/<mã>` **công khai** (§7.14). Ranh giới lộ gì là bất biến mới **§9.31**. Component giả đã **xoá hẳn** |
| `ea46195` | **Lưới an toàn** — `npm test` (vitest, **70 phép kiểm, ~1 giây**, đã vào CI). Mỗi `it` trong `tests/bat-bien.test.ts` khoá **một dòng §9**. Chạy lần đầu đã bắt hai chỗ hành vi lệch với ý định code: `cleanLine({})` ra `"[object Object]"` (biến được thành tên chuồng qua lời gọi ngoài trình duyệt) và `clampQty(null)` rơi về *min* thay vì *mặc định*. ⚠️ **Cố ý không nối DB, không dựng máy chủ** ⟹ **không phủ cổng quyền và không phủ phép ghi DB** — xem CODEMAP §13 trước khi tin vào màu xanh |
| `d96252b` | **Nhận hàng tận nhà** — khép nốt vòng đời. Trước đó một lô chỉ có hai kết cục: bán trên chợ, hoặc `EXPIRED`; người nuôi 5 tháng **không có cách nào nhận trứng của chính mình**. Nay có `Address` + `LotStatus.CLAIMED` + `TaskKind.HANDOVER` (§7.13). `HANDOVER` **tách riêng** khỏi `DELIVER` — gộp thì một tấm ảnh đóng cả hai chuyến và tiền chợ được chi dựa trên ảnh của chuyến khác |
| `5854acd` | **Vòng nhắc** — việc nền thứ 5 (`lib/jobs.remindStuff`), thứ duy nhất trong cron **không đổi dữ liệu, chỉ nói**. Năm chuyện trước nay im lặng tuyệt đối: đàn hết chu kỳ chưa quyết định · **lô sắp hết hạn** (nhắc TRƯỚC, không báo sau) · việc nằm im quá lâu → nhắc **nông dân**, không mách chủ chuồng · hoá đơn `REPORTED` chưa đối soát · chuồng có nông dân tạm dừng. Bảng `Nudge` là chốt **"nhắc một lần, không nhắc mỗi ngày"** |
| `7a7cb7c` | **Khép hai mắt xích hở.** ① `TaskKind.HARVEST` — chọn "nhận thịt" nay **giao việc thật** cho nông dân, và việc đó **không tích xong được khi sổ thu hoạch còn trống** (§7.11). ② `admin-actions.reassignBarn` + khối "🔄 Chuồng đang không có người chăm" ở `/admin` — bàn giao chuồng của cô/chú đang tạm dừng, **kèm cả việc đang treo** (§7.12) |
| `d8108c7` | **Khép lứa gà thịt** — `/ket-chu-ky` mở cho cả hai dòng (trước chỉ gà đẻ, nuôi trọn lứa gà thịt xong không ai hỏi gì) · sửa nhánh `RENEW` đang làm hỏng dữ liệu (5 con cứng, đặt thẳng `LAYING`, giữ `vaccinatedAt` cũ) |
| `b7756d2` | **Việc nền theo ngày** (`GET /api/cron`, Vercel Cron) — job nền **đầu tiên** của repo: đàn gà lớn lên · nhả chỗ giữ trên chợ · đóng sổ lô quá hạn · huỷ hoá đơn trang trí bỏ quên |

Chi tiết nghiệp vụ của cron nằm ở **CODEMAP §7.10**, bất biến kèm theo ở **§9.30** và **§9.8** (chống dội chuông).
Hai vòng lặp mới ở **§7.11** và **§7.12**.

**DB thật đã đổi** (mọi thứ đều additive — xem trước bằng `prisma migrate diff --script` rồi mới `db push`):
`ALTER TYPE "TaskKind"` thêm `HARVEST` rồi `HANDOVER` · `ALTER TYPE "LotStatus"` thêm `CLAIMED` ·
`CREATE TABLE "Nudge"` · `CREATE TABLE "Address"` · `HarvestLot` thêm `claimedAt` + `deliverTo` + `publicCode`.

⚠️ Riêng `publicCode` (cột **unique**) đòi `--accept-data-loss` — đúng bẫy §10. Quy trình đã theo: xác minh cột **chưa tồn tại** và bảng **0 dòng** rồi mới chấp nhận. Lần sau gặp lại thì kiểm y như vậy, đừng gõ cờ đó theo phản xạ.

---

## 2b. Kế hoạch đang chạy

Đã làm xong: **① vòng nhắc ✅ → ② nhận hàng tận nhà ✅ → ③ lưới an toàn ✅ → ④ QR truy xuất thật ✅ (chủ dự án đã xác nhận quét được trên Vercel) → ⑤ sửa kho ảnh ✅**.

**Đợt tiếp theo, xếp theo giá trị** (chi tiết ở §4): nối nguồn thu (§11.13) · trải nghiệm chờ & trạng thái rỗng · hộp thư & thông báo (§11.6 §11.20) · siết an ninh và đối soát (§11.4 §11.19 §11.21) · test phủ cổng quyền (§11.18).

> ⚠️ **Đợt ⑤ còn nợ nghiệm thu trên máy thật.** Phần server đã chạy tròn vòng thật (ký → PUT → đọc lại → xoá, 28 phép/0 hỏng). Nhưng **hai nút chọn file, chặn HEIC và `Content-Type` là mã chạy trong trình duyệt** — không có trình duyệt nào trong tay để tự bấm. Checklist ở `HUONG-DAN-SETUP-DEPLOY` mục **L**, bước 1–5.

> 📌 **Bài học đắt nhất của đợt này, đừng quên:** `tsc` + `lint` + `npm test` + `build` **xanh hết** trong khi một tính năng chính chết câm. Bộ kiểm **không nối mạng** nên mọi biên giới với dịch vụ ngoài đều là vùng mù. Thứ đáng lẽ phải bắt được nó là một **phép kiểm định kỳ có nối mạng** — vẫn chưa có (§11.4).

---

## 3. ⚠️ Việc CHỦ DỰ ÁN phải làm tay — code không thay được

| Việc | Không làm thì sao |
|---|---|
| ~~🔴 Đặt **`CRON_SECRET`** trên Vercel~~ | ✅ **Xong, đã nghiệm thu** — `curl https://chic-chic-lac.vercel.app/api/cron` (không kèm khoá) trả **401**, tức biến đã có và cổng đang đóng đúng cách. (503 mới là chưa có biến.) |
| 🟠 Kiểm Vercel → Settings → Functions đã là **Singapore (sin1)** | Hàm chạy ở `iad1` thì mỗi lượt đi–về DB ~300ms thay vì vài ms. Đây là **đòn bẩy tốc độ lớn nhất**, chỉ hiệu lực từ lần deploy sau khi có `vercel.json` |
| 🔴 **Bấm thử tải ảnh trên điện thoại thật** sau khi deploy đợt ⑤ | Phần server đã kiểm tròn vòng, nhưng hai nút chọn file / chặn HEIC / `Content-Type` chạy **trong trình duyệt** — tôi không có trình duyệt để tự bấm. Checklist: `HUONG-DAN-SETUP-DEPLOY.md` mục **L** bước 1–5. Bước hay bị bỏ nhất là **bước 4** (mở bằng tài khoản khác xem ảnh có hiện không) — đó là bước duy nhất bắt được lỗi định dạng |
| 🟡 Thử tay **nhánh chợ của vòng ngóng tiền** (`CHICM…`) | Đây là chỗ tôi **chưa test được** (lúc chạy không có đơn chợ nào đang chờ). Đăng bán một lô → mua bằng tài khoản khác → chuyển khoản thật; màn hình phải tự đổi trong ~6 giây, không cần F5 |

---

## 4. Làm gì tiếp — xếp theo mức chặn

1. 🟠 **Lứa mới miễn phí** (§11.17) — `RENEW` không hỏi lại giống/số lượng/tên và **không tính lại tiền**.
2. 🟠 **Giao hàng chưa có phí và chưa có giới hạn khoảng cách** (§11.12) — nông trại chở miễn phí đi bất cứ đâu. Ổn ở Ba Vì + Hà Nội, sai ngay khi có khách tỉnh khác.
3. 🟠 **Test chưa phủ cổng quyền** (§11.18) — `npm test` phủ tầng logic, nhưng `canViewBarn` `threadAccess` `isAdmin` `requireWorker` và mọi phép ghi DB vẫn chỉ kiểm bằng tay. Muốn phủ nốt thì phải dựng máy chủ trong test (route tạm + phiên thật) — một tầng khác hẳn về chi phí.
4. 🟠 **Nguồn thu chưa nối** (§11.13) — phí nghỉ hưu 60k/tháng và gói An tâm 40k mới chỉ ghi sổ, chưa có cơ chế thu. **Đợt tiếp theo.**
5. 🟡 **QR đã thật nhưng chưa có bản in và chưa có đường thu hồi mã** (§11.15).
6. 🟡 **§11.31** — 50/66 câu lệnh mỗi lần tải trang là chi phí bắt tay pgBouncer. **Đừng đụng trước khi deploy đúng vùng** — rất có thể lúc đó không còn đáng quan tâm.

> Đã bịt trong ba đợt gần nhất, đừng làm lại: chọn nhận thịt không tạo việc (§11.10) · bàn giao chuồng (§11.9) · đàn `END_OF_LAY` im lặng · hoá đơn `REPORTED` bỏ quên không ai biết (§11.26) · lô hết hạn chỉ báo sau khi đã mất · **lô không bán được thì hết hạn rồi thôi** (§11.12).

Danh sách đầy đủ + lý do: **CODEMAP §11**.

---

## 5. Bốn luật hay bị phá nhất (đủ bộ ở §9)

- **§9.1 — Không minh chứng thì không xong.** `BarnTask.status = DONE` ⟹ `proofMediaId != null`. Chỉ chặn ở `completeTask`, đừng mở đường ghi `DONE` thứ hai.
- **§9.2 / §9.30 — App không đổi hiện thực.** Nút bấm **tạo việc**, không đổi trạng thái. Cái gì suy được từ lịch thì việc nền tự đổi; cái gì là sự thật ngoài đời thì **phải có ảnh**. Vì thế `LAYING` chỉ đến từ **quả trứng đầu tiên**, không bao giờ từ cuốn lịch.
- **§9.6 — Không tin client.** Giá, số lượng, vị trí decor: tính lại ở server.
- **§9.24 — Đổi trạng thái tiền là so-sánh-rồi-đặt** trong **một** câu lệnh (`updateMany` + xét `count`). Có nhiều đường chạy song song (admin bấm tay · webhook · việc nền).

---

## 6. Cách làm việc mà chủ dự án mong đợi

- **Tiếng Việt hết** — giao diện, comment, commit message (không dấu, kết bằng `Co-Authored-By`).
- **Đọc CODEMAP trước khi sửa; cập nhật CODEMAP trong CÙNG commit** khi thêm route / server action / bảng.
- **`npx tsc --noEmit` + `npm run lint` + `npm test` + `npm run build`** trước mỗi commit.
- **Đổi một dòng ở CODEMAP §9 thì rà lại `tests/bat-bien.test.ts`** — mỗi `it` ở đó khoá một dòng §9. Hai bên lệch nhau nghĩa là một trong hai đang nói dối.
- **Chạy thử THẬT rồi mới nói xong.** Dựng dữ liệu → gọi endpoint thật → kiểm DB → **dọn sạch**. Kiểm cả **phép âm tính** (thứ *không* được đụng vào), không chỉ nhánh thuận.
- **Không có số đo đáng tin thì nói thẳng là không đo được**, đừng công bố con số. (Đã có lần RTT trôi 282→557ms giữa phiên làm mọi phép so sánh vô nghĩa.)
- **Trước khi commit:** xoá script tạm, route tạm, phiên test, dữ liệu test; trả `lib/db.ts` về nguyên trạng nếu có bật log.
- **Không bao giờ in giá trị trong `.env`** — chỉ báo có/không và số ký tự. Chỉ `.env.example` được theo dõi trong git.
- Làm xong thì **commit và push luôn**, không đợi hỏi.

---

## 7. Bẫy của riêng cái máy này

| Bẫy | Cách qua |
|---|---|
| `.next` nằm trong thư mục OneDrive → `EPERM`/`EBUSY` | `taskkill //F //IM node.exe` rồi `rm -rf .next` |
| `EPERM query_engine-windows.dll.node` khi build | Dev server đang giữ file. Tắt node rồi build lại |
| PowerShell 5.1 `Get-Content`/`Set-Content` **phá sạch dấu tiếng Việt** | Dùng Read/Write của agent. Lỡ hỏng thì `git checkout -- <file>` |
| Cổng 3000–3002 hay bận | Dev thử thì `npx next dev -p 3007` |
| **DB là Supabase THẬT, có dữ liệu thật của chủ dự án** | Mọi script test phải snapshot → sửa → **trả về nguyên trạng**. Đừng bao giờ `db:reset` |
| Server action nhận `FormData` **không gọi được từ ngoài trình duyệt** | Dựng **route tạm** gọi vào action + cookie phiên thật trong DB (route là request thật nên `cookies()`/`revalidatePath` chạy được). Xoá route tạm rồi `rm -rf .next` |
| Ổ C: từng đầy **0 byte** giữa phiên | Nếu ghi file lỗi `ENOSPC`: `npm cache clean --force`, xoá `.next` |
| Muốn kiểm thứ gì **trên bản đã deploy** | Tên miền là **`https://chic-chic-lac.vercel.app`** — không ghi ở đâu trong code cả, nên trước đây mỗi lần cần lại phải đi hỏi |
| Kiểm một lời gọi ra **dịch vụ ngoài** (Supabase Storage, SePay, Resend) | `npm test` **không nối mạng** ⟹ mù hoàn toàn ở đây. Cách đã dùng và hiệu quả: script `.mts` tạm ở gốc repo, tự nạp `.env`, rồi `await import("./src/lib/<file>.js")` để gọi **đúng hàm thật** thay vì chép lại logic. Chạy bằng `npx tsx`. Đổi `process.env` rồi import lại **trong cùng tiến trình là vô ích** (ESM trả bản cũ) — phải `execFileSync` một tiến trình riêng |

---

## 8. Mở đầu đoạn chat mới thế nào

> *"Đọc `CLAUDE.md`, `CODEMAP.md` (§8 §9 §10) và `MEMORY.md` ở gốc repo trước đã. Xong rồi nói tôi nghe đang ở đâu và ông định làm gì tiếp."*

Rồi chọn một mục ở **§4** bên trên. `CRON_SECRET` đã xong và đã nghiệm thu (§3), nên không còn gì bị chặn bởi biến môi trường nữa.
