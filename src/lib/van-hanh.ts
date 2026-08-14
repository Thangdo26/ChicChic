// VẬN HÀNH PILOT - phần chạm DB (Epic 7, spec §4.3/§4.4 · §20 Epic 7).
//
// ⚠️ **CHỈ SERVER**, và **CHỈ ĐỌC**. Không một `create`/`update`/`delete` nào trong file này -
// đây là màn hình để nhìn, và một bảng số liệu tự ghi vào dữ liệu nó đang đếm là thứ §7.14
// đã cấm một lần rồi (phép ghi nấp trong một lượt xem trang).
//
// Phần thuần - ngưỡng, cách đọc một tỉ lệ, chữ cảnh báo - nằm ở `lib/van-hanh-meta.ts`.
import { prisma } from "@/lib/db";
import { batFamily } from "@/lib/family";
import { NGUONG_PILOT, PHUT_MOI_VIEC_UOC, tiLe } from "@/lib/van-hanh-meta";

const NGAY = 86_400_000;

export type DongCohort = {
  cohortKey: string;
  moi: number;
  dangChay: number;
  tamDung: number;
  daRut: number;
  daXong: number;
  /** Bé còn mối nối chưa gỡ và hồ sơ còn hiệu lực. */
  soBe: number;
  baiXong: number;
};

export type SoLieuPilot = {
  /** ≥60%: gia đình được mời đã nhận lời. */
  kichHoat: number | null;
  /** ≥50%: nhà đang chạy đã có ít nhất một bài xong. */
  moMan: number | null;
  /** ≥40%: nhà đang chạy có ≥1 bài xong trong 7 ngày. ⚠️ KHÔNG phải retention tuần 6. */
  tuanNay: number | null;
  /** ≥30%: nhà có ≥1 việc cả nhà làm xong ngoài đời trong 30 ngày. */
  ngoaiDoi: number | null;
  /** ≥50%: mong muốn bé gửi đã được cha mẹ trả lời. */
  traLoi: number | null;
  /** ≤30 phút/chuồng/tuần - **ước lượng**, xem `PHUT_MOI_VIEC_UOC`. */
  taiNongDanPhut: number | null;
  /** Số việc chương trình đẩy sang cô chú trong 7 ngày (tử số của dòng trên). */
  viecTuMongMuon: number;
  /** Số chuồng đang có suất sống - mẫu số của dòng trên. */
  soChuongSong: number;
  /** Nhãn một chạm: bao nhiêu việc chăm đã xong có nhãn, trên tổng số việc chăm đã xong. */
  nhanDaDung: number;
  nhanCoTheDung: number;
};

export type SlaDuLieu = {
  daRutConsent: number;
  daXinXoa: number;
  daXoaXong: number;
  /** Giờ trung vị từ lúc xin xoá tới lúc xoá xong. `null` = chưa có ca nào. */
  gioTrungViXoa: number | null;
  daTaiVe: number;
};

export type BangVanHanh = {
  cohort: DongCohort[];
  soLieu: SoLieuPilot;
  sla: SlaDuLieu;
  /** Nhóm pilot đang có suất tạm dừng, kèm lý do - để người trực thấy ngay có gì đang tắt. */
  dangTamDung: { cohortKey: string; lyDo: string | null; soSuat: number }[];
};

const RONG: BangVanHanh = {
  cohort: [],
  soLieu: {
    kichHoat: null, moMan: null, tuanNay: null, ngoaiDoi: null, traLoi: null,
    taiNongDanPhut: null, viecTuMongMuon: 0, soChuongSong: 0, nhanDaDung: 0, nhanCoTheDung: 0,
  },
  sla: { daRutConsent: 0, daXinXoa: 0, daXoaXong: 0, gioTrungViXoa: null, daTaiVe: 0 },
  dangTamDung: [],
};

/** Loại việc có thể mang nhãn - phải khớp `van-hanh-meta.NHAN_CHAM_SOC[*].viec`. */
const VIEC_CO_NHAN = ["FEED", "CHECK", "RANGE_OUT", "RANGE_IN"] as const;

