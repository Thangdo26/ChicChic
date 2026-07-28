import { prisma } from "@/lib/db";
import { postUpdate } from "@/app/actions";

// PoC: trang admin đơn giản để ông tự đăng cập nhật. MVP: thêm auth (ADMIN role).
export default async function Admin() {
  const barns = await prisma.barn.findMany({ include: { updates: { orderBy: { createdAt: "desc" }, take: 3 } } });

  async function submit(formData: FormData) {
    "use server";
    await postUpdate(String(formData.get("barn")), String(formData.get("text")), String(formData.get("kind")));
  }

  return (
    <div className="screen">
      <span className="eyebrow">Admin (PoC — chưa có auth)</span>
      <h2 className="display text-[21px] mt-1 mb-3">Đăng cập nhật từ nông trại</h2>
      <form action={submit} className="card grid gap-2.5">
        <label className="label !mt-0">Chuồng</label>
        <select name="barn" className="rounded-[11px] px-3 py-2.5 text-[14px]" style={{ border: "1.5px solid var(--line)" }}>
          {barns.map((b: { id: string; slug: string; label: string }) => <option key={b.id} value={b.slug}>{b.label} ({b.slug})</option>)}
        </select>
        <label className="label !mt-2">Loại</label>
        <select name="kind" className="rounded-[11px] px-3 py-2.5 text-[14px]" style={{ border: "1.5px solid var(--line)" }}>
          {["CARE", "NOTE", "PHOTO", "HEALTH", "MILESTONE"].map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <label className="label !mt-2">Nội dung</label>
        <textarea name="text" rows={3} placeholder="VD: Sáng nay đàn ăn khỏe, trời nắng đẹp." className="rounded-[11px] px-3 py-2.5 text-[14px]" style={{ border: "1.5px solid var(--line)" }} />
        <button className="btn btn-primary mt-1" type="submit">Đăng cập nhật</button>
      </form>

      <div className="card mt-3">
        <div className="font-bold text-[14px] mb-1.5">Cập nhật gần đây</div>
        {barns.flatMap((b: { slug: string; updates: { id: string; kind: string; text: string }[] }) => b.updates.map((u: { id: string; kind: string; text: string }) => (
          <div key={u.id} className="kv"><span style={{ color: "var(--ink-soft)" }}>{b.slug} · {u.kind}</span><span className="font-semibold text-right max-w-[60%] truncate">{u.text}</span></div>
        )))}
      </div>
    </div>
  );
}
