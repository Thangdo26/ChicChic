import React from "react";

export function Chick({ x = 0, y = 0 }: { x?: number; y?: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <ellipse cx="0" cy="0" rx="10" ry="8.5" fill="#F2D07A" />
      <circle cx="7" cy="-5" r="5.5" fill="#F2D07A" />
      <circle cx="8.5" cy="-6" r="1" fill="#22302A" />
      <path d="M12 -5 l4 1.4 l-4 1.4z" fill="#E7883C" />
      <path d="M6 -10 q1 -3 3 -1" stroke="#C0801F" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <path d="M-9 2 l-4 3 M-9 4 l-4 1" stroke="#C0801F" strokeWidth="1.3" strokeLinecap="round" />
    </g>
  );
}

/**
 * Cỡ chữ co lại theo độ dài để không tràn khung - biển rộng ~46 đơn vị SVG.
 * Đo theo ký tự thật (`Array.from`) vì một emoji là hai code unit.
 */
function fitFont(text: string, base: number, fits: number) {
  const n = Array.from(text).length || 1;
  return n <= fits ? base : Math.max(base * 0.55, (base * fits) / n);
}

/**
 * Pha một màu sáng hơn để làm mặt ván / mặt cánh, giữ khung ở màu gốc.
 *
 * Cần thiết vì người chơi chọn màu tự do: vẽ khung và mặt CÙNG một màu thì hàng rào
 * thành một mảng đặc, mất hết nét. Trộn về phía trắng theo `amount` giữ được hình khối
 * với mọi màu trong bảng.
 */
