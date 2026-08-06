"use client";
import { useEffect, useRef } from "react";

/**
 * Ngóng một mã chuyển khoản cho tới khi tiền được ghi nhận, rồi báo đúng MỘT lần.
 *
 * VÌ SAO CẦN: webhook ngân hàng xác nhận ở phía server. Màn hình đang mở không hề biết,
 * nên nếu không hỏi lại thì người dùng ngồi nhìn "chờ chuyển khoản" trong khi tiền đã
 * về và hàng đã vào chuồng. Trước bản này chỉ banner cọc có vòng hỏi; hoá đơn trang trí
 * và đơn chợ thì không có gì cả.
 *
 * Hai lớp hãm — giữ nguyên từ bản đã chạy tốt ở banner cọc, vì đối soát tay có thể mất
 * vài giờ:
 *  1. CHỈ hỏi khi tab đang mở. Không có nó thì một tab bỏ quên qua đêm bắn ~14.000
 *     request — đủ để một mình làm cạn pool kết nối Supabase.
 *  2. Giãn dần 6s → 60s. Người vừa bấm "đã chuyển khoản" cần biết ngay; người mở tab 20
 *     phút rồi thì mỗi phút một lần là quá đủ. Quay lại tab thì hỏi ngay và đặt lại 6s.
 *
 * ⚠️ `active` phải là "đơn CHƯA được trả", đừng thu hẹp thành "người dùng đã bấm tôi-đã-
 * chuyển-khoản". Tiền có thể về TRƯỚC khi người ta bấm nút — và đó chính là lúc màn hình
 * đứng im lâu nhất.
 */
export function usePayWatch(
  code: string | null | undefined,
  active: boolean,
  onPaid: () => void,
) {
  // Giữ trong ref để đổi hàm không làm dựng lại vòng hỏi.
  const cb = useRef(onPaid);
  cb.current = onPaid;
  const done = useRef(false);

  useEffect(() => {
    if (!code || !active || done.current) return;

    let delay = 6_000;
    let timer: number | undefined;
    let huy = false;

    const ask = async () => {
      if (document.visibilityState !== "visible" || done.current) return;
      try {
        const res = await fetch(`/api/thanh-toan?code=${encodeURIComponent(code)}`, { cache: "no-store" });
        if (!res.ok) return; // 401/404: thôi im lặng, lần sau thử lại
        const data = (await res.json()) as { paid?: boolean };
        if (data.paid && !done.current) {
          done.current = true;
          cb.current();
        }
      } catch {
        /* mạng chập chờn thì lần hỏi sau thử lại — không làm hỏng gì trên màn hình */
      }
    };

    const loop = () => {
      timer = window.setTimeout(async () => {
        if (huy) return;
        await ask();
        delay = Math.min(60_000, Math.round(delay * 1.5));
        if (!huy && !done.current) loop();
      }, delay);
    };
    loop();

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      delay = 6_000;
      void ask();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      huy = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [code, active]);
}
