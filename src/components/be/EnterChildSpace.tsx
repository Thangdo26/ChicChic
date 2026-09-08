"use client";
import { useTransition } from "react";
import { vaoKhuCuaBe } from "@/app/learning-actions";
import { scopeChanged } from "@/components/SessionScopeSync";
import { useToast } from "@/components/Toast";

export default function EnterChildSpace({ childId }: { childId: string }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  return <button className="btn btn-ghost btn-sm ml-auto" disabled={pending} aria-busy={pending}
    onClick={() => start(async () => {
      const result = await vaoKhuCuaBe({ childId });
      if (!result.ok) { toast(result.message, "err"); return; }
      scopeChanged();
      window.location.assign(`/be/${encodeURIComponent(childId)}`);
    })}>
    {pending ? "Đang mở…" : "Vào khu của bé →"}
  </button>;
}
