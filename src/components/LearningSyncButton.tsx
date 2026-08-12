"use client";
// Nút "tìm khoảnh khắc mới" ở /gia-dinh (spec §14.5 - cổng đồng bộ, Epic 4).
//
// Component client: chỉ vẽ và gọi action. Không đụng Prisma, không tự kiểm quyền - luật nằm
// ở `learning-actions.dongBoKhoanhKhac` (§1.2). Và nó **không nhận id nào**: phạm vi là tài
// khoản đang đăng nhập, quyết định ở server.
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { dongBoKhoanhKhac } from "@/app/learning-actions";
import { useToast } from "@/components/Toast";

export default function LearningSyncButton() {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  return (
    <button
      className="btn btn-ghost btn-sm" disabled={pending} aria-busy={pending}
      onClick={() =>
        start(async () => {
          const r = await dongBoKhoanhKhac();
          toast(r.message, r.ok ? "ok" : "err");
          if (r.ok) router.refresh();
        })
      }
    >
      {pending ? "Đang tìm…" : "Tìm khoảnh khắc mới"}
    </button>
  );
}