function mix(hex: string, amount = 0.42) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const up = (c: number) => Math.round(c + (255 - c) * amount);
  const r = up((n >> 16) & 255), g = up((n >> 8) & 255), b = up(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** Một món decor, vẽ quanh gốc toạ độ (0,0), khổ ~44×36 đơn vị SVG.
 *  Nhờ vậy đặt được ở bất kỳ đâu trên khung chuồng bằng transform.
 *
 *  `text` là chữ chủ chuồng tự khắc cho CÁI CỤ THỂ này (BarnDecor.text); `label` là
 *  tên chuồng, dùng làm chữ mặc định khi chưa khắc gì. Món nào nhận chữ và dài bao
 *  nhiêu thì tra `DECOR_TEXT` trong lib/decor.ts - đừng đoán ở đây. */
export function DecorSprite({
  svgKey, label = "Chuồng bạn", text, color, variant,
}: {
  svgKey: string; label?: string; text?: string | null;
  /** Màu của món sơn được (yếm, hàng rào, chong chóng). Bỏ trống = màu mặc định. */
  color?: string | null;
  /** Kiểu dáng của món có nhiều dạng (hàng rào). Bỏ trống = kiểu đầu tiên. */
  variant?: string | null;
}) {
  switch (svgKey) {
    case "bien": {
      const t = (text ?? label).trim() || "Chuồng bạn";
      return (
        <g>
          <rect x="-3" y="4" width="6" height="14" rx="1.5" fill="#8C5A3B" />
          <rect x="-25" y="-11" width="50" height="17" rx="3" fill="#FFFDF5" stroke="#C0801F" strokeWidth="1.8" />
          <text x="0" y="1.5" fontSize={fitFont(t, 9, 12)} textAnchor="middle" fill="#2F5D3A"
            fontFamily="var(--font-display),serif">
            {t}
          </text>
        </g>
      );
    }

    case "bang": {
      // Chưa khắc gì thì vẫn là mấy nét phấn nguệch ngoạc - bảng trống nhìn hụt hẫng.
      const t = (text ?? "").trim();
      return (
        <g>
          <rect x="-21" y="-15" width="42" height="30" rx="3" fill="#8C5A3B" />
          <rect x="-18" y="-12" width="36" height="24" rx="2" fill="#2C4136" />
          {t ? (
            <text x="0" y="2.5" fontSize={fitFont(t, 7, 11)} textAnchor="middle" fill="#DCE8D2"
              fontFamily="var(--font-display),serif">
              {t}
            </text>
          ) : (
            <path d="M-13 -6 h20 M-13 -1 h24 M-13 4 h16" stroke="#DCE8D2" strokeWidth="1.6"
              strokeLinecap="round" opacity=".85" />
          )}
          <circle cx="15" cy="9" r="1.8" fill="#F7F3E4" />
        </g>
      );
    }

    // Chong chóng: sơn được, và mua nhiều cái cắm rải quanh sân là chuyện bình thường.
    // Chưa chọn màu thì giữ nguyên bốn cánh bốn màu như bản đầu.
    case "chong": {
      const blades = color
        ? [color, mix(color, 0.3), mix(color, 0.55), mix(color, 0.75)]
        : ["#E7A33C", "#6FA45A", "#DE7B54", "#CFE3F2"];
      return (
        <g>
          <rect x="-1.4" y="0" width="2.8" height="20" rx="1.2" fill="#9B7A4D" />
          <g>
            <path d="M0 0 L0 -13 Q7 -13 7 -6 Z" fill={blades[0]} />
            <path d="M0 0 L13 0 Q13 7 6 7 Z" fill={blades[1]} />
            <path d="M0 0 L0 13 Q-7 13 -7 6 Z" fill={blades[2]} />
            <path d="M0 0 L-13 0 Q-13 -7 -6 -7 Z" fill={blades[3]} />
          </g>
          <circle cx="0" cy="0" r="2.2" fill="#C0801F" />
        </g>
      );
    }

    case "mang":
      return (
        <g>
          <rect x="-21" y="-4" width="42" height="11" rx="4.5" fill="#B06A43" />
          <rect x="-18" y="-2" width="36" height="4" rx="2" fill="#8A4F30" opacity=".55" />
          <rect x="-16" y="-10" width="7" height="7" rx="1.6" fill="#E7A33C" />
          <rect x="9" y="-10" width="7" height="7" rx="1.6" fill="#E7A33C" />
        </g>
      );

    case "nuoc":
      return (
        <g>
          <path d="M-8 -16 h16 a2 2 0 0 1 2 2 v15 h-20 v-15 a2 2 0 0 1 2 -2z" fill="#CFE3F2" stroke="#8FB4CE" strokeWidth="1.4" />
          <rect x="-8" y="-6" width="16" height="9" fill="#9FC9E6" opacity=".8" />
          <ellipse cx="0" cy="6" rx="17" ry="6" fill="#7FA9C9" />
          <ellipse cx="0" cy="4.5" rx="17" ry="6" fill="#B8D8EE" stroke="#8FB4CE" strokeWidth="1.2" />
          <ellipse cx="0" cy="4.5" rx="11" ry="3.4" fill="#DCEEFA" />
        </g>
      );

    case "orom":
      return (
        <g>
          <path d="M-20 8 h40 l-3 -13 h-34z" fill="#8C5A3B" />
          <path d="M-19 -4 q19 -11 38 0 q-19 6 -38 0z" fill="#E3C97E" />
          <path d="M-14 -3 l7 -4 M-4 -5 l8 -3 M6 -4 l7 -3" stroke="#C9A85C" strokeWidth="1.3" strokeLinecap="round" />
          <ellipse cx="-3" cy="-3" rx="6" ry="4.6" fill="#FFF8EC" stroke="#E4D5B4" strokeWidth="1" />
          <ellipse cx="7" cy="-2" rx="5" ry="4" fill="#FFF8EC" stroke="#E4D5B4" strokeWidth="1" />
        </g>
      );

    case "cau":
      return (
        <g>
          <rect x="-22" y="-8" width="44" height="5" rx="2.5" fill="#C8A96A" />
          <path d="M-10 -8 v3 M2 -8 v3 M13 -8 v3" stroke="#A98A4C" strokeWidth="1.2" />
          <path d="M-15 -3 l-4 16 M15 -3 l4 16" stroke="#9B7A4D" strokeWidth="3.4" strokeLinecap="round" />
        </g>
      );

    case "cay":
      return (
        <g>
          <circle cx="1" cy="-8" r="13" fill="#6FA45A" />
          <circle cx="-8" cy="-4" r="8.5" fill="#7FB268" />
          <circle cx="8" cy="-3" r="7" fill="#5E9450" />
          <path d="M-9 6 h18 l-2.5 12 h-13z" fill="#B06A43" />
          <rect x="-10" y="4" width="20" height="4" rx="1.6" fill="#C77C4E" />
        </g>
      );

    // Hàng rào: món DUY NHẤT vừa đổi màu vừa đổi kiểu, và cố ý mua được nhiều đoạn.
    // Người chơi ghép các đoạn lại thành cái sân của riêng mình - nên mỗi đoạn phải
    // độc lập về màu và kiểu (`BarnDecor.colorHex` / `.variant`, không phải thuộc tính
    // của LOẠI món). Bảng màu/kiểu hợp lệ ở `DECOR_COLORS`/`DECOR_VARIANTS` (lib/decor).
    case "rao": {
      const go = color || "#C9A26B";      // khung, thanh ngang
      const van = color ? mix(color) : "#EBDCC0"; // mặt ván, sáng hơn khung một bậc
      if (variant === "cong") {
        // Cổng ra vào: hai trụ cao + vòm, chừa lối đi ở giữa.
        return (
          <g>
            <rect x="-19" y="-10" width="6" height="22" rx="1.6" fill={go} />
            <rect x="13" y="-10" width="6" height="22" rx="1.6" fill={go} />
            <path d="M-16 -10 q16 -11 32 0" stroke={go} strokeWidth="3.4" fill="none" strokeLinecap="round" />
            <g fill={van} stroke={go} strokeWidth="1.1">
              <path d="M-11 12 v-13 h4 v13z" />
              <path d="M-4 12 v-13 h4 v13z" />
              <path d="M3 12 v-13 h4 v13z" />
            </g>
            <rect x="-12" y="2" width="24" height="2.6" rx="1.2" fill={go} />
          </g>
        );
      }
      if (variant === "thap") {
        // Rào thấp quây luống - chắn gà chứ không chắn tầm nhìn.
        return (
          <g>
            <g fill={van} stroke={go} strokeWidth="1.1">
              <path d="M-19 12 v-8 l3 -3 l3 3 v8z" />
              <path d="M-8 12 v-8 l3 -3 l3 3 v8z" />
              <path d="M3 12 v-8 l3 -3 l3 3 v8z" />
              <path d="M14 12 v-8 l3 -3 l3 3 v8z" />
            </g>
            <rect x="-21" y="6" width="43" height="2.8" rx="1.3" fill={go} />
          </g>
        );
      }
      // Mặc định: rào thẳng (ứng với variant = null, giữ nguyên hình cũ).
      return (
        <g>
          <g fill={van} stroke={go} strokeWidth="1.2">
            <path d="M-19 12 v-16 l3.5 -4 l3.5 4 v16z" />
            <path d="M-6.5 12 v-16 l3.5 -4 l3.5 4 v16z" />
            <path d="M6 12 v-16 l3.5 -4 l3.5 4 v16z" />
          </g>
          <rect x="-21" y="-1" width="34" height="3.4" rx="1.5" fill={go} />
          <rect x="-21" y="6" width="34" height="3.4" rx="1.5" fill={go} />
        </g>
      );
    }

    case "den":
      return (
        <g>
          <path d="M-22 -8 q22 14 44 0" stroke="#C0801F" strokeWidth="1.5" fill="none" />
          <g fill="#F4CE6A" stroke="#D9AE41" strokeWidth=".8">
            <circle cx="-15" cy="-1.5" r="3.6" />
            <circle cx="-5" cy="2.5" r="3.6" />
            <circle cx="5" cy="2.5" r="3.6" />
            <circle cx="15" cy="-1.5" r="3.6" />
          </g>
        </g>
      );

    // Yếm gà - vẽ CẢ CON GÀ ĐANG ĐEO, không vẽ mỗi cái yếm rời.
    // Người mua cần hiểu ngay "món này mặc lên con gà", và cần thấy màu nằm trên lưng
    // gà trông ra sao - đó mới là thứ họ sẽ nhìn thấy trong ảnh cô Lan gửi về.
    case "yem": {
      const c = color || "#E4572E";
      return (
        <g>
          {/* đuôi */}
          <path d="M13 0 q9 -5 12 -12 q1 9 -5 15z" fill="#E7D3AE" stroke="#C9A26B" strokeWidth="1" strokeLinejoin="round" />
          {/* chân */}
          <path d="M-4 13 v5 M6 13 v5" stroke="#D79A3C" strokeWidth="1.8" strokeLinecap="round" />
          {/* thân */}
          <ellipse cx="1" cy="4" rx="13" ry="9.5" fill="#F5E7CC" stroke="#C9A26B" strokeWidth="1.2" />
          {/* đầu */}
          <circle cx="-13" cy="-8" r="5" fill="#F5E7CC" stroke="#C9A26B" strokeWidth="1.2" />
          {/* mào */}
          <path d="M-16 -12.4 q1.4 -3 2.8 -0.2 q1.4 -3 2.8 0.4" fill="#D8544A" />
          {/* mỏ */}
          <path d="M-18 -7.4 l-4 1.4 l4 1.4z" fill="#E9A13B" />
          {/* mắt */}
          <circle cx="-14.4" cy="-9" r="0.9" fill="#3A2A1C" />
          {/* ⭐ YẾM - phần đổi màu theo `colorHex` của món */}
          <path d="M-7 -1 q6 -6.5 15 -2.6 q3 5 0.8 9 q-8 3.8 -15 0 q-2.8 -3 -0.8 -6.4z"
            fill={c} stroke="rgba(0,0,0,.2)" strokeWidth="1" strokeLinejoin="round" />
          {/* dây buộc vòng qua cổ */}
          <path d="M-7 -0.6 q-4 1.4 -4.6 4.4" stroke={c} strokeWidth="1.7" fill="none" strokeLinecap="round" />
        </g>
      );
    }

    default:
      return null;
  }
}

export type PlacedDecor = {
  svgKey: string; x: number; y: number; scale?: number; flipped?: boolean;
  /** Chữ đã khắc cho riêng cái này. Bỏ trống = dùng chữ mặc định của món. */
  text?: string | null;
  /** Màu và kiểu dáng của RIÊNG cái này (hàng rào, chong chóng). */
  colorHex?: string | null;
  variant?: string | null;
  /** `BarnDecor.id` - key ổn định khi một chuồng có nhiều bản cùng loại. */
  id?: string;
};

/** Khung nền chuồng (không kèm decor) - dùng chung giữa trang chuồng và Decor Studio. */
export const COOP_VIEWBOX = { w: 240, h: 180 };

export function CoopBackdrop({ outside = false }: { outside?: boolean }) {
  const chicks = outside
    ? [<Chick key="1" x={48} y={158} />, <Chick key="2" x={150} y={164} />, <Chick key="3" x={196} y={150} />]
    : [<Chick key="1" x={96} y={150} />, <Chick key="2" x={126} y={152} />, <Chick key="3" x={150} y={150} />];
  return (
    <>
      <rect x="60" y="70" width="120" height="82" rx="6" fill="#F3E7CD" stroke="#C9A26B" strokeWidth="2" />
      <path d="M52 72 L120 34 L188 72 Z" fill="#8C5A3B" stroke="#6f472d" strokeWidth="2" />
      <rect x="104" y="104" width="32" height="48" rx="4" fill="#6f472d" />
      <rect x="72" y="86" width="20" height="18" rx="3" fill="#CFE3F2" stroke="#C9A26B" />
      <rect x="148" y="86" width="20" height="18" rx="3" fill="#CFE3F2" stroke="#C9A26B" />
      <ellipse cx="120" cy="168" rx="96" ry="9" fill="#CADBBE" />
      {chicks}
    </>
  );
}

export function Coop({
  decor = [],
  outside = false,
  label,
}: {
  decor?: PlacedDecor[];
  outside?: boolean;
  label?: string;
}) {
  return (
    <svg viewBox={`0 0 ${COOP_VIEWBOX.w} ${COOP_VIEWBOX.h}`} width="100%" style={{ maxHeight: 190 }}>
      <CoopBackdrop outside={outside} />
      {decor.map((d, i) => (
        <g
          key={d.id ?? `${d.svgKey}-${i}`}
          transform={`translate(${d.x},${d.y}) scale(${(d.flipped ? -1 : 1) * (d.scale ?? 1)},${d.scale ?? 1})`}
        >
          <DecorSprite svgKey={d.svgKey} label={label} text={d.text}
            color={d.colorHex} variant={d.variant} />
        </g>
      ))}
    </svg>
  );
}

export function FarmerAvatar() {
  return (
    <svg viewBox="0 0 48 48" width="100%" height="100%">
      <rect width="48" height="48" fill="#EAF1E3" />
      <path d="M8 46c0-9 7-14 16-14s16 5 16 14z" fill="#2F5D3A" />
      <circle cx="24" cy="20" r="10" fill="#F0C89A" />
      <path d="M10 18 q14 -12 28 0 l0 -3 q-14 -10 -28 0z" fill="#C88A3A" />
      <path d="M9 18 h30 l-2 4 h-26z" fill="#E7A33C" />
      <circle cx="20" cy="20" r="1.3" fill="#22302A" />
      <circle cx="28" cy="20" r="1.3" fill="#22302A" />
      <path d="M21 25 q3 2 6 0" stroke="#b06a43" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** Thumbnail decor cho lưới catalog - bọc sprite trong khung riêng. */
export function DecorFigure({
  svgKey, size = 64, color,
}: { svgKey: string; size?: number; color?: string | null }) {
  return (
    <svg viewBox="-26 -22 52 46" width={size} height={size * 0.88} aria-hidden>
      <DecorSprite svgKey={svgKey} color={color} />
    </svg>
  );
}

// ⚠️ ĐÃ GỠ: `QRCode()` - một lưới ô vuông ngẫu nhiên trông giống mã QR nhưng KHÔNG mã
// hoá gì cả. Nó từng nằm trên trang truy xuất, tức đúng chỗ sản phẩm này bán niềm tin.
// Đừng dựng lại: mã QR thật ở `lib/qr.ts` (quét ra `/tx/<mã>` của từng lô, §7.14), và
// hình minh hoạ trong file này CỐ Ý không được đóng vai một thứ kiểm chứng được (§9.12).
