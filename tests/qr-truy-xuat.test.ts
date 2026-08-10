// MÃ QR TRUY XUẤT (§7.14).
//
// Không có bộ GIẢI mã QR nào chạy offline ở đây, nên bộ này KHÔNG chứng minh được
// "điện thoại quét ra đúng URL" — việc đó nằm ở bước nghiệm thu bằng tay
// (HUONG-DAN-SETUP-DEPLOY mục K). Cái nó khoá lại là mọi thứ QUANH cái mã: URL đưa
// vào có đúng không, mã có phình quá cỡ in không, và mã truy xuất có đủ khó đoán không.
import { describe, expect, it } from "vitest";
import { qrModuleCount, qrSvg, tracePath, traceUrl } from "@/lib/qr";
import { newTraceCode, normalizeTraceCode } from "@/lib/harvest";

describe("đường dẫn truy xuất", () => {
  it("ngắn — mỗi ký tự thừa là thêm ô, in ra nhỏ đi", () => {
    expect(tracePath("ABCDEFGHJK")).toBe("/tx/ABCDEFGHJK");
  });

  it("dựng URL tuyệt đối từ host của chính request", () => {
    expect(traceUrl("chicchic.vn", "ABCDEFGHJK")).toBe("https://chicchic.vn/tx/ABCDEFGHJK");
  });

  it("localhost thì dùng http, không thì https", () => {
    expect(traceUrl("localhost:3007", "ABCDEFGHJK")).toMatch(/^http:\/\//);
    expect(traceUrl("chicchic.vn", "ABCDEFGHJK")).toMatch(/^https:\/\//);
  });

  it("không biết host thì trả đường dẫn tương đối, KHÔNG bịa tên miền", () => {
    // Bịa một tên miền mặc định là in ra hàng loạt mã trỏ vào hư không.
    for (const h of [null, undefined, "", "   "]) {
      expect(traceUrl(h, "ABCDEFGHJK")).toBe("/tx/ABCDEFGHJK");
    }
  });
});

describe("mã truy xuất — đây là một CHÌA KHOÁ, không phải số thứ tự", () => {
  it("đủ dài để không dò được", () => {
    expect(newTraceCode()).toHaveLength(10);
  });

  it("không lặp lại trong 2000 lần sinh", () => {
    const set = new Set(Array.from({ length: 2000 }, newTraceCode));
    expect(set.size).toBe(2000);
  });

  it("bỏ ký tự dễ nhìn nhầm — người ta có thể phải GÕ TAY khi camera chịu", () => {
    const all = Array.from({ length: 400 }, newTraceCode).join("");
    for (const c of ["0", "O", "1", "I", "L"]) expect(all).not.toContain(c);
    expect(all).toMatch(/^[A-Z0-9]+$/);
  });

  it("chuẩn hoá được mã người ta gõ lệch", () => {
    expect(normalizeTraceCode(" abcdef-ghjk ")).toBe("ABCDEFGHJK");
    expect(normalizeTraceCode("abc.def/ghjk")).toBe("ABCDEFGHJK");
    expect(normalizeTraceCode(null)).toBe("");
    // Không cho gõ dài hơn để tránh tra bằng tiền tố.
    expect(normalizeTraceCode("ABCDEFGHJKXXXXX")).toHaveLength(10);
  });
});

describe("SVG mã QR", () => {
  const url = traceUrl("chicchic.vn", "ABCDEFGHJK");

  it("là MỘT thẻ svg tự chứa, không phụ thuộc gì bên ngoài", () => {
    const svg = qrSvg(url);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    // Không tải font, không tải ảnh, không script — trang công khai phải vẽ được
    // cả khi mạng chậm.
    expect(svg).not.toMatch(/<script|<image|href=/i);
  });

  it("gom ô đen vào MỘT path, không phải hàng trăm thẻ rect", () => {
    const svg = qrSvg(url);
    expect((svg.match(/<path/g) ?? []).length).toBe(1);
    expect(svg).not.toContain("<rect x=");
  });

  it("có vùng lặng 2 ô — thiếu nó nhiều máy quét chịu", () => {
    const n = qrModuleCount(url);
    expect(svg_viewBox(qrSvg(url))).toBe(n + 4);
  });

  it("mã của một URL thật đủ nhỏ để in lên nhãn hộp", () => {
    // Trên 45 ô là mỗi ô mảnh tới mức camera điện thoại khó bắt ở cỡ nhãn thường.
    expect(qrModuleCount(url)).toBeLessThanOrEqual(45);
  });

  it("đổi nội dung thì đổi hình — hàm không trả về một hình cố định", () => {
    // Đây chính là lỗi của bản cũ: `Illustrations.QRCode` vẽ cùng một lưới bất kể
    // dữ liệu, nên trông như mã QR mà không mã hoá gì (§11.15).
    expect(qrSvg(traceUrl("chicchic.vn", "AAAAAAAAAA")))
      .not.toBe(qrSvg(traceUrl("chicchic.vn", "BBBBBBBBBB")));
  });

  it("cùng nội dung thì ra cùng hình — in lại lần hai vẫn là mã đó", () => {
    expect(qrSvg(url)).toBe(qrSvg(url));
  });

  it("đổi màu được mà không đổi cấu trúc mã", () => {
    const a = qrSvg(url);
    const b = qrSvg(url, { dark: "#000000", light: "#FFFFFF" });
    expect(svg_path(a)).toBe(svg_path(b));
    expect(b).toContain("#000000");
  });
});

/** Cạnh của viewBox — "0 0 N N" → N. */
function svg_viewBox(svg: string): number {
  return Number(svg.match(/viewBox="0 0 (\d+) \d+"/)![1]);
}
/** Chuỗi `d` của path — phần thật sự mang dữ liệu của mã. */
function svg_path(svg: string): string {
  return svg.match(/<path d="([^"]*)"/)![1];
}
