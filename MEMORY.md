# MEMORY - bàn giao sang đoạn chat mới

> Cập nhật: 2026-08-10 · Đối chiếu **Đợt 9 - chín mục chủ dự án nêu sau khi dùng thử**.
> File này **cố ý không chép lại `CODEMAP.md`**. CODEMAP trả lời *"code nằm đâu, sửa thì gãy gì"*.
> File này trả lời: ***đang ở đâu, làm gì tiếp, và cách làm việc trong repo này.***

---

## 0. Đọc gì, theo thứ tự

1. [CLAUDE.md](CLAUDE.md) - luật ngắn.
2. [CODEMAP.md](CODEMAP.md) - **§8** (sửa X thì đụng đâu) · **§9** (bất biến) · **§10** (bẫy đã gặp). Ba mục này phải xem **trước khi gõ dòng đầu tiên**.
3. File này.

> `KE-HOACH-DOT-TIEP-THEO.md` là **tài liệu lịch sử** - kế hoạch cho QR / yếm / sổ thu hoạch / chợ, đã làm xong hết. Đừng đọc nó như việc còn phải làm.

---

## 1. Sản phẩm, trong một đoạn

**ChicChic** - nhận nuôi một chuồng gà thật ở Ba Vì, chăm qua app: giao việc cho nông dân, nhận ảnh mỗi ngày, cuối chu kỳ chọn nhận thịt / cho nghỉ hưu / nuôi lứa mới. **Không phải kênh đầu tư, không cam kết lợi nhuận.** Ba trụ giữ sản phẩm đứng: *việc chỉ xong khi có ảnh minh chứng* · *nông dân là người thật xem được mặt* · *tin xấu cũng báo thật*.

Next.js 14 App Router · Prisma 5.22 · Supabase Postgres `ap-southeast-1` (pooler 6543) · Vercel ghim vùng `sin1`. Ngôn ngữ của **mọi thứ** trong repo - giao diện, comment, commit - là **tiếng Việt**.

---

## 2. Các đợt gần nhất

