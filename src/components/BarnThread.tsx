"use client";
// Hộp thư của chuồng — dùng chung cho CẢ HAI vai. Khác nhau ở props chứ không phải
// ở hai component riêng: chủ chuồng có nút "Chuyển thành việc", nông dân có nút trả
// lời nhanh, nông trại (ADMIN) chỉ đọc.
//
// CỐ Ý không có "đang gõ" và không có tích "đã xem" kiểu Messenger. Cô chú đang ở
// ngoài vườn — hạ kỳ vọng phản hồi tức thi là tính năng, không phải thiếu sót.
// Nhưng tin MỚI thì vẫn phải tự hiện ra: poll giống hệt chuông thông báo.
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { messageToTask, reportMessage, sendMessage } from "@/app/message-actions";
import { MAX_BODY, REPORT_REASONS, reportLabel, type MessageVM, type ThreadRole } from "@/lib/messages-meta";
import { timeAgo } from "@/lib/decor";

/** Trả lời một chạm cho nông dân — lời giải cho "15 chuồng × mấy tin mỗi ngày". */
const QUICK_REPLIES = [
  "Đã nhận, chiều mình làm nhé 👍",
  "Đàn khoẻ bình thường bạn nhé",
  "Mai mình gửi ảnh nhé",
  "Cái này bạn hỏi nông trại giúp mình",
];

/** Nhanh hơn chuông (20s) vì đang mở hộp thư thì người ta đợi câu trả lời. */
const POLL_MS = 12_000;

const CLS = "rounded-[11px] px-3 py-2.5 text-[13.7px] w-full";
const BORDER = { border: "1.5px solid var(--line)", background: "#fff" } as const;

const sig = (l: MessageVM[]) => l.map((m) => `${m.id}:${m.reported}`).join("|");

