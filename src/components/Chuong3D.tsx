"use client";
// Hình chuồng bấm được - lớp bọc mỏng quanh `Coop`.
//
// Vì sao nó là client component còn `Coop` thì không: `Coop` được dùng ở 7 chỗ, phần lớn
// là ảnh nhỏ 86px trong danh sách chuồng và ở trang chủ. Bắt cả 7 chỗ đó gánh JavaScript
// chỉ vì MỘT trang cần chạm được vào con gà là trả giá sai chỗ. Nên state nằm ở đây,
// còn hình vẽ vẫn là SVG dựng sẵn ở server.
//
// State chọn/rê/dừng ở client. Mọi luật - vẽ yếm nào,
// con nào đứng đâu - nằm ở `lib/chuong-3d.ts`.
import { useState } from "react";
import Link from "next/link";
import { Coop, type PlacedDecor } from "@/components/Illustrations";
import { cauSoCon, type GaVM } from "@/lib/chuong-3d";

export default function Chuong3D({
  decor, outside, label, dan, soConThat, danGaHref = null, coTheDatTen,
}: {
  decor: PlacedDecor[];
  outside: boolean;
  label: string;
  dan: GaVM[];
  /** Số con ĐANG SỐNG thật trong đàn - có thể lớn hơn `dan.length` vì trần vẽ. */
  soConThat: number;
  /**
   * Đường sang trang Đàn gà. `null` = không vẽ liên kết nào.
   *
   * Cô chú nông dân xem chuồng cũng cần chạm vào con gà để biết tên nó (họ là người
   * phải ra mặc đúng cái yếm cho đúng con), nhưng trang Đàn gà là của chủ chuồng -
   * nên với họ không có liên kết. Một nút bấm vào rồi bị từ chối còn tệ hơn không có.
   */
  danGaHref?: string | null;
  /** Đàn gà đẻ mới đặt tên từng con; gà thịt đi theo cả lứa. */
  coTheDatTen: boolean;
}) {
  /** Con đang chạm (điện thoại) - giữ nguyên tới khi chạm chỗ khác. */
  const [giu, setGiu] = useState<string | null>(null);
  /** Con đang rê chuột qua (máy tính) - thả ra là mất. */
  const [re, setRe] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);

  const hienId = re ?? giu;
  const hien = dan.find((g) => g.id === hienId) ?? null;
  const chuaDatTen = dan.filter((g) => !g.coTen).length;

  return (
    <>
      <div className="coopwrap coop-playground mt-2" data-paused={paused} style={{ padding: "10px 10px 4px" }}>
        <Coop
          decor={decor} outside={outside} label={label} dan={dan}
          chon={hienId} onChon={setGiu} onRe={setRe} animated large
        />
        <div className="flex items-center justify-between gap-3 px-2 pb-2 text-xs" style={{ color: "var(--ink-soft)" }}>
          <span>Cảnh minh họa · yếm cập nhật theo minh chứng</span>
          <button className="coop-motion-toggle" type="button" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? "▶ Cho gà đi dạo" : "Ⅱ Tạm dừng"}</button>
        </div>
      </div>

      {/* Một dòng duy nhất dưới hình, đổi nội dung theo con đang chỉ tới. Cố ý KHÔNG
          đẩy chiều cao trang lên xuống mỗi lần chạm - chữ nhảy làm người ta mất chỗ
          đang đọc, nên khối này luôn chiếm đúng một dòng. */}
      <div className="soft mt-2 flex items-center gap-2 text-[12.6px]" style={{ minHeight: 48 }} aria-live="polite" aria-atomic="true">
        {hien ? (
          <>
            <span className="flex-none inline-block rounded-[3px]"
              style={{ width: 12, height: 12, background: hien.yem?.mau ?? "var(--paper2)", border: hien.yem ? "none" : "1px solid var(--line)" }}
              aria-hidden />
            <span className="min-w-0 flex-1">
              <b>{hien.ten}</b>
              <span style={{ color: "var(--ink-soft)" }}>
                {" · "}
                {hien.yem
                  ? `đang mặc ${hien.yem.ten}`
                  : hien.cho
                    // Nói rõ đây là việc CHƯA làm xong, đừng để người ta tưởng hình
                    // vẽ thiếu: cái yếm chưa lên lưng con gà thật thì hình không vẽ.
                    ? `${hien.cho.toLowerCase()} - hình sẽ đổi khi có ảnh`
                    : "chưa mặc yếm"}
              </span>
            </span>
            {danGaHref && coTheDatTen && (
              <Link href={danGaHref} className="flex-none font-semibold no-underline whitespace-nowrap"
                style={{ color: "var(--paddy)" }}>
                {hien.coTen ? "Yếm ›" : "Đặt tên ›"}
              </Link>
            )}
          </>
        ) : (
          <span style={{ color: "var(--ink-soft)" }}>
            {cauSoCon(soConThat)}
            {soConThat > 0 && (coTheDatTen
              ? chuaDatTen > 0
                ? ` · chạm vào một con để xem tên (${chuaDatTen} con chưa đặt tên)`
                : " · chạm vào một con để xem tên"
              : " · chạm vào một con để xem vòng chân")}
          </span>
        )}
      </div>
    </>
  );
}