/**
 * Toàn bộ số liệu của bảng `/admin/gia-dinh`.
 *
 * ⚠️ **Mọi tỉ lệ ở đây trả `null` khi mẫu số bằng 0, không trả 0%.** Đó là lời nói dối kinh
 * điển của bảng số liệu tự làm: chưa mời nhà nào mà bảng hiện "0% kích hoạt" thì người đọc
 * thấy đỏ và kết luận tính năng hỏng. Phép so nằm ở `van-hanh-meta.tiLe`.
 *
 * Cỡ pilot là 10–15 gia đình (§22.2 bước 8), nên ở đây cố ý **lấy cả bảng rồi đếm trong bộ
 * nhớ** thay vì viết mười câu `groupBy` lồng nhau: dễ đọc hơn nhiều, và đắt hơn không đáng
 * kể. Nếu có ngày con số này lên hàng nghìn thì đây là chỗ phải viết lại - và đó là một
 * vấn đề đáng có.
 */
export async function bangVanHanh(): Promise<BangVanHanh> {
  if (!batFamily()) return RONG;
  try {
    const now = Date.now();
    const bayNgay = new Date(now - 7 * NGAY);
    const baMuoiNgay = new Date(now - 30 * NGAY);

    const [suats, noi, baiXong, baiTuanNay, viecCaNha, mongMuon, careTuanNay, consent, taiVe, viecChamXong] =
      await Promise.all([
        prisma.familyEnrollment.findMany({
          select: { id: true, status: true, cohortKey: true, parentId: true, barnId: true, pauseReason: true },
        }),
        prisma.childBarnLink.findMany({
          where: { unlinkedAt: null, child: { status: { not: "DELETED" } } },
          select: { childId: true, enrollmentId: true },
        }),
        prisma.learningMoment.groupBy({
          by: ["childId"],
          where: { status: "COMPLETED" },
          _count: { _all: true },
        }),
        prisma.learningMoment.groupBy({
          by: ["childId"],
          where: { status: "COMPLETED", completedAt: { gte: bayNgay } },
          _count: { _all: true },
        }),
        prisma.learningMoment.groupBy({
          by: ["childId"],
          where: { missionDoneAt: { gte: baMuoiNgay } },
          _count: { _all: true },
        }),
        prisma.childSuggestion.groupBy({ by: ["status"], _count: { _all: true } }),
        // Tử số của "tải nông dân": mỗi `CARE_WISH` được cha mẹ đồng ý là **một lần chương
        // trình đẩy việc sang cô chú**. Đếm ở đây chứ không đếm `BarnTask` vì `upsertTask`
        // gộp nhiều mong muốn vào một việc đang mở - đếm việc sẽ đếm thiếu công thật.
        prisma.childSuggestion.count({
          where: { kind: "CARE_WISH", status: "REVIEWED", reviewedAt: { gte: bayNgay } },
        }),
        prisma.childConsentEvent.findMany({
          where: { action: { in: ["WITHDRAWN", "DELETE_REQUESTED", "DELETED"] } },
          select: { childId: true, action: true, createdAt: true },
        }),
        prisma.event.count({ where: { name: "child_data_exported" } }),
        // Nhãn một chạm được dùng bao nhiêu: chỉ tính việc **đã xong** và **thuộc loại có
        // nhãn**. Việc không có nhãn nào để chọn thì không có mặt trong mẫu số - nếu không
        // thì tỉ lệ này chỉ đo xem nông trại làm bao nhiêu việc `HARVEST`.
        prisma.barnTask.groupBy({
          by: ["careTag"],
          where: { status: "DONE", kind: { in: [...VIEC_CO_NHAN] } },
          _count: { _all: true },
        }),
      ]);

    // ---- Bảng cohort ----
    const beTheoSuat = new Map<string, string[]>();
    for (const n of noi) {
      const ds = beTheoSuat.get(n.enrollmentId) ?? [];
      ds.push(n.childId);
      beTheoSuat.set(n.enrollmentId, ds);
    }
    const xongTheoBe = new Map(baiXong.map((b) => [b.childId, b._count._all]));

    const theoCohort = new Map<string, DongCohort>();
    for (const s of suats) {
      const d = theoCohort.get(s.cohortKey) ?? {
        cohortKey: s.cohortKey, moi: 0, dangChay: 0, tamDung: 0, daRut: 0, daXong: 0,
        soBe: 0, baiXong: 0,
      };
      if (s.status === "INVITED") d.moi += 1;
      if (s.status === "ACTIVE") d.dangChay += 1;
      if (s.status === "PAUSED") d.tamDung += 1;
      if (s.status === "WITHDRAWN") d.daRut += 1;
      if (s.status === "COMPLETED") d.daXong += 1;
      for (const be of beTheoSuat.get(s.id) ?? []) {
        d.soBe += 1;
        d.baiXong += xongTheoBe.get(be) ?? 0;
      }
      theoCohort.set(s.cohortKey, d);
    }

    // ---- Năm chỉ số ----
    // Mẫu số của "kích hoạt" là **mọi suất từng được mời**, kể cả đã rút: một gia đình rút
    // sau hai tuần vẫn là một gia đình đã được mời, và bỏ họ ra khỏi mẫu số là cách làm cho
    // con số đẹp lên bằng việc quên đi những người bỏ đi.
    const daNhan = suats.filter((s) => s.status !== "INVITED").length;
    const suatSong = suats.filter((s) => s.status === "ACTIVE" || s.status === "PAUSED");
    const beDangChay = suatSong.flatMap((s) => beTheoSuat.get(s.id) ?? []);
    const nhaDangChay = new Set(suatSong.map((s) => s.parentId));

    const nhaTheoBe = new Map<string, string>();
    for (const s of suatSong) {
      for (const be of beTheoSuat.get(s.id) ?? []) nhaTheoBe.set(be, s.parentId);
    }
    const nhaCo = (rows: { childId: string }[]) =>
      new Set(rows.map((r) => nhaTheoBe.get(r.childId)).filter((x): x is string => !!x)).size;

    const daTraLoi = mongMuon
      .filter((m) => m.status !== "PENDING")
      .reduce((t, m) => t + m._count._all, 0);
    const tongMongMuon = mongMuon.reduce((t, m) => t + m._count._all, 0);

    const soChuongSong = new Set(suatSong.map((s) => s.barnId)).size;

    const coNhan = viecChamXong.filter((v) => !!v.careTag).reduce((t, v) => t + v._count._all, 0);
    const tongViecCham = viecChamXong.reduce((t, v) => t + v._count._all, 0);

    const soLieu: SoLieuPilot = {
      kichHoat: tiLe(daNhan, suats.length),
      moMan: tiLe(nhaCo(baiXong.filter((b) => beDangChay.includes(b.childId))), nhaDangChay.size),
      tuanNay: tiLe(nhaCo(baiTuanNay), nhaDangChay.size),
      ngoaiDoi: tiLe(nhaCo(viecCaNha), nhaDangChay.size),
      traLoi: tiLe(daTraLoi, tongMongMuon),
      taiNongDanPhut: soChuongSong > 0
        ? Math.round(((careTuanNay * PHUT_MOI_VIEC_UOC) / soChuongSong) * 10) / 10
        : null,
      viecTuMongMuon: careTuanNay,
      soChuongSong,
      nhanDaDung: coNhan,
      nhanCoTheDung: tongViecCham,
    };

    // ---- SLA dữ liệu ----
    const xinXoa = new Map<string, Date>();
    const xoaXong = new Map<string, Date>();
    let daRutConsent = 0;
    for (const c of consent) {
      if (c.action === "WITHDRAWN") daRutConsent += 1;
      if (c.action === "DELETE_REQUESTED" && !xinXoa.has(c.childId)) xinXoa.set(c.childId, c.createdAt);
      if (c.action === "DELETED") xoaXong.set(c.childId, c.createdAt);
    }
    const gio: number[] = [];
    for (const [childId, xin] of xinXoa) {
      const xong = xoaXong.get(childId);
      if (xong) gio.push((xong.getTime() - xin.getTime()) / 3_600_000);
    }
    gio.sort((a, b) => a - b);
    const sla: SlaDuLieu = {
      daRutConsent,
      daXinXoa: xinXoa.size,
      daXoaXong: xoaXong.size,
      gioTrungViXoa: gio.length > 0
        ? Math.round(gio[Math.floor((gio.length - 1) / 2)] * 100) / 100
        : null,
      daTaiVe: taiVe,
    };

    // ---- Đang tạm dừng ----
    const dungTheoNhom = new Map<string, { cohortKey: string; lyDo: string | null; soSuat: number }>();
    for (const s of suats.filter((x) => x.status === "PAUSED")) {
      const k = `${s.cohortKey}|${s.pauseReason ?? ""}`;
      const d = dungTheoNhom.get(k) ?? { cohortKey: s.cohortKey, lyDo: s.pauseReason, soSuat: 0 };
      d.soSuat += 1;
      dungTheoNhom.set(k, d);
    }

    return {
      cohort: [...theoCohort.values()].sort((a, b) => a.cohortKey.localeCompare(b.cohortKey)),
      soLieu,
      sla,
      dangTamDung: [...dungTheoNhom.values()],
    };
  } catch (e) {
    console.error("[van-hanh] không dựng được bảng vận hành", e);
    return RONG;
  }
}

export { NGUONG_PILOT };
