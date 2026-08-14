"use client";
// Một mong muốn của bé, nhìn từ phía cha mẹ (spec §10.4 · §18.2, Epic 6).
//
// ⚠️⚠️ **KHÔNG nút nào ở đây mua gì cả** (FL-D06 · spec §10.4 bước 6). Với món trang trí, cái
// duy nhất card này làm được là **mở trang trang trí ra** - nơi có giá, có tồn kho và có đối
// soát tiền như mọi lần. Một nút "đồng ý mua luôn" ở đây sẽ biến màn hình của một đứa trẻ
// thành một cửa bán hàng, đúng thứ cả chương trình này được dựng để không làm.
//
// Một nút duy nhất **có tác động thật**: "Nhờ cô chú làm" của `CARE_WISH`, và nó tạo một việc
// cho nông dân chứ không tiêu một đồng nào (FL-D22).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { boQuaMongMuon, ghiNhoMongMuon, nhoCoChuLam } from "@/app/learning-actions";
import { useToast } from "@/components/Toast";

export type DeXuatVM = {
  id: string;
  kind: string;
  emoji: string;
  choChaMe: string;
  nickname: string;
  beEmoji: string;
  ngay: string;
  /** Đường dẫn "xem chỗ này" - trang trang trí hoặc hộp thư của chuồng. `null` = không có. */
  href: string | null;
  hrefNhan: string | null;
};

export default function DeXuatCard({ d }: { d: DeXuatVM }) {
  const [xong, setXong] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const chay = (fn: () => Promise<{ ok: boolean; message: string }>, nhan: string) =>
    start(async () => {
      const r = await fn();
      toast(r.message, r.ok ? "ok" : "err");
      if (r.ok) { setXong(nhan); router.refresh(); }
    });

  if (xong) {
    return (
      <div className="card text-[13.5px]" style={{ color: "var(--ink-soft)" }}>
        {d.emoji} {d.choChaMe} <b style={{ color: "var(--paddy-deep)" }}>· {xong}</b>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--ink-soft)" }}>
        <span aria-hidden>{d.beEmoji}</span>
        {d.nickname} · {d.ngay}
      </div>
      <div className="text-[14.5px] font-semibold mt-1">
        <span className="mr-1" aria-hidden>{d.emoji}</span>{d.choChaMe}
      </div>

      {d.href && d.hrefNhan && (
        <a href={d.href} className="btn btn-ghost btn-sm mt-2.5 no-underline w-full">
          {d.hrefNhan}
        </a>
      )}

      <div className="flex gap-2 mt-2.5">
        {/* "Để lần sau" cân bằng với nút chính - từ chối phải dễ bấm đúng bằng đồng ý, nếu
            không thì hàng chờ này chỉ có một lối thoát và người ta sẽ thôi mở nó ra. */}
        <button className="btn btn-ghost flex-1" disabled={pending}
          onClick={() => chay(() => boQuaMongMuon({ id: d.id }), "để lần sau")}>
          Để lần sau
        </button>
        {d.kind === "CARE_WISH" ? (
          <button className="btn btn-primary flex-1" disabled={pending} aria-busy={pending}
            onClick={() => chay(() => nhoCoChuLam({ id: d.id }), "đã nhờ cô chú")}>
            {pending ? "Đang nhắn…" : "Nhờ cô chú làm"}
          </button>
        ) : (
          <button className="btn btn-primary flex-1" disabled={pending} aria-busy={pending}
            onClick={() => chay(() => ghiNhoMongMuon({ id: d.id }), "đã ghi nhớ")}>
            Mình đã đọc rồi
          </button>
        )}
      </div>
    </div>
  );
}