| Commit | Việc |
|---|---|
| *(đợt này)* | **Đường hoàn tiền (Đợt 10) - và một lỗ rò lòi ra ngay đầu đợt.** ⚠️ **Lỗ rò trước đã:** `returnBarn` đặt `ownerId = null`, mà `lib/auth` lại coi `!ownerId` là lý do cho xem - từ Đợt 9 `barnViewer` phục vụ **khách chưa đăng nhập**, nên ai hoàn trả chuồng thì tên chuồng + cả cuốn nhật ký ảnh **mở toang ra internet**. Đo thật bằng `curl` không cookie trên bản production: HTTP 200 kèm đủ nội dung, **3 chuồng thật** đang như vậy (§11.37). Đã bỏ `!ownerId` khỏi cả hai cổng, `tests/hoan-tien.test.ts` khoá lại bằng bề mặt mã nguồn. **Việc chính:** hoàn trả chuồng nay **ghi nợ phần tiền nuôi của những ngày chưa nuôi** (theo tỉ lệ ngày, trong **cùng transaction** với phép gỡ quyền sở hữu) · người mua báo hàng chợ không đúng trong **3 ngày** ⟹ ghi nợ **trọn giá kể cả phí** · bàn `↩️ Hoàn tiền` ở `/admin` (duyệt · từ chối có lý do · đóng sổ kèm ảnh biên lai và **số THẬT đã chuyển**). Câu cũ ở ô hoàn trả hứa *"cọc đối soát hoàn lại"* và câu trả về hứa *"hoàn lại theo chính sách"* - **cả hai đều rỗng**, nay nói thẳng con số. **DB thật đã đổi**: `CREATE TYPE RefundKind/RefundStatus` + `CREATE TABLE "Refund"` (thuần additive). 284 → **301** phép kiểm |
| `5b025da` | **Chín mục chủ dự án nêu sau khi dùng thử.** Ba commit: `a592435` (khách xem thử + bốn dòng cam kết bấm được + ẩn mời mọc + ô tài khoản ngân hàng) · `c49ef17` (sổ cân hằng tuần, đổi tên gà, nhờ cấp đông) · `5b025da` (ví & rút tiền). Chi tiết ở §2c bên dưới. **DB thật đã đổi**: `ALTER TYPE "TaskKind"` thêm `FREEZE` + `WEIGH` · `CREATE TABLE "WeighIn"` · `Payout` thêm `requestedAt`. Bất biến **§9.5 được NỚI** (khách xem được chuồng trưng bày) - đọc lại §9.5 trước khi đụng vào cổng quyền chuồng |
| `f8081f1` | **Trải nghiệm chờ & trạng thái rỗng (Đợt 8).** Repo có đúng **một** `loading.tsx` ở gốc, mang hình dạng **trang chuồng** - nên mở `/cho`, `/admin`, `/nong-trai` cũng thấy hình một cái chuồng vài giây rồi trang nhảy sang bố cục khác hẳn. Nay **19 khung chờ** dựng từ `components/Skeletons.tsx`, mỗi cái bám bố cục thật của route mình. Kèm ba chỗ khác: nút *"Xác nhận lựa chọn này"* ở màn kết chu kỳ (nút **nặng nhất và chạy lâu nhất** repo) trước đó là `<form action>` trần **không có phản hồi nào** → đổi sang `useTransition` · §11.24 câu ở màn đổi tên hứa tên mới hiện "trên **biển tên treo trước chuồng**" - đúng với hình VẼ, sai với tấm biển gỗ thật ngoài vườn → nói đúng phạm vi + chỉ đường nhắn cô chú · hồ sơ nông dân **chưa có ảnh nào** trước đó im lặng hoàn toàn, đọc ra thành "người này chưa làm gì bao giờ" ngay lúc khách đang chọn ai chăm chuồng mình. Bộ kiểm mới `tests/khung-cho.test.ts` (**bộ duy nhất đọc file nguồn**) 148 → **246** |
| `8ac9742` | **Thu tiền nuôi - lỗ doanh thu lớn nhất của repo (§7.16, §11.13).** Sản phẩm thu **đúng 50.000đ cọc** rồi thôi; toàn bộ `priceEstimateVnd` nằm im như con số ước tính không ai đòi, trong khi nông trại nuôi thật. Nay `BarnInvoice` + `PayKind` thứ năm (`CHICN…`) + webhook + `/admin` + gia hạn. **Gà thịt** một hoá đơn trọn lứa · **gà đẻ** một hoá đơn mỗi tháng (bảng giá in "/ tháng" từ đầu) · **cọc trừ vào kỳ đầu** (đã sửa mọi câu "cọc hoàn lại" cho khỏi nói dối). Phát hành khi chủ chuồng mở trang (`<InvoiceGate>`, **sau** khi render - render không được ghi) **và** trong cron (không mở app không được thành cách trốn tiền). Quá hạn 7 ngày → `<BarnUnpaid>` + `ownedBarn()` từ chối. Bất biến mới **§9.33** |
| `68c8e10` | **Nối nguồn thu - phí nuôi dưỡng đàn nghỉ hưu (§11.13, §7.15).** Màn kết chu kỳ **hứa** *"Phí nuôi dưỡng 60.000đ/tháng, đối soát tay như các khoản khác"* rồi bấm xong thì không có gì: không hoá đơn, không mã chuyển khoản, `/admin` không biết có ai vừa chọn nghỉ hưu. Một dòng `LifecycleDecision.retireFeeVnd = 60000` nằm im không ai đọc. Nay `CareOrder` + trang `/chuong/[id]/nghi-huu` + `PayKind` thứ tư (`CHICR…`) + webhook tự khớp + khối đối soát ở `/admin` + nhắc trước hạn trong cron. **Trả trước theo khối 3/6/12 tháng**, không phải hoá đơn hằng tháng (12 lần chuyển khoản tay/năm cho một đàn là một cỗ máy ma sát), và **không giảm giá theo khối**. Bất biến mới **§9.32** |
| `e6d0f1c` | **Kho ảnh chưa từng chạy được lần nào.** Chủ dự án báo "chọn ảnh JPG mà app kêu sai định dạng" ở cả máy tính lẫn điện thoại. Nguyên nhân: `signUpload` gửi mỗi header `Authorization`, thiếu `apikey` ⟹ với key Supabase **đời mới** (`sb_secret_…`) endpoint ký URL trả `400 Invalid Compact JWS`. Lúc phát hiện, **kho rỗng cả 5 thư mục** - chưa tấm ảnh minh chứng nào từng lên được. Sửa kèm: `signUpload` trả `reason` **tách bạch** (câu báo cũ đổ lỗi cho ảnh của người dùng) · **hai ô chọn file** - `capture` *thay thế* hộp chọn file nên điện thoại không có đường vào thư viện · chặn HEIC tại máy · đặt `Content-Type` lúc PUT · video 25→45MB (trần kho **50MB, đã đo**) |
| `1af07d2` | **Video iPhone: có tiếng mà không có hình.** Chủ dự án tải lên được rồi nhưng video ra ô đen kèm tiếng nói. Soi thẳng hai file trong kho qua HTTP Range: cả hai là **H.265/HEVC** (`hvc1`) + tiếng AAC - Chrome/Windows giải mã được tiếng, không giải mã được hình, và **`onError` không kêu** nên không ai biết. **Cùng gốc với lỗi HEIC**: một công tắc *"High Efficiency"* trên iPhone đẻ ra cả hai. Thêm `lib/video.ts` đọc codec **thật trong file** (đi dọc hộp MP4 tìm `moov` - video iPhone để `moov` ở CUỐI nên không đọc đại vài MB đầu được) rồi chặn lúc chọn; video đã lỡ nằm trong sổ thì trình phát tự nhận ra bằng `videoWidth === 0`. Kèm: ô xem trước cũ nhét URL video vào `<img>` ⟹ **mọi video đều ra biểu tượng ảnh vỡ** (không lộ trên chuồng demo vì seed có sẵn `posterUrl`) |
| `421d16c` | **QR truy xuất thật** - `Illustrations.QRCode` là lưới ô vuông ngẫu nhiên **không mã hoá gì**, nằm đúng trang bán niềm tin; và trang truy xuất lại sau `requireUser` nên **người được tặng - người duy nhất cần kiểm chứng - không xem được**. Nay mỗi lô có `publicCode` + mã QR thật (`lib/qr.ts`) quét ra `/tx/<mã>` **công khai** (§7.14). Ranh giới lộ gì là bất biến mới **§9.31**. Component giả đã **xoá hẳn** |
| `ea46195` | **Lưới an toàn** - `npm test` (vitest, **70 phép kiểm, ~1 giây**, đã vào CI). Mỗi `it` trong `tests/bat-bien.test.ts` khoá **một dòng §9**. Chạy lần đầu đã bắt hai chỗ hành vi lệch với ý định code: `cleanLine({})` ra `"[object Object]"` (biến được thành tên chuồng qua lời gọi ngoài trình duyệt) và `clampQty(null)` rơi về *min* thay vì *mặc định*. ⚠️ **Cố ý không nối DB, không dựng máy chủ** ⟹ **không phủ cổng quyền và không phủ phép ghi DB** - xem CODEMAP §13 trước khi tin vào màu xanh |
| `d96252b` | **Nhận hàng tận nhà** - khép nốt vòng đời. Trước đó một lô chỉ có hai kết cục: bán trên chợ, hoặc `EXPIRED`; người nuôi 5 tháng **không có cách nào nhận trứng của chính mình**. Nay có `Address` + `LotStatus.CLAIMED` + `TaskKind.HANDOVER` (§7.13). `HANDOVER` **tách riêng** khỏi `DELIVER` - gộp thì một tấm ảnh đóng cả hai chuyến và tiền chợ được chi dựa trên ảnh của chuyến khác |
| `5854acd` | **Vòng nhắc** - việc nền thứ 5 (`lib/jobs.remindStuff`), thứ duy nhất trong cron **không đổi dữ liệu, chỉ nói**. Năm chuyện trước nay im lặng tuyệt đối: đàn hết chu kỳ chưa quyết định · **lô sắp hết hạn** (nhắc TRƯỚC, không báo sau) · việc nằm im quá lâu → nhắc **nông dân**, không mách chủ chuồng · hoá đơn `REPORTED` chưa đối soát · chuồng có nông dân tạm dừng. Bảng `Nudge` là chốt **"nhắc một lần, không nhắc mỗi ngày"** |
| `7a7cb7c` | **Khép hai mắt xích hở.** ① `TaskKind.HARVEST` - chọn "nhận thịt" nay **giao việc thật** cho nông dân, và việc đó **không tích xong được khi sổ thu hoạch còn trống** (§7.11). ② `admin-actions.reassignBarn` + khối "🔄 Chuồng đang không có người chăm" ở `/admin` - bàn giao chuồng của cô/chú đang tạm dừng, **kèm cả việc đang treo** (§7.12) |
| `d8108c7` | **Khép lứa gà thịt** - `/ket-chu-ky` mở cho cả hai dòng (trước chỉ gà đẻ, nuôi trọn lứa gà thịt xong không ai hỏi gì) · sửa nhánh `RENEW` đang làm hỏng dữ liệu (5 con cứng, đặt thẳng `LAYING`, giữ `vaccinatedAt` cũ) |
| `b7756d2` | **Việc nền theo ngày** (`GET /api/cron`, Vercel Cron) - job nền **đầu tiên** của repo: đàn gà lớn lên · nhả chỗ giữ trên chợ · đóng sổ lô quá hạn · huỷ hoá đơn trang trí bỏ quên |

