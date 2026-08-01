"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  login, resetPassword, sendRegisterCode, sendResetCode, verifyAndRegister, type AuthResult,
} from "@/app/auth-actions";
import { useToast } from "@/components/Toast";

const CLS = "w-full rounded-[11px] px-3 py-3 text-[14px]";
const BORDER = { border: "1.5px solid var(--line)", background: "#fff" } as const;

function Field(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={CLS} style={BORDER} />;
}

/** Ô hiện mã OTP khi bản demo chưa cấu hình gửi email thật. */
function DevCode({ code }: { code: string }) {
  return (
    <div className="rounded-[12px] p-3 text-center" style={{ background: "var(--yolk-tint)", border: "1px dashed var(--yolk)" }}>
      <div className="text-[11.5px]" style={{ color: "var(--yolk-deep)" }}>
        ⚙️ Bản demo chưa cấu hình gửi email — mã của bạn là
      </div>
      <div className="display font-bold text-[26px] tracking-[8px] mt-1">{code}</div>
    </div>
  );
}

function useNextPath() {
  const sp = useSearchParams();
  const next = sp.get("next") ?? "/tai-khoan";
  // chỉ nhận đường dẫn nội bộ, chặn open-redirect kiểu //evil.com
  return next.startsWith("/") && !next.startsWith("//") ? next : "/tai-khoan";
}

/**
 * Sau khi đăng nhập/đăng ký, tải lại hẳn trang đích.
 * Cookie phiên vừa được đặt trong server action; điều hướng cứng đảm bảo cả
 * layout gốc (chip tài khoản trên thanh trên) lẫn trang đích đều đọc được phiên mới.
 */
const goAuthed = (path: string) => window.location.assign(path);

// ---------------- Đăng ký (2 bước) ----------------