export default function BarnThread({
  barnSlug, role, ownerName, workerName, initial, compact = false, focusId,
}: {
  barnSlug: string;
  role: ThreadRole;
  ownerName: string;
  workerName: string;
  initial: MessageVM[];
  /** Nhúng trong trang khác (trang chuồng của nông dân) thì gọn lại. */
  compact?: boolean;
  /** Cuộn tới và làm nổi một tin cụ thể — nông trại mở từ hàng đợi báo cáo. */
  focusId?: string;
}) {
  const readOnly = role === "ADMIN";
  // Với admin (chỉ đọc) thì không có "phía bên kia" — mỗi dòng tự xưng tên theo vai.
  const otherName = role === "OWNER" ? workerName : ownerName;

  const [list, setList] = useState<MessageVM[]>(initial);
  const [text, setText] = useState("");
  const [taskFor, setTaskFor] = useState<string | null>(null);
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const endRef = useRef<HTMLDivElement>(null);

  // Danh sách từ server đổi (revalidate) thì đồng bộ lại — chỉnh state trong lúc
  // render theo đúng pattern React, không dùng effect.
  const serverSig = sig(initial);
  const syncedSig = useRef(serverSig);
  if (syncedSig.current !== serverSig) {
    syncedSig.current = serverSig;
    setList(initial);
  }

  /**
   * Kéo tin mới về. Đây là thứ làm hộp thư "hai chiều": bên kia gửi xong thì bên này
   * thấy mà không phải tải lại trang. Nông trại không poll — đọc một lần là đủ.
   */
  const refresh = useCallback(async () => {
    if (readOnly) return;
    try {
      const res = await fetch(`/api/barns/${barnSlug}/messages`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { list: MessageVM[] };
      setList(data.list);
    } catch {
      /* mất mạng thì thôi, lần poll sau thử lại */
    }
  }, [barnSlug, readOnly]);

  useEffect(() => {
    if (readOnly) return;
    const tick = () => { if (document.visibilityState === "visible") void refresh(); };
    const id = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [refresh, readOnly]);

  // Có tin mới thì cuộn xuống cuối; nếu đang mở từ hàng đợi báo cáo thì cuộn tới tin đó.
  useEffect(() => {
    if (focusId) {
      document.getElementById(`tin-${focusId}`)?.scrollIntoView({ block: "center" });
      return;
    }
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [list.length, focusId]);

  const send = (body: string) => {
    const b = body.trim();
    if (!b || pending) return;
    start(async () => {
      const r = await sendMessage(barnSlug, b);
      if (r.list) setList(r.list);
      if (r.ok) setText("");
      // Tin bị gắn cờ vẫn gửi được, nhưng nói rõ vì sao nên trao đổi trong app.
      toast(r.message, r.ok ? (r.warned ? "warn" : "ok") : "err");
    });
  };

  const toTask = (messageId: string, kind: string) => {
    start(async () => {
      const r = await messageToTask(messageId, kind);
      toast(r.message, r.ok ? "ok" : "err");
      if (r.ok) setTaskFor(null);
    });
  };

  const report = (messageId: string, reason: string) => {
    start(async () => {
      const r = await reportMessage(messageId, reason);
      toast(r.message, r.ok ? "ok" : "err");
      if (r.ok) { setReportFor(null); void refresh(); }
    });
  };

  return (
    <div className={compact ? "" : "card"}>
      {!compact && !readOnly && (
        <>
          <div className="font-bold text-[14px]">💬 Hộp thư với {otherName}</div>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--ink-soft)" }}>
            {otherName} thường trả lời trong ngày — cô chú còn đang ở ngoài chuồng.
          </p>
        </>
      )}

      {/* Luật riêng tư nói TRƯỚC, không phải giấu trong điều khoản. */}
      {!readOnly && (
        <p className="text-[11.4px] mt-1.5 mb-2" style={{ color: "var(--ink-soft)" }}>
          🔒 Nông trại chỉ đọc hộp thư này khi có tin bị báo cáo hoặc bị hệ thống gắn cờ.
        </p>
      )}

      <div
        className="grid gap-2 py-1"
        style={{ maxHeight: compact ? 320 : 460, overflowY: "auto" }}
      >
        {list.length === 0 ? (
          <div className="soft text-center py-6 text-[12.8px]" style={{ color: "var(--ink-soft)" }}>
            Chưa có tin nào. {role === "OWNER"
              ? `Hỏi ${otherName} một câu về đàn gà của bạn xem sao.`
              : "Chủ chuồng chưa nhắn gì — bạn cũng nhắn trước được nhé."}
          </div>
        ) : (
          list.map((m) => (
            <div
              key={m.id}
              id={`tin-${m.id}`}
              className={`flex ${m.mine ? "justify-end" : "justify-start"}`}
              style={focusId === m.id ? { scrollMarginTop: 80 } : undefined}
            >
              <div className="max-w-[86%] min-w-0">
                <div
                  className="rounded-[13px] px-3 py-2 text-[13.2px] leading-relaxed"
                  style={{
                    ...(m.mine
                      ? { background: "var(--paddy-tint)", color: "var(--ink)" }
                      : { background: "var(--paper2)", color: "var(--ink)", border: "1px solid var(--line-soft)" }),
                    ...(focusId === m.id ? { outline: "2px solid #B4472F", outlineOffset: 2 } : {}),
                  }}
                >
                  <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</span>
                </div>

                <div className={`flex items-center gap-1.5 mt-0.5 flex-wrap ${m.mine ? "justify-end" : ""}`}>
                  <span className="text-[10.8px]" style={{ color: "var(--ink-soft)" }}>
                    {m.mine ? "Bạn" : m.author === "WORKER" ? workerName : ownerName} · {timeAgo(m.createdAt)}
                  </span>
                  {m.flagged && <span className="text-[10.8px]" title="Có vẻ trao đổi liên hệ riêng">🚩</span>}
                  {m.reported && (
                    <span className="text-[10.5px] font-semibold rounded-full px-1.5"
                      style={{ background: "#FBE7E1", color: "#8A3A26" }}>
                      ⚠️ {reportLabel(m.reportReason)}
                    </span>
                  )}
                </div>

                {/* Chủ chuồng: biến ý định thành việc có minh chứng */}
                {!readOnly && role === "OWNER" && m.mine && (
                  taskFor === m.id ? (
                    <div className="flex flex-wrap gap-1.5 mt-1 justify-end">
                      <button type="button" disabled={pending} onClick={() => toTask(m.id, "FEED")}
                        className="btn btn-ghost btn-sm">🌾 Cho ăn</button>
                      <button type="button" disabled={pending} onClick={() => toTask(m.id, "CHECK")}
                        className="btn btn-ghost btn-sm">🔍 Kiểm tra</button>
                      <button type="button" onClick={() => setTaskFor(null)}
                        className="text-[11.5px] px-1" style={{ color: "var(--ink-soft)" }}>Thôi</button>
                    </div>
                  ) : (
                    <div className="flex justify-end mt-0.5">
                      <button type="button" onClick={() => setTaskFor(m.id)}
                        className="text-[11.2px] font-semibold" style={{ color: "var(--paddy)" }}>
                        → Chuyển thành việc
                      </button>
                    </div>
                  )
                )}

                {/* Báo cáo tin của phía bên kia — phải CHỌN loại vi phạm trước */}
                {!readOnly && !m.mine && !m.reported && (
                  reportFor === m.id ? (
                    <div className="rounded-[12px] p-2.5 mt-1.5" style={{ background: "var(--paper2)", border: "1px solid var(--line)" }}>
                      <div className="font-semibold text-[12.2px] mb-1">Báo cáo tin này vì?</div>
                      <div className="grid gap-1">
                        {REPORT_REASONS.map((r) => (
                          <button key={r.id} type="button" disabled={pending}
                            onClick={() => report(m.id, r.id)}
                            className="text-left rounded-[9px] px-2.5 py-1.5"
                            style={{ background: "#fff", border: "1px solid var(--line)" }}>
                            <div className="font-semibold text-[12.4px]" style={{ color: "var(--ink)" }}>{r.label}</div>
                            <div className="text-[11px]" style={{ color: "var(--ink-soft)" }}>{r.hint}</div>
                          </button>
                        ))}
                      </div>
                      <button type="button" onClick={() => setReportFor(null)}
                        className="text-[11.5px] mt-1.5" style={{ color: "var(--ink-soft)" }}>Thôi, bỏ qua</button>
                      <p className="text-[10.8px] mt-1" style={{ color: "var(--ink-soft)" }}>
                        Báo cáo xong, nông trại sẽ đọc được cả hộp thư này để hiểu bối cảnh.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-0.5">
                      <button type="button" onClick={() => setReportFor(m.id)}
                        className="text-[10.8px]" style={{ color: "var(--ink-soft)" }}>
                        Báo cáo tin này
                      </button>
                    </div>
                  )
                )}
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      {readOnly ? (
        <div className="soft text-[12.4px] mt-2" style={{ color: "var(--ink-soft)" }}>
          Chế độ xem của nông trại — đọc để xử lý báo cáo, không nhắn thay hai bên được.
        </div>
      ) : (
        <>
          {role === "WORKER" && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {QUICK_REPLIES.map((q) => (
                <button key={q} type="button" disabled={pending} onClick={() => send(q)}
                  className="text-[11.6px] font-semibold rounded-full px-2.5 py-1"
                  style={{ background: "var(--paper2)", border: "1px solid var(--line)", color: "var(--ink)" }}>
                  {q}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2 mt-2.5">
            <textarea
              className={`${CLS} flex-1`}
              style={BORDER}
              rows={2}
              maxLength={MAX_BODY}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={role === "OWNER"
                ? `Hỏi ${otherName} về đàn gà của bạn…`
                : "Nhắn cho chủ chuồng…"}
            />
            <button type="button" disabled={pending || !text.trim()} onClick={() => send(text)}
              className="btn btn-primary btn-sm flex-none">
              {pending ? "…" : "Gửi"}
            </button>
          </div>

          <p className="text-[11.2px] mt-1.5" style={{ color: "var(--ink-soft)" }}>
            {role === "OWNER"
              ? "Nhắn tin là để hỏi han. Muốn cô/chú làm gì ngoài đời thì bấm “Chuyển thành việc” — có việc mới có ảnh minh chứng."
              : "Nhắn gì cũng được, nhưng đừng hứa số trứng hay ngày thu hoạch — cứ báo đúng những gì đang thấy ở chuồng."}
          </p>
        </>
      )}
    </div>
  );
}