Chi tiết nghiệp vụ của cron nằm ở **CODEMAP §7.10**, bất biến kèm theo ở **§9.30** và **§9.8** (chống dội chuông).
Hai vòng lặp mới ở **§7.11** và **§7.12**.

**DB thật đã đổi** (mọi thứ đều additive - xem trước bằng `prisma migrate diff --script` rồi mới `db push`):
`ALTER TYPE "TaskKind"` thêm `HARVEST` rồi `HANDOVER` · `ALTER TYPE "LotStatus"` thêm `CLAIMED` ·
`CREATE TABLE "Nudge"` · `CREATE TABLE "Address"` · `CREATE TABLE "CareOrder"` · `CREATE TABLE "BarnInvoice"` · `HarvestLot` thêm `claimedAt` + `deliverTo` + `publicCode`.

⚠️ Riêng `publicCode` (cột **unique**) đòi `--accept-data-loss` - đúng bẫy §10. Quy trình đã theo: xác minh cột **chưa tồn tại** và bảng **0 dòng** rồi mới chấp nhận. Lần sau gặp lại thì kiểm y như vậy, đừng gõ cờ đó theo phản xạ.

---

## 2b. Kế hoạch đang chạy

Đã làm xong: **① vòng nhắc ✅ → ② nhận hàng tận nhà ✅ → ③ lưới an toàn ✅ → ④ QR truy xuất thật ✅ → ⑤ sửa kho ảnh + video HEVC ✅ → ⑥ nối nguồn thu ✅ → ⑦ thu tiền nuôi + khoá chuồng ✅ → ⑧ trải nghiệm chờ ✅ → ⑨ chín mục chủ dự án nêu ✅ → ⑩ đường hoàn tiền ✅**.

