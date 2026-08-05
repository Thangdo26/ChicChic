// Ảnh QR chuyển khoản (chuẩn VietQR / NAPAS 247) — người dùng quét bằng app ngân hàng
// thay vì gõ tay số tài khoản rồi gõ tay mã nội dung.
//
// VÌ SAO ĐÁNG LÀM: mã chuyển khoản gõ sai là `parsePayCode` trả null → BankTxn ghi
// UNMATCHED → khoản tiền rơi về đối soát tay. Quét mã thì cả số tiền lẫn nội dung do
// máy điền, không còn khe cho lỗi gõ. Đo bằng tỉ lệ BankTxn.UNMATCHED và trung vị
// `deposit_confirmed.props.hoursToPay` trước/sau — hai thước đo đã có sẵn trong Event.
//
// VÌ SAO DÙNG ẢNH CỦA NHÀ CUNG CẤP, KHÔNG TỰ SINH: chuỗi EMVCo sai một trường là tiền
// vào tài khoản người khác. Đây là đường tiền, không phải chỗ để tin vào một bộ mã hoá
// TLV + CRC16 viết vội rồi không có cách nào kiểm ngoài việc quét thử bằng mắt.
// Đổi lại là một phụ thuộc mạng ngoài, nên MỌI chỗ dùng QR phải giữ nguyên lối gõ tay
// làm đường lùi — xem `components/PayQR.tsx` (ảnh hỏng thì tự ẩn, không để ô vỡ).
//
// Endpoint là của SePay — CHÍNH nhà cung cấp đang nhận webhook ngân hàng của mình
// (`api/webhooks/sepay`), nên không thêm bên thứ ba nào vào đường tiền. Số tiền + mã
// đơn + số tài khoản vốn đã đi qua họ rồi.
//
// Tài liệu: https://docs.sepay.vn/tao-qr-code-vietqr-dong.html
//
// File này KHÔNG đụng Prisma → an toàn cho client bundle (luật import §1.2).

const ENDPOINT = "https://vietqr.app/img";

/** Khung có logo NAPAS + logo ngân hàng. Người quét tin ảnh có logo hơn ảnh QR trần. */
const TEMPLATE = "compact";

// Đọc bằng biểu thức NGUYÊN VĂN `process.env.NEXT_PUBLIC_…` — Next thay thế lúc build
// theo đúng chuỗi đó. Gán động (`process.env[name]`) thì không được thay và client
// nhận về undefined.
//
// ⚠️ Ba biến này là biến BUILD-TIME. Đổi giá trị trên Vercel phải **Redeploy**, restart
// không ăn thua (cùng bẫy với SUPABASE_URL trong next.config.mjs).
const BANK = (process.env.NEXT_PUBLIC_HOLD_BANK_CODE ?? "").trim();
const ACCOUNT = (process.env.NEXT_PUBLIC_HOLD_ACCOUNT ?? "").replace(/[^0-9A-Za-z]/g, "");
const HOLDER = (process.env.NEXT_PUBLIC_HOLD_NAME ?? "").trim();

/**
 * Đã đủ thông tin để dựng QR chưa. Thiếu thì mọi chỗ hiện QR tự biến mất và người dùng
 * quay về lối gõ tay — KHÔNG được chặn luồng thanh toán (cùng nguyên tắc `storageReady`).
 */
export const qrReady = () => !!BANK && !!ACCOUNT;

/**
 * URL ảnh QR cho một lần chuyển khoản cụ thể.
 *
 * @param amountVnd số tiền đơn đang chờ (cọc chuồng / hoá đơn trang trí)
 * @param code      mã nội dung chuyển khoản đã lưu ở `payCode` (CHICC… / CHICD…)
 * @returns null khi chưa cấu hình hoặc dữ liệu vào không dùng được — chỗ gọi phải xử lý
 */
export function payQrUrl(amountVnd: number, code: string): string | null {
  if (!qrReady()) return null;

  const amount = Math.round(Number(amountVnd) || 0);
  // Số tiền phải dương: QR mang amount = 0 mở app ngân hàng ra ô trống, người dùng lại
  // gõ tay — tức là mất đúng thứ mình định giải quyết, mà lại trông như đã xong.
  if (amount <= 0) return null;

  // `des` chỉ nhận chữ và số không dấu. Mã của mình vốn đã đúng dạng đó theo thiết kế
  // (`PAY_ALPHABET` trong lib/decor.ts), nhưng vẫn lọc lại phòng khi ai đó đổi công thức
  // mã mà quên chỗ này — lọc thừa thì mất mã, còn để lọt ký tự lạ thì ngân hàng tự ý
  // đổi nội dung và webhook bóc không ra.
  const des = String(code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!des) return null;

  const q = new URLSearchParams({
    acc: ACCOUNT,
    bank: BANK,
    amount: String(amount),
    des,
    template: TEMPLATE,
    // In thẳng dưới ảnh: tên chủ TK · số TK (nhà cung cấp tự che giữa) · số tiền ·
    // nội dung CK · tên ngân hàng. Người trả tiền đối chiếu được TRƯỚC khi bấm, thay
    // vì quét một ô đen rồi tin. Đây là chỗ đắt nhất để sai nên phải nhìn thấy được.
    showinfo: "true",
  });
  // Tên chủ tài khoản. Không có thì nhà cung cấp bỏ trống dòng đó, không hỏng ảnh.
  if (HOLDER) q.set("holder", HOLDER);

  return `${ENDPOINT}?${q.toString()}`;
}