export function RegisterForm() {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const next = useNextPath();

  const run = (fn: () => Promise<AuthResult>, after?: (r: AuthResult) => void) =>
    start(async () => {
      try {
        const r = await fn();
        toast(r.message, r.ok ? "ok" : "warn");
        if (r.devCode) setDevCode(r.devCode);
        after?.(r);
      } catch {
        toast("Có lỗi xảy ra — thử lại giúp mình nhé.", "err");
      }
    });

  if (step === 1) {
    return (
      <div className="card grid gap-2.5">
        <div className="font-bold text-[14px]">Bước 1 · Xác minh email</div>
        <Field type="email" inputMode="email" autoComplete="email" placeholder="email của bạn"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn btn-primary" disabled={pending || !email.includes("@")}
          onClick={() => run(() => sendRegisterCode(email), (r) => { if (r.ok) setStep(2); })}>
          {pending ? "Đang gửi mã…" : "Gửi mã xác minh →"}
        </button>
        <p className="text-[12px] text-center" style={{ color: "var(--ink-soft)" }}>
          Đã có tài khoản? <Link href={`/dang-nhap?next=${encodeURIComponent(next)}`} className="font-semibold" style={{ color: "var(--paddy)" }}>Đăng nhập</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="card grid gap-2.5">
      <div className="font-bold text-[14px]">Bước 2 · Nhập mã & đặt mật khẩu</div>
      <p className="text-[12.4px] -mt-1" style={{ color: "var(--ink-soft)" }}>
        Mã 6 số đã gửi tới <b>{email}</b>{" "}
        <button className="font-semibold underline" style={{ color: "var(--paddy)" }}
          onClick={() => { setStep(1); setDevCode(null); }}>đổi email</button>
      </p>
      {devCode && <DevCode code={devCode} />}
      <Field inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="Mã 6 số"
        value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
      <Field placeholder="Tên của bạn (hiện trong chuồng)" value={name} maxLength={80}
        onChange={(e) => setName(e.target.value)} />
      <Field type="password" autoComplete="new-password" placeholder="Mật khẩu (≥ 8 ký tự)"
        value={pw} onChange={(e) => setPw(e.target.value)} />
      <Field type="password" autoComplete="new-password" placeholder="Nhập lại mật khẩu"
        value={pw2} onChange={(e) => setPw2(e.target.value)} />
      {pw2 && pw !== pw2 && <p className="text-[12px]" style={{ color: "#B4472F" }}>Hai mật khẩu chưa khớp.</p>}
      <button className="btn btn-primary" disabled={pending || code.length !== 6 || pw.length < 8 || pw !== pw2}
        onClick={() => run(() => verifyAndRegister(email, code, pw, name), (r) => { if (r.ok) goAuthed(next); })}>
        {pending ? "Đang tạo tài khoản…" : "Tạo tài khoản ✓"}
      </button>
      <button className="btn btn-ghost btn-sm mx-auto" disabled={pending}
        onClick={() => run(() => sendRegisterCode(email))}>Gửi lại mã</button>
    </div>
  );
}

// ---------------- Đăng nhập ----------------

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const next = useNextPath();

  const submit = () =>
    start(async () => {
      try {
        const r = await login(email, pw);
        toast(r.message, r.ok ? "ok" : "warn");
        if (r.ok) goAuthed(next);
      } catch {
        toast("Có lỗi xảy ra — thử lại giúp mình nhé.", "err");
      }
    });

  return (
    <div className="card grid gap-2.5">
      <Field type="email" inputMode="email" autoComplete="email" placeholder="email của bạn"
        value={email} onChange={(e) => setEmail(e.target.value)} />
      <Field type="password" autoComplete="current-password" placeholder="mật khẩu"
        value={pw} onChange={(e) => setPw(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && email.includes("@") && pw && submit()} />
      <button className="btn btn-primary" disabled={pending || !email.includes("@") || !pw} onClick={submit}>
        {pending ? "Đang đăng nhập…" : "Đăng nhập"}
      </button>
      <div className="flex justify-between text-[12px]">
        <Link href={`/quen-mat-khau`} className="font-semibold" style={{ color: "var(--ink-soft)" }}>Quên mật khẩu?</Link>
        <Link href={`/dang-ky?next=${encodeURIComponent(next)}`} className="font-semibold" style={{ color: "var(--paddy)" }}>Tạo tài khoản mới</Link>
      </div>
    </div>
  );
}

// ---------------- Quên mật khẩu (2 bước) ----------------

export function ForgotForm() {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();

  const run = (fn: () => Promise<AuthResult>, after?: (r: AuthResult) => void) =>
    start(async () => {
      try {
        const r = await fn();
        toast(r.message, r.ok ? "ok" : "warn");
        if (r.devCode) setDevCode(r.devCode);
        after?.(r);
      } catch {
        toast("Có lỗi xảy ra — thử lại giúp mình nhé.", "err");
      }
    });

  if (step === 1) {
    return (
      <div className="card grid gap-2.5">
        <Field type="email" inputMode="email" autoComplete="email" placeholder="email tài khoản của bạn"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn btn-primary" disabled={pending || !email.includes("@")}
          onClick={() => run(() => sendResetCode(email), (r) => { if (r.ok) setStep(2); })}>
          {pending ? "Đang gửi mã…" : "Gửi mã đặt lại mật khẩu →"}
        </button>
      </div>
    );
  }

  return (
    <div className="card grid gap-2.5">
      <p className="text-[12.4px]" style={{ color: "var(--ink-soft)" }}>Mã đã gửi tới <b>{email}</b>.</p>
      {devCode && <DevCode code={devCode} />}
      <Field inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="Mã 6 số"
        value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
      <Field type="password" autoComplete="new-password" placeholder="Mật khẩu mới (≥ 8 ký tự)"
        value={pw} onChange={(e) => setPw(e.target.value)} />
      <button className="btn btn-primary" disabled={pending || code.length !== 6 || pw.length < 8}
        onClick={() => run(() => resetPassword(email, code, pw), (r) => { if (r.ok) goAuthed("/tai-khoan"); })}>
        {pending ? "Đang đặt lại…" : "Đặt mật khẩu mới ✓"}
      </button>
      <button className="btn btn-ghost btn-sm mx-auto" disabled={pending}
        onClick={() => run(() => sendResetCode(email))}>Gửi lại mã</button>
    </div>
  );
}