Kèm trong đợt ⑤: **header an ninh** (`next.config.mjs`). Quét production thấy Vercel chỉ tự đặt `Strict-Transport-Security`, còn `X-Frame-Options` `X-Content-Type-Options` `Referrer-Policy` `Permissions-Policy` đều trống - app này có nút bấm-một-cái-là-xác-nhận-tiền nên không chắn iframe là mời clickjacking. **CSP cố ý chưa làm** (§11.32): đặt sai là trắng trang, phải có người soi console trình duyệt.

**Đợt tiếp theo, xếp theo giá trị** (chi tiết ở §4): **lứa mới miễn phí** (§11.17 - bấm RENEW không tính thêm đồng nào) · siết an ninh và đối soát (§11.19 §11.21 §11.32 - CSP nằm ở đây) · hộp thư & thông báo (§11.6 §11.20) · test phủ cổng quyền (§11.18).

> ✅ **Đợt ⑩ đã chạy thử THẬT trên DB thật**: **38 đạt / 0 hỏng** qua route tạm + phiên thật, gồm cả phép âm tính (gõ sai câu xác nhận · người khác hoàn trả chuồng của mình → **không đổi gì** · chưa đăng nhập · không phải người mua · ngoài cửa sổ 3 ngày · bấm hai lần → vẫn một dòng nợ · không phải admin · từ chối mà không ghi lý do · đóng sổ trước khi duyệt · gõ thừa số 0 → chặn · đóng sổ hai lần → chặn). Riêng lỗ rò kiểm thêm **33 phép** trên cả 3 chuồng thật đã hoàn trả (đều đóng) **và** 3 chuồng trưng bày (đều còn mở - không phá đồ Đợt 9). Dữ liệu tạm đã dọn, kiểm lại `Refund` toàn bảng = 0.

> 📌 **Một chỗ phép kiểm của TÔI sai, không phải code sai:** ba phép đầu ở nhóm lỗ rò báo HONG vì tôi đòi HTTP 3xx. Next **streaming** đã đẩy vỏ trang đi trước, nên `redirect()` thành lệnh phía client và mã trạng thái vẫn là 200 - đúng thứ đã ghi ở §11 từ đợt trước. Kiểm lại bằng **nội dung** (tên chuồng không có trong HTML, có lệnh chuyển sang `/dang-nhap`) thì đạt. Bài học: ở repo này **đừng bao giờ nghiệm thu cổng quyền bằng mã trạng thái**.

