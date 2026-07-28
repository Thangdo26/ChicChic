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

export function Coop({ decor = [], outside = false }: { decor?: string[]; outside?: boolean }) {
  const has = (k: string) => decor.includes(k);
  const chicks = outside
    ? [<Chick key="1" x={48} y={158} />, <Chick key="2" x={150} y={164} />, <Chick key="3" x={196} y={150} />]
    : [<Chick key="1" x={96} y={150} />, <Chick key="2" x={126} y={152} />, <Chick key="3" x={150} y={150} />];
  return (
    <svg viewBox="0 0 240 180" width="100%" style={{ maxHeight: 190 }}>
      <rect x="60" y="70" width="120" height="82" rx="6" fill="#F3E7CD" stroke="#C9A26B" strokeWidth="2" />
      <path d="M52 72 L120 34 L188 72 Z" fill="#8C5A3B" stroke="#6f472d" strokeWidth="2" />
      <rect x="104" y="104" width="32" height="48" rx="4" fill="#6f472d" />
      <rect x="72" y="86" width="20" height="18" rx="3" fill="#CFE3F2" stroke="#C9A26B" />
      <rect x="148" y="86" width="20" height="18" rx="3" fill="#CFE3F2" stroke="#C9A26B" />
      <ellipse cx="120" cy="168" rx="96" ry="9" fill="#CADBBE" />
      {has("bien") && (<><rect x="86" y="60" width="48" height="16" rx="3" fill="#fff" stroke="#C0801F" /><text x="110" y="72" fontSize="9" textAnchor="middle" fill="#2F5D3A" fontFamily="var(--font-display),serif">Chuồng bạn</text></>)}
      {has("cay") && (<><circle cx="40" cy="132" r="11" fill="#6FA45A" /><rect x="38" y="140" width="4" height="10" fill="#7a5a34" /></>)}
      {has("den") && (<><path d="M150 44 h44" stroke="#C0801F" strokeWidth="1.5" /><circle cx="160" cy="50" r="3.2" fill="#F4CE6A" /><circle cx="172" cy="50" r="3.2" fill="#F4CE6A" /><circle cx="184" cy="50" r="3.2" fill="#F4CE6A" /></>)}
      {has("mang") && <rect x="120" y="150" width="34" height="7" rx="3" fill="#B06A43" />}
      {chicks}
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

// SVG cho mỗi decor SKU
export function DecorFigure({ svgKey }: { svgKey: string }) {
  switch (svgKey) {
    case "bien": return (<svg width="70" height="40"><rect x="6" y="10" width="58" height="18" rx="3" fill="#fff" stroke="#C0801F" strokeWidth="1.6" /><text x="35" y="23" fontSize="9" textAnchor="middle" fill="#2F5D3A" fontFamily="var(--font-display),serif">Chuồng bạn</text><rect x="32" y="28" width="3" height="9" fill="#8C5A3B" /></svg>);
    case "cay": return (<svg width="70" height="46"><circle cx="35" cy="18" r="13" fill="#6FA45A" /><circle cx="27" cy="20" r="8" fill="#7FB268" /><rect x="30" y="30" width="10" height="12" fill="#B06A43" rx="2" /></svg>);
    case "den": return (<svg width="70" height="40"><path d="M6 14 q29 12 58 0" stroke="#C0801F" strokeWidth="1.5" fill="none" /><circle cx="20" cy="18" r="3.5" fill="#F4CE6A" /><circle cx="35" cy="20" r="3.5" fill="#F4CE6A" /><circle cx="50" cy="18" r="3.5" fill="#F4CE6A" /></svg>);
    case "mang": return (<svg width="70" height="40"><rect x="14" y="20" width="42" height="10" rx="4" fill="#B06A43" /><rect x="18" y="16" width="6" height="6" fill="#E7A33C" /><rect x="46" y="16" width="6" height="6" fill="#E7A33C" /></svg>);
    default: return null;
  }
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
