export const dynamic = "force-dynamic";
// Bảng vận hành pilot ChicChic Gia đình (Epic 7 · spec §4.3, §4.4, §20 Epic 7).
//
// Route nằm DƯỚI `/admin` là bắt buộc, không phải cho gọn - cùng lý do đã ghi ở
// `/admin/tin-nhan/[slug]`: `middleware.ts` chỉ khoá `/admin/:path*` bằng Basic Auth, và
// trình duyệt chỉ tự gửi kèm header đó cho đường dẫn trong cùng realm.
//
// ⚠️ **Trang này CHỈ ĐỂ NHÌN - không có một cái nút nào.** Nút tạm dừng/mở lại nằm ở khối
// 👨‍👩‍👧 trên `/admin`, cạnh danh sách suất, vì đó là chỗ người trực đang nhìn khi họ quyết
// định. Một bảng số liệu có nút bấm là một bảng người ta bấm nhầm trong lúc đọc.
//
// ⚠️ **Không một dòng nào ở đây là dữ liệu của một đứa trẻ cụ thể.** Không biệt danh, không
// `childId`, không nhãn chuồng gắn với tên bé - chỉ số đếm theo nhóm (spec §17.5). Ai cần
// biết một gia đình cụ thể đang thế nào thì hỏi chính gia đình đó (Epic 8), không tra ở đây.
import Link from "next/link";
import { notFound } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { batFamily } from "@/lib/family";
import { bangVanHanh } from "@/lib/van-hanh";
import {
  CANH_BAO_UOC, LY_DO_TAM_DUNG, NGUONG_PILOT, PHUT_MOI_VIEC_UOC,
  soNguong, soTran, tiLe, type MucDat,
} from "@/lib/van-hanh-meta";

const MAU: Record<MucDat, { background: string; color: string }> = {
  dat: { background: "var(--paddy-tint)", color: "var(--paddy-deep)" },
  "chua-dat": { background: "#FCF3E8", color: "#7a4d1a" },
  "chua-do": { background: "var(--paper2)", color: "var(--ink-soft)" },
};

/** Một chỉ số. `null` ⟹ "chưa đủ dữ liệu", **không** phải 0% - xem `van-hanh-meta.tiLe`. */
function ChiSo({
  ten, giaTri, muc, nguong, giaiThich,
}: {
  ten: string;
  giaTri: number | null;
  muc: MucDat;
  nguong: string;
  giaiThich: string;
}) {
  return (
    <div className="card">
      <div className="flex items-baseline gap-2">
        <span className="display text-[20px]">
          {giaTri === null ? "—" : `${giaTri}%`}
        </span>
        <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={MAU[muc]}>
          {muc === "dat" ? "đạt" : muc === "chua-dat" ? "chưa đạt" : "chưa đủ dữ liệu"}
        </span>
      </div>
      <div className="text-[13px] font-semibold mt-1">{ten}</div>
      <div className="text-[11.8px] mt-0.5 leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        Ngưỡng nội bộ {nguong} · {giaiThich}
      </div>
    </div>
  );
}