> ✅ **Đợt ⑧ đã đo THẬT trên bản build production** (`npx next start`, phiên thật rồi xoá): khung chờ ra **trước** nội dung thật trong cùng một phản hồi (`/nong-dan/<id>`: khung ở byte 3.244, nội dung ở byte 14.747) · mỗi route ra **số ô khung khác nhau** (chuồng 14 · chợ 7 · tài khoản 5 · truy xuất 4) tức đúng khung riêng chứ không phải khung chung · màn rỗng nông dân mới hiện đúng với dữ liệu thật (Chị Hoa, 0 ảnh). **Chưa kiểm được bằng mắt**: có bị giật khi trang thật hiện ra không, và nút *"Đang gửi tới nông trại…"* (chỉ hiện sau khi bấm "Chọn" nên curl không thấy). Checklist ở `HUONG-DAN-SETUP-DEPLOY` mục **O**.

> 📌 **Một chỗ tôi suýt làm sai trong đợt ⑧, đáng nhớ:** đã viết `useFormStatus` với lý lẽ *"giữ `<form action={…}>` cho trang bấm được khi JavaScript chưa tải xong"*. Lý lẽ đó **sai** - cái sheet chứa form chỉ mở ra bằng `onClick`, không có JS thì không ai tới được nó. Và `useFormStatus` là hook duy nhất trong repo **không kiểm được bằng curl** (nút chỉ tồn tại sau một cú bấm). Đã đổi về `useTransition`, đúng cách mọi nút khác trong repo đang làm. Bài học: một lập luận nghe hợp lý về "progressive enhancement" thì phải kiểm xem đường đi đó **có thật sự tồn tại** không.

> ✅ **Ảnh đã chạy** - chủ dự án xác nhận tải lên và xem lại được. Video tải lên được nhưng ra ô đen (phần 2 ở bảng trên).

> ✅ **Đợt ⑥ đã chạy thử THẬT trên DB thật**: 38 phép qua route tạm (cổng quyền, tiền tính ở server, idempotent, mua nối tiếp, huỷ) + 14 phép qua webhook SePay (sai khoá → 401, chuyển thiếu → MISMATCH không xác nhận, đủ tiền → MATCHED, gửi lại 7 lần không cộng thêm kỳ). Dữ liệu tạm đã dọn, kiểm lại `CareOrder` toàn bảng = 0.

> ⚠️ **Còn nợ nghiệm thu trên máy thật:** chặn HEIC, chặn HEVC, hai nút chọn file và ô xem trước video **đều là mã chạy trong trình duyệt** - không có trình duyệt nào trong tay để tự bấm. Checklist ở `HUONG-DAN-SETUP-DEPLOY` mục **L**. Riêng phần đọc codec thì đã chạy `soiVideo` lên **chính hai file iPhone thật** trong kho: nhận đúng `hvc1` trong 0–1ms, không gắn cờ nhầm ảnh JPG.

> 📌 **Hai bài học đắt nhất, đừng quên:**
> 1. `tsc` + `lint` + `npm test` + `build` **xanh hết** trong khi một tính năng chính chết câm. Bộ kiểm **không nối mạng** nên mọi biên giới với dịch vụ ngoài đều là vùng mù. Phép kiểm định kỳ có nối mạng: vẫn chưa có (§11.4).
> 2. **Chuồng demo có dữ liệu seed đầy đủ hơn dữ liệu thật** - `posterUrl` có sẵn ở seed nên lỗi "video ra ảnh vỡ" không bao giờ lộ khi thử trên demo. Thử tính năng media thì phải thử bằng **thứ mình vừa tải lên**, không phải thứ seed dựng sẵn.

---

## 2c. Đợt 9 - chín mục chủ dự án nêu

| # | Việc | Đã làm gì |
|---|---|---|
| 1 | Khách chưa đăng nhập xem thử chuồng | Nới **§9.5** qua `lib/auth.barnViewer`: ba trang chỉ-để-xem (chuồng · nhật ký ảnh · truy xuất) mở cho khách **khi `isPublic`**. Trước đó `prisma/seed.ts` đã ghi *"3 chuồng seed là chuồng trưng bày - khách chưa đăng nhập vẫn xem được"* nhưng `canViewBarn` gọi `requireUser` trước nên ý đó **chưa bao giờ chạy** |
| 2 | Gà thịt cập nhật cân nặng theo tuần | Bảng `WeighIn` + `TaskKind.WEIGH` + cron hẹn mỗi tuần + biểu đồ cột trên trang chuồng. **Không bịa số**: tuần chưa cân thì để trống |
| 3 | Ẩn "nhận thêm chuồng" khi đã có chuồng | Bỏ khỏi thanh điều hướng, danh sách chuồng, lưới lối tắt. **Giữ đúng một lối** ở `/tai-khoan` (§11.34) |
| 4 | Bốn dòng cam kết ở trang chủ phải bấm được | `lib/showcase.loiVaoChuong` → vào chuồng **của chính họ** nếu có, không thì chuồng trưng bày |
| 5 | Sửa được tên gà sau khi nhận chuồng | `actions.renameBird` + nút ✎ ngay tại dòng của con đó. Bỏ tên cũng là lựa chọn thật |
| 6 | Đăng bán mà chưa có tài khoản → dẫn tới ô điền | Ô điền mở **ngay tại chỗ**, dưới đúng cái lô đang muốn bán |
| 7 | Người bán nhận tiền và rút được | Ví ở `/cho/cua-toi` (rút được · đang giữ hộ · lỗi) + nút rút + `/admin` xếp người đã xin rút lên trước. ⚠️ **Giữ nguyên ký quỹ §9.29** - xem ô cảnh báo dưới bảng |
| 8 | Cấp đông cho chính mình | `TaskKind.FREEZE` + nút cạnh "Nhận về nhà" và "Bán lại". Một chiều, không rã đông |
| 9 | Chọn ngân hàng, tự điền tên chủ TK | `lib/banks.ts` 38 ngân hàng + BIN. Tra tên qua VietQR **chỉ hiện khi đã cấu hình khoá** - và đoạn đó **chưa chạy thử với khoá thật** (§11.35) |

