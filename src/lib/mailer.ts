// Gửi email mã xác minh.
// - Có RESEND_API_KEY  → gửi thật qua Resend (https://resend.com - free tier đủ cho PoC).
// - Chưa cấu hình      → "chế độ demo": không gửi được email, trả mã về để UI hiện tại chỗ
//                        (kèm nhãn rõ ràng). Nhờ vậy luồng đăng ký test được từ đầu tới cuối
//                        trước khi có tài khoản Resend.
export type SendResult =
  | { sent: true }
  | { sent: false; devCode: string }; // demo mode - hiện mã ngay trên màn hình

export async function sendCodeEmail(to: string, code: string, purpose: "REGISTER" | "RESET"): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, devCode: code };

  const subject = purpose === "REGISTER"
    ? `ChicChic - mã xác minh đăng ký: ${code}`
    : `ChicChic - mã đặt lại mật khẩu: ${code}`;

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:420px;margin:0 auto;padding:24px">
      <div style="font-size:20px;font-weight:700"><span style="color:#2F5D3A">Chic</span><span style="color:#C0801F">Chic</span> 🐔</div>
      <p style="color:#374151;font-size:14px">
        ${purpose === "REGISTER" ? "Mã xác minh để hoàn tất đăng ký tài khoản:" : "Mã xác minh để đặt lại mật khẩu:"}
      </p>
      <div style="font-size:32px;font-weight:800;letter-spacing:8px;background:#F6F1E3;border-radius:12px;padding:16px;text-align:center">${code}</div>
      <p style="color:#6b7280;font-size:12px">Mã có hiệu lực 10 phút. Nếu không phải bạn yêu cầu, cứ bỏ qua email này.</p>
      <p style="color:#9ca3af;font-size:11px">ChicChic - đặt mua trước nông sản + dịch vụ nuôi hộ. Không phải kênh đầu tư.</p>
    </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM ?? "ChicChic <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[mailer] Resend lỗi", res.status, body.slice(0, 300));
    throw new Error("send-failed");
  }
  return { sent: true };
}
