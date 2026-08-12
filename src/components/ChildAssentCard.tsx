"use client";
// Hỏi chính bé 7–8 tuổi (spec §17.1, §10.2 bước 7).
//
// Đây là màn hình cha mẹ **quay sang cho bé xem**, nên chữ viết cho bé đọc: câu ngắn, không
// thuật ngữ, không "điều khoản". Và hai nút phải **cân nhau** - một cái nút "Có" to màu và
// một dòng chữ nhỏ mờ "để sau" thì không còn là một câu hỏi thật nữa.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ghiNhanAssent } from "@/app/family-actions";
import { useToast } from "@/components/Toast";

export default function ChildAssentCard({
  childId, nickname, emoji,
}: {
  childId: string; nickname: string; emoji: string;
}) {
  const [pending, start] = useTransition();
  const [dangGui, setDangGui] = useState<"co" | "chua" | null>(null);
  const toast = useToast();
  const router = useRouter();

  const tra = (dongY: boolean) =>
    start(async () => {
      setDangGui(dongY ? "co" : "chua");
      const r = await ghiNhanAssent({ childId, dongY });
      toast(r.message, r.ok ? "ok" : "err");
      setDangGui(null);
      if (r.ok) router.refresh();
    });

  return (
    <div className="card" style={{ background: "var(--yolk-tint)" }}>
      <div className="flex items-center gap-2">
        <span className="text-[26px]">{emoji}</span>
        <h3 className="display text-[16px]">Hỏi {nickname} một câu nhé</h3>
      </div>
      <p className="text-[14px] mt-2 leading-relaxed">
        Mở màn hình này cho bé xem rồi đọc cùng bé:
      </p>
      <p className="text-[15px] mt-2 rounded-[12px] px-3 py-2.5 leading-relaxed"
        style={{ background: "var(--paper)" }}>
        “Ở đây con sẽ được xem một chuồng gà thật, biết hôm nay các cô chú cho gà ăn gì, và
        làm vài việc nho nhỏ cùng bố mẹ. Con có muốn không?”
      </p>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <button className="btn btn-primary" disabled={pending} aria-busy={dangGui === "co"}
          onClick={() => tra(true)}>
          {dangGui === "co" ? "…" : "Con muốn 🌾"}
        </button>
        <button className="btn btn-ghost" disabled={pending} aria-busy={dangGui === "chua"}
          onClick={() => tra(false)}>
          {dangGui === "chua" ? "…" : "Con chưa muốn"}
        </button>
      </div>
      <p className="text-[12px] mt-2.5" style={{ color: "var(--ink-soft)" }}>
        Bé nói “chưa muốn” cũng không sao - hồ sơ để nguyên đó, hỏi lại lúc khác được.
      </p>
    </div>
  );
}
