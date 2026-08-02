"use client";
// Hộp thư của chuồng — dùng chung cho CẢ HAI vai. Khác nhau ở props chứ không phải
// ở hai component riêng: chủ chuồng có nút "Chuyển thành việc", nông dân có nút trả
// lời nhanh.
//
// CỐ Ý không có "đang gõ" và không có tích "đã xem" kiểu Messenger. Cô chú đang ở
// ngoài vườn — hạ kỳ vọng phản hồi tức thì là tính năng, không phải thiếu sót.
import { useEffect, useRef, useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { messageToTask, reportMessage, sendMessage } from "@/app/message-actions";
import type { MessageVM } from "@/lib/messages";
import { timeAgo } from "@/lib/decor";

/** Trả lời một chạm cho nông dân — lời giải cho "15 chuồng × mấy tin mỗi ngày". */
const QUICK_REPLIES = [
  "Đã nhận, chiều mình làm nhé 👍",
  "Đàn khoẻ bình thường bạn nhé",
  "Mai mình gửi ảnh nhé",
  "Cái này bạn hỏi nông trại giúp mình",
];

const MAX_BODY = 1000;
const CLS = "rounded-[11px] px-3 py-2.5 text-[13.7px] w-full";
const BORDER = { border: "1.5px solid var(--line)", background: "#fff" } as const;

export default function BarnThread({
  barnSlug, role, ownerName, workerName, initial, compact = false,
}: {
  barnSlug: string;
  role: "OWNER" | "WORKER" | "ADMIN";
  ownerName: string;
  workerName: string;
  initial: MessageVM[];
  /** Nhúng trong trang khác (trang chuồng của nông dân) thì gọn lại. */
  compact?: boolean;
}) {
  // Với admin (chỉ đọc) thì không có "phía bên kia" — mỗi dòng tự xưng tên theo vai.
  const otherName = role === "OWNER" ? workerName : ownerName;
  const [list, setList] = useState<MessageVM[]>(initial);
  const [text, setText] = useState("");
  const [taskFor, setTaskFor] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const endRef = useRef<HTMLDivElement>(null);

  // Danh sách từ server đổi (revalidate) thì đồng bộ lại.
  useEffect(() => setList(initial), [initial]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [list.length]);

  const readOnly = role === "ADMIN";

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

  const report = (messageId: string) => {
    start(async () => {
      const r = await reportMessage(messageId);
      toast(r.message, r.ok ? "ok" : "err");
    });
  };

  return (
    <div className={compact ? "" : "card"}>
      {!compact && (
        <>
          <div className="font-bold text-[14px]">💬 Hộp thư với {otherName}</div>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--ink-soft)" }}>
            {otherName} thường trả lời trong ngày — cô chú còn đang ở ngoài chuồng.
          </p>
        </>
      )}

      {/* Luật riêng tư nói TRƯỚC, không phải giấu trong điều khoản. */}
      <p className="text-[11.4px] mt-1.5 mb-2" style={{ color: "var(--ink-soft)" }}>
        🔒 Nông trại chỉ đọc hộp thư này khi có tin bị báo cáo hoặc bị hệ thống gắn cờ.
      </p>

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
            <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[86%] min-w-0">
                <div
                  className="rounded-[13px] px-3 py-2 text-[13.2px] leading-relaxed"
                  style={m.mine
                    ? { background: "var(--paddy-tint)", color: "var(--ink)" }
                    : { background: "var(--paper2)", color: "var(--ink)", border: "1px solid var(--line-soft)" }}
                >
                  <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</span>
                </div>

                <div className={`flex items-center gap-1.5 mt-0.5 ${m.mine ? "justify-end" : ""}`}>
                  <span className="text-[10.8px]" style={{ color: "var(--ink-soft)" }}>
                    {m.mine ? "Bạn" : m.author === "WORKER" ? workerName : ownerName} · {timeAgo(m.createdAt)}
                  </span>
                  {m.flagged && <span className="text-[10.8px]" title="Có vẻ trao đổi liên hệ riêng">🚩</span>}
                  {m.reported && <span className="text-[10.8px]" title="Đã báo cáo với nông trại">⚠️</span>}
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

                {/* Báo cáo tin của phía bên kia */}
                {!readOnly && !m.mine && !m.reported && (
                  <div className="mt-0.5">
                    <button type="button" disabled={pending} onClick={() => report(m.id)}
                      className="text-[10.8px]" style={{ color: "var(--ink-soft)" }}>
                      Báo cáo tin này
                    </button>
                  </div>
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
