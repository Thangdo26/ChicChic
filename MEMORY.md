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
| *(đợt này)* | **Khép hai mắt xích hở.** ① `TaskKind.HARVEST` — chọn "nhận thịt" nay **giao việc thật** cho nông dân, và việc đó **không tích xong được khi sổ thu hoạch còn trống** (§7.11). ② `admin-actions.reassignBarn` + khối "🔄 Chuồng đang không có người chăm" ở `/admin` — bàn giao chuồng của cô/chú đang tạm dừng, **kèm cả việc đang treo** (§7.12) |
| `d8108c7` | **Khép lứa gà thịt** — `/ket-chu-ky` mở cho cả hai dòng (trước chỉ gà đẻ, nuôi trọn lứa gà thịt xong không ai hỏi gì) · sửa nhánh `RENEW` đang làm hỏng dữ liệu (5 con cứng, đặt thẳng `LAYING`, giữ `vaccinatedAt` cũ) |
| `b7756d2` | **Việc nền theo ngày** (`GET /api/cron`, Vercel Cron) — job nền **đầu tiên** của repo: đàn gà lớn lên · nhả chỗ giữ trên chợ · đóng sổ lô quá hạn · huỷ hoá đơn trang trí bỏ quên |

Chi tiết nghiệp vụ của cron nằm ở **CODEMAP §7.10**, bất biến kèm theo ở **§9.30**.
Hai vòng lặp mới ở **§7.11** và **§7.12**; đợt này có `db push` một câu `ALTER TYPE "TaskKind" ADD VALUE 'HARVEST'` (đã chạy trên DB thật).

---

## 3. ⚠️ Việc CHỦ DỰ ÁN phải làm tay — code không thay được

| Việc | Không làm thì sao |
|---|---|
| 🔴 Đặt **`CRON_SECRET`** trên Vercel rồi **Redeploy** | `/api/cron` trả 503 (đóng) ⟹ **cả hai đợt trên nằm im**: đàn gà kẹt "đang úm", chỗ giữ trên chợ không tự nhả, hoá đơn bỏ quên giữ hàng mãi. Hướng dẫn: `HUONG-DAN-SETUP-DEPLOY.md` mục **J** |
| 🟠 Kiểm Vercel → Settings → Functions đã là **Singapore (sin1)** | Hàm chạy ở `iad1` thì mỗi lượt đi–về DB ~300ms thay vì vài ms. Đây là **đòn bẩy tốc độ lớn nhất**, chỉ hiệu lực từ lần deploy sau khi có `vercel.json` |
| 🟡 Thử tay **nhánh chợ của vòng ngóng tiền** (`CHICM…`) | Đây là chỗ tôi **chưa test được** (lúc chạy không có đơn chợ nào đang chờ). Đăng bán một lô → mua bằng tài khoản khác → chuyển khoản thật; màn hình phải tự đổi trong ~6 giây, không cần F5 |

---

## 4. Làm gì tiếp — xếp theo mức chặn

1. 🟠 **Lô không bán được thì hết hạn rồi thôi** (§11.12) — chưa có `Address`/giao hàng cho *chính chủ chuồng*. Cron giờ bắn thông báo "lô đã hết hạn" mà người ta **không có cách nào nhận hàng** ⟹ đang là một ngõ cụt. **Mắt xích hở dài nhất còn lại.**
2. 🟠 **Lứa mới miễn phí** (§11.17) — `RENEW` không hỏi lại giống/số lượng/tên và **không tính lại tiền**.
3. 🟠 **Đàn `END_OF_LAY` mà chủ chuồng không quyết định gì thì nằm đó vô hạn** (§11.10) — không có nhắc, không có mặc định. Cron (§7.10) là chỗ hợp lý để thêm một dòng nhắc; cùng chỗ đó nhắc luôn **chuồng đang kẹt chưa bàn giao** (§11.9) và **việc `HARVEST` bị bỏ quên**.
4. 🟡 **0 file test** (§11.18) — cách đang dùng là script `.mjs` tạm + route tạm rồi xoá. Đợt vừa rồi chạy **25 phép kiểm** kiểu đó và bắt được lỗi thật, nhưng **không chạy lại được** ở lần sửa sau — đó mới là thứ test tự động dùng để làm.
5. 🟡 **§11.31** — 50/66 câu lệnh mỗi lần tải trang là chi phí bắt tay pgBouncer. **Đừng đụng trước khi deploy đúng vùng** — rất có thể lúc đó không còn đáng quan tâm.

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
- **`npx tsc --noEmit` + `npm run lint` + `npm run build`** trước mỗi commit.
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

---

## 8. Mở đầu đoạn chat mới thế nào

> *"Đọc `CLAUDE.md`, `CODEMAP.md` (§8 §9 §10) và `MEMORY.md` ở gốc repo trước đã. Xong rồi nói tôi nghe đang ở đâu và ông định làm gì tiếp."*

Rồi chọn một mục ở **§4** bên trên. Nếu chưa đặt `CRON_SECRET` thì làm việc đó trước — hai đợt vừa rồi đang nằm im chờ đúng một biến môi trường.
