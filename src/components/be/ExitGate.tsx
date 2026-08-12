"use client";
// Cổng ra khỏi khu của bé (spec §15.4).
//
// ⚠️ **Đây là lối ra DUY NHẤT của `/be/**`.** Không trang nào trong khu của bé được có một
// `Link` thẳng sang khu người lớn - bộ kiểm quét mã nguồn canh điều đó (§9.40).
//
// Cổng này **không phải hàng rào an ninh duy nhất** và không được coi nó như vậy: server vẫn
// dựa vào phiên + quyền sở hữu ở mọi hành động (§15.4 của spec). Nó là cái chốt cửa để một
// đứa trẻ đang cầm máy không lạc vào phần có tiền, chứ không phải cái khoá.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moCuaRaNgoai } from "@/app/learning-actions";
import { useToast } from "@/components/Toast";

export default function ExitGate() {
  const [mo, setMo] = useState(false);
  const [mk, setMk] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  if (!mo) {
    return (
      <button className="btn btn-ghost w-full" onClick={() => setMo(true)}>
        Xong rồi, gọi bố mẹ nhé
      </button>
    );
  }

  return (
    <div className="card">
      <div className="text-[14px] font-semibold">👋 Nhờ bố mẹ một chút</div>
      <p className="text-[12.5px] mt-1 leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        Phần dành cho người lớn có chuồng, chợ và hoá đơn - nên bố mẹ gõ mật khẩu giúp bé nhé.
      </p>
      <input
        className="input mt-2.5" type="password" value={mk} autoComplete="current-password"
        placeholder="Mật khẩu của bố mẹ" onChange={(e) => setMk(e.target.value)}
      />
      <div className="flex gap-2 mt-2.5">
        {/* Hai nút cân nhau: quay lại chơi tiếp cũng là một lựa chọn thật. */}
        <button className="btn btn-ghost flex-1" onClick={() => { setMo(false); setMk(""); }}>
          Quay lại
        </button>
        <button className="btn btn-primary flex-1" disabled={!mk || pending} aria-busy={pending}
          onClick={() =>
            start(async () => {
              const r = await moCuaRaNgoai({ password: mk });
              if (!r.ok) { toast(r.message, "err"); return; }
              setMk("");
              router.push("/gia-dinh");
            })
          }>
          {pending ? "Đang mở…" : "Mở cho bố mẹ"}
        </button>
      </div>
    </div>
  );
}
