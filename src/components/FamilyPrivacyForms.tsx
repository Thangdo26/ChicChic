"use client";
// Rút lời đồng ý · xoá dữ liệu của bé (spec §10.5, §17.3, §17.4).
//
// Hai việc **khác nhau**, và trang này không được gộp chúng vào một cái nút. Rút là "đóng
// cửa lại, dữ liệu còn đó"; xoá là "bôi trắng, không lấy lại được". Người ta thường muốn cái
// thứ nhất trước, và gộp lại nghĩa là ai đó mất cuốn album của con mình vì tưởng chỉ đang
// tạm dừng.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rutConsentTre, taiDuLieuTre, xoaDuLieuTre } from "@/app/family-actions";
import { useToast } from "@/components/Toast";

export type HoSoRiengTuVM = {
  id: string;
  nickname: string;
  emoji: string;
  trangThai: string;
  daRut: boolean;
};

export default function FamilyPrivacyForms({ hoSo }: { hoSo: HoSoRiengTuVM[] }) {
  const [pending, start] = useTransition();
  const [dangXoa, setDangXoa] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();

  const rut = (childId: string) =>
    start(async () => {
      const r = await rutConsentTre({ childId });
      toast(r.message, r.ok ? "ok" : "err");
      if (r.ok) router.refresh();
    });

  const xoa = (childId: string) =>
    start(async () => {
      const r = await xoaDuLieuTre({ childId });
      toast(r.message, r.ok ? "ok" : "err");
      setDangXoa(null);
      if (r.ok) router.refresh();
    });

  /**
   * Tải dữ liệu của bé về máy (Epic 7 · §17.3).
   *
   * Máy chủ trả **chữ**, trình duyệt tự dựng tệp. Không mở thêm một route tải nào: mỗi
   * endpoint mới là một cửa nữa phải canh, mà cửa đó lại nhận id từ thanh địa chỉ.
   *
   * `revokeObjectURL` ngay sau khi bấm - không có nó thì cả gói dữ liệu nằm lại trong bộ nhớ
   * của tab cho tới lúc đóng, và đây là đúng loại dữ liệu không nên nằm lại đâu cả.
   */
  const tai = (childId: string) =>
    start(async () => {
      const r = await taiDuLieuTre({ childId });
      if (!r.ok || !r.noiDung || !r.tenTep) {
        toast(r.message, "err");
        return;
      }
      const url = URL.createObjectURL(new Blob([r.noiDung], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.tenTep;
      a.click();
      URL.revokeObjectURL(url);
      toast(r.message, "ok");
    });

  if (hoSo.length === 0) {
    return (
      <p className="text-[13px] mt-3" style={{ color: "var(--ink-soft)" }}>
        Chưa có hồ sơ bé nào.
      </p>
    );
  }

  return (
    <div className="grid gap-2.5 mt-3">
      {hoSo.map((h) => (
        <div key={h.id} className="card">
          <div className="flex items-center gap-2">
            <span className="text-[24px]">{h.emoji}</span>
            <div>
              <div className="text-[14.5px] font-semibold">{h.nickname}</div>
              <div className="text-[12px]" style={{ color: "var(--ink-soft)" }}>{h.trangThai}</div>
            </div>
          </div>

          {!h.daRut && (
            <button className="btn btn-ghost btn-sm w-full mt-3" disabled={pending}
              onClick={() => rut(h.id)}>
              Rút lời đồng ý
            </button>
          )}

          {/*
            Tải về nằm NGAY TRÊN nút xoá, cố ý (§17.3 mục 5): thứ tự trên màn hình là thứ tự
            người ta làm, và thứ tự đúng là "cầm cuốn album đi rồi hãy đóng cửa". Đặt nó ở
            một trang khác, hay dưới nút xoá, là để phần lớn người dùng không bao giờ thấy nó.
          */}
          <button className="btn btn-ghost btn-sm w-full mt-2" disabled={pending} aria-busy={pending}
            onClick={() => tai(h.id)}>
            ⬇️ Tải dữ liệu của bé về máy
          </button>

          {dangXoa === h.id ? (
            <div className="mt-2.5 rounded-[12px] px-3 py-2.5 text-[13px] leading-relaxed"
              style={{ background: "#FDECEC", border: "1px solid #F3C9C9", color: "#8a2f2f" }}>
              <b>Xoá là không lấy lại được.</b> Tên gọi, hình đại diện và mọi thứ bé đã làm
              sẽ mất. Chuồng, đàn gà, ảnh nông trại chụp và sổ thu hoạch <b>vẫn còn nguyên</b>
              {" "}- và cam kết đàn nghỉ hưu ở nông trại cũng vậy.
              <div className="mt-1.5">
                Muốn giữ lại làm kỷ niệm thì bấm <b>Tải dữ liệu của bé về máy</b> trước đã nhé
                - sau khi xoá thì bên mình cũng không dựng lại được.
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2.5">
                <button className="btn btn-sm" disabled={pending} onClick={() => setDangXoa(null)}>
                  Thôi, để lại
                </button>
                <button className="btn btn-sm" disabled={pending} aria-busy={pending}
                  style={{ background: "#B23B3B", color: "#fff" }}
                  onClick={() => xoa(h.id)}>
                  {pending ? "Đang xoá…" : "Xoá hẳn"}
                </button>
              </div>
            </div>
          ) : (
            <button className="btn btn-ghost btn-sm w-full mt-2" disabled={pending}
              style={{ color: "#B23B3B" }}
              onClick={() => setDangXoa(h.id)}>
              Xoá hẳn dữ liệu của bé
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
