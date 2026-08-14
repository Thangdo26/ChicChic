"use client";
// Bé gửi mong muốn cho bố mẹ (spec §10.4, Epic 6).
//
// ⚠️ **Component này KHÔNG được import gì thuộc khu người lớn** - không action trang trí,
// chợ, hoá đơn; không `lib/pricing`; không Prisma. Bộ kiểm quét mã nguồn canh (§9.40).
//
// ⚠️⚠️ **Bé không thấy tiền, và không thấy món còn hàng hay không** (FL-D06). Ở đây một món
// trang trí chỉ là một cái hình và một câu; mọi thứ liên quan tới tiền nằm ở luồng của người
// lớn. Nếu có ngày ai đó muốn thêm một con số vào màn hình này, đó là lúc phải đọc lại §8.3.
//
// **Một màn một việc** (§18.1): bé chọn NHÓM trước, rồi mới thấy các lựa chọn trong nhóm đó.
// Bày cả mười tám nút cùng lúc lên màn hình một đứa trẻ 5 tuổi là bày một bức tường chữ.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guiMongMuon } from "@/app/learning-actions";
import { useToast } from "@/components/Toast";
import { type LoaiMongMuon, NHAN_NHOM, nhomMongMuon } from "@/lib/de-xuat-meta";

const NHOM: LoaiMongMuon[] = [
  "CARE_WISH", "CURATED_FARM_QUESTION", "DECOR_WISH", "FAMILY_ACTIVITY_WISH",
];

export default function WishPicker({
  childId, daGui,
}: {
  childId: string;
  /** Khoá bé đã nhắn và đang chờ bố mẹ - để không mời bé nhắc lại cùng một điều. */
  daGui: string[];
}) {
  const [nhom, setNhom] = useState<LoaiMongMuon | null>(null);
  const [gui, setGui] = useState<string[]>(daGui);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  if (!nhom) {
    return (
      <div className="grid gap-2.5 mt-4">
        {NHOM.map((k) => (
          <button key={k} className="btn text-[16px] justify-start"
            style={{ minHeight: 58, textAlign: "left", background: "#fff", border: "1px solid var(--line)" }}
            onClick={() => setNhom(k)}>
            <span className="text-[22px] mr-2" aria-hidden>{NHAN_NHOM[k].emoji}</span>
            {NHAN_NHOM[k].choBe}
          </button>
        ))}
      </div>
    );
  }

  const ds = nhomMongMuon(nhom);

  return (
    <div className="mt-4">
      <button className="btn btn-ghost btn-sm" onClick={() => setNhom(null)}>‹ Chọn điều khác</button>
      <h2 className="display text-[18px] mt-2.5">
        {NHAN_NHOM[nhom].emoji} {NHAN_NHOM[nhom].choBe}
      </h2>

      <div className="grid gap-2 mt-3">
        {ds.map((m) => {
          const roi = gui.includes(m.key);
          return (
            <button key={m.key} className="btn text-[15px] justify-start"
              disabled={roi || pending}
              style={{
                minHeight: 58, textAlign: "left",
                background: roi ? "var(--paddy-tint)" : "#fff",
                border: `1px solid ${roi ? "var(--paddy)" : "var(--line)"}`,
              }}
              onClick={() =>
                start(async () => {
                  const r = await guiMongMuon({ childId, optionKey: m.key });
                  toast(r.message, r.ok ? "ok" : "err");
                  // Cả hai nhánh `ok` (gửi mới **và** "đã nhắn rồi") đều khoá nút lại: bé bấm
                  // lại lần nữa mà màn hình không đổi gì là một màn hình có vẻ hỏng.
                  if (r.ok) { setGui((x) => [...x, m.key]); router.refresh(); }
                })
              }>
              <span className="text-[22px] mr-2" aria-hidden>{m.emoji}</span>
              <span className="flex-1">{m.choBe}</span>
              {roi && <span className="text-[12.5px] font-semibold" style={{ color: "var(--paddy-deep)" }}>đã nhắn 💌</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
