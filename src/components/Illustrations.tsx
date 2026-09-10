import React from "react";
import {
  KHUNG, cauGa, hopMat, matKhoi, toi, viTriDan, type GaVM,
} from "@/lib/chuong-3d";

/**
 * Một KHỐI HỘP - viên gạch của cả cảnh chuồng.
 *
 * Ba mặt, ba sắc độ của cùng một màu: đó là toàn bộ bí quyết làm một hình phẳng trông
 * có khối, và cũng là lý do cảnh này trông "kiểu Minecraft" mà không cần một dòng WebGL
 * nào. ⚠️ Đừng thay bằng thư viện 3D: trang chuồng là trang NẶNG NHẤT của app (§11.23,
 * đã từng 9,3s), người dùng mở nó bằng điện thoại giữa đồng, và một khung cảnh SVG dựng
 * sẵn ở server thì tốn đúng 0 KB JavaScript.
 */
function Khoi({
  x, y, w, h, d, mau, mo,
}: {
  x: number; y: number; w: number; h: number; d: number; mau: string;
  /** Độ mờ - dùng cho khối gợi ý (mây, bóng), không dùng cho vật thật. */
  mo?: number;
}) {
  const m = hopMat(x, y, w, h, d);
  const c = matKhoi(mau);
  return (
    <g opacity={mo}>
      <polygon points={m.tren} fill={c.tren} />
      <polygon points={m.ben} fill={c.ben} />
      <polygon points={m.truoc} fill={c.truoc} />
    </g>
  );
}

const GA = {
  than: "#F6F1E5",
  mao: "#CE4A3B",
  mo: "#E79A3C",
  chan: "#C77B2A",
  mat: "#2A2622",
} as const;

/**
 * MỘT CON GÀ, dựng bằng khối, đứng trên gốc toạ độ và quay mặt sang phải.
 *
 * ⚠️⚠️ Cái yếm chỉ được vẽ khi `g.yem` khác `null`, và **luật quyết định điều đó không
 * nằm ở đây** - nó nằm ở `ganYem` trong `lib/chuong-3d.ts` (bất biến §9.43). Đừng bao
 * giờ đọc thẳng `BirdGear.status` hay `colorHex` ở tầng vẽ: chọn màu xong mà hình đổi
 * ngay là app đang khoe một việc cô chú CHƯA làm ngoài chuồng.
 */
