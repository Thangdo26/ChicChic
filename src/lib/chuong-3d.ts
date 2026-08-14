/**
 * HÌNH CHUỒNG DẠNG KHỐI - hình học thuần cho cảnh chuồng "3D kiểu Minecraft".
 *
 * Module này KHÔNG import Prisma, env hay next/headers - nó là toán thuần, nên vừa dùng
 * được ở server component, vừa ở client component, vừa nạp thẳng vào vitest.
 *
 * ⭐ VÌ SAO NÓ TỒN TẠI - hai chuyện khác hẳn nhau gộp vào một chỗ:
 *
 *  1. **Hình chuồng phải nói đúng số con.** Trước bản này `CoopBackdrop` vẽ CỨNG ba con
 *     gà, mọi chuồng như nhau. Người nhận nuôi 6 con mở app ra đếm được 3 - và đó là
 *     con số duy nhất trên màn hình mà họ kiểm chứng được bằng mắt, vì họ vừa tự tay
 *     chọn nó lúc nhận chuồng. Sai ở đúng chỗ đó thì mọi con số khác của app cũng đáng
 *     ngờ theo.
 *
 *  2. ⚠️⚠️ **YẾM CHỈ ĐƯỢC VẼ KHI NÓ ĐÃ Ở TRÊN CON GÀ THẬT** (§9.1, bất biến §9.43).
 *     `BirdGear.status = PENDING_ON` nghĩa là chủ chuồng đã chọn màu, còn cô chú thì
 *     CHƯA ra chuồng mặc. Vẽ cái yếm đó lên hình ngay lúc bấm là app tự bịa ra một
 *     việc chưa ai làm - đúng thứ cả repo này từ chối (không ảnh thì không `DONE`).
 *     Nên luật đó nằm ở ĐÚNG MỘT HÀM `ganYem` dưới đây, và `GaVM.yem` chỉ khác `null`
 *     khi cái yếm đang thật sự ở trên lưng con gà ngoài vườn. Thành phần vẽ không được
 *     phép tự quyết định gì cả - nó chỉ vẽ `yem` nếu có.
 */

/** Khung toạ độ của cả cảnh. Trùng `COOP_VIEWBOX` - decor cũ đặt trong đúng hệ này. */
export const KHUNG = { w: 240, h: 180 } as const;

// ---------------------------------------------------------------- màu khối

const HEX = /^#?([0-9a-f]{6})$/i;

/** Trộn một màu về phía trắng - dùng cho mặt TRÊN của khối (mặt hứng nắng). */
export function sang(hex: string, t = 0.26): string {
  const m = HEX.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const up = (c: number) => Math.round(c + (255 - c) * t);
  return ghep(up((n >> 16) & 255), up((n >> 8) & 255), up(n & 255));
}

/** Trộn một màu về phía đen - dùng cho mặt BÊN của khối (mặt khuất). */
export function toi(hex: string, t = 0.22): string {
  const m = HEX.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const down = (c: number) => Math.round(c * (1 - t));
  return ghep(down((n >> 16) & 255), down((n >> 8) & 255), down(n & 255));
}

