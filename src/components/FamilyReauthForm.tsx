"use client";
// Cửa "gõ lại mật khẩu" của ChicChic Gia đình (spec §17.1, Epic 2).
//
// Component client: chỉ vẽ và gọi action. Nó **không** tự biết ai được đi tiếp - luật nằm ở
// `family-actions.xacMinhLai` và ở từng trang gọi `daXacMinhGanDay()` (§1.2).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { xacMinhLai } from "@/app/family-actions";
import { useToast } from "@/components/Toast";

export default function FamilyReauthForm({ next, viec }: { next: string; viec: string }) {
  const [password, setPassword] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const gui = () =>
    start(async () => {
      const r = await xacMinhLai({ password });
      toast(r.message, r.ok ? "ok" : "err");
      if (r.ok) {
        setPassword("");
        // `refresh()` trước `push()`: trang đích đọc dấu xác minh ở server, mà bản render cũ
        // của nó có thể còn nằm trong cache của router.
        router.refresh();
        router.push(next);
      }
    });

  return (
    <div className="card mt-3">
      <h2 className="display text-[17px]">🔒 Gõ lại mật khẩu</h2>
      <p className="text-[13px] mt-1.5 leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        Bạn sắp <b>{viec}</b>. Phiên đăng nhập ở máy này sống tới 30 ngày, nên trước những
        việc đụng tới dữ liệu của bé, ChicChic hỏi lại một lần để chắc là <b>đúng bạn</b>
        {" "}đang ngồi đây.
      </p>
      <form
        className="grid gap-2 mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (password && !pending) gui();
        }}
      >
        <label className="grid gap-1">
          <span className="text-[12px] font-semibold">Mật khẩu</span>
          <input
            className="input" type="password" autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className="btn btn-primary" type="submit" disabled={!password || pending} aria-busy={pending}>
          {pending ? "Đang kiểm…" : "Xác minh"}
        </button>
      </form>
      <p className="text-[12px] mt-2.5" style={{ color: "var(--ink-soft)" }}>
        Xác minh có hiệu lực <b>10 phút</b>, và tự hết ngay sau khi việc kia xong.
      </p>
    </div>
  );
}
