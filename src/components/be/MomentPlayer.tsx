"use client";
// Bốn cơ chế học, vẽ ra màn hình (spec §8.1, Epic 5 mục 2).
//
// ⚠️ **Component này KHÔNG được import gì thuộc khu người lớn** - không action tiền/chợ/hoá
// đơn, không `lib/pricing`, không Prisma. Bộ kiểm quét mã nguồn canh (§9.40).
//
// Bốn luật của phần vẽ, lấy thẳng từ §8.2 và §18.1 của spec:
//  · **Không "Sai rồi".** Chọn chưa đúng thì mời nhìn lại, và **không giới hạn số lần thử**.
//  · **Không điểm, không đếm ngày liên tiếp, không so bé này với bé kia.**
//  · **Một màn một việc**, nút to, chạm dễ; không tự chạy sang thẻ sau.
//  · Chuyển động theo `prefers-reduced-motion` - repo đã tắt toàn cục ở `globals.css`.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { batDauBai, xongBai, xongNhiemVu } from "@/app/learning-actions";
import { useToast } from "@/components/Toast";

type LuaChon = { key: string; label: string; dung?: boolean };
export type The =
  | { kind: "story"; title: string; body: string; media: "EVENT_PROOF" | "NONE" }
  | { kind: "observe"; prompt: string; options: LuaChon[]; explain: Record<string, string> }
  | { kind: "predict"; prompt: string; options: LuaChon[] }
  | { kind: "sequence"; prompt: string; items: LuaChon[] }
  | { kind: "count"; prompt: string; source: "HARVEST_QTY"; variant: string }
  | { kind: "finish"; message: string; achievementKey?: string };

export type NoiDungBai = {
  title: string;
  cards: The[];
  familyMission?: { key: string; title: string; body: string };
};

/** Xáo một mảng theo id cố định của bài - cùng một bài mở lại thì thứ tự không nhảy lung tung. */
function xaoTheoBai<T>(ds: T[], hat: string): T[] {
  const ra = [...ds];
  let h = 0;
  for (let i = 0; i < hat.length; i++) h = (h * 31 + hat.charCodeAt(i)) >>> 0;
  for (let i = ra.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) >>> 0;
    const j = h % (i + 1);
    [ra[i], ra[j]] = [ra[j], ra[i]];
  }
  return ra;
}

