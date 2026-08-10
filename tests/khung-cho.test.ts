// KHUNG CHỜ (`loading.tsx` + `components/Skeletons.tsx`) — CODEMAP §8 "Thêm route mới".
//
// Bộ này khác mọi bộ khác trong `tests/`: nó **đọc file nguồn** thay vì gọi hàm. Lý do
// là thứ cần khoá ở đây không phải một phép tính mà là một **thói quen dễ mất**:
//
//  · thêm route mới rồi quên khung chờ ⟹ route đó rơi về khung mặc định, sai hình;
//  · lỡ tay để một `await` vào `loading.tsx` ⟹ khung chờ tự nó phải chờ, tức là
//    KHÔNG CÒN LÀ KHUNG CHỜ NỮA mà chỉ là một trang trắng thứ hai xếp trước trang thật;
//  · nhét chữ "Đang tải…" vào khung ⟹ trình đọc màn hình đọc lên rồi mất, và mắt
//    thường thì thấy một dòng chữ đứng im — trông y như trang đã hỏng.
//
// Cả ba đều là thứ `tsc`, `lint` và `build` đều cho qua.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const APP = join(__dirname, "..", "src", "app");

/** Bỏ chú thích để những luật dưới đây không bắt nhầm chính lời giải thích. */
const boChuThich = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function quet(thuMuc: string, ten: string): string[] {
  const ra: string[] = [];
  for (const m of readdirSync(thuMuc)) {
    const p = join(thuMuc, m);
    if (statSync(p).isDirectory()) ra.push(...quet(p, ten));
    else if (m === ten) ra.push(p);
  }
  return ra;
}

const khungCho = quet(APP, "loading.tsx");
const duongDan = (p: string) => relative(APP, p).split(sep).slice(0, -1).join("/") || "(gốc)";
const tenRoute = new Set(khungCho.map(duongDan));

describe("route nào phải có khung chờ riêng", () => {
  // Danh sách này KHÔNG phải "mọi route" — trang đăng nhập, đăng ký, quên mật khẩu đều
  // nhẹ và dùng chung khung mặc định là đúng. Đây là những trang **phải chờ dữ liệu
  // thật** và có bố cục riêng đủ khác để một khung sai hình gây giật trang.
  const BAT_BUOC = [
    "chuong/[id]",              // nặng nhất, mở nhiều nhất
    "chuong",
    "tai-khoan",
    "cho",
    "cho/cua-toi",
    "nong-trai",                // cô chú mở giữa vườn bằng 3G
    "nong-trai/chuong/[slug]",
    "admin",
    "nong-dan/[id]",
    "tx/[code]",                // người vừa quét QR, chưa có tài khoản
    "chuong/[id]/nhat-ky",
    "chuong/[id]/thu-hoach",
    "chuong/[id]/dan-ga",
    "chuong/[id]/truy-xuat",
    "chuong/[id]/trang-tri",
    "chuong/[id]/tin-nhan",
    "chuong/[id]/nghi-huu",
    "chuong/[id]/ket-chu-ky",
  ];

  it.each(BAT_BUOC)("%s có loading.tsx riêng", (r) => {
    expect(tenRoute.has(r)).toBe(true);
  });

  it("vẫn còn khung mặc định ở gốc cho những trang không kể tên", () => {
    // Xoá cái này đi thì các trang nhẹ mất sạch phản hồi khi chuyển trang.
    expect(tenRoute.has("(gốc)")).toBe(true);
  });

  it("khung chờ con phải nằm CÙNG thư mục với trang nó phục vụ", () => {
    // Next lấy `loading.tsx` gần nhất đi lên. Đặt lạc chỗ thì nó im lặng phục vụ cả
    // cây con bên dưới bằng một hình dạng không phải của mình — kiểu sai không báo lỗi.
    for (const p of khungCho) {
      const thuMuc = p.slice(0, -"loading.tsx".length);
      const anhEm = readdirSync(thuMuc);
      expect(anhEm.includes("page.tsx"), `${duongDan(p)} có loading.tsx mà không có page.tsx`).toBe(true);
    }
  });
});

describe("khung chờ không được tự nó phải chờ", () => {
  it.each(khungCho.map((p) => [duongDan(p), p]))("%s: không async, không await", (_ten, p) => {
    const src = boChuThich(readFileSync(p, "utf8"));
    expect(src).not.toMatch(/\basync\b/);
    expect(src).not.toMatch(/\bawait\b/);
  });

  it.each(khungCho.map((p) => [duongDan(p), p]))("%s: không đụng DB hay phiên đăng nhập", (_ten, p) => {
    const src = boChuThich(readFileSync(p, "utf8"));
    // Một truy vấn ở đây là một lượt đi–về DB xếp TRƯỚC lượt của trang thật — đúng
    // thứ khung chờ sinh ra để che đi.
    for (const cam of ["@/lib/db", "prisma", "getSessionUser", "cookies("]) {
      expect(src, `${_ten} có "${cam}"`).not.toContain(cam);
    }
  });
});

describe("khung chờ không được nói gì", () => {
  it.each(khungCho.map((p) => [duongDan(p), p]))("%s: không có chữ hiển thị cho người dùng", (_ten, p) => {
    const src = boChuThich(readFileSync(p, "utf8"));
    // Bắt các nút chữ JSX kiểu `>Đang tải…<`. Thuộc tính (`aria-label`) không tính —
    // đó là chữ dành cho trình đọc màn hình, và nó ĐƯỢC phép có.
    const nutChu = src.match(/>[^<>{}\n]*[A-Za-zÀ-ỹ][^<>{}]*</g) ?? [];
    expect(nutChu, `${_ten} có chữ hiển thị: ${nutChu.join(" | ")}`).toHaveLength(0);
  });

  it.each(khungCho.map((p) => [duongDan(p), p]))("%s: dùng khung chung, không tự dựng lại", (_ten, p) => {
    // Đi qua `Skeletons` là cách duy nhất bảo đảm `aria-busy` có mặt (xem phép kiểm
    // dưới) và mọi khung dùng chung một tông xám.
    expect(readFileSync(p, "utf8")).toContain('from "@/components/Skeletons"');
  });
});

describe("bộ khung chung", () => {
  const src = readFileSync(join(__dirname, "..", "src", "components", "Skeletons.tsx"), "utf8");

  it("báo cho trình đọc màn hình biết đang tải", () => {
    // Người dùng trình đọc màn hình không thấy hiệu ứng nhấp nháy. Không có
    // `aria-busy` thì với họ trang đơn giản là **trống rỗng**, không có gì phân biệt
    // với một trang đã tải xong và không có nội dung.
    expect(src).toContain('aria-busy="true"');
    expect(src).toMatch(/aria-label="Đang tải"/);
  });

  it("là component máy chủ — không kéo thêm JS về máy người dùng", () => {
    // Khung chờ là markup tĩnh. Đánh "use client" vào đây là bắt người dùng tải thêm
    // bundle để xem... một khối xám, ngay lúc mạng đang là thứ họ thiếu nhất.
    expect(src).not.toContain('"use client"');
  });
});