> ⚠️ **Mục 7 tôi làm khác yêu cầu một chỗ, có chủ ý.** Yêu cầu là *"sau khi người mua chuyển khoản thành công thì người bán nhận được tiền"*. Tôi **giữ nguyên ký quỹ**: tiền chỉ rút được sau khi lô **giao tận tay và có ảnh trao tay** (§9.29). Lý do: đó là toàn bộ cơ chế bảo đảm của cái chợ và là lý do phí 20% tồn tại - bỏ nó đi thì người mua trả tiền xong không còn gì bảo vệ, và chính chủ dự án cũng là người mua trong nửa số giao dịch. Ví **hiện khoản đang giữ hộ ra** kèm câu giải thích, thay vì giấu. Muốn đổi thì nói, nhưng nên đọc §9.29 trước.

> 📌 **Đợt 10 - một quyết định về TIỀN cần chủ dự án biết, không phải một lỗi code.** Phần hoàn tiền tính trên `BarnInvoice.totalVnd` - đúng số người ta đã chuyển cho hoá đơn đó - nên **tiền cọc 50.000đ không nằm trong khoản hoàn**. Đó là thiết kế đã chốt từ trước (*"cọc đi vào tiền hàng chứ không giữ riêng rồi hoàn lại"*), và nay được **nói thẳng ra màn hình** ngay trước lúc bấm thay vì hứa suông. Nhưng hệ quả thật là: ai trả cọc rồi đổi ý sau một ngày vẫn mất trọn 50k. Muốn đổi thì đổi ở `lib/refunds.duKienHoanChuong` **và** câu chữ trong `BarnCardMenu` - đừng đổi một nửa.

> ⚠️ **Và một luật tôi suýt phá:** §9.29 có dòng *"không bao giờ hiện tổng thu tích luỹ của một người ở bất kỳ đâu"*. Bản nháp đầu của ví có ô "đã nhận" cộng dồn - đúng cái bảng điều khiển mà mọi app đa cấp đều có. Đã bỏ; `tests/vi-tien.test.ts` nay quét **bề mặt module** để chặn ai đó thêm lại.

## 3. ⚠️ Việc CHỦ DỰ ÁN phải làm tay - code không thay được

