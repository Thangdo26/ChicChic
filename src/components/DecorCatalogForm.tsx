"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DECOR_TEMPLATES, type DecorCatalogInput } from "@/lib/decor-catalog";
import { saveDecorCatalog } from "@/app/catalog-actions";
import { DecorFigure } from "@/components/Illustrations";
import { useToast } from "@/components/Toast";

type Row = DecorCatalogInput & { version: number; active: boolean };
const empty: DecorCatalogInput = { slug: "", name: "", svgKey: "tet-lantern", blurb: "", priceVnd: 0, stockQty: 0, colorHex: "#C84C3D", active: false };

export default function DecorCatalogForm({ rows }: { rows: Row[] }) {
  const [form, setForm] = useState<DecorCatalogInput>(empty);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const editing = form.expectedVersion !== undefined;
  const patch = (value: Partial<DecorCatalogInput>) => setForm((prev) => ({ ...prev, ...value }));
  return (
    <section className="card mt-3 decor-catalog-form" id="danh-muc-trang-tri">
      <h2 className="display text-[18px]">🎏 Vật phẩm & mùa lễ hội</h2>
      <p className="text-sm mt-1 mb-4" style={{ color: "var(--ink-soft)" }}>Thêm món mới từ các mẫu có sẵn. Chỉ mở bán khi nông trại sẵn sàng cung cấp vật phẩm thật.</p>
      <label className="block text-sm font-semibold">Chọn món để sửa
        <select className="input mt-1" value={editing ? form.slug : ""} disabled={pending} onChange={(e) => {
          const row = rows.find((r) => r.slug === e.target.value);
          setForm(row ? { ...row, expectedVersion: row.version } : empty);
        }}>
          <option value="">＋ Tạo vật phẩm mới</option>
          {rows.map((r) => <option key={r.slug} value={r.slug}>{r.name}{r.active ? "" : " · ngừng bán"}</option>)}
        </select>
      </label>
      <form className="grid gap-3 mt-4" onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          try {
            const r = await saveDecorCatalog(form);
            toast(r.message, r.ok ? "ok" : "warn");
            if (r.ok) { setForm(empty); router.refresh(); }
          } catch { toast("Chưa lưu được. Kiểm tra kết nối rồi thử lại nhé.", "err"); }
        });
      }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Mã món<input className="input mt-1" required maxLength={60} pattern="[a-z0-9][a-z0-9-]{2,59}" disabled={editing || pending} placeholder="den-long-tet-2027" value={form.slug} onChange={(e) => patch({ slug: e.target.value })} /></label>
          <label className="text-sm">Tên hiển thị<input className="input mt-1" required maxLength={60} disabled={pending} value={form.name} onChange={(e) => patch({ name: e.target.value })} /></label>
          <label className="text-sm">Hình vật phẩm<select className="input mt-1" disabled={editing || pending} value={form.svgKey} onChange={(e) => patch({ svgKey: e.target.value })}>{DECOR_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></label>
          <label className="text-sm">Giá bán (đ)<input className="input mt-1" type="number" min={1} max={10_000_000} step={1} required disabled={pending} value={form.priceVnd} onChange={(e) => patch({ priceVnd: e.target.valueAsNumber })} /></label>
        </div>
        {form.svgKey === "yem" && <label className="text-sm">Màu yếm<input type="color" className="block h-10 w-20 mt-1" disabled={editing || pending} value={form.colorHex ?? "#C84C3D"} onChange={(e) => patch({ colorHex: e.target.value })} /></label>}
        {!editing && <label className="text-sm">Số cái thực có trên kệ<input className="input mt-1" type="number" min={0} max={9999} step={1} required disabled={pending} value={form.stockQty} onChange={(e) => patch({ stockQty: e.target.valueAsNumber })} /></label>}
        <label className="text-sm">Mô tả ngắn<input className="input mt-1" maxLength={180} disabled={pending} value={form.blurb ?? ""} onChange={(e) => patch({ blurb: e.target.value })} /></label>
        <div className="flex items-center gap-4 rounded-xl p-3" style={{ background: "var(--paper2)" }}>
          <div className="w-24 flex-none"><DecorFigure svgKey={form.svgKey} color={form.colorHex} /></div>
          <div><b>{form.name || "Xem trước vật phẩm"}</b><p className="text-xs mt-1">Hình và màu được giữ cố định sau khi tạo. Ngừng bán vẫn giữ món đã mua.</p></div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} disabled={pending} onChange={(e) => patch({ active: e.target.checked })} />Mở bán trong cửa hàng</label>
        <button className="btn btn-primary" disabled={pending} aria-busy={pending}>{pending ? "Đang lưu…" : editing ? "Lưu thay đổi" : "Tạo vật phẩm"}</button>
      </form>
    </section>
  );
}
