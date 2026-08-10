// Đọc codec thật của một file MP4/MOV bằng cách bóc cấu trúc hộp (box) của nó.
//
// VÌ SAO CẦN: iPhone để chế độ mặc định "High Efficiency" thì quay ra **H.265/HEVC**.
// Safari và máy Apple mở ngon lành, nhưng Chrome/Edge trên Windows thường **không giải
// mã nổi luồng hình** trong khi vẫn phát được luồng tiếng AAC - ra đúng cái triệu chứng
// "có tiếng mà không có hình", màn hình đen. Không lỗi, không cảnh báo.
//
// Đây là **cùng một gốc với lỗi ảnh HEIC** (xem `ANH_MO_DUOC` trong MediaUpload): cùng
// một công tắc trên iPhone đẻ ra cả hai. Và cùng một hậu quả: §9.1 nói việc chỉ `DONE`
// khi có ảnh/video minh chứng, mà một đoạn video người xem chỉ nghe được tiếng thì sổ
// ghi là "đủ bằng chứng" trong khi thực tế là không có gì.
//
// VÌ SAO KHÔNG HỎI TRÌNH DUYỆT: `video.canPlayType()` hay thử phát rồi xem `videoWidth`
// chỉ trả lời được *"MÁY NÀY có xem được không"*. Nhưng người quyết định là **người
// nhận**, thường ngồi máy khác - nông dân quay bằng iPhone thì iPhone xem tốt, còn chủ
// chuồng mở trên laptop Windows thì màn đen. Hỏi trình duyệt của người gửi là hỏi nhầm
// người. Đọc thẳng codec trong file thì cho ra cùng một câu trả lời ở mọi máy.
//
// File này CLIENT-SAFE: không Prisma, không `node:*` (§1.2).

/** Đọc `len` byte kể từ `off`. Trình duyệt đưa vào `Blob.slice`; bộ kiểm đưa vào một mảng byte. */
export type DocByte = (off: number, len: number) => Promise<Uint8Array>;

export type CodecVideo = {
  /** Mã 4 ký tự của luồng hình, vd `hvc1`, `avc1`. `null` = không tìm thấy luồng hình. */
  hinh: string | null;
  /** Mã 4 ký tự của luồng tiếng, vd `mp4a`. */
  tieng: string | null;
  /** Luồng hình là H.265/HEVC (kể cả Dolby Vision) - thứ nhiều máy không mở được. */
  laHevc: boolean;
};

/** Bốn ký tự nhận diện luồng hình, theo thứ tự ưu tiên khi tra. */
const MA_HINH = ["hvc1", "hev1", "dvh1", "dvhe", "avc1", "avc3", "av01", "vp09", "vp08"] as const;
const MA_TIENG = ["mp4a", "Opus", "alac", ".mp3"] as const;
const HEVC = new Set(["hvc1", "hev1", "dvh1", "dvhe"]);

/** Bọc một mảng byte sẵn có thành `DocByte` - dùng trong bộ kiểm. */
export function docTuMang(buf: Uint8Array): DocByte {
  return async (off, len) => buf.subarray(off, Math.min(off + len, buf.length));
}

const chu = (b: Uint8Array, i: number) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
const so32 = (b: Uint8Array, i: number) => (b[i] << 24 >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];

/**
 * Đi dọc các hộp ở TẦNG CAO NHẤT để tìm `moov` (hộp chứa toàn bộ mô tả luồng).
 *
 * Không tải cả file: mỗi bước chỉ đọc 16 byte đầu hộp rồi nhảy qua phần thân. Điều này
 * quan trọng vì video iPhone đặt `moov` **ở CUỐI**, sau khối dữ liệu `mdat` vài chục MB -
 * đọc từ đầu tới đó là tải nguyên file.
 */
export async function timMoov(doc: DocByte, coFile: number): Promise<{ off: number; size: number } | null> {
  let off = 0;
  // Trần vòng lặp: file hỏng có thể tạo chuỗi hộp vô tận. 64 là quá thoải mái cho MP4 thật.
  for (let i = 0; i < 64 && off + 8 <= coFile; i++) {
    const h = await doc(off, 16);
    if (h.length < 8) return null;

    let size = so32(h, 0);
    const type = chu(h, 4);
    let than = 8;

    if (size === 1) {
      // size = 1 nghĩa là cỡ thật nằm ở 8 byte tiếp theo (hộp >4GB).
      if (h.length < 16) return null;
      size = so32(h, 8) * 2 ** 32 + so32(h, 12);
      than = 16;
    } else if (size === 0) {
      // size = 0 nghĩa là hộp chạy tới hết file.
      size = coFile - off;
    }

    if (type === "moov") return { off: off + than, size: Math.max(0, size - than) };
    if (size < 8) return null; // cỡ vô lý ⟹ không phải MP4/MOV, đừng đoán tiếp
    off += size;
  }
  return null;
}

/**
 * Tra mã codec trong phần thân `moov`.
 *
 * Tìm thẳng chuỗi 4 ký tự thay vì bóc tiếp xuống `trak/mdia/minf/stbl/stsd`: `moov` chỉ
 * chứa mô tả (vài KB), không chứa dữ liệu hình, nên khả năng trùng ngẫu nhiên rất thấp -
 * đổi lại đọc được cả những biến thể cấu trúc mà bóc tay dễ trượt.
 */
export function codecTrongMoov(moov: Uint8Array): CodecVideo {
  let s = "";
  for (let i = 0; i < moov.length; i++) s += String.fromCharCode(moov[i]);
  const hinh = MA_HINH.find((m) => s.includes(m)) ?? null;
  const tieng = MA_TIENG.find((m) => s.includes(m)) ?? null;
  return { hinh, tieng, laHevc: !!hinh && HEVC.has(hinh) };
}

/** `moov` là mô tả luồng nên rất nhỏ (đo trên video iPhone thật: 2–3KB). Đọc thừa cho chắc. */
const MOOV_TOI_DA = 512 * 1024;

/**
 * Soi codec của một file video.
 *
 * Trả `null` khi **không đọc ra** - file WebM, file hỏng, hay trình duyệt cũ không có
 * `Blob.arrayBuffer`. Bên gọi phải hiểu `null` là *"không biết"* chứ không phải *"có
 * vấn đề"*: chặn một thứ mình không đọc nổi là chặn nhầm người dùng thật để đổi lấy một
 * cảm giác an toàn.
 */
export async function soiVideo(file: Blob): Promise<CodecVideo | null> {
  try {
    const doc: DocByte = async (off, len) =>
      new Uint8Array(await file.slice(off, off + len).arrayBuffer());
    const moov = await timMoov(doc, file.size);
    if (!moov) return null;
    return codecTrongMoov(await doc(moov.off, Math.min(moov.size, MOOV_TOI_DA)));
  } catch {
    return null;
  }
}
