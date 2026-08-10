// KHO ẢNH - phần thuần logic của `lib/storage.ts`.
//
// Bộ này KHÔNG gọi Supabase (§13: không mạng, không DB), nên nó không chứng minh được
// "tải ảnh lên chạy được" - việc đó phải chạy tay theo công thức ở §13. Cái nó khoá là
// hai thứ đã từng hoặc suýt gây hại: danh sách đuôi file được nhận, và tên thư mục.
//
// Vì sao đáng có một bộ riêng: tính năng chụp ảnh **đã chết câm một thời gian** vì thiếu
// một header, và không có phép kiểm nào kêu lên (§10). Bộ này không bắt được lỗi đó -
// nói thẳng như vậy - nhưng nó khoá được những mảnh mà một phép kiểm offline khoá nổi.
import { describe, expect, it } from "vitest";
import { mediaTypeOfExt, safeFolderName, signUpload, storageReady } from "@/lib/storage";

describe("đuôi file được nhận", () => {
  it("nhận ảnh và video thông thường của điện thoại", () => {
    for (const e of ["jpg", "jpeg", "png", "webp", "heic"]) expect(mediaTypeOfExt(e)).toBe("PHOTO");
    for (const e of ["mp4", "mov", "webm"]) expect(mediaTypeOfExt(e)).toBe("VIDEO");
  });

  it("KHÔNG nhận SVG - SVG chạy được script, mà ảnh này hiện cho người khác xem", () => {
    // Đây là một bất biến an ninh, không phải lựa chọn tiện tay. Ai định thêm "svg" vào
    // cho đủ bộ thì đọc dòng này trước: một tấm "ảnh minh chứng" .svg tải lên kho công
    // khai là một trang HTML chạy được, mở trong phiên đăng nhập của chủ chuồng.
    expect(mediaTypeOfExt("svg")).toBeNull();
    expect(mediaTypeOfExt("svgz")).toBeNull();
  });

  it("KHÔNG nhận thứ gì không phải ảnh/video", () => {
    for (const e of ["exe", "sh", "php", "html", "pdf", "zip", "js", "", ".", "jpg.exe"]) {
      expect(mediaTypeOfExt(e)).toBeNull();
    }
  });

  it("không phân biệt hoa thường, và chấm ở đầu cũng nhận", () => {
    // Máy ảnh một số máy đặt tên "IMG_0001.JPG"; `extOf` lấy ra "JPG".
    expect(mediaTypeOfExt("JPG")).toBe("PHOTO");
    expect(mediaTypeOfExt(".Mp4")).toBe("VIDEO");
  });
});

describe("tên thư mục - lớp chắn thứ hai sau danh sách trắng ở createUploadUrl", () => {
  it("gạt bỏ mọi mưu leo ra khỏi thư mục", () => {
    for (const xau of ["../../quan-tri", "..%2Fquan-tri", "./../quan-tri", "....//quan-tri"]) {
      const s = safeFolderName(xau);
      expect(s).not.toContain("..");
      expect(s).not.toContain("//");
      expect(s.startsWith("/")).toBe(false);
    }
  });

  it("giữ nguyên năm thư mục thật - làm sạch không được đổi cái đang đúng", () => {
    for (const f of ["viec", "nhat-ky", "ho-so", "thu-hoach", "quan-tri"]) {
      expect(safeFolderName(f)).toBe(f);
    }
  });

  it("rỗng hoặc toàn ký tự lạ thì rơi về 'khac', KHÔNG ra chuỗi rỗng", () => {
    // Chuỗi rỗng sẽ dựng ra đường dẫn "/tenfile.jpg" - file rơi thẳng vào gốc kho.
    for (const f of ["", "   ", "!@#$%", "///", "..", "."]) expect(safeFolderName(f)).toBe("khac");
  });

  it("cắt ngắn tên quá dài", () => {
    expect(safeFolderName("a".repeat(200))).toHaveLength(40);
  });
});

describe("lý do từ chối phải TÁCH BẠCH", () => {
  // Trộn hai lý do vào một câu là chuyện đã làm người dùng đi sửa thứ không hỏng (§10):
  // kho ảnh dựng sai, nhưng họ được bảo rằng ảnh JPG của họ có vấn đề.
  it("đuôi lạ → 'duoi-file' (không cần nối mạng: thoát trước khi gọi kho)", async () => {
    const r = await signUpload("viec", "svg");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(storageReady() ? "duoi-file" : "chua-cau-hinh");
  });

  it("chưa cấu hình kho → 'chua-cau-hinh', thứ UI dựa vào để đổi sang ô dán đường dẫn", async () => {
    if (storageReady()) return; // máy có .env thật thì không dựng lại nhánh này được
    const r = await signUpload("viec", "jpg");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("chua-cau-hinh");
  });
});
