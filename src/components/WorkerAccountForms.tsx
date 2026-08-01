"use client";
// Admin cấp & quản lý tài khoản đăng nhập cho nông dân. Nông dân không tự đăng ký được.
import { useEffect, useRef, useState, useTransition } from "react";
import { createWorkerAccount, resetWorkerPassword } from "@/app/admin-actions";
import { useToast } from "@/components/Toast";

const CLS = "rounded-[11px] px-3 py-2.5 text-[14px] w-full";
const BORDER = { border: "1.5px solid var(--line)", background: "#fff" } as const;

/** Hồ sơ nông dân chưa gắn tài khoản — cấp login cho người đã có sẵn trong hệ thống. */
export type WorkerNoAccount = { id: string; name: string; area: string };

/** Một nông dân trong bảng quản lý ở /admin. */
export type WorkerRow = {
  id: string;
  name: string;
  area: string;
  active: boolean;
  maxBarns: number;
  barns: number;
  username: string | null;
  email: string | null;
};

// Bỏ ký tự dễ đọc nhầm (0/O, 1/l/I) — mật khẩu này sẽ được đọc qua điện thoại cho cô chú.
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

function randomPassword(len = 10) {
  const bytes = new Uint32Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

function CopyButton({ value, label = "Sao chép" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm flex-none"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          /* trình duyệt chặn clipboard → admin tự bôi đen chép tay */
        }
      }}
    >{done ? "✓ Đã chép" : label}</button>
  );
}

// ---------------- Popup thông tin tài khoản ----------------

/**
 * Bấm vào tên nông dân → popup này.
 * Hiện đầy đủ TÊN ĐĂNG NHẬP, và đặt mật khẩu mới ngay tại chỗ.
 *
 * Lưu ý: mật khẩu ĐANG dùng không hiện lại được — DB chỉ lưu bản băm scrypt
 * (`salt:hash`), không có đường giải ngược. Muốn đưa mật khẩu cho cô chú thì
 * đặt mật khẩu mới ở đây rồi chép lại ngay khi nó còn hiện trên màn hình.
 */
