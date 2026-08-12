"use client";
// Tạo hồ sơ cho một bé (spec §10.2 bước 6, Epic 2).
//
// ⚠️ **Ba ô, và không được thêm ô thứ tư** mà không quay lại đọc spec §17: không ngày sinh,
// không trường lớp, không vị trí, không ảnh của bé. Danh sách hình đại diện là **đóng** và
// nằm ở `lib/family-gates.AVATAR_TRE` - đây là component client nên nó chỉ *vẽ* danh sách
// đó; phép kiểm thật nằm ở `family-actions.taoHoSoTre`.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { taoHoSoTre } from "@/app/family-actions";
import { useToast } from "@/components/Toast";
import { AVATAR_TRE, CONSENT_VERSION, MAX_BIET_DANH } from "@/lib/family-gates";

const NHOM_TUOI = [
  { key: "AGE_5_6", ten: "5 – 6 tuổi", mo: "Bé chưa đọc trôi. Nội dung nhiều hình, ít chữ." },
  { key: "AGE_7_8", ten: "7 – 8 tuổi", mo: "Bé đọc được. Có thêm một bước hỏi ý chính bé." },
] as const;

export default function ChildProfileForm() {
  const [nickname, setNickname] = useState("");
  const [ageBand, setAgeBand] = useState<"AGE_5_6" | "AGE_7_8" | "">("");
  const [avatarKey, setAvatarKey] = useState("");
  const [dongY, setDongY] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const duGiay = !!nickname.trim() && !!ageBand && !!avatarKey && dongY;

  const gui = () =>
    start(async () => {
      const r = await taoHoSoTre({ nickname, ageBand, avatarKey });
      toast(r.message, r.ok ? "ok" : "err");
      if (r.ok) {
        router.refresh();
        router.push("/gia-dinh");
      }
    });

  return (
    <div className="grid gap-3 mt-3">
      {/* Nói TRƯỚC khi hỏi, không phải sau. Người ta chỉ đồng ý được với thứ đã đọc. */}
      <div className="card">
        <h2 className="display text-[17px]">ChicChic giữ những gì của bé</h2>
        <ul className="text-[13px] mt-2 grid gap-1.5 leading-relaxed">
          <li>✅ <b>Tên gọi ở nhà</b> do bạn đặt - để gọi bé trong khu khám phá.</li>
          <li>✅ <b>Nhóm tuổi</b> - để chọn nội dung vừa sức.</li>
          <li>✅ <b>Một hình đại diện</b> bạn chọn từ danh sách có sẵn.</li>
          <li>✅ <b>Tiến độ học</b> - để bạn xem lại bé đã làm gì.</li>
        </ul>
        <p className="text-[13px] mt-2.5 rounded-[10px] px-2.5 py-2 leading-relaxed"
          style={{ background: "var(--paddy-tint)", color: "var(--paddy-deep)" }}>
          ❌ ChicChic <b>không</b> hỏi ngày sinh, trường lớp, địa chỉ hay số điện thoại của
          bé. <b>Không</b> nhận ảnh hay giọng nói của bé. <b>Không</b> quảng cáo, <b>không</b>
          {" "}chia sẻ dữ liệu của bé cho nông dân hay bất kỳ ai khác.
        </p>
        <p className="text-[12px] mt-2" style={{ color: "var(--ink-soft)" }}>
          Bản cam kết {CONSENT_VERSION}. Bạn rút lại hoặc xoá sạch bất cứ lúc nào ở mục
          {" "}<b>Quyền riêng tư</b>.
        </p>
      </div>

      <div className="card">
        <label className="grid gap-1">
          <span className="text-[12px] font-semibold">Bé tên gọi ở nhà là gì?</span>
          <input
            className="input" value={nickname} maxLength={MAX_BIET_DANH}
            placeholder="Ví dụ: Bin, Su, Cún"
            onChange={(e) => setNickname(e.target.value)}
          />
          {/* Lời nhắc này là thứ duy nhất chặn được họ tên đầy đủ - code không phân biệt được. */}
          <span className="text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
            Đặt tên gọi ở nhà thôi nhé, <b>đừng nhập họ tên đầy đủ</b> của bé.
          </span>
        </label>

        <div className="grid gap-1.5 mt-3.5">
          <span className="text-[12px] font-semibold">Bé bao nhiêu tuổi?</span>
          {NHOM_TUOI.map((n) => (
            <button
              key={n.key} type="button"
              className="text-left rounded-[12px] px-3 py-2.5 border transition"
              style={{
                background: ageBand === n.key ? "var(--paddy-tint)" : "var(--paper2)",
                borderColor: ageBand === n.key ? "var(--paddy-deep)" : "transparent",
              }}
              onClick={() => setAgeBand(n.key)}
            >
              <div className="text-[13.5px] font-semibold">{n.ten}</div>
              <div className="text-[12px] mt-0.5" style={{ color: "var(--ink-soft)" }}>{n.mo}</div>
            </button>
          ))}
        </div>

        <div className="grid gap-1.5 mt-3.5">
          <span className="text-[12px] font-semibold">Chọn một hình cho bé</span>
          <div className="flex flex-wrap gap-2">
            {AVATAR_TRE.map((a) => (
              <button
                key={a.key} type="button" title={a.ten} aria-label={a.ten}
                aria-pressed={avatarKey === a.key}
                className="rounded-[12px] w-[54px] h-[54px] text-[26px] border transition"
                style={{
                  background: avatarKey === a.key ? "var(--paddy-tint)" : "var(--paper2)",
                  borderColor: avatarKey === a.key ? "var(--paddy-deep)" : "transparent",
                }}
                onClick={() => setAvatarKey(a.key)}
              >
                {a.emoji}
              </button>
            ))}
          </div>
        </div>

        <label className="flex gap-2 items-start mt-4 text-[13px] leading-relaxed">
          <input type="checkbox" className="mt-0.5" checked={dongY}
            onChange={(e) => setDongY(e.target.checked)} />
          <span>
            Tôi là <b>cha/mẹ hoặc người giám hộ</b> của bé, tôi đã đọc phần trên và đồng ý cho
            ChicChic giữ đúng những thứ đó.
          </span>
        </label>

        <button className="btn btn-primary w-full mt-3" disabled={!duGiay || pending}
          aria-busy={pending} onClick={gui}>
          {pending ? "Đang tạo…" : "Tạo hồ sơ cho bé"}
        </button>
      </div>
    </div>
  );
}
