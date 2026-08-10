"use client";
// Ô quét mã chuyển khoản - dùng chung cho banner cọc và hoá đơn trang trí.
//
// Nguyên tắc: đây là THÊM một lối, không phải THAY lối cũ. Chưa cấu hình QR, ảnh tải
// không được, hay nhà cung cấp sập - component tự biến mất và người dùng vẫn chuyển
// khoản được bằng cách gõ tay. Không bao giờ để một ô ảnh vỡ nằm giữa đường tiền.
//
// Ảnh đã tự in tên chủ TK · số TK · SỐ TIỀN · NỘI DUNG CK · tên ngân hàng (`showinfo`
// trong lib/vietqr.ts), nên ở đây KHÔNG chép lại mấy con số đó lần nữa: hai nguồn chữ
// cho cùng một số tiền là hai chỗ để lệch nhau.
import { useState } from "react";
import { payQrUrl } from "@/lib/vietqr";
import { fmtVnd } from "@/lib/pricing";

/** Tỉ lệ ảnh nhà cung cấp trả về ở template `compact` + `showinfo` (540×714). */
const W = 540;
const H = 714;

export default function PayQR({
  amountVnd,
  code,
  label = "Quét mã để chuyển khoản",
}: {
  amountVnd: number;
  /** Mã nội dung chuyển khoản đã lưu ở `payCode` - KHÔNG tự suy ra từ id. */
  code: string;
  label?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = payQrUrl(amountVnd, code);
  if (!url || failed) return null;

  return (
    <div
      className="rounded-[13px] p-3 mt-2.5 text-center"
      style={{ background: "#fff", border: "1px solid #EBD8AE" }}
    >
      <div className="font-semibold text-[13.2px]" style={{ color: "var(--yolk-deep)" }}>
        📲 {label}
      </div>

      {/*
        Thẻ <img> thường, cố ý KHÔNG dùng next/image: ảnh này do nhà cung cấp sinh riêng
        theo (số tiền + mã đơn) nên mỗi hoá đơn một URL khác - không có gì để tối ưu và
        không cache lại được. Đi qua next/image chỉ thêm một chặng proxy của Vercel đúng
        lúc người dùng đang trả tiền, lại bắt phải khai host vào `remotePatterns`
        (biến build-time ⟹ đổi nhà cung cấp là phải Redeploy). Xem CODEMAP §10.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={`Mã QR chuyển khoản ${fmtVnd(amountVnd)}, nội dung ${code}`}
        width={W}
        height={H}
        className="mx-auto mt-2 rounded-[9px]"
        style={{ width: "100%", maxWidth: 208, height: "auto" }}
        onError={() => setFailed(true)}
      />

      <p className="text-[12.2px] mt-2 leading-snug" style={{ color: "var(--ink-soft)" }}>
        Mở app ngân hàng → <b>quét mã</b>. Số tiền và nội dung đã nằm sẵn trong mã, bạn
        không phải gõ lại.
      </p>
    </div>
  );
}
