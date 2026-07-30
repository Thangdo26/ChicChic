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

/** Một món decor, vẽ quanh gốc toạ độ (0,0), khổ ~44×36 đơn vị SVG.
 *  Nhờ vậy đặt được ở bất kỳ đâu trên khung chuồng bằng transform. */
export function DecorSprite({ svgKey, label = "Chuồng bạn" }: { svgKey: string; label?: string }) {
  switch (svgKey) {
    case "bien":
      return (
        <g>
          <rect x="-3" y="4" width="6" height="14" rx="1.5" fill="#8C5A3B" />
          <rect x="-25" y="-11" width="50" height="17" rx="3" fill="#FFFDF5" stroke="#C0801F" strokeWidth="1.8" />
          <text x="0" y="1.5" fontSize="9" textAnchor="middle" fill="#2F5D3A" fontFamily="var(--font-display),serif">
            {label.slice(0, 12)}
          </text>
        </g>
      );

    case "bang":
      return (
        <g>
          <rect x="-21" y="-15" width="42" height="30" rx="3" fill="#8C5A3B" />
          <rect x="-18" y="-12" width="36" height="24" rx="2" fill="#2C4136" />
          <path d="M-13 -6 h20 M-13 -1 h24 M-13 4 h16" stroke="#DCE8D2" strokeWidth="1.6" strokeLinecap="round" opacity=".85" />
          <circle cx="15" cy="9" r="1.8" fill="#F7F3E4" />
        </g>
      );

    case "chong":
      return (
        <g>
          <rect x="-1.4" y="0" width="2.8" height="20" rx="1.2" fill="#9B7A4D" />
          <g>
            <path d="M0 0 L0 -13 Q7 -13 7 -6 Z" fill="#E7A33C" />
            <path d="M0 0 L13 0 Q13 7 6 7 Z" fill="#6FA45A" />
            <path d="M0 0 L0 13 Q-7 13 -7 6 Z" fill="#DE7B54" />
            <path d="M0 0 L-13 0 Q-13 -7 -6 -7 Z" fill="#CFE3F2" />
          </g>
          <circle cx="0" cy="0" r="2.2" fill="#C0801F" />
        </g>
      );

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

    case "rao":
      return (
        <g>
          <g fill="#EBDCC0" stroke="#C9A26B" strokeWidth="1.2">
            <path d="M-19 12 v-16 l3.5 -4 l3.5 4 v16z" />
            <path d="M-6.5 12 v-16 l3.5 -4 l3.5 4 v16z" />
            <path d="M6 12 v-16 l3.5 -4 l3.5 4 v16z" />
          </g>
          <rect x="-21" y="-1" width="34" height="3.4" rx="1.5" fill="#C9A26B" />
          <rect x="-21" y="6" width="34" height="3.4" rx="1.5" fill="#C9A26B" />
        </g>
      );

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

    default:
      return null;
  }
}

export type PlacedDecor = { svgKey: string; x: number; y: number; scale?: number; flipped?: boolean };

/** Khung nền chuồng (không kèm decor) — dùng chung giữa trang chuồng và Decor Studio. */
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
          key={`${d.svgKey}-${i}`}
          transform={`translate(${d.x},${d.y}) scale(${(d.flipped ? -1 : 1) * (d.scale ?? 1)},${d.scale ?? 1})`}
        >
          <DecorSprite svgKey={d.svgKey} label={label} />
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

/** Thumbnail decor cho lưới catalog — bọc sprite trong khung riêng. */
export function DecorFigure({ svgKey, size = 64 }: { svgKey: string; size?: number }) {
  return (
    <svg viewBox="-26 -22 52 46" width={size} height={size * 0.88} aria-hidden>
      <DecorSprite svgKey={svgKey} />
    </svg>
  );
}

export function QRCode() {
  const rects: React.ReactNode[] = [];
  let seed = 7;
  for (let r = 0; r < 11; r++) for (let c = 0; c < 11; c++) {
    seed = (seed * 33 + r * 7 + c * 13) % 97;
    if (seed % 2 === 0) rects.push(<rect key={`${r}-${c}`} x={c * 10} y={r * 10} width="10" height="10" fill="#22302A" />);
  }
  const eye = <rect x="0" y="0" width="30" height="30" fill="none" stroke="#22302A" strokeWidth="6" />;
  return (
    <svg viewBox="-2 -2 114 114" width="100%" height="100%">
      {rects}{eye}
      <g transform="translate(80,0)">{eye}</g>
      <g transform="translate(0,80)">{eye}</g>
    </svg>
  );
}
