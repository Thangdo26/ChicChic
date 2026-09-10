import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Coop, DecorFigure } from "@/components/Illustrations";
import { ganYem } from "@/lib/chuong-3d";
import { DECOR_TEMPLATES, validateDecorCatalog } from "@/lib/decor-catalog";
import { decorProofSnapshot } from "@/lib/decor-proof";

describe("Danh mục an toàn và cảnh chuồng", () => {
  const base = { slug: "den-tet-2027", name: "Đèn Tết", svgKey: "tet-lantern", priceVnd: 45000, stockQty: 3 };
  it.each(DECOR_TEMPLATES)("mẫu $key có hình dựng được và dữ liệu hợp lệ", (t) => {
    expect(validateDecorCatalog({ ...base, svgKey: t.key, colorHex: "#cc4422" })).toHaveProperty("data.svgKey", t.key);
    const html = renderToStaticMarkup(<DecorFigure svgKey={t.key} color="#CC4422" />);
    expect(html).toContain("<svg");
    expect(html).not.toMatch(/<script|<foreignObject|<image|https:/);
  });
  it.each([
    { svgKey: "<svg onload=alert(1)>" }, { priceVnd: 0 }, { priceVnd: -1 }, { priceVnd: 1.5 },
    { priceVnd: Number.NaN }, { stockQty: 10000 }, { slug: "../../admin" }, { svgKey: "yem", colorHex: "url(https://x)" },
  ])("từ chối dữ liệu giả mạo %j", (bad) => {
    expect(validateDecorCatalog({ ...base, ...bad })).toHaveProperty("error");
  });
  it.each([0, 1, 6, 10, 12])("render đúng %i bạn gà, có nhãn dùng bàn phím", (n) => {
    const dan = Array.from({ length: n }, (_, i) => ganYem({ id: `bird-${i}`, name: `Mơ ${i}`, tagCode: `L-${i}`,
      gearStatus: i === 0 ? "WORN" : "PENDING_ON", gearItemName: "yếm đỏ", gearColorHex: "#CB4537" }));
    const html = renderToStaticMarkup(<Coop dan={dan} animated large onChon={() => {}} />);
    expect((html.match(/role="button"/g) ?? []).length).toBe(n);
    expect((html.match(/class="coop-wander /g) ?? []).length).toBe(n);
    expect(html).toContain(`${n} bạn gà`);
    expect(html).not.toContain("Đang mặc yếm đỏ. Đang mặc");
  });
  it("cảnh công khai chỉ có số con, không nhận tên hay yếm riêng", () => {
    const html = renderToStaticMarkup(<Coop soCon={6} />);
    expect(html).not.toMatch(/role="button"|Mơ|tabindex=/);
    expect(html).toContain("6 bạn gà");
  });
  it("đổi bản vẽ làm hết hiệu lực ảnh cũ, thứ tự truy vấn không làm sai snapshot", () => {
    const a = { id: "a", itemId: "item", x: 20, y: 80, scale: 1, z: 1, flipped: false, text: "Mơ", colorHex: null, variant: null };
    const b = { ...a, id: "b", x: 100 };
    expect(decorProofSnapshot([a,b], "Vườn Mơ")).toBe(decorProofSnapshot([b,a], "Vườn Mơ"));
    expect(decorProofSnapshot([a,b], "Vườn Mơ")).not.toBe(decorProofSnapshot([{...a,text:"Mai"},b], "Vườn Mơ"));
    expect(decorProofSnapshot([a], "Vườn Mơ")).not.toBe(decorProofSnapshot([a], "Vườn Mai"));
  });
  it("chuyển động có dừng, giảm chuyển động và không có vòng lặp JS", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("animation-play-state: paused");
    const child = readFileSync("src/components/be/FarmPlayground.tsx", "utf8");
    expect(child).toContain("aria-pressed");
    expect(child).not.toMatch(/requestAnimationFrame|setInterval|fetch\(|@\/app\/.*actions/);
  });
});
