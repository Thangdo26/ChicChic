/** @type {import('next').NextConfig} */

// Ảnh ngoài chỉ nhận từ những host mình biết. Trước đây để "**" (mọi host) — nghĩa là
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

const nextConfig = {
  images: {
    remotePatterns: hosts.map((hostname) => ({ protocol: "https", hostname })),
  },
};
export default nextConfig;
