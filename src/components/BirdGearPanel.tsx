"use client";
// Đàn gà + yếm — chỗ chủ chuồng chọn con nào mặc màu nào.
//
// Đây là chỗ cái tên chủ chuồng đặt lúc nhận chuồng cuối cùng có ích: mặc cho mỗi con
// một màu khác nhau thì từ nay nhìn ảnh cô Lan gửi về là nhận ra được con Miu.
//
// Component KHÔNG tự quyết gì cả — mọi luật (còn kho không, con này có yếm chưa,
// đàn có phải gà đẻ không) đều ở `actions.wearGear`. Ở đây chỉ ẩn/hiện cho đỡ bấm hụt.
import { useState, useTransition } from "react";
import { wearGear, removeGear } from "@/app/actions";
import { DecorFigure } from "@/components/Illustrations";
import { useToast } from "@/components/Toast";
import { fmtVnd } from "@/lib/pricing";

/** Một con gà trong đàn, kèm yếm đang đeo (nếu có). */
export type BirdVM = {
  id: string;
  name: string | null;
  tagCode: string;
  gear: {
    id: string;
    itemName: string;
    colorHex: string | null;
    /** PENDING_ON | WORN | PENDING_OFF — OFF không bao giờ gửi xuống đây. */
    status: "PENDING_ON" | "WORN" | "PENDING_OFF";
    photoUrl: string | null;
  } | null;
};

/** Một loại yếm trong kho của chuồng này. */
export type GearVM = {
  slug: string;
  name: string;
  colorHex: string | null;
  tone: string | null;
  priceVnd: number;
  owned: number;
  free: number;
};

const STATUS_VI: Record<string, string> = {
  PENDING_ON: "Chờ nông dân mặc",
  WORN: "Đang đeo",
  PENDING_OFF: "Chờ nông dân tháo",
};

export default function BirdGearPanel({
  barnSlug, birds, gear,
}: {
  barnSlug: string;
  birds: BirdVM[];
  gear: GearVM[];
}) {
  /** Con đang mở bảng chọn màu. */
  const [picking, setPicking] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();

  const inStore = gear.filter((g) => g.free > 0);
  const worn = birds.filter((b) => b.gear).length;

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      try {
        const r = await fn();
        toast(r.message, r.ok ? "ok" : "warn");
        if (r.ok) setPicking(null);
      } catch {
        toast("Không gửi được — kiểm tra mạng rồi thử lại.", "err");
      }
    });

  return (
    <>
      <div className="soft flex justify-between items-center text-[13px]">
        <span style={{ color: "var(--ink-soft)" }}>{birds.length} con trong đàn</span>
        <b>{worn} con có yếm</b>
      </div>

      {gear.length === 0 ? (
        <div className="card mt-3 text-center">
          <div className="h-16 grid place-items-center"><DecorFigure svgKey="yem" /></div>
          <div className="font-bold text-[14px] mt-1">Chưa có yếm nào</div>
          <p className="text-[12.4px] mt-1 leading-snug" style={{ color: "var(--ink-soft)" }}>
            Yếm che lưng gà mái khỏi bị trống đạp trụi lông — và cho mỗi con một màu
            riêng để bạn <b>nhận ra được trong ảnh</b>.
          </p>
          <a href={`/chuong/${barnSlug}/trang-tri`} className="btn btn-yolk btn-sm mt-2.5 no-underline">
            Xem yếm ở trang Trang trí →
          </a>
        </div>
      ) : (
        <div className="mt-3">
          <div className="label">Kho yếm</div>
          <div className="flex flex-wrap gap-1.5">
            {gear.map((g) => (
              <span key={g.slug}
                className="flex items-center gap-1.5 text-[12.2px] font-semibold rounded-full px-2.5 py-1.5"
                style={{ background: "var(--paper2)", border: "1px solid var(--line)" }}>
                <span className="inline-block rounded-full flex-none"
                  style={{ width: 11, height: 11, background: g.colorHex ?? "#999" }} aria-hidden />
                {g.name}
                <b style={{ color: g.free > 0 ? "var(--paddy-deep)" : "var(--ink-soft)" }}>
                  {g.free}/{g.owned}
                </b>
              </span>
            ))}
          </div>
          <p className="text-[11.4px] mt-1.5" style={{ color: "var(--ink-soft)" }}>
            Số bên phải là <b>còn trong kho / đã mua</b>. Tháo ra là về kho, không mất tiền lần hai.
          </p>
        </div>
      )}

      <div className="label mt-3">Đàn của bạn</div>
      <div className="grid gap-2">
        {birds.map((b) => {
          const who = b.name?.trim() || `Con ${b.tagCode}`;
          const g = b.gear;
          return (
            <div key={b.id} className="card">
              <div className="flex items-center gap-2.5">
                <span className="flex-none rounded-full grid place-items-center"
                  style={{
                    width: 30, height: 30,
                    background: g?.colorHex ?? "var(--paper2)",
                    border: g ? "none" : "1px solid var(--line)",
                  }} aria-hidden>
                  {!g && "🐔"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[14px] truncate">{who}</div>
                  <div className="text-[11.8px]" style={{ color: "var(--ink-soft)" }}>
                    Vòng chân {b.tagCode}
                    {g && ` · ${g.itemName} · ${STATUS_VI[g.status]}`}
                  </div>
                </div>
                {g ? (
                  <button className="btn btn-ghost btn-sm flex-none" disabled={pending}
                    onClick={() => run(() => removeGear(barnSlug, g.id))}
                    style={{ color: "#B4472F", borderColor: "#F0CFC6" }}>
                    {g.status === "PENDING_ON" ? "Rút lại" : "Tháo"}
                  </button>
                ) : (
                  <button className="btn btn-yolk btn-sm flex-none" disabled={pending || inStore.length === 0}
                    title={inStore.length === 0 ? "Kho hết yếm — mua thêm ở trang Trang trí" : undefined}
                    onClick={() => setPicking(picking === b.id ? null : b.id)}>
                    🧣 Mặc yếm
                  </button>
                )}
              </div>

              {/* Ảnh minh chứng cô Lan chụp con này lúc mặc xong — bằng chứng §9.1,
                  và cũng là thứ đáng xem nhất trên trang này. */}
              {g?.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={g.photoUrl} alt={`${who} đang đeo ${g.itemName}`}
                  className="w-full rounded-[11px] mt-2" style={{ maxHeight: 190, objectFit: "cover" }} />
              )}

              {picking === b.id && (
                <div className="mt-2.5 pt-2.5" style={{ borderTop: "1px dashed var(--line)" }}>
                  <div className="text-[12.4px] mb-1.5" style={{ color: "var(--ink-soft)" }}>
                    Chọn màu cho <b>{who}</b> — nông dân sẽ mặc thật rồi chụp ảnh gửi bạn.
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {inStore.map((g2) => (
                      <button key={g2.slug} type="button" disabled={pending}
                        onClick={() => run(() => wearGear(barnSlug, b.id, g2.slug))}
                        className="flex items-center gap-1.5 text-[12.4px] font-semibold rounded-full px-3 py-1.5"
                        style={{ background: "#fff", border: "1px solid var(--line)" }}>
                        <span className="inline-block rounded-full flex-none"
                          style={{ width: 12, height: 12, background: g2.colorHex ?? "#999" }} aria-hidden />
                        {g2.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {gear.length > 0 && (
        <a href={`/chuong/${barnSlug}/trang-tri`}
          className="btn btn-ghost mt-3 no-underline">
          ＋ Mua thêm yếm · {fmtVnd(gear[0].priceVnd)}/cái
        </a>
      )}
    </>
  );
}