export function GaKhoi({ g }: { g?: GaVM | null }) {
  const yem = g?.yem ?? null;
  return (
    <>
      {/* bóng đổ - một vệt bẹt, đủ để con gà không lơ lửng */}
      <ellipse cx="0" cy="0.5" rx="11" ry="2.6" fill="#000" opacity="0.13" />
      {/* chân */}
      <g className="coop-foot"><rect x="-4.6" y="-5" width="2.6" height="5" fill={GA.chan} /><rect x="-5" y="-1" width="4" height="1.5" fill={GA.chan} /></g>
      <g className="coop-foot coop-foot-back"><rect x="2.2" y="-5" width="2.6" height="5" fill={toi(GA.chan, 0.14)} /><rect x="2" y="-1" width="4" height="1.5" fill={GA.chan} /></g>
      {/* đuôi - vẽ trước thân để nằm phía sau */}
      <Khoi x={-14} y={-19} w={6} h={7} d={4.5} mau={toi(GA.than, 0.07)} />
      {/* thân */}
      <Khoi x={-10} y={-16} w={19} h={11} d={6} mau={GA.than} />
      {/* cánh - một khối chìm trên sườn, để thân không phải một cục trơn */}
      <rect x="-7.5" y="-13" width="9" height="5" fill={toi(GA.than, 0.1)} />
      <path d="M-7-12H0M-6-10H-1" stroke="#FCFAF1" strokeWidth="0.8" />
      {/* ⭐ YẾM - chỉ khi nó đã ở trên con gà thật (§9.43). Che gần trọn ngực và trùm
          qua mép thân: đây là thứ để chủ chuồng NHẬN RA con nào là con nào, nên nó
          phải đọc được ở cỡ ảnh nhỏ 86px trong danh sách chuồng, không chỉ ở đây. */}
      {yem && <Khoi x={-2.5} y={-15.5} w={12} h={10.5} d={5} mau={yem.mau} />}
      {/* cổ + đầu */}
      <Khoi x={2} y={-25} w={9} h={9.5} d={5} mau={GA.than} />
      {/* mào */}
      <Khoi x={3.5} y={-28} w={5.5} h={3} d={3.6} mau={GA.mao} />
      {/* mỏ */}
      <Khoi x={11} y={-21} w={4} h={3} d={2.8} mau={GA.mo} />
      {/* yếm thịt dưới mỏ */}
      <rect x="9.6" y="-18" width="2.4" height="2.6" fill={GA.mao} />
      {/* mắt */}
      <rect x="7.4" y="-23.4" width="1.9" height="1.9" fill={GA.mat} />
      <rect x="7.6" y="-23.3" width="0.6" height="0.6" fill="#FFF" />
    </>
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
    case "tet-lantern":
      return <g><path d="M0-21V-14M0 9V19" stroke="#986B36" strokeWidth="2" /><path d="M-8-13L-13-6V3L-8 10H8L13 3V-6L8-13Z" fill="#C95040" /><path d="M-5-13L-7 0L-4 10M5-13L7 0L4 10M0-13V10" fill="none" stroke="#F5B665" strokeWidth="1.3" /><rect x="-9" y="-15" width="18" height="3" fill="#E8B25D" /><rect x="-8" y="9" width="16" height="3" fill="#E8B25D" /><path d="M-3 16V22M0 16V24M3 16V22" stroke="#C95040" strokeWidth="2" /></g>;
    case "tet-blossom":
      return <g><Khoi x={-8} y={8} w={16} h={11} d={5} mau="#B97151" /><path d="M0 9L-1-16M-1-3L-13-11M-1 1L12-9M-1-10L7-18" stroke="#8C653F" strokeWidth="2" fill="none" />{[[-12,-11],[-3,-17],[7,-17],[12,-8],[-1,-4]].map(([x,y],i)=><g key={i} transform={`translate(${x},${y})`}><path d="M0-5L2-2L5-1L3 2L3 5L0 3L-3 5L-3 1L-5-1L-2-2Z" fill="#F4C34F" /><circle r="1.4" fill="#C88135" /></g>)}</g>;
    case "noel-tree":
      return <g><Khoi x={-3} y={9} w={6} h={10} d={3} mau="#9A6945" /><path d="M0-19L11-5H7L16 7H10L21 17H-21L-10 7H-16L-7-5H-11Z" fill="#3E7957" /><path d="M0-19L11-5H7L16 7H10L21 17H0Z" fill="#2C6347" /><path d="M-9-3L8 1M-13 8L15 12" stroke="#EBD088" strokeWidth="1.3" /><circle cx="-5" cy="4" r="2" fill="#DC7760" /><circle cx="9" cy="13" r="2" fill="#F4C95E" /><path d="M0-24L1.8-20.7L5-20L2.4-17.5L3-14L0-15.7L-3-14L-2.4-17.5L-5-20L-1.8-20.7Z" fill="#EEC45C" /></g>;
    case "noel-wreath":
      return <g><circle cy="-2" r="14" fill="none" stroke="#477D55" strokeWidth="7" />{[-12,-5,5,12].map((x,i)=><circle key={i} cx={x} cy={i%2 ? 9 : -11} r="2" fill="#D77A58" />)}<path d="M0 10L-9 4L-10 15L0 12L10 15L9 4Z" fill="#BF5749" /><path d="M-2 12L-5 22L0 19L4 23L3 11" fill="#BF5749" /></g>;
    case "festival-flags":
      return <g><path d="M-25-10Q0 2 25-10" stroke="#8E7952" fill="none" strokeWidth="1.3" />{[-21,-11,-1,9,19].map((x,i)=><path key={i} d={`M${x-3} ${-6+Math.abs(x)*-.14}l6 1 -4 9Z`} fill={["#CF6C51","#EABF63","#6B9E89","#7B98AB","#D99B72"][i]} />)}</g>;
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

/**
 * Khung nền chuồng (KHÔNG kèm đàn gà, KHÔNG kèm decor) - dùng chung giữa trang chuồng
 * và Decor Studio.
 *
 * Hệ toạ độ giữ nguyên 240×180 như trước khi dựng khối. Đó là điều kiện bắt buộc, không
 * phải sự tiện tay: mỗi dòng `BarnDecor.x/y` là một **bản vẽ cô chú lắp thật ngoài
 * chuồng**, nên đổi hệ toạ độ là làm sai lệch việc của người khác.
 */
export const COOP_VIEWBOX = KHUNG;

const CHUONG = {
  tuong: "#EADFC2",
  mai: "#9A5C3A",
  cua: "#7A5233",
  kinh: "#BCDCF0",
  co: "#7FA85C",
  dat: "#8A6A45",
} as const;

export function CoopBackdrop({ outside = false }: { outside?: boolean }) {
  return (
    <>
      {/* Phong cảnh minh họa; không suy ra thời tiết hay vật phẩm đã lắp thật. */}
      <rect width="240" height="180" rx="8" fill="#E9F2E6" />
      <circle cx="193" cy="30" r="13" fill="#F4D997" opacity="0.8" />
      <path d="M0 113Q39 67 91 106T240 90V164H0Z" fill="#CEDFC0" />
      <path d="M0 133Q58 94 105 126T240 106V169H0Z" fill="#BAD2A7" />
      {/* mây khối - nằm trên `DECOR_BOUNDS.minY` (24) nên không bao giờ đè lên decor */}
      <Khoi x={22} y={12} w={26} h={7} d={5} mau="#FFFFFF" mo={0.75} />
      <Khoi x={34} y={7} w={16} h={5} d={5} mau="#FFFFFF" mo={0.75} />
      <Khoi x={188} y={18} w={22} h={6} d={5} mau="#FFFFFF" mo={0.6} />

      {/* nền: mặt cỏ lùi về sau + vách đất phía trước - đúng một khối cỏ cắt đôi */}
      <polygon points="28,142 212,142 236,166 4,166" fill={CHUONG.co} />
      <polygon points="28,142 212,142 236,166 4,166" fill="#FFFFFF" opacity="0.12" />
      <rect x="4" y="166" width="232" height="12" fill={CHUONG.dat} />
      <rect x="4" y="166" width="232" height="2.4" fill={toi(CHUONG.co, 0.18)} />
      <path d="M109 144L132 144L158 166H80Z" fill="#D7C491" opacity="0.75" />
      <ellipse cx="145" cy="149" rx="64" ry="8" fill="#476A3B" opacity="0.14" />
      {[12,25,39,201,218,229].map((x,i)=><g key={x} transform={`translate(${x},${152+i%3*5})`}><path d="M-3 1L-4-3M0 1V-5M3 1L4-2" stroke="#658E4D" strokeWidth="1" /><circle cx="0" cy="-6" r="1.6" fill={i%2 ? "#FFF1CD" : "#EDD089"} /></g>)}

      {/* mái, xếp bậc từ dưới lên - bậc thang là thứ làm cái mái trông "khối" */}
      <Khoi x={52} y={63} w={136} h={12} d={16} mau={CHUONG.mai} />
      <Khoi x={62} y={52} w={116} h={11} d={16} mau={CHUONG.mai} />
      <Khoi x={74} y={42} w={92} h={10} d={16} mau={CHUONG.mai} />
      <Khoi x={88} y={34} w={64} h={8} d={16} mau={CHUONG.mai} />
      {[44,54,65].map((y,i)=><path key={y} d={`M${77-i*12} ${y}h${88+i*23}`} stroke="#D2956A" opacity="0.5" strokeWidth="1" />)}

      {/* thân chuồng */}
      <Khoi x={62} y={75} w={116} h={75} d={16} mau={CHUONG.tuong} />
      <path d="M65 78H176" stroke="#9D8056" strokeWidth="3" opacity="0.35" />
      <path d="M67 82V145M173 82V145" stroke="#D6BE91" strokeWidth="3" />
      {/* mạch ván - vài đường là đủ gợi ra tấm ván, nhiều quá thì rối ở cỡ 86px */}
      {[95, 115, 135].map((y) => (
        <rect key={y} x="62" y={y} width="116" height="1.6" fill={toi(CHUONG.tuong, 0.14)} />
      ))}

      {/* cửa sổ - ô kính có nẹp chia, kiểu khối */}
      {[74, 144].map((x) => (
        <g key={x}>
          <Khoi x={x} y={90} w={22} h={20} d={3} mau={CHUONG.kinh} />
          <rect x={x + 10} y="90" width="2" height="20" fill={toi(CHUONG.tuong, 0.3)} />
          <rect x={x} y="99" width="22" height="2" fill={toi(CHUONG.tuong, 0.3)} />
          <path d={`M${x+2} 91l6 0 -6 6M${x+14} 101l5 0 -5 5`} fill="#F5FCF9" opacity="0.7" />
          <Khoi x={x-2} y={111} w={26} h={2.5} d={4} mau="#AB815B" />
        </g>
      ))}

      {/* CỬA. Mở hay đóng đi theo `Barn.outside` - cột đó chỉ đổi trong `completeTask`
          (§9), tức là cánh cửa trên hình chỉ mở khi cô chú đã thật sự ra mở nó. */}
      <Khoi x={104} y={106} w={32} h={44} d={3} mau={outside ? "#4A3524" : CHUONG.cua} />
      {outside ? (
        <>
          <rect x="107" y="109" width="26" height="41" fill="#3A2A1B" />
          {/* cánh cửa mở dạt sang bên */}
          <Khoi x={136} y={108} w={7} h={40} d={5} mau={CHUONG.cua} />
        </>
      ) : (
        <>
          <rect x="118.6" y="106" width="1.8" height="44" fill={toi(CHUONG.cua, 0.28)} />
          <rect x="123" y="126" width="3.4" height="3.4" fill="#E7C46A" />
        </>
      )}
    </>
  );
}

/**
 * LỚP ĐÀN GÀ - đúng số con, đúng tên, đúng cái yếm đang mặc.
 *
 * ⭐ Vì sao lớp này tách khỏi `CoopBackdrop`: nó vẽ SAU decor trong `Coop`, để con gà
 * nằm trên cùng và bấm được. Cả tính năng chỉ có nghĩa khi chạm vào con gà thì ra tên
 * nó - một cái chậu cây chắn mất cú chạm đó là hỏng đúng chỗ quan trọng.
 *
 * Hai cách gọi, cố ý khác nhau:
 *  · `dan`   - có tên và có yếm. CHỈ dùng cho người được xem chuồng đó (chủ, cô chú,
 *              admin). Tên gà là do chủ chuồng đặt, và ở chuồng trưng bày công khai thì
 *              nó không việc gì phải rơi vào mắt người lạ.
 *  · `soCon` - chỉ số lượng, gà vẽ trơn không tên. Dùng cho ảnh nhỏ trong danh sách và
 *              cho chuồng xem thử.
 */
export function DanGaKhoi({
  dan, soCon, ngoaiVuon = false, chon = null, onChon, onRe, animated = false,
}: {
  dan?: GaVM[] | null;
  soCon?: number;
  ngoaiVuon?: boolean;
  /** Con đang được chỉ tới - hiện bảng tên. Chạm (điện thoại) hoặc rê chuột (máy tính). */
  chon?: string | null;
  /** Có hàm này thì lớp gà bấm được; không có thì nó chỉ là hình vẽ. */
  onChon?: (id: string | null) => void;
  /** Rê chuột vào/ra. Điện thoại không có sự kiện này - vì vậy `onChon` mới là đường chính. */
  onRe?: (id: string | null) => void;
  animated?: boolean;
}) {
  const n = dan?.length ?? Math.max(0, Math.floor(Number(soCon)) || 0);
  const cho = viTriDan(n, ngoaiVuon);
  const iChon = dan && chon ? dan.findIndex((g) => g.id === chon) : -1;
  const gChon = iChon >= 0 ? dan![iChon] : null;
  const pChon = iChon >= 0 ? cho[iChon] : null;

  return (
    <>
      {cho.map((p, i) => {
        const g = dan?.[i] ?? null;
        const dangChon = !!g && chon === g.id;
        const bam = onChon && g ? () => onChon(dangChon ? null : g.id) : undefined;
        return (
          <g key={g?.id ?? `ga-${i}`} transform={`translate(${p.x},${p.y}) scale(${p.co})`}>
            <g className={animated ? `coop-wander coop-route-${i % 3}` : undefined} style={animated ? { animationDelay: `${-i * 2.7}s`, animationDuration: `${16 + i % 4 * 3}s` } : undefined}>
            {/* `<title>` là chú giải sẵn có của trình duyệt: rê chuột là hiện tên, tốn
                0 dòng JavaScript và chạy cả ở những trang chỉ vẽ chứ không bấm được. */}
            {g && <title>{cauGa(g)}</title>}
            {dangChon && (
              <ellipse cx="0" cy="0.5" rx="13" ry="3.6" fill="none"
                stroke="#2F5D3A" strokeWidth="1.3" strokeDasharray="3 2.4" />
            )}
            <GaKhoi g={g} />
            {/* Dấu chờ: cô chú CHƯA ra mặc/tháo yếm. Nó nằm trên ĐẦU con gà chứ không
                phải trên lưng - chỗ đó dành riêng cho cái yếm đã mặc thật (§9.43). */}
            {g?.cho && <g aria-hidden="true" pointerEvents="none">
              <circle cx="-1" cy="-33" r="3.7" fill="#FFF9E8" stroke="#B5893F" strokeWidth="0.8" />
              <path d="M-1 -35.2v2.4l1.8 1" stroke="#8A6732" strokeWidth="0.8" strokeLinecap="round" fill="none" />
            </g>}
            {(bam || onRe) && g && (
              <rect
                x="-18" y="-34" width="38" height="37" rx="6" fill="transparent" className="coop-bird-hit" style={{ cursor: bam ? "pointer" : undefined }}
                role={bam ? "button" : undefined} tabIndex={bam ? 0 : undefined}
                aria-label={cauGa(g)}
                aria-pressed={bam ? dangChon : undefined}
                onClick={bam}
                onFocus={onRe ? () => onRe(g.id) : undefined}
                onBlur={onRe ? () => onRe(null) : undefined}
                onPointerEnter={onRe ? () => onRe(g.id) : undefined}
                onPointerLeave={onRe ? () => onRe(null) : undefined}
                onKeyDown={bam ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); bam(); } } : undefined}
              />
            )}
            </g>
          </g>
        );
      })}

      {/* BẢNG TÊN - vẽ SAU cả đàn nên luôn nằm trên cùng, và vẽ ở hệ toạ độ ngoài nên
          chữ không bị co theo cỡ con gà ở xa. */}
      {!animated && gChon && pChon && <BangTen g={gChon} x={pChon.x} y={pChon.y} />}
    </>
  );
}

