"use client";
// Admin cấp tài khoản đăng nhập cho nông dân. Nông dân không tự đăng ký được.
import { useRef, useState, useTransition } from "react";
import { createWorkerAccount, resetWorkerPassword } from "@/app/admin-actions";
import { useToast } from "@/components/Toast";

const CLS = "rounded-[11px] px-3 py-2.5 text-[14px] w-full";
const BORDER = { border: "1.5px solid var(--line)", background: "#fff" } as const;

/** Hồ sơ nông dân chưa gắn tài khoản — cấp login cho người đã có sẵn trong hệ thống. */
export type WorkerNoAccount = { id: string; name: string; area: string };

export function CreateWorkerForm({ pending: unlinked }: { pending: WorkerNoAccount[] }) {
  const toast = useToast();
  const [busy, start] = useTransition();
  const [mode, setMode] = useState<"new" | "existing">(unlinked.length > 0 ? "existing" : "new");
  const [pw, setPw] = useState("");
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={ref}
      className="grid gap-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        if (mode === "new") data.delete("workerId");
        start(async () => {
          try {
            const r = await createWorkerAccount(data);
            toast(r.message, r.ok ? "ok" : "warn");
            if (r.ok) { ref.current?.reset(); setPw(""); }
          } catch {
            toast("Không tạo được tài khoản. Thử lại giúp mình nhé.", "err");
          }
        });
      }}
    >
      <div className="seg">
        <button type="button" className={mode === "existing" ? "on" : ""} onClick={() => setMode("existing")}
          disabled={unlinked.length === 0}>
          Nông dân đã có ({unlinked.length})
        </button>
        <button type="button" className={mode === "new" ? "on" : ""} onClick={() => setMode("new")}>
          Thêm người mới
        </button>
      </div>

      {mode === "existing" ? (
        unlinked.length === 0 ? (
          <div className="soft text-[12.8px]" style={{ color: "var(--ink-soft)" }}>
            Mọi nông dân trong hệ thống đều đã có tài khoản đăng nhập.
          </div>
        ) : (
          <select name="workerId" className={CLS} style={BORDER} required>
            {unlinked.map((w) => <option key={w.id} value={w.id}>{w.name} — {w.area}</option>)}
          </select>
        )
      ) : (
        <>
          <input name="name" className={CLS} style={BORDER} required maxLength={80}
            placeholder="Tên cô/chú — VD: Cô Lan" />
          <input name="area" className={CLS} style={BORDER} required maxLength={120}
            placeholder="Khu vực — VD: Ba Vì, Hà Nội" />
          <div className="flex gap-2.5">
            <input name="yearsExp" type="number" min={0} max={60} defaultValue={5} className={CLS} style={BORDER}
              aria-label="Số năm kinh nghiệm" />
            <input name="maxBarns" type="number" min={1} max={50} defaultValue={15} className={CLS} style={BORDER}
              aria-label="Số chuồng nhận tối đa" />
          </div>
          <p className="text-[11.4px] -mt-1" style={{ color: "var(--ink-soft)" }}>
            Hai ô trên: số năm kinh nghiệm · số chuồng nhận tối đa.
          </p>
        </>
      )}

      <input name="username" className={CLS} style={BORDER} required
        autoCapitalize="none" autoCorrect="off" spellCheck={false}
        pattern="[a-z0-9][a-z0-9._\-]{2,31}"
        placeholder="Tên đăng nhập — VD: colan (chữ thường, không dấu)" />
      <input name="password" className={CLS} style={BORDER} required minLength={8}
        value={pw} onChange={(e) => setPw(e.target.value)}
        placeholder="Mật khẩu (≥ 8 ký tự) — đưa tận tay cho cô/chú" />

      <button className="btn btn-primary mt-1" type="submit"
        disabled={busy || pw.length < 8 || (mode === "existing" && unlinked.length === 0)}>
        {busy ? "Đang tạo…" : "Cấp tài khoản"}
      </button>
      <p className="text-[11.6px]" style={{ color: "var(--ink-soft)" }}>
        Ghi lại tên đăng nhập + mật khẩu rồi đưa cho cô/chú — hệ thống không hiện lại mật khẩu.
        Nông dân vào <b>/dang-nhap</b> gõ đúng hai thứ đó là vào được hộp việc.
      </p>
    </form>
  );
}

/** Đặt lại mật khẩu cho một nông dân đã có tài khoản. */
export function ResetWorkerPassword({ workerId, name }: { workerId: string; name: string }) {
  const toast = useToast();
  const [busy, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost btn-sm flex-none" onClick={() => setOpen(true)}>
        Đổi mật khẩu
      </button>
    );
  }

  return (
    <div className="flex gap-2 items-center flex-1 min-w-0">
      <input
        className="rounded-[11px] px-3 py-2 text-[13.5px] min-w-0 flex-1" style={BORDER}
        type="text" value={pw} minLength={8} placeholder={`Mật khẩu mới cho ${name}`}
        onChange={(e) => setPw(e.target.value)}
      />
      <button
        type="button" className="btn btn-yolk btn-sm flex-none" disabled={busy || pw.length < 8}
        onClick={() => {
          const data = new FormData();
          data.set("password", pw);
          start(async () => {
            try {
              const r = await resetWorkerPassword(workerId, data);
              toast(r.message, r.ok ? "ok" : "warn");
              if (r.ok) { setPw(""); setOpen(false); }
            } catch {
              toast("Không đổi được mật khẩu.", "err");
            }
          });
        }}
      >{busy ? "…" : "Lưu"}</button>
      <button type="button" className="btn btn-ghost btn-sm flex-none" onClick={() => { setOpen(false); setPw(""); }}>
        Huỷ
      </button>
    </div>
  );
}