export function WorkerAccountDialog({
  worker, open, onClose, focusPassword,
}: {
  worker: WorkerRow;
  open: boolean;
  onClose: () => void;
  focusPassword?: boolean;
}) {
  const toast = useToast();
  const [busy, start] = useTransition();
  const [pw, setPw] = useState("");
  const [saved, setSaved] = useState<string | null>(null); // mật khẩu vừa đặt, để chép ra
  const inputRef = useRef<HTMLInputElement>(null);

  // Mở lại popup thì xoá sạch trạng thái lần trước — không để mật khẩu cũ nằm lay lắt.
  useEffect(() => {
    if (!open) { setPw(""); setSaved(null); return; }
    if (focusPassword) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open, focusPassword]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const save = () =>
    start(async () => {
      try {
        const r = await resetWorkerPassword(worker.id, pw);
        toast(r.message, r.ok ? "ok" : "warn");
        if (r.ok) { setSaved(pw); setPw(""); }
      } catch {
        toast("Không đổi được mật khẩu. Thử lại giúp mình nhé.", "err");
      }
    });

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center p-4"
      style={{ background: "rgba(20,28,23,.52)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Tài khoản của ${worker.name}`}
    >
      <div
        className="w-full max-w-[380px] rounded-[18px] overflow-hidden"
        style={{ background: "var(--card)", border: "1px solid var(--line)", boxShadow: "0 18px 50px rgba(20,28,23,.34)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2 px-4 py-3" style={{ background: "var(--paper2)", borderBottom: "1px solid var(--line-soft)" }}>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[15px] truncate">{worker.name}</div>
            <div className="text-[11.8px] truncate" style={{ color: "var(--ink-soft)" }}>
              {worker.area} · {worker.barns}/{worker.maxBarns} chuồng · {worker.active ? "đang nhận chuồng" : "tạm dừng nhận chuồng"}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng"
            className="flex-none text-[18px] leading-none px-1" style={{ color: "var(--ink-soft)" }}>×</button>
        </div>

        <div className="p-4 grid gap-3">
          {/* ---- Tên đăng nhập ---- */}
          <div>
            <div className="label" style={{ marginTop: 0 }}>Tên đăng nhập</div>
            {worker.username ? (
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate text-[15px] font-bold px-2.5 py-2 rounded-[10px]"
                  style={{ background: "var(--paddy-tint)", color: "var(--paddy-deep)" }}>{worker.username}</code>
                <CopyButton value={worker.username} />
              </div>
            ) : worker.email ? (
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 truncate text-[13.5px] font-bold px-2.5 py-2 rounded-[10px]"
                  style={{ background: "var(--paper2)", color: "var(--ink)" }}>{worker.email}</code>
                <CopyButton value={worker.email} />
              </div>
            ) : (
              <div className="soft text-[12.8px]" style={{ color: "#B4472F" }}>
                ⚠️ Nông dân này <b>chưa có tài khoản đăng nhập</b>. Dùng khối “Cấp tài khoản mới”
                bên dưới trang, tab <b>Nông dân đã có</b>.
              </div>
            )}
            {worker.username && worker.email && (
              <p className="text-[11.4px] mt-1" style={{ color: "var(--ink-soft)" }}>
                Đăng nhập bằng tên trên tại <b>/dang-nhap</b>. Email nội bộ <code>{worker.email}</code> chỉ để hệ thống dùng — không gửi thư tới đó.
              </p>
            )}
          </div>

          {/* ---- Mật khẩu ---- */}
          {worker.username || worker.email ? (
            <div>
              <div className="label" style={{ marginTop: 0 }}>Mật khẩu</div>

              {saved ? (
                <div className="rounded-[12px] p-3" style={{ background: "var(--yolk-tint)", border: "1px dashed var(--yolk)" }}>
                  <div className="text-[11.8px]" style={{ color: "var(--yolk-deep)" }}>
                    ✓ Đã lưu vào hệ thống. <b>Chép lại ngay</b> — đóng popup là không xem lại được.
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <code className="flex-1 min-w-0 truncate text-[16px] font-bold px-2.5 py-2 rounded-[10px]"
                      style={{ background: "#fff", border: "1px solid #EBD8AE" }}>{saved}</code>
                    <CopyButton value={saved} />
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={() => setSaved(null)}>
                    Đặt lại lần nữa
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-[11.8px] mb-1.5" style={{ color: "var(--ink-soft)" }}>
                    Mật khẩu đang dùng <b>không xem lại được</b> — hệ thống chỉ lưu bản mã hoá một chiều.
                    Cô chú quên thì đặt mật khẩu mới ở đây rồi đọc cho họ.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      ref={inputRef}
                      className="flex-1 min-w-0 rounded-[11px] px-3 py-2.5 text-[14px]"
                      style={BORDER}
                      type="text"
                      autoCapitalize="none" autoCorrect="off" spellCheck={false}
                      placeholder="Mật khẩu mới (≥ 8 ký tự)"
                      value={pw}
                      onChange={(e) => setPw(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && pw.length >= 8 && !busy) save(); }}
                    />
                    <button type="button" className="btn btn-ghost btn-sm flex-none" onClick={() => setPw(randomPassword())}>
                      🎲 Tạo
                    </button>
                  </div>
                  <button type="button" className="btn btn-primary mt-2" disabled={busy || pw.length < 8} onClick={save}>
                    {busy ? "Đang lưu…" : "Lưu mật khẩu mới"}
                  </button>
                  <p className="text-[11.4px] mt-1.5" style={{ color: "var(--ink-soft)" }}>
                    Lưu xong, mọi phiên đang đăng nhập của cô/chú bị đăng xuất và phải vào lại bằng mật khẩu mới.
                  </p>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Phần bấm được của một hàng nông dân: tên (mở popup xem tài khoản) + nút Đổi mật khẩu
 * (mở đúng popup đó, con trỏ nhảy sẵn vào ô mật khẩu). Một hàng — một popup, một state.
 */
export function WorkerAccountRow({ worker }: { worker: WorkerRow }) {
  const [open, setOpen] = useState(false);
  const [focusPw, setFocusPw] = useState(false);
  const hasAccount = !!worker.username || !!worker.email;

  return (
    <>
      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={() => { setFocusPw(false); setOpen(true); }}
          className="font-semibold text-[13.3px] truncate text-left hover:underline max-w-full"
          style={{ color: "var(--paddy-deep)" }}
          title="Xem thông tin đăng nhập"
        >
          {worker.name}
          {!worker.active && <span className="text-[11px] font-semibold ml-1.5" style={{ color: "#B4472F" }}>· tạm dừng</span>}
        </button>
        <div className="text-[11.6px] truncate" style={{ color: "var(--ink-soft)" }}>
          {/* Ba trạng thái: chưa có tài khoản · có nhưng đăng nhập bằng email · có tên đăng nhập */}
          {!hasAccount
            ? <span style={{ color: "#B4472F" }}>⚠️ chưa có tài khoản đăng nhập</span>
            : worker.username
              ? <>đăng nhập: <b>{worker.username}</b></>
              : <>đăng nhập bằng email: <b>{worker.email}</b></>}
          {" · "}{worker.barns}/{worker.maxBarns} chuồng · {worker.area}
        </div>
      </div>

      <button
        type="button"
        className="btn btn-ghost btn-sm flex-none"
        onClick={() => { setFocusPw(true); setOpen(true); }}
        disabled={!hasAccount}
      >Đổi mật khẩu</button>

      <WorkerAccountDialog
        worker={worker}
        open={open}
        focusPassword={focusPw}
        onClose={() => { setOpen(false); setFocusPw(false); }}
      />
    </>
  );
}

// ---------------- Cấp tài khoản mới ----------------

export function CreateWorkerForm({ pending: unlinked }: { pending: WorkerNoAccount[] }) {
  const toast = useToast();
  const [busy, start] = useTransition();
  const [mode, setMode] = useState<"new" | "existing">(unlinked.length > 0 ? "existing" : "new");
  const [workerId, setWorkerId] = useState(unlinked[0]?.id ?? "");
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [yearsExp, setYearsExp] = useState(5);
  const [maxBarns, setMaxBarns] = useState(15);
  const [username, setUsername] = useState("");
  const [pw, setPw] = useState("");
  const [done, setDone] = useState<{ username: string; password: string } | null>(null);

  const ready = username.trim().length >= 3 && pw.length >= 8
    && (mode === "new" ? name.trim().length >= 2 && area.trim().length >= 2 : !!workerId);

  const submit = () =>
    start(async () => {
      try {
        const r = await createWorkerAccount({
          workerId: mode === "existing" ? workerId : undefined,
          name, area, yearsExp, maxBarns,
          username: username.trim().toLowerCase(),
          password: pw,
        });
        toast(r.message, r.ok ? "ok" : "warn");
        if (r.ok) {
          setDone({ username: username.trim().toLowerCase(), password: pw });
          setName(""); setArea(""); setUsername(""); setPw("");
        }
      } catch {
        toast("Không tạo được tài khoản. Thử lại giúp mình nhé.", "err");
      }
    });

  // Vừa tạo xong: hiện lại đủ cặp đăng nhập để admin chép đưa cho cô chú.
  if (done) {
    return (
      <div className="rounded-[12px] p-3" style={{ background: "var(--paddy-tint)", border: "1px solid #CDE0C6" }}>
        <div className="font-semibold text-[13.4px]">✓ Đã cấp tài khoản</div>
        <p className="text-[11.8px] mt-0.5 mb-2" style={{ color: "var(--ink-soft)" }}>
          Chép lại và đưa tận tay cô/chú. <b>Đóng khối này là không xem lại mật khẩu được nữa.</b>
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[12px] w-[86px] flex-none" style={{ color: "var(--ink-soft)" }}>Tên đăng nhập</span>
          <code className="flex-1 min-w-0 truncate font-bold px-2 py-1.5 rounded-[9px]" style={{ background: "#fff", border: "1px solid var(--line)" }}>{done.username}</code>
          <CopyButton value={done.username} />
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[12px] w-[86px] flex-none" style={{ color: "var(--ink-soft)" }}>Mật khẩu</span>
          <code className="flex-1 min-w-0 truncate font-bold px-2 py-1.5 rounded-[9px]" style={{ background: "#fff", border: "1px solid var(--line)" }}>{done.password}</code>
          <CopyButton value={done.password} />
        </div>
        <button type="button" className="btn btn-ghost btn-sm mt-2.5" onClick={() => setDone(null)}>
          Cấp thêm người nữa
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-2.5">
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
          <select className={CLS} style={BORDER} value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
            {unlinked.map((w) => <option key={w.id} value={w.id}>{w.name} — {w.area}</option>)}
          </select>
        )
      ) : (
        <>
          <input className={CLS} style={BORDER} maxLength={80} placeholder="Tên cô/chú — VD: Cô Lan"
            value={name} onChange={(e) => setName(e.target.value)} />
          <input className={CLS} style={BORDER} maxLength={120} placeholder="Khu vực — VD: Ba Vì, Hà Nội"
            value={area} onChange={(e) => setArea(e.target.value)} />
          <div className="flex gap-2.5">
            <input type="number" min={0} max={60} className={CLS} style={BORDER} aria-label="Số năm kinh nghiệm"
              value={yearsExp} onChange={(e) => setYearsExp(Number(e.target.value))} />
            <input type="number" min={1} max={50} className={CLS} style={BORDER} aria-label="Số chuồng nhận tối đa"
              value={maxBarns} onChange={(e) => setMaxBarns(Number(e.target.value))} />
          </div>
          <p className="text-[11.4px] -mt-1" style={{ color: "var(--ink-soft)" }}>
            Hai ô trên: số năm kinh nghiệm · số chuồng nhận tối đa.
          </p>
        </>
      )}

      <input className={CLS} style={BORDER} autoCapitalize="none" autoCorrect="off" spellCheck={false}
        placeholder="Tên đăng nhập — VD: colan (chữ thường, không dấu)"
        value={username} onChange={(e) => setUsername(e.target.value)} />

      <div className="flex items-center gap-2">
        <input className="flex-1 min-w-0 rounded-[11px] px-3 py-2.5 text-[14px]" style={BORDER}
          type="text" autoCapitalize="none" autoCorrect="off" spellCheck={false}
          placeholder="Mật khẩu (≥ 8 ký tự)"
          value={pw} onChange={(e) => setPw(e.target.value)} />
        <button type="button" className="btn btn-ghost btn-sm flex-none" onClick={() => setPw(randomPassword())}>
          🎲 Tạo
        </button>
      </div>

      <button className="btn btn-primary mt-1" type="button" disabled={busy || !ready} onClick={submit}>
        {busy ? "Đang tạo…" : "Cấp tài khoản"}
      </button>
      <p className="text-[11.6px]" style={{ color: "var(--ink-soft)" }}>
        Tạo xong sẽ hiện lại đủ <b>tên đăng nhập + mật khẩu</b> để chép — sau đó hệ thống không
        hiện lại mật khẩu nữa. Nông dân vào <b>/dang-nhap</b> gõ đúng hai thứ đó là vào được hộp việc.
      </p>
    </div>
  );
}