export default async function AdminGiaDinh() {
  // Hai cửa, đúng thứ tự: quản trị trước, rồi cờ tổng. Cờ tắt ⟹ `notFound()` chứ không phải
  // một trang "đang tắt" - kill switch tồn tại để không lộ gì cả (§11.51).
  if (!(await isAdmin())) notFound();
  if (!batFamily()) notFound();

  const { cohort, soLieu, sla, dangTamDung } = await bangVanHanh();

  const tongMoi = cohort.reduce((t, c) => t + c.moi, 0);
  const tongChay = cohort.reduce((t, c) => t + c.dangChay, 0);
  const tongDung = cohort.reduce((t, c) => t + c.tamDung, 0);
  const tyLeNhan = tiLe(soLieu.nhanDaDung, soLieu.nhanCoTheDung);

  return (
    <div className="screen">
      <Link href="/admin" className="text-[13px] no-underline" style={{ color: "var(--ink-soft)" }}>
        ← Bảng quản trị
      </Link>
      <h1 className="display text-[21px] mt-2">👨‍👩‍👧 Vận hành pilot ChicChic Gia đình</h1>
      <p className="lede mt-1.5">
        Số liệu theo nhóm, không theo từng nhà. Ngưỡng lấy từ §4.4 của bản kế hoạch - đây là
        mốc quyết định <b>nội bộ</b>, không phải chuẩn thị trường.
      </p>

      {tongDung > 0 && (
        <div className="card mt-3" style={{ background: "#FCF3E8", border: "1px solid #F0D9B4" }}>
          <div className="text-[14px] font-semibold" style={{ color: "#7a4d1a" }}>
            ⏸️ {tongDung} suất đang tạm dừng
          </div>
          <ul className="text-[12.5px] mt-1.5 grid gap-1" style={{ color: "#7a4d1a" }}>
            {dangTamDung.map((d, i) => (
              <li key={i}>
                · {d.cohortKey} · {d.soSuat} suất ·{" "}
                {LY_DO_TAM_DUNG.find((l) => l.khoa === d.lyDo)?.choQuanTri ?? "không rõ lý do"}
              </li>
            ))}
          </ul>
          <p className="text-[12px] mt-1.5" style={{ color: "#7a4d1a" }}>
            Mở lại ở khối 👨‍👩‍👧 trên <Link href="/admin">bảng quản trị</Link>.
          </p>
        </div>
      )}

      <h2 className="display text-[16px] mt-3.5">Năm chỉ số quyết định</h2>
      <div className="grid gap-2 mt-2">
        <ChiSo ten="Gia đình được mời đã nhận lời" giaTri={soLieu.kichHoat}
          muc={soNguong(soLieu.kichHoat, NGUONG_PILOT.kichHoat)}
          nguong={`≥${NGUONG_PILOT.kichHoat}%`}
          giaiThich={`mẫu số là MỌI suất từng mời (${tongMoi + tongChay + tongDung}+), kể cả nhà đã rút`} />
        <ChiSo ten="Nhà đang chạy đã có ít nhất một bài xong" giaTri={soLieu.moMan}
          muc={soNguong(soLieu.moMan, NGUONG_PILOT.moMan)}
          nguong={`≥${NGUONG_PILOT.moMan}%`}
          giaiThich="bài mở màn - nếu thấp thì chỗ hỏng nằm ở bước bàn giao máy cho bé" />
        <ChiSo ten="Nhà có ≥1 bài xong trong 7 ngày qua" giaTri={soLieu.tuanNay}
          muc={soNguong(soLieu.tuanNay, NGUONG_PILOT.giuChan)}
          nguong={`≥${NGUONG_PILOT.giuChan}%`}
          giaiThich="⚠️ đây là TUẦN NÀY, không phải retention tuần 6 - con số của §4.4 chỉ đọc được sau khi pilot chạy đủ 6 tuần" />
        <ChiSo ten="Nhà làm xong việc cả nhà ngoài đời (30 ngày)" giaTri={soLieu.ngoaiDoi}
          muc={soNguong(soLieu.ngoaiDoi, NGUONG_PILOT.ngoaiDoi)}
          nguong={`≥${NGUONG_PILOT.ngoaiDoi}%`}
          giaiThich="chỉ số quan trọng nhất của cả sản phẩm: nội dung có tạo hành động ngoài màn hình không" />
        <ChiSo ten="Mong muốn của bé được cha mẹ trả lời" giaTri={soLieu.traLoi}
          muc={soNguong(soLieu.traLoi, NGUONG_PILOT.traLoi)}
          nguong={`≥${NGUONG_PILOT.traLoi}%`}
          giaiThich="thấp nghĩa là bé đang nhắn vào một cái hộp thư không ai mở" />
      </div>

      {/*
        Tải nông dân tách riêng vì nó là con số DUY NHẤT ở trang này không phải phép đo -
        và một con số ước nằm lẫn giữa bốn con số đo là cách chắc chắn để có ngày ai đó
        trích nó ra khỏi ngữ cảnh.
      */}
      <h2 className="display text-[16px] mt-3.5">Tải của nông dân</h2>
      <div className="card mt-2">
        <div className="flex items-baseline gap-2">
          <span className="display text-[20px]">
            {soLieu.taiNongDanPhut === null ? "—" : `~${soLieu.taiNongDanPhut} phút`}
          </span>
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={MAU[soTran(soLieu.taiNongDanPhut, NGUONG_PILOT.taiNongDanPhut)]}>
            {soTran(soLieu.taiNongDanPhut, NGUONG_PILOT.taiNongDanPhut) === "dat"
              ? "trong ngưỡng"
              : soTran(soLieu.taiNongDanPhut, NGUONG_PILOT.taiNongDanPhut) === "chua-dat"
                ? "vượt ngưỡng"
                : "chưa đủ dữ liệu"}
          </span>
        </div>
        <div className="text-[13px] font-semibold mt-1">
          mỗi chuồng mỗi tuần, do chương trình học thêm vào
        </div>
        <p className="text-[12px] mt-1.5 rounded-[10px] px-2.5 py-2 leading-relaxed"
          style={{ background: "#FCF3E8", border: "1px solid #F0D9B4", color: "#7a4d1a" }}>
          ⚠️ <b>{CANH_BAO_UOC}.</b> {soLieu.viecTuMongMuon} việc trong 7 ngày qua ÷{" "}
          {soLieu.soChuongSong} chuồng đang chạy × {PHUT_MOI_VIEC_UOC} phút/việc (ước).
          Ngưỡng §4.4 là ≤{NGUONG_PILOT.taiNongDanPhut} phút/<b>nông trại</b>/tuần, còn đây
          tính theo <b>chuồng</b> - một nông trại nhiều chuồng thì con số thật cao hơn. Số
          dùng để quyết định phải hỏi chính cô chú ở tuần phỏng vấn.
        </p>
        <div className="text-[12.5px] mt-2" style={{ color: "var(--ink-soft)" }}>
          Nhãn một chạm: <b>{soLieu.nhanDaDung}</b>/{soLieu.nhanCoTheDung} việc chăm đã xong có
          gắn nhãn{tyLeNhan === null ? "" : ` (${tyLeNhan}%)`}. Nhãn là <b>tuỳ chọn</b> - con
          số thấp không phải lỗi cần sửa, nó chỉ có nghĩa là báo cáo phân biệt được ít việc hơn.
        </div>
      </div>

      <h2 className="display text-[16px] mt-3.5">Quyền dữ liệu của gia đình</h2>
      <div className="card mt-2 text-[13px] grid gap-1.5">
        <div>Đã rút lời đồng ý: <b>{sla.daRutConsent}</b></div>
        <div>Đã xin xoá dữ liệu: <b>{sla.daXinXoa}</b> · xoá xong: <b>{sla.daXoaXong}</b></div>
        <div>
          Thời gian xoá (trung vị):{" "}
          <b>{sla.gioTrungViXoa === null ? "chưa có ca nào" : `${sla.gioTrungViXoa} giờ`}</b>
        </div>
        <div>Số lần cha mẹ tải dữ liệu của bé về: <b>{sla.daTaiVe}</b></div>
        <p className="text-[12px] mt-1 leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          Xin xoá và xoá xong nằm trong <b>cùng một giao dịch</b>, nên trung vị gần bằng 0 là
          đúng - không phải dấu hiệu chưa đo. Con số này có mặt để nếu có ngày việc xoá bị
          tách ra chạy nền thì độ trễ hiện ra ngay ở đây.
        </p>
      </div>

      <h2 className="display text-[16px] mt-3.5">Theo nhóm pilot</h2>
      {cohort.length === 0 ? (
        <p className="text-[13px] mt-2" style={{ color: "var(--ink-soft)" }}>
          Chưa có suất nào. Mời một chuồng ở khối 👨‍👩‍👧 trên <Link href="/admin">bảng quản trị</Link>.
        </p>
      ) : (
        <div className="grid gap-2 mt-2">
          {cohort.map((c) => (
            <div key={c.cohortKey} className="card">
              <div className="text-[14px] font-semibold">{c.cohortKey}</div>
              <div className="text-[12.5px] mt-1 leading-relaxed" style={{ color: "var(--ink-soft)" }}>
                Chờ trả lời <b>{c.moi}</b> · đang chạy <b>{c.dangChay}</b> · tạm dừng{" "}
                <b>{c.tamDung}</b> · đã rút <b>{c.daRut}</b> · đã kết thúc <b>{c.daXong}</b>
              </div>
              <div className="text-[12.5px] mt-0.5" style={{ color: "var(--ink-soft)" }}>
                {c.soBe} hồ sơ bé đang gắn · {c.baiXong} khoảnh khắc đã xem xong
              </div>
            </div>
          ))}
        </div>
      )}

      {/*
        Chỉ số §4.3 duy nhất KHÔNG đếm được ở đây, và nói thẳng vì sao. Bịa ra một ô "0" cho
        nó là tệ hơn không có: một số 0 lấy từ một phép đếm rỗng trông y hệt một số 0 lấy từ
        một phép đếm đúng, và cái người đọc cần biết là **vì sao** nó bằng 0.
      */}
      <div className="card mt-3.5" style={{ background: "var(--paddy-tint)" }}>
        <div className="text-[13.5px] font-semibold" style={{ color: "var(--paddy-deep)" }}>
          🔒 Số lần trẻ tự mua / tự quyết vòng đời: <b>0 theo cấu trúc</b>
        </div>
        <p className="text-[12.3px] mt-1 leading-relaxed" style={{ color: "var(--paddy-deep)" }}>
          Đây <b>không phải một phép đếm</b> - không có đường nào để đếm, và đó chính là câu
          trả lời. Khu của bé không có endpoint nào ghi tiền hay đổi vòng đời; mong muốn của
          bé chỉ ghi một dòng chờ, còn việc thật chỉ sinh từ một cái chạm của cha mẹ đã đăng
          nhập. Chốt nằm ở bất biến <b>§9.41</b>, và bộ kiểm soi từng lời gọi trong mã nguồn
          ở mỗi lần chạy <code>npm test</code>.
        </p>
      </div>
    </div>
  );
}