const ghep = (r: number, g: number, b: number) =>
  `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;

/** Ba mặt của cùng một chất liệu. Đây là thứ làm cái hộp trông có khối. */
export type MatKhoi = { truoc: string; tren: string; ben: string };
export const matKhoi = (mau: string): MatKhoi => ({
  truoc: mau,
  tren: sang(mau),
  ben: toi(mau),
});

// ---------------------------------------------------------------- khối hộp

/**
 * Phép chiếu: một khối sâu `d` thì mặt sau lệch lên-phải bấy nhiêu lần hệ số này.
 *
 * Cố ý KHÔNG phải phép chiếu đẳng cự (isometric) thật. Toàn bộ decor cũ - biển tên,
 * chậu cây, hàng rào - là sprite nhìn CHÍNH DIỆN, đặt theo toạ độ người dùng tự kéo và
 * cô chú lắp thật ngoài chuồng theo đúng bản vẽ đó. Xoay cả cảnh sang đẳng cự là làm
 * hỏng mọi bố cục đã lưu. Nên ở đây giữ nguyên mặt chính diện và chỉ thêm chiều sâu
 * lệch lên-phải: vẫn ra khối, mà không dòng `BarnDecor.x/y` nào phải đổi.
 */
export const SAU = { dx: 0.62, dy: -0.5 } as const;

export type MatPhang = { truoc: string; tren: string; ben: string };

/**
 * Ba đa giác của một khối hộp đặt tại (x,y) - `x,y` là góc TRÊN-TRÁI của mặt chính diện.
 * `d` là độ sâu; `d = 0` ⟹ mặt trên và mặt bên suy biến thành đường, vẫn vẽ được.
 */
export function hopMat(x: number, y: number, w: number, h: number, d: number): MatPhang {
  const dx = d * SAU.dx;
  const dy = d * SAU.dy;
  const p = (...xs: number[]) => {
    const out: string[] = [];
    for (let i = 0; i < xs.length; i += 2) out.push(`${lam(xs[i])},${lam(xs[i + 1])}`);
    return out.join(" ");
  };
  return {
    truoc: p(x, y, x + w, y, x + w, y + h, x, y + h),
    tren: p(x, y, x + w, y, x + w + dx, y + dy, x + dx, y + dy),
    ben: p(x + w, y, x + w + dx, y + dy, x + w + dx, y + h + dy, x + w, y + h),
  };
}

/** Làm tròn 2 chữ số - chuỗi `points` ngắn lại, HTML gửi về nhẹ hơn. */
const lam = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- đàn gà

/**
 * Trần số con VẼ trên hình.
 *
 * Một chuồng thật nhận 5–10 con (`FLOCK_QTY`), nên trần này không bao giờ chạm tới với
 * dữ liệu thật - nó là lưới an toàn cho đàn seed/đàn do admin dựng. ⚠️ Chạm trần thì
 * phải NÓI RA số còn lại (xem `cauSoCon`), tuyệt đối không im lặng vẽ 12 con cho một
 * đàn 40 con: cả tính năng này sinh ra để hình vẽ khớp với sự thật.
 */
export const DAN_TOI_DA = 12;

/** Một chỗ đứng trong sân: toạ độ trong `KHUNG` và cỡ con gà ở chỗ đó. */
export type ChoDung = { x: number; y: number; co: number };

/**
 * Vùng đàn đứng: trước cửa chuồng, và khi đã được thả RA VƯỜN thì rộng ra cả sân.
 *
 * `buocToiDa` là khoảng cách LỚN NHẤT giữa hai con cùng hàng. Hàng vẫn trải theo bề
 * rộng `rong`, nhưng không được trải quá bước này - hai đầu bài toán đều xấu như nhau:
 * chia đều cả bề rộng thì đàn 2 con đứng dạt về hai mép sân như hai người lạ, còn bước
 * cố định thì đàn 6 con dồn thành một cục nhỏ trước cửa.
 */
const VUNG = {
  trong: { giua: 120, rong: 150, y1: 148, y2: 164, buocToiDa: 44 },
  vuon: { giua: 120, rong: 190, y1: 150, y2: 170, buocToiDa: 42 },
} as const;

/**
 * Xê dịch tất định theo chỉ số - để đàn không xếp thẳng hàng như quân cờ.
 *
 * Cố ý KHÔNG dùng `Math.random`: server vẽ một kiểu, client hydrate ra kiểu khác là
 * React kêu lệch, và con gà tên Miu sẽ nhảy sang chỗ khác mỗi lần tải lại trang - thứ
 * làm hỏng đúng cái cảm giác "đây là đàn của mình" mà cả tính năng đang xây.
 */
const lech = (i: number, bienDo: number) => lam((((i * 37) % 17) / 16 - 0.5) * 2 * bienDo);

/**
 * Số HÀNG muốn xếp. Đàn nhỏ đứng một hàng ngang cho dễ đếm; đàn to xếp thành cụm có
 * chiều sâu, vì một hàng 10 con thẳng băng thì trông như đồ hoạ trò chơi năm 1985.
 */
const soHangMuon = (n: number) => (n <= 4 ? 1 : n <= 8 ? 2 : 3);

/**
 * Chỗ đứng của từng con trong đàn - THUẦN và TẤT ĐỊNH.
 *
 * Trả về đã sắp theo `y` tăng dần, tức là **vẽ từ xa tới gần**: con đứng dưới (gần
 * người xem) vẽ sau nên che con đứng trên. Đó là toàn bộ "chiều sâu" của cảnh này,
 * cộng với `co` nhỏ dần về phía xa.
 */
export function viTriDan(soCon: number, ngoaiVuon = false): ChoDung[] {
  const n = Math.max(0, Math.min(DAN_TOI_DA, Math.floor(Number(soCon)) || 0));
  if (n === 0) return [];
  const v = ngoaiVuon ? VUNG.vuon : VUNG.trong;
  // Chia đều cho các hàng thay vì xếp đầy hàng trước rồi bỏ một con lẻ ở hàng sau.
  const soHang = Math.min(n, soHangMuon(n));
  const moiHang = Math.ceil(n / soHang);
  const ra: ChoDung[] = [];

  for (let i = 0; i < n; i++) {
    const hang = Math.floor(i / moiHang);
    const trongHang = i % moiHang;
    const conHang = Math.min(moiHang, n - hang * moiHang);
    // Trải hàng theo bề rộng sân, nhưng không rộng quá `buocToiDa`.
    const buoc = conHang > 1 ? Math.min(v.buocToiDa, v.rong / (conHang - 1)) : 0;
    // Hàng càng xa càng hẹp - phối cảnh nghèo của người nghèo, mà đủ đọc.
    const hep = 1 - hang * 0.12;
    // ⭐ Hàng lẻ lệch nửa bước (kiểu xây gạch): không có nó thì con hàng sau nấp đúng
    // sau lưng con hàng trước, và người dùng đếm trên màn hình ra thiếu một con.
    const soLe = hang % 2 ? buoc * 0.42 : 0;
    const x = v.giua + (trongHang - (conHang - 1) / 2) * buoc * hep + soLe + lech(i, 2.5);
    // hang 0 là hàng GẦN NHẤT (y lớn nhất, con to nhất).
    const gan = soHang === 1 ? 1 : 1 - hang / (soHang - 1);
    const y = v.y1 + (v.y2 - v.y1) * gan + lech(i + 7, 1.2);
    ra.push({ x: lam(x), y: lam(y), co: lam(0.78 + 0.26 * gan) });
  }
  return ra.sort((a, b) => a.y - b.y);
}

/**
 * Câu nói thật về số con đang vẽ.
 *
 * `soCon` là số con ĐANG SỐNG trong đàn. Bằng 0 là chuyện có thật và bình thường: đàn
 * đã nhận thịt hoặc đã nghỉ hưu. Lúc đó sân trống, và phải nói ra vì sao nó trống -
 * một cái sân trống không lời giải thích thì người ta tưởng app hỏng.
 */
export function cauSoCon(soCon: number): string {
  const n = Math.max(0, Math.floor(Number(soCon)) || 0);
  if (n === 0) return "Sân đang trống - đàn này đã khép lại một mùa.";
  if (n > DAN_TOI_DA) return `${n} con trong đàn · hình vẽ ${DAN_TOI_DA} con cho đỡ chật`;
  return n === 1 ? "1 bạn gà trong chuồng của bạn" : `${n} bạn gà trong chuồng của bạn`;
}

// ---------------------------------------------------------------- một con gà

/** Một con gà trên hình. `yem` chỉ khác null khi yếm ĐANG Ở TRÊN CON GÀ THẬT. */
export type GaVM = {
  id: string;
  /** Tên chủ chuồng đặt, hoặc mã vòng chân nếu chưa đặt. Luôn có chữ. */
  ten: string;
  /** Chủ chuồng đã tự đặt tên chưa - để lời mời "đặt tên đi" chỉ hiện khi cần. */
  coTen: boolean;
  /** ⚠️ Yếm ĐÃ MẶC THẬT, có ảnh của cô chú. `null` ⟹ KHÔNG vẽ yếm. */
  yem: { ten: string; mau: string } | null;
  /** Việc đang chờ cô chú làm ngoài chuồng - chỉ để NÓI, không vẽ lên gà. */
  cho: string | null;
};

/** Màu mặc định khi loại yếm chưa khai `colorHex` - vẫn phải vẽ ra được cái gì đó. */
export const YEM_MAU_MAC_DINH = "#C86B54";

/** Tên gọi một con gà: tên chủ chuồng đặt, không có thì gọi theo vòng chân. */
export function tenGa(name: string | null | undefined, tagCode: string): string {
  const t = (name ?? "").trim();
  return t || `Con ${tagCode}`;
}

/**
 * ⭐⭐ CỬA DUY NHẤT dựng `GaVM` (bất biến §9.43).
 *
 * Đừng dựng `{ yem: ... }` bằng tay ở bất cứ đâu khác - luật "chỉ vẽ yếm đã mặc thật"
 * chỉ đứng vững khi nó có đúng một chỗ để đọc và đúng một chỗ để hỏng.
 *
 * Bảng trạng thái, và vì sao:
 *  · `WORN`        ⟹ vẽ. Cô chú đã mặc và đã gửi ảnh (§9.1).
 *  · `PENDING_OFF` ⟹ VẪN VẼ. Chủ chuồng đã bấm tháo nhưng ngoài vườn con gà vẫn đang
 *                    đeo - gỡ khỏi hình ngay lúc bấm là nói dối theo chiều ngược lại.
 *  · `PENDING_ON`  ⟹ KHÔNG vẽ, chỉ nói "đang chờ cô chú mặc".
 *  · `OFF`/không có ⟹ không vẽ, không nói gì.
 */
export function ganYem(x: {
  id: string;
  name?: string | null;
  tagCode: string;
  gearStatus?: string | null;
  gearItemName?: string | null;
  gearColorHex?: string | null;
}): GaVM {
  const ten = tenGa(x.name, x.tagCode);
  const coTen = !!(x.name ?? "").trim();
  const tenYem = (x.gearItemName ?? "").trim() || "yếm";
  const mau = (x.gearColorHex ?? "").trim() || YEM_MAU_MAC_DINH;

  switch (x.gearStatus) {
    case "WORN":
      return { id: x.id, ten, coTen, yem: { ten: tenYem, mau }, cho: null };
    case "PENDING_OFF":
      return { id: x.id, ten, coTen, yem: { ten: tenYem, mau }, cho: `Chờ cô chú tháo ${tenYem}` };
    case "PENDING_ON":
      return { id: x.id, ten, coTen, yem: null, cho: `Chờ cô chú mặc ${tenYem}` };
    default:
      return { id: x.id, ten, coTen, yem: null, cho: null };
  }
}

/** Câu mô tả một con gà - dùng cho `<title>` (chuột rê) và `aria-label`. */
export function cauGa(g: GaVM): string {
  if (g.yem) return `${g.ten} · đang mặc ${g.yem.ten}`;
  if (g.cho) return `${g.ten} · ${g.cho.toLowerCase()}`;
  return `${g.ten} · chưa mặc yếm`;
}