| Việc | Không làm thì sao |
|---|---|
| ~~🔴 Đặt **`CRON_SECRET`** trên Vercel~~ | ✅ **Xong, đã nghiệm thu** - `curl https://chic-chic-lac.vercel.app/api/cron` (không kèm khoá) trả **401**, tức biến đã có và cổng đang đóng đúng cách. (503 mới là chưa có biến.) |
| 🟠 Kiểm Vercel → Settings → Functions đã là **Singapore (sin1)** | Hàm chạy ở `iad1` thì mỗi lượt đi–về DB ~300ms thay vì vài ms. Đây là **đòn bẩy tốc độ lớn nhất**, chỉ hiệu lực từ lần deploy sau khi có `vercel.json` |
| 🔴 **Bấm thử tải ảnh trên điện thoại thật** sau khi deploy đợt ⑤ | Phần server đã kiểm tròn vòng, nhưng hai nút chọn file / chặn HEIC / `Content-Type` chạy **trong trình duyệt** - tôi không có trình duyệt để tự bấm. Checklist: `HUONG-DAN-SETUP-DEPLOY.md` mục **L** bước 1–5. Bước hay bị bỏ nhất là **bước 4** (mở bằng tài khoản khác xem ảnh có hiện không) - đó là bước duy nhất bắt được lỗi định dạng |
| 🔴 **Bấm thử 9 mục của Đợt 9 trên trình duyệt thật** | Phần server đã kiểm tròn vòng (40 phép âm+dương trên DB thật), nhưng nút bấm, ô chọn ngân hàng, biểu đồ cân nặng và ví thì **chạy trong trình duyệt** - tôi không có trình duyệt để tự bấm. Checklist: `HUONG-DAN-SETUP-DEPLOY` mục **P** |
| 🔴 **Bấm thử luồng hoàn tiền (Đợt 10) trên trình duyệt thật** | Phần server đã kiểm tròn vòng (38 phép âm+dương trên DB thật), nhưng ô xác nhận hoàn trả, bàn `↩️ Hoàn tiền` ở `/admin` và ô báo hàng hỏng ở `/cho/cua-toi` đều **chạy trong trình duyệt**. Checklist: `HUONG-DAN-SETUP-DEPLOY` mục **Q** |
| 🟠 **Ngó lại 3 chuồng đã hoàn trả** (`chuong-vt7tgo` `chuong-qi4ofm` `chuong-yktkna`) | Chúng từng **mở công khai** vì lỗ rò §11.37 - nay đã đóng, nhưng vẫn nằm đó **không chủ**: nông trại phải quyết giao lại cho ai (khối 🔄 ở `/admin`) hay để yên. Không có màn "đóng chuồng" nào trong app |
| 🟠 **Cân thử đàn `demo-thit` vài lần** | Chuồng trưng bày nay là thứ **khách vãng lai nhìn thấy đầu tiên**, và nó đang có một việc cân treo. Cân 2–3 lần là trang đó có một **biểu đồ lớn lên thật** để khoe - thứ thuyết phục hơn mọi dòng chữ (§11.36) |
| 🟡 Muốn bật **tra tên chủ tài khoản** thì phải có khoá VietQR | `VIETQR_CLIENT_ID` + `VIETQR_API_KEY` (my.vietqr.io). ⚠️ Đoạn này **chưa chạy thử với khoá thật** - bật lên rồi tra **đúng số tài khoản của chính mình** trước khi tin (§11.35). Không bật thì nút không hiện, app chạy bình thường |
| 🟡 Thử tay **nhánh chợ của vòng ngóng tiền** (`CHICM…`) | Đây là chỗ tôi **chưa test được** (lúc chạy không có đơn chợ nào đang chờ). Đăng bán một lô → mua bằng tài khoản khác → chuyển khoản thật; màn hình phải tự đổi trong ~6 giây, không cần F5 |

---

## 4. Làm gì tiếp - xếp theo mức chặn

1. 🟠 **Lứa mới miễn phí** (§11.17) - **việc đáng làm nhất hiện nay.** `RENEW` không hỏi lại giống/số lượng/tên và **không tính lại tiền**: bấm một cái là nuôi thêm trọn một lứa không mất đồng nào. Đây là lỗ doanh thu còn lại lớn nhất, và nó lệch về phía nông trại.
2. 🟠 **Giao hàng chưa có phí và chưa có giới hạn khoảng cách** (§11.12) - nông trại chở miễn phí đi bất cứ đâu. Ổn ở Ba Vì + Hà Nội, sai ngay khi có khách tỉnh khác.
3. 🟠 **Test chưa phủ cổng quyền** (§11.18) - `npm test` phủ tầng logic, nhưng `canViewBarn` `threadAccess` `isAdmin` `requireWorker` và mọi phép ghi DB vẫn chỉ kiểm bằng tay. **Đợt 10 vừa cho thấy giá của khoảng trống này**: lỗ rò §11.37 nằm ngay trong `canViewBarn`/`barnViewer` và cả bốn lệnh kiểm đều xanh suốt thời gian nó tồn tại. (Bộ `hoan-tien` nay khoá được **một** dòng của cổng đó bằng cách đọc mã nguồn - mẹo rẻ tiền, không thay được việc dựng máy chủ trong test.)
4. 🟡 **Hoàn tiền chưa có gì tự nhắc** (§11.38) - cron không đụng bảng `Refund`, nên một khoản `REQUESTED` bị người trực để quên thì nằm im mãi. Người đang chờ tiền là người ít kiên nhẫn nhất.
5. 🟡 **QR đã thật nhưng chưa có bản in và chưa có đường thu hồi mã** (§11.15).
6. 🟡 **§11.31** - 50/66 câu lệnh mỗi lần tải trang là chi phí bắt tay pgBouncer. **Đừng đụng trước khi deploy đúng vùng** - rất có thể lúc đó không còn đáng quan tâm.

