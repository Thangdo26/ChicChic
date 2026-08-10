/** @type {import('next').NextConfig} */

// Ảnh ngoài chỉ nhận từ những host mình biết. Trước đây để "**" (mọi host) - nghĩa là
// một đường dẫn dán vào có thể trỏ tới bất cứ đâu: pixel theo dõi, ảnh chết, nội dung lạ.
// Kho ảnh thật (SUPABASE_URL) luôn được cho phép; hai host video giữ lại vì
// normalizeMediaUrl() cố tình đổi link YouTube/Vimeo sang dạng embed của chúng.
const storageHost = process.env.SUPABASE_URL
  ? new URL(process.env.SUPABASE_URL).hostname
  : null;

const hosts = [
  storageHost,
  "img.youtube.com",
  "i.ytimg.com",
  "i.vimeocdn.com",
].filter(Boolean);

/**
 * Header an ninh - đo trên bản deploy thì Vercel mới chỉ tự đặt `Strict-Transport-Security`,
 * còn lại trống hết. Bốn cái dưới đây là loại "đặt một lần, đúng cho mọi trang".
 *
 * Vì sao đáng đặt ở app này chứ không phải "cho có": nó có `/admin` sau Basic Auth và có
 * những nút bấm một cái là **chuyển tiền hoặc xác nhận đã nhận tiền**. Không có
 * `X-Frame-Options`, ai đó nhúng nguyên trang này vào một iframe trong suốt rồi dụ chủ
 * chuồng bấm lên trên - họ tưởng đang bấm nút của trang kia (clickjacking).
 *
 * ⚠️ **Cố ý CHƯA có `Content-Security-Policy`.** CSP đặt sai là trang trắng, mà Next dùng
 * script inline cho hydration nên phải khai `nonce`/hash cho đúng - thứ chỉ kiểm được
 * bằng cách mở trình duyệt thật và soi console. Đặt mò rồi deploy là đánh cược cả trang
 * chủ. Ghi ở §11.21, làm khi có người ngồi trước trình duyệt.
 *
 * ⚠️ **Cố ý KHÔNG khai `camera` trong `Permissions-Policy`.** Cổng nông dân sống bằng nút
 * chụp ảnh; khai nhầm thành `camera=()` là tắt đúng tính năng vừa mới sửa xong, và đó lại
 * là thứ không kiểm được nếu không có trình duyệt. Bỏ trống = mặc định `self`, đủ dùng.
 */
const securityHeaders = [
  // Trình duyệt không được tự "đoán lại" kiểu file. Kho ảnh là bucket công khai nhận
  // file người dùng tải lên, nên đây là lớp chắn chuyện một file được đoán thành HTML.
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Đường dẫn có thể chứa slug chuồng và mã truy xuất lô - đừng gửi kèm sang site khác.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(), microphone=(), usb=(), payment=()" },
];

const nextConfig = {
  images: {
    remotePatterns: hosts.map((hostname) => ({ protocol: "https", hostname })),
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default nextConfig;
