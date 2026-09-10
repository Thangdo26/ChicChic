"use client";
// Nhận lời mời cho một chuồng (spec §10.2).
//
// ⚠️ **Nói hết hệ quả TRƯỚC khi có nút để bấm.** Cái bấm này khoá vòng đời một đàn gà thật
// và không đảo ngược được (§9.37). Một cái nút "Đồng ý" đứng một mình dưới hai dòng chữ vui
// vẻ là cách lấy sự đồng ý mà người ta không biết mình đang đồng ý cái gì.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { nhanLoiMoiGiaDinh } from "@/app/family-actions";
import { useToast } from "@/components/Toast";

export type HoSoChonVM = { id: string; nickname: string; emoji: string; sanSang: boolean; vuong?: string };

export default function FamilyInviteCard({
  enrollmentId, barnSlug, barnLabel, hoSo,
}: {
  enrollmentId?: string; barnSlug?: string; barnLabel: string; cohortKey?: string; hoSo: HoSoChonVM[];
}) {
  const sanSang = hoSo.filter((h) => h.sanSang);
  const [childId, setChildId] = useState(sanSang.length === 1 ? sanSang[0].id : "");
  const [xacNhan, setXacNhan] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const nhan = () =>
    start(async () => {
      try {
        const r = await nhanLoiMoiGiaDinh({ enrollmentId, barnSlug, childId, xacNhan });
        toast(r.message, r.ok ? "ok" : "err");
        if (r.ok) router.refresh();
      } catch { toast("Chưa nhận được phản hồi. Kiểm tra mạng rồi thử lại nhé.", "err"); }
    });

  return (
    <div className="card">
      <h3 className="display text-[16px]">🌾 Cùng bé khám phá {barnLabel}</h3>
      <p className="text-[13px] mt-1.5 leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        Bạn xác nhận và chọn hồ sơ bên dưới là hành trình mở ngay, không chờ duyệt. Bé sẽ theo
        dõi đúng đàn gà này: hôm nay ăn gì, đẻ quả trứng đầu tiên lúc nào, ai là người chăm.
      </p>

      {/*
        Đoạn này là phần quan trọng nhất của cả trang. Nó phải đọc được hết trong một hơi và
        không được nằm dưới nút bấm.
      */}
      <div className="text-[13px] mt-3 rounded-[12px] px-3 py-2.5 leading-relaxed"
        style={{ background: "#FCF3E8", border: "1px solid #F0D9B4", color: "#7a4d1a" }}>
        <b>Khi bạn đồng ý, có một điều không đảo ngược được:</b>
        <ul className="mt-1.5 grid gap-1">
          <li>· Đàn gà ở chuồng này <b>chỉ còn một chặng cuối: nghỉ hưu ở nông trại</b>.</li>
          <li>· Bạn sẽ <b>không</b> nhận thịt đàn này, và <b>không</b> nuôi lứa mới thay vào.</li>
          <li>· Nông trại nuôi tiếp đàn đã hết đẻ, và giữ vậy kể cả khi sau này bạn rút khỏi
            chương trình hoặc xoá dữ liệu của bé.</li>
        </ul>
      </div>

      {sanSang.length === 0 ? (
        <p className="text-[13px] mt-3" style={{ color: "var(--ink-soft)" }}>
          Chưa có hồ sơ bé nào sẵn sàng.{" "}
          {hoSo.some((h) => !h.sanSang)
            ? "Hồ sơ đang có còn vướng một bước - xem ở phần dưới."
            : "Tạo hồ sơ cho bé trước rồi quay lại nhé."}
        </p>
      ) : (
        <>
          <div className="grid gap-1.5 mt-3.5">
            <span className="text-[12px] font-semibold">Chuồng này dành cho bé nào?</span>
            {sanSang.map((h) => (
              <button
                key={h.id} type="button"
                className="text-left rounded-[12px] px-3 py-2 border transition flex items-center gap-2"
                style={{
                  background: childId === h.id ? "var(--paddy-tint)" : "var(--paper2)",
                  borderColor: childId === h.id ? "var(--paddy-deep)" : "transparent",
                }}
                aria-pressed={childId === h.id} onClick={() => setChildId(h.id)}
              >
                <span className="text-[20px]">{h.emoji}</span>
                <span className="text-[13.5px] font-semibold">{h.nickname}</span>
              </button>
            ))}
          </div>

          <label className="flex gap-2 items-start mt-3.5 text-[13px] leading-relaxed">
            <input type="checkbox" className="mt-0.5" checked={xacNhan}
              onChange={(e) => setXacNhan(e.target.checked)} />
            <span>
              Tôi là phụ huynh của bé, đã đọc và đồng ý: đàn gà ở {barnLabel} sẽ <b>nghỉ hưu ở nông trại</b>, và
              điều này không đổi lại được.
            </span>
          </label>

          <button className="btn btn-primary w-full mt-3"
            disabled={!childId || !xacNhan || pending} aria-busy={pending} onClick={nhan}>
            {pending ? "Đang ghi…" : "Xác nhận & mở hành trình cho bé"}
          </button>
        </>
      )}
    </div>
  );
}
