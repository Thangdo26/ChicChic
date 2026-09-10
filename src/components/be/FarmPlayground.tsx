"use client";
import { useState } from "react";
import { Coop, type PlacedDecor } from "@/components/Illustrations";
import { cauSoCon, type GaVM } from "@/lib/chuong-3d";

/** Chạm để quan sát, không ghi dữ liệu hoặc giao việc ngoài đời. */
export default function FarmPlayground({ dan, soCon, outside, decor }: {
  dan: GaVM[]; soCon: number; outside: boolean; decor: PlacedDecor[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const bird = dan.find((g) => g.id === selected);
  return (
    <section className="family-playground mt-4" aria-label="Góc ngắm gà">
      <div className="flex items-center justify-between gap-2 p-4 pb-1">
        <h2 className="display text-lg">Góc ngắm gà của mình 🌼</h2>
        <button type="button" className="coop-motion-toggle" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? "Đi dạo nhé" : "Dừng một chút"}</button>
      </div>
      <div className="coop-playground px-2" data-paused={paused}>
        <Coop dan={dan} decor={decor} outside={outside} label="Góc của mình" chon={selected} onChon={setSelected} animated large />
      </div>
      <div className="px-4 pb-4 pt-2 min-h-24" aria-live="polite" aria-atomic="true">
        <p className="font-semibold">{bird ? `Xin chào ${bird.ten}!` : cauSoCon(soCon)}</p>
        <p className="text-sm mt-1">{bird?.yem ? "Mình nhìn thấy chiếc yếm của bạn ấy rồi. Cùng bố mẹ tìm bạn ấy trong ảnh nhé!" : "Chạm nhẹ vào một bạn gà để gọi tên. Mình cùng ngắm, rồi kể với bố mẹ nhé."}</p>
        <p className="text-xs mt-2" style={{ color: "var(--ink-soft)" }}>Đây là hình minh họa. Ảnh cô chú gửi mới là khoảnh khắc ở nông trại.</p>
      </div>
    </section>
  );
}
