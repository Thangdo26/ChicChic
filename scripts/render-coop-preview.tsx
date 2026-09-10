// Xuất cảnh thật từ component để xem bố cục; không tạo ảnh minh chứng nông trại.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { Coop, DecorFigure } from "../src/components/Illustrations";
import { ganYem } from "../src/lib/chuong-3d";
import { DECOR_TEMPLATES } from "../src/lib/decor-catalog";

const folder = resolve(process.argv[2] || ".artifacts/coop-preview");
mkdirSync(folder, { recursive: true });
for (const n of [0, 1, 6, 10, 12]) {
  const dan = Array.from({ length: n }, (_, i) => ganYem({ id: `preview-${i}`, name: ["Mơ", "Mít", "Bông"][i % 3], tagCode: `L-${i + 1}`,
    gearStatus: i < 3 ? "WORN" : "PENDING_ON", gearItemName: "yếm", gearColorHex: ["#C95445", "#E4BA4C", "#559795"][i % 3] }));
  let svg = renderToStaticMarkup(<Coop large dan={dan} outside label="Vườn nhà Mơ" decor={[
    { id: "sign", svgKey: "bien", x: 120, y: 62, scale: 0.9, text: "Vườn nhà Mơ" },
    { id: "tree", svgKey: "tet-blossom", x: 41, y: 111, scale: 0.9 },
    { id: "lantern", svgKey: "tet-lantern", x: 197, y: 99, scale: 0.9 },
  ]} />);
  svg = svg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ').replace('width="100%"', 'width="960" height="720"').replace(/style="[^"]*"/, "");
  writeFileSync(join(folder, `coop-${n}.svg`), svg);
}
const tiles = DECOR_TEMPLATES.map((t, i) => `<g transform="translate(${(i % 4) * 160 + 36},${Math.floor(i / 4) * 144 + 12})">${renderToStaticMarkup(<DecorFigure svgKey={t.key} color="#CD5347" size={96} />)}<text x="48" y="116" text-anchor="middle" font-size="12" font-family="sans-serif" fill="#22302A">${t.label}</text></g>`).join("");
writeFileSync(join(folder, "catalog.svg"), `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="576"><rect width="100%" height="100%" fill="#F9F6EE"/>${tiles}</svg>`);
console.log(`Đã xuất 5 cảnh và danh mục tại ${folder}`);
