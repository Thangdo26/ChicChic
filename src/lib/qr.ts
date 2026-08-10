// MÃ QR TRUY XUẤT - mã quét được thật, không phải hình trang trí.
//
// Trước file này `Illustrations.QRCode` vẽ một lưới ô vuông ngẫu nhiên KHÔNG mã hoá gì
// cả (CODEMAP §11.15). Nó nằm ngay trên trang truy xuất - đúng chỗ sản phẩm này bán
// niềm tin - nên nó không phải "chưa làm xong", nó là một lời nói dối nhỏ đặt đúng chỗ
// nhạy cảm nhất: người ta cầm điện thoại lên quét, không ra gì, và bắt đầu ngờ luôn
// những thứ thật nằm cạnh nó.
//
// `qrcode-generator`: MIT, **0 dependency**, có sẵn khai báo kiểu. Chọn nó thay vì tự
// viết bộ mã hoá QR (Reed–Solomon + chọn mặt nạ ~300 dòng) vì ở đây không có bộ GIẢI mã
// nào để tự kiểm - tự viết là ship một cái mã không ai chắc quét được, tức đúng lại
// cái sai đang sửa. Cũng không dùng dịch vụ sinh ảnh QR bên thứ ba: đường dẫn truy xuất
// của từng lô hàng không có lý do gì phải đi qua máy chủ người khác.
//
// Chỉ gọi từ SERVER (trang truy xuất, sổ thu hoạch). Nhét vào client bundle là gánh
// thêm vài chục KB cho một thứ vẽ một lần rồi thôi.
import qrcode from "qrcode-generator";

/**
 * Mức sửa lỗi. `M` (~15%) là mức tiêu chuẩn: mã in ra dán lên hộp trứng bị nhoè hoặc
 * cong vẫn quét được, mà không phình to như mức `H`.
 */
const EC_LEVEL = "M" as const;

/**
 * Vẽ QR thành MỘT thẻ `<svg>` tự chứa.
 *
 * Trả về chuỗi để nhúng bằng `dangerouslySetInnerHTML` - an toàn vì chuỗi này do
 * chính hàm dựng từ số, không có gì của người dùng lọt vào thuộc tính nào.
 *
 * `viewBox` tính theo số ô nên ảnh co giãn theo khung chứa, không lệ thuộc cỡ pixel.
 * Vùng lặng 2 ô quanh mã là bắt buộc của chuẩn - thiếu nó nhiều máy quét chịu.
 */
export function qrSvg(text: string, opts?: { dark?: string; light?: string }): string {
  const dark = opts?.dark ?? "#22302A";
  const light = opts?.light ?? "#FFFFFF";

  // typeNumber 0 = tự chọn phiên bản nhỏ nhất chứa đủ dữ liệu.
  const qr = qrcode(0, EC_LEVEL);
  qr.addData(text);
  qr.make();

  const n = qr.getModuleCount();
  const pad = 2;
  const size = n + pad * 2;

  // Gom mọi ô đen vào MỘT `path` thay vì n² thẻ `<rect>`: một mã cỡ vừa có ~400 ô đen,
  // tức 400 nút DOM cho một hình không bao giờ đổi.
  let d = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += `M${c + pad} ${r + pad}h1v1h-1z`;
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
    `width="100%" height="100%" shape-rendering="crispEdges" role="img" ` +
    `aria-label="Mã QR truy xuất nguồn gốc">` +
    `<rect width="${size}" height="${size}" fill="${light}"/>` +
    `<path d="${d}" fill="${dark}"/>` +
    `</svg>`
  );
}

/** Số ô mỗi cạnh của mã - dùng để kiểm tra, và để biết mã có phình quá không. */
export function qrModuleCount(text: string): number {
  const qr = qrcode(0, EC_LEVEL);
  qr.addData(text);
  qr.make();
  return qr.getModuleCount();
}

/**
 * Đường dẫn công khai của một lô.
 *
 * NGẮN có chủ đích (`/tx/<mã>`): mã QR càng ít ký tự thì càng ít ô, in ra càng to và
 * càng dễ quét ở khoảng cách xa. `/chuong/.../truy-xuat/...` sẽ đội thêm một phiên bản
 * QR mà không đổi lấy được gì.
 */
export const tracePath = (publicCode: string) => `/tx/${publicCode}`;

/**
 * Ghép thành URL tuyệt đối để nhét vào mã.
 *
 * `host` lấy từ header của chính request (trang truy xuất là server component nên
 * `headers()` dùng được) - CỐ Ý không đọc biến môi trường: repo này đã có một lớp bẫy
 * `NEXT_PUBLIC_*` thay lúc build (§12), và một cái QR in sai tên miền là thứ chỉ phát
 * hiện được khi hộp trứng đã tới tay người ta.
 */
export function traceUrl(host: string | null | undefined, publicCode: string): string {
  const h = (host ?? "").trim();
  if (!h) return tracePath(publicCode);
  const proto = h.startsWith("localhost") || h.startsWith("127.0.0.1") ? "http" : "https";
  return `${proto}://${h}${tracePath(publicCode)}`;
}