/** Bảng tên nổi trên đầu một con gà. Tự né mép khung để không bị cắt chữ. */
function BangTen({ g, x, y }: { g: GaVM; x: number; y: number }) {
  const d1 = g.ten;
  const d2 = g.yem ? `Đang mặc ${g.yem.ten}` : (g.cho ?? "Chưa mặc yếm");
  const rong = Math.max(Array.from(d1).length * 4.5, Array.from(d2).length * 3.3) + 14;
  const cx = Math.min(KHUNG.w - rong / 2 - 3, Math.max(rong / 2 + 3, x));
  const cy = Math.max(26, y - 34);
  return (
    <g pointerEvents="none">
      <polygon points={`${cx - 4},${cy + 4} ${cx + 4},${cy + 4} ${cx},${cy + 10}`} fill="#22302A" opacity="0.93" />
      <rect x={cx - rong / 2} y={cy - 16} width={rong} height={21} rx="4.5" fill="#22302A" opacity="0.93" />
      <text x={cx} y={cy - 7} textAnchor="middle" fontSize="7.6" fontWeight="700" fill="#F7FBF4">{d1}</text>
      <text x={cx} y={cy + 1} textAnchor="middle" fontSize="5.9" fill={g.yem ? g.yem.mau : "#BFCDBA"}>{d2}</text>
    </g>
  );
}

export function Coop({
  decor = [],
  outside = false,
  label,
  dan,
  soCon,
  chon,
  onChon,
  onRe,
  animated = false,
  large = false,
}: {
  decor?: PlacedDecor[];
  outside?: boolean;
  label?: string;
  /** Đàn gà có tên - xem chú thích ở `DanGaKhoi`. */
  dan?: GaVM[] | null;
  /** Chỉ số con, không tên. Bỏ trống cả hai ⟹ sân trống (chuồng chưa có đàn). */
  soCon?: number;
  chon?: string | null;
  onChon?: (id: string | null) => void;
  onRe?: (id: string | null) => void;
  animated?: boolean;
  large?: boolean;
}) {
  return (
    <svg className="coop-scene" viewBox={`0 0 ${COOP_VIEWBOX.w} ${COOP_VIEWBOX.h}`} width="100%" style={{ maxHeight: large ? 410 : 190 }} role={onChon ? "group" : "img"} aria-label={`Minh họa chuồng, ${dan?.length ?? soCon ?? 0} bạn gà`}>
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
      <DanGaKhoi dan={dan} soCon={soCon} ngoaiVuon={outside} chon={chon} onChon={onChon} onRe={onRe} animated={animated} />
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
