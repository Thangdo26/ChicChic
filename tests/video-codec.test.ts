// ĐỌC CODEC TRONG FILE MP4/MOV (`lib/video.ts`).
//
// Bộ này kiểm được TRỌN VẸN, khác hẳn `tests/kho-anh.test.ts`: bóc cấu trúc hộp là logic
// thuần, không cần mạng cũng không cần trình duyệt. Nên nếu có gì hỏng ở đây thì là hỏng
// thật, không phải "chưa kiểm tới".
//
// Số liệu dựng lại từ hai file iPhone THẬT của chủ dự án (đã soi qua HTTP Range):
// `ftyp` 24 byte → `mdat` 4,5MB / 11MB → `moov` 2194 / 3206 byte, codec `hvc1` + `mp4a`.
// Nghĩa là `moov` nằm **ở CUỐI** và rất nhỏ — đó là lý do phải đi dọc hộp thay vì đọc
// đại vài MB đầu file.
import { describe, expect, it } from "vitest";
import { codecTrongMoov, docTuMang, soiVideo, timMoov } from "@/lib/video";

/** Dựng một hộp MP4: 4 byte cỡ + 4 byte tên + thân. */
function hop(ten: string, than: Uint8Array | string = new Uint8Array(0)): Uint8Array {
  const t = typeof than === "string" ? new TextEncoder().encode(than) : than;
  const size = 8 + t.length;
  const out = new Uint8Array(size);
  new DataView(out.buffer).setUint32(0, size);
  out.set(new TextEncoder().encode(ten), 4);
  out.set(t, 8);
  return out;
}

function noi(...xs: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(xs.reduce((n, x) => n + x.length, 0));
  let i = 0;
  for (const x of xs) { out.set(x, i); i += x.length; }
  return out;
}

/** `new Blob([uint8])` không qua được tsc ở lib hiện tại — đưa thẳng ArrayBuffer cho gọn. */
function blobTu(u: Uint8Array): Blob {
  return new Blob([u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer]);
}

/** Nhái đúng bố cục video iPhone: ftyp → mdat (to) → moov (nhỏ, ở cuối). */
function videoIphone(codec: string, coMdat = 5_000_000): Uint8Array {
  return noi(
    hop("ftyp", "isommp42"),
    hop("mdat", new Uint8Array(coMdat)),
    hop("moov", `trakmdiaminfstblstsd${codec}whatevermp4a`),
  );
}

describe("đi dọc hộp để tìm moov", () => {
  it("tìm được moov nằm CUỐI file — đúng bố cục iPhone quay ra", async () => {
    const f = videoIphone("hvc1");
    const r = await timMoov(docTuMang(f), f.length);
    expect(r).not.toBeNull();
    // Nhảy qua mdat 5MB chứ không đọc nó: chỉ đọc header thì mới nhanh được.
    expect(r!.off).toBeGreaterThan(5_000_000);
  });

  it("tìm được moov nằm ĐẦU file (video đã tối ưu cho phát trực tuyến)", async () => {
    const f = noi(hop("ftyp", "isom"), hop("moov", "avc1mp4a"), hop("mdat", new Uint8Array(1000)));
    const r = await timMoov(docTuMang(f), f.length);
    expect(r).not.toBeNull();
    expect(codecTrongMoov(f.subarray(r!.off, r!.off + r!.size)).hinh).toBe("avc1");
  });

  it("hộp cỡ 64-bit (size = 1) vẫn nhảy đúng — mdat >4GB dùng dạng này", async () => {
    const lon = new Uint8Array(8 + 8 + 100);
    const dv = new DataView(lon.buffer);
    dv.setUint32(0, 1);                       // báo "cỡ thật ở 8 byte sau"
    lon.set(new TextEncoder().encode("mdat"), 4);
    dv.setUint32(8, 0);
    dv.setUint32(12, lon.length);             // cỡ thật
    const f = noi(hop("ftyp", "isom"), lon, hop("moov", "hvc1"));
    const r = await timMoov(docTuMang(f), f.length);
    expect(r).not.toBeNull();
    expect(codecTrongMoov(f.subarray(r!.off, r!.off + r!.size)).laHevc).toBe(true);
  });

  it("KHÔNG lặp vô tận với file hỏng", async () => {
    // Hộp khai cỡ 0 ở giữa: đọc ẩu là vòng lặp đứng yên một chỗ mãi mãi.
    const xau = new Uint8Array(16);
    xau.set(new TextEncoder().encode("junk"), 4);
    const f = noi(hop("ftyp", "isom"), xau);
    await expect(timMoov(docTuMang(f), f.length)).resolves.toBeNull();
  });

  it("file không phải MP4 thì trả null, KHÔNG đoán bừa", async () => {
    for (const rac of ["khong phai video gi ca", "\x1a\x45\xdf\xa3webm", ""]) {
      const b = new TextEncoder().encode(rac);
      await expect(timMoov(docTuMang(b), b.length)).resolves.toBeNull();
    }
  });
});

describe("nhận diện codec", () => {
  it("bắt đúng mọi biến thể HEVC — đây là thứ gây 'có tiếng không có hình'", () => {
    for (const m of ["hvc1", "hev1", "dvh1", "dvhe"]) {
      const c = codecTrongMoov(new TextEncoder().encode(`stsd${m}mp4a`));
      expect(c.laHevc).toBe(true);
      expect(c.hinh).toBe(m);
    }
  });

  it("KHÔNG gắn cờ nhầm H.264 — đây mới là định dạng mọi máy mở được", () => {
    for (const m of ["avc1", "avc3"]) {
      expect(codecTrongMoov(new TextEncoder().encode(`stsd${m}mp4a`)).laHevc).toBe(false);
    }
  });

  it("KHÔNG gắn cờ nhầm AV1/VP9", () => {
    for (const m of ["av01", "vp09"]) {
      expect(codecTrongMoov(new TextEncoder().encode(`stsd${m}Opus`)).laHevc).toBe(false);
    }
  });

  it("đọc được cả luồng tiếng", () => {
    expect(codecTrongMoov(new TextEncoder().encode("hvc1mp4a")).tieng).toBe("mp4a");
  });

  it("moov trống thì nói không biết, không nói là hỏng", () => {
    const c = codecTrongMoov(new Uint8Array(0));
    expect(c.hinh).toBeNull();
    expect(c.laHevc).toBe(false);
  });
});

describe("soiVideo trên Blob — đường mà MediaUpload thật sự đi", () => {
  it("video iPhone HEVC bị gắn cờ", async () => {
    // Blob nhỏ thôi cho nhanh; bố cục vẫn y hệt file thật.
    const c = await soiVideo(blobTu(videoIphone("hvc1", 20_000)));
    expect(c?.laHevc).toBe(true);
  });

  it("video H.264 đi lọt", async () => {
    const c = await soiVideo(blobTu(videoIphone("avc1", 20_000)));
    expect(c?.laHevc).toBe(false);
  });

  it("đọc không ra thì trả null — và null nghĩa là KHÔNG BIẾT, không phải CÓ VẤN ĐỀ", async () => {
    // WebM chẳng hạn: chặn thứ mình không đọc nổi là chặn nhầm người dùng thật để đổi
    // lấy cảm giác an toàn. `MediaUpload` phải cho qua khi gặp null.
    expect(await soiVideo(blobTu(new TextEncoder().encode("\x1a\x45\xdf\xa3 webm")))).toBeNull();
  });
});