> Đã bịt trong ba đợt gần nhất, đừng làm lại: **chuồng hoàn trả bị công khai (§11.37)** · **đường hoàn tiền (§11.13, §11.38)** · chọn nhận thịt không tạo việc (§11.10) · bàn giao chuồng (§11.9) · đàn `END_OF_LAY` im lặng · hoá đơn `REPORTED` bỏ quên không ai biết (§11.26) · lô hết hạn chỉ báo sau khi đã mất · **lô không bán được thì hết hạn rồi thôi** (§11.12).

Danh sách đầy đủ + lý do: **CODEMAP §11**.

---

## 5. Bốn luật hay bị phá nhất (đủ bộ ở §9)

- **§9.1 - Không minh chứng thì không xong.** `BarnTask.status = DONE` ⟹ `proofMediaId != null`. Chỉ chặn ở `completeTask`, đừng mở đường ghi `DONE` thứ hai.
- **§9.2 / §9.30 - App không đổi hiện thực.** Nút bấm **tạo việc**, không đổi trạng thái. Cái gì suy được từ lịch thì việc nền tự đổi; cái gì là sự thật ngoài đời thì **phải có ảnh**. Vì thế `LAYING` chỉ đến từ **quả trứng đầu tiên**, không bao giờ từ cuốn lịch.
- **§9.6 - Không tin client.** Giá, số lượng, vị trí decor: tính lại ở server.
- **§9.24 - Đổi trạng thái tiền là so-sánh-rồi-đặt** trong **một** câu lệnh (`updateMany` + xét `count`). Có nhiều đường chạy song song (admin bấm tay · webhook · việc nền).

---

## 6. Cách làm việc mà chủ dự án mong đợi

- **Tiếng Việt hết** - giao diện, comment, commit message (không dấu, kết bằng `Co-Authored-By`).
- **Đọc CODEMAP trước khi sửa; cập nhật CODEMAP trong CÙNG commit** khi thêm route / server action / bảng.
- **`npx tsc --noEmit` + `npm run lint` + `npm test` + `npm run build`** trước mỗi commit.
- **Đổi một dòng ở CODEMAP §9 thì rà lại `tests/bat-bien.test.ts`** - mỗi `it` ở đó khoá một dòng §9. Hai bên lệch nhau nghĩa là một trong hai đang nói dối.
- **Chạy thử THẬT rồi mới nói xong.** Dựng dữ liệu → gọi endpoint thật → kiểm DB → **dọn sạch**. Kiểm cả **phép âm tính** (thứ *không* được đụng vào), không chỉ nhánh thuận.
- **Không có số đo đáng tin thì nói thẳng là không đo được**, đừng công bố con số. (Đã có lần RTT trôi 282→557ms giữa phiên làm mọi phép so sánh vô nghĩa.)
- **Trước khi commit:** xoá script tạm, route tạm, phiên test, dữ liệu test; trả `lib/db.ts` về nguyên trạng nếu có bật log.
- **Không bao giờ in giá trị trong `.env`** - chỉ báo có/không và số ký tự. Chỉ `.env.example` được theo dõi trong git.
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
| Muốn kiểm thứ gì **trên bản đã deploy** | Tên miền là **`https://chic-chic-lac.vercel.app`** - không ghi ở đâu trong code cả, nên trước đây mỗi lần cần lại phải đi hỏi |
| Kiểm một lời gọi ra **dịch vụ ngoài** (Supabase Storage, SePay, Resend) | `npm test` **không nối mạng** ⟹ mù hoàn toàn ở đây. Cách đã dùng và hiệu quả: script `.mts` tạm ở gốc repo, tự nạp `.env`, rồi `await import("./src/lib/<file>.js")` để gọi **đúng hàm thật** thay vì chép lại logic. Chạy bằng `npx tsx`. Đổi `process.env` rồi import lại **trong cùng tiến trình là vô ích** (ESM trả bản cũ) - phải `execFileSync` một tiến trình riêng |

---

## 8. Mở đầu đoạn chat mới thế nào

> *"Đọc `CLAUDE.md`, `CODEMAP.md` (§8 §9 §10) và `MEMORY.md` ở gốc repo trước đã. Xong rồi nói tôi nghe đang ở đâu và ông định làm gì tiếp."*

Rồi chọn một mục ở **§4** bên trên. `CRON_SECRET` đã xong và đã nghiệm thu (§3), nên không còn gì bị chặn bởi biến môi trường nữa.