export default function MomentPlayer({
  momentId, noiDung, soLuong, anhUrl, daXong, nhiemVuDaXong,
}: {
  momentId: string;
  noiDung: NoiDungBai;
  /** Con số THẬT của sự kiện (số trứng…). `null` = bài này không có số. */
  soLuong: number | null;
  /** Ảnh thật cô chú đã chụp. `null` = không có ảnh hợp lệ, thẻ tự bỏ phần ảnh đi. */
  anhUrl: string | null;
  daXong: boolean;
  nhiemVuDaXong: boolean;
}) {
  const cards = noiDung.cards ?? [];
  const [i, setI] = useState(0);
  const [chon, setChon] = useState<Record<number, string>>({});
  const [thuTu, setThuTu] = useState<Record<number, string[]>>({});
  const [xong, setXong] = useState(daXong);
  const [nvXong, setNvXong] = useState(nhiemVuDaXong);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const the = cards[i];
  if (!the) return null;
  const cuoi = i >= cards.length - 1;

  const sang = () => {
    // Mở bài ra ở bước đầu tiên - KHÔNG lúc vẽ trang: một phép ghi DB nấp trong một lượt xem
    // trang là thứ §7.14 đã cấm một lần rồi.
    if (i === 0 && !xong) void batDauBai({ momentId });
    setI((x) => Math.min(x + 1, cards.length - 1));
  };

  const ketThuc = () =>
    start(async () => {
      const r = await xongBai({
        momentId,
        luaChon: Object.entries(chon).map(([k, v]) => ({ the: Number(k), chon: v })),
      });
      toast(r.message, r.ok ? "ok" : "err");
      if (r.ok) { setXong(true); router.refresh(); }
    });

  return (
    <div>
      {/* Thanh chấm: bé biết mình đang ở đâu và còn mấy bước. Không phải thanh điểm. */}
      <div className="flex gap-1.5 justify-center mb-3" aria-hidden>
        {cards.map((_, k) => (
          <span key={k} className="rounded-full" style={{
            width: k === i ? 22 : 8, height: 8,
            background: k <= i ? "var(--paddy)" : "var(--line)",
          }} />
        ))}
      </div>

      <div className="card">
        {the.kind === "story" && (
          <>
            <h2 className="display text-[20px]">{the.title}</h2>
            {the.media === "EVENT_PROOF" && anhUrl && (
              // Ảnh THẬT cô chú vừa chụp ở chuồng. `alt` nói đúng nó là gì (§18.1).
              // eslint-disable-next-line @next/next/no-img-element
              <img src={anhUrl} alt="Ảnh cô chú vừa chụp ở chuồng gà của mình"
                className="w-full rounded-[12px] mt-2.5" style={{ maxHeight: 260, objectFit: "cover" }} />
            )}
            <p className="text-[15px] mt-2.5 leading-relaxed">{the.body}</p>
          </>
        )}

        {(the.kind === "observe" || the.kind === "predict") && (
          <>
            <h2 className="display text-[18px]">{the.prompt}</h2>
            <div className="grid gap-2 mt-3">
              {xaoTheoBai(the.options, momentId + i).map((o) => {
                const daChon = chon[i] === o.key;
                return (
                  <button key={o.key} className="btn text-[15px] justify-start"
                    aria-pressed={daChon}
                    style={{
                      minHeight: 54, textAlign: "left",
                      background: daChon ? "var(--paddy-tint)" : "#fff",
                      border: `1px solid ${daChon ? "var(--paddy)" : "var(--line)"}`,
                    }}
                    onClick={() => setChon((c) => ({ ...c, [i]: o.key }))}>
                    {o.label}
                  </button>
                );
              })}
            </div>
            {/* Lời hồi đáp: giải thích, không chấm điểm. Bé đổi ý bao nhiêu lần cũng được. */}
            {the.kind === "observe" && chon[i] && (
              <p className="text-[13.5px] mt-3 rounded-[10px] px-2.5 py-2 leading-relaxed"
                style={{ background: "var(--paper2)" }}>
                {the.explain[chon[i]] ?? "Mình cùng nhìn lại nhé."}
              </p>
            )}
            {the.kind === "predict" && chon[i] && (
              <p className="text-[13.5px] mt-3 rounded-[10px] px-2.5 py-2 leading-relaxed"
                style={{ background: "var(--paper2)" }}>
                Mình cùng chờ xem nhé - chuyện của đàn gà thì không ai đoán chắc được.
              </p>
            )}
          </>
        )}

        {the.kind === "sequence" && (() => {
          const dung = the.items.map((x) => x.key);
          const hienTai = thuTu[i] ?? xaoTheoBai(dung, momentId + i);
          const daXep = thuTu[i] !== undefined;
          const doiCho = (k: number) => {
            const ds = [...hienTai];
            [ds[k], ds[k - 1]] = [ds[k - 1], ds[k]];
            setThuTu((t) => ({ ...t, [i]: ds }));
          };
          return (
            <>
              <h2 className="display text-[18px]">{the.prompt}</h2>
              <div className="grid gap-2 mt-3">
                {hienTai.map((k, vt) => (
                  <div key={k} className="flex items-center gap-2 rounded-[12px] px-2.5 py-2.5"
                    style={{ background: "#fff", border: "1px solid var(--line)", minHeight: 54 }}>
                    <span className="font-semibold text-[15px] flex-1">
                      {the.items.find((x) => x.key === k)?.label}
                    </span>
                    <button className="btn btn-ghost btn-sm" disabled={vt === 0}
                      aria-label="Đưa lên trên" onClick={() => doiCho(vt)}>↑</button>
                  </div>
                ))}
              </div>
              {daXep && (
                <p className="text-[13.5px] mt-3 rounded-[10px] px-2.5 py-2 leading-relaxed"
                  style={{ background: "var(--paper2)" }}>
                  {hienTai.join(",") === dung.join(",")
                    ? "Đúng thứ tự rồi đó!"
                    : "Mình thử đổi chỗ thêm lần nữa xem sao nhé."}
                </p>
              )}
            </>
          );
        })()}

        {the.kind === "count" && (
          <>
            <h2 className="display text-[18px]">{the.prompt}</h2>
            {soLuong === null ? (
              <p className="text-[14px] mt-2">Lần này mình chưa có số để đếm - mai nhé!</p>
            ) : (
              <>
                {/* Đếm bằng MẮT: mỗi quả trứng một hình, đúng số thật của đàn nhà mình. */}
                <div className="flex flex-wrap gap-1.5 mt-3" role="img"
                  aria-label={`Có ${soLuong} quả trứng`}>
                  {Array.from({ length: Math.min(soLuong, 60) }).map((_, k) => (
                    <span key={k} className="text-[26px]" aria-hidden>🥚</span>
                  ))}
                </div>
                <p className="text-[15px] mt-3">
                  Hôm ấy đàn gà nhà mình được <b>{soLuong}</b> quả.
                </p>
              </>
            )}
          </>
        )}

        {the.kind === "finish" && (
          <>
            <div className="text-[40px]" aria-hidden>🎉</div>
            <h2 className="display text-[20px] mt-1">{the.message}</h2>
          </>
        )}
      </div>

      {/* Điều hướng: một nút, một hướng. KHÔNG tự mở bài kế tiếp (§18.1). */}
      <div className="mt-3">
        {!cuoi ? (
          <button className="btn btn-primary w-full text-[16px]" style={{ minHeight: 54 }}
            onClick={sang}>
            Tiếp theo →
          </button>
        ) : xong ? (
          <div className="text-center text-[14px] font-semibold" style={{ color: "var(--paddy-deep)" }}>
            Bé đã làm xong bài này 🎉
          </div>
        ) : (
          <button className="btn btn-primary w-full text-[16px]" style={{ minHeight: 54 }}
            disabled={pending} aria-busy={pending} onClick={ketThuc}>
            {pending ? "Đang lưu…" : "Mình xong rồi!"}
          </button>
        )}
      </div>

      {/* Nhiệm vụ cùng bố mẹ - chỉ hiện ở thẻ cuối, và chỉ là một dấu tick. */}
      {cuoi && noiDung.familyMission && (
        <div className="card mt-3" style={{ background: "var(--paddy-tint)" }}>
          <div className="text-[14px] font-semibold">💚 {noiDung.familyMission.title}</div>
          <p className="text-[13.5px] mt-1 leading-relaxed">{noiDung.familyMission.body}</p>
          {nvXong ? (
            <div className="text-[13.5px] mt-2 font-semibold" style={{ color: "var(--paddy-deep)" }}>
              Cả nhà đã làm rồi 💚
            </div>
          ) : (
            <button className="btn btn-ghost mt-2.5 w-full" disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await xongNhiemVu({ momentId });
                  toast(r.message, r.ok ? "ok" : "err");
                  if (r.ok) { setNvXong(true); router.refresh(); }
                })
              }>
              Cả nhà làm xong rồi
            </button>
          )}
        </div>
      )}
    </div>
  );
}
