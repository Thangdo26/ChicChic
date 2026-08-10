"use client";
import { useState, useTransition } from "react";
import { decideEndOfLay } from "@/app/actions";
import { useToast } from "@/components/Toast";
import { fmtVnd } from "@/lib/pricing";

type Choice = "MEAT" | "RETIRE" | "RENEW";

type Option = { id: Choice; emoji: string; title: string; desc: string; happens: string[]; tone: string };

/**
 * Ba lựa chọn giống nhau cho cả hai dòng, nhưng CHỮ thì không được dùng chung: gà mái
 * đã đẻ một mùa và gà thịt tơ là hai con vật khác nhau trên mâm cơm, và hứa "gà mái
 * hầm" cho một lứa gà thịt là nói sai về chính món người ta sắp nhận (§9.11).
 */
const optionsFor = (broiler: boolean): Option[] => [
  {
    id: "MEAT",
    emoji: broiler ? "🍗" : "🍲",
    title: broiler ? "Nhận thịt (gà tơ)" : "Nhận thịt (gà mái hầm)",
    desc: broiler
      ? "Nhận đàn về làm món. Gà nuôi đủ ngày, thả vườn — thịt chắc, ngọt, hợp luộc/nướng/hấp."
      : "Nhận đàn về làm món. Gà mái đã đẻ lâu hợp các món hầm/tiềm — gà mái dầu, tiềm thuốc bắc — đậm vị, khác gà tơ.",
    happens: [
      "Nông trại sơ chế theo đúng quy định giết mổ & kiểm dịch",
      // Nói đúng thứ hệ thống THẬT SỰ làm: nông dân cân, chụp ảnh và ghi vào sổ thu
      // hoạch — đó là lô hàng có truy xuất, và nó thuộc về chủ chuồng.
      "Nông dân cân từng con, chụp ảnh và ghi vào sổ thu hoạch của bạn",
      "Lô đó là của bạn: nhận về, hoặc đăng bán lại trên chợ nông trại",
    ],
    tone: "Một hành trình farm-to-table trọn vẹn.",
  },
  {
    id: "RETIRE", emoji: "🌾", title: 'Cho "nghỉ hưu" ở nông trại',
    desc: "Để các bạn gà sống tiếp ở vườn nhà cô Lan, không vào lò mổ. Bạn vẫn thi thoảng nhận ảnh.",
    happens: ["Gà ở lại farm, được chăm bình thường", "Không giết mổ"],
    tone: "Một lựa chọn tử tế — tụi mình trân trọng.",
  },
  {
    id: "RENEW", emoji: "🐣", title: "Nuôi lứa mới",
    desc: "Khép lại chương này, bắt đầu một đàn mới trong chuồng của bạn — đặt tên lại từ đầu.",
    happens: [
      "Đàn cũ được farm cho nghỉ",
      `Chuồng bắt đầu một lứa ${broiler ? "gà thịt" : "gà đẻ"} mới, đúng số con như lứa vừa rồi`,
      // Nói trước cho đúng §9.2: gà con không xuất hiện vì ai đó bấm nút.
      "Nông dân nhận việc thả gà con vào chuồng và gửi ảnh — lứa mới bắt đầu từ giai đoạn úm",
    ],
    tone: "Mở một chương mới.",
  },
];

export default function EndOfLayChoices({
  barnSlug, retireFeeVnd, broiler = false,
}: { barnSlug: string; retireFeeVnd: number; broiler?: boolean }) {
  const OPTIONS = optionsFor(broiler);
  const [confirm, setConfirm] = useState<Choice | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const opt = OPTIONS.find((o) => o.id === confirm);

  /**
   * Đây là nút **nặng nhất trong cả sản phẩm**: bấm xong là đàn gà đi vào lò mổ, hoặc
   * được giữ lại, hoặc bị thay bằng một lứa mới — không hoàn tác được. Nó cũng là nút
   * chạy **lâu nhất**: ghi `LifecycleDecision`, đổi trạng thái từng con, tạo việc cho
   * nông dân, ghi nhật ký, đo, bắn thông báo — rồi mới chuyển trang.
   *
   * Trước bản này nó là một `<form action={decideEndOfLay}>` trần, không có phản hồi
   * nào: bấm xong màn hình đứng im vài giây ở đúng khoảnh khắc người ta căng thẳng
   * nhất trong cả sản phẩm. Phản xạ tự nhiên là **bấm lại**. Lần bấm thứ hai không
   * làm hỏng dữ liệu (`decideEndOfLay` có chốt `stage !== END_OF_LAY` rồi đá về trang
   * chuồng), nhưng "bấm mà không thấy gì" ở một quyết định như thế này là cách chắc
   * chắn làm người ta mất tin vào cả app.
   *
   * Dùng `useTransition` chứ **không** `useFormStatus`: cái sheet chứa nút này chỉ mở
   * ra bằng `onClick`, nên không có JavaScript thì không ai tới được nó — lập luận
   * "giữ `<form action>` cho chạy được khi chưa có JS" nghe hợp lý nhưng không đúng ở
   * đây. Đổi lại, `useTransition` là đúng cách mọi nút khác trong repo đang làm, và
   * nó bắt được lỗi để báo bằng toast thay vì ném ra màn `error.tsx`.
   */
  const xacNhan = () =>
    start(async () => {
      try {
        const fd = new FormData();
        fd.set("barn", barnSlug);
        fd.set("choice", opt!.id);
        await decideEndOfLay(fd); // tự chuyển về trang chuồng khi xong
      } catch {
        toast("Chưa gửi được lựa chọn. Kiểm tra kết nối rồi thử lại giúp mình nhé.", "err");
      }
    });

  return (
    <>
      <div className="grid gap-3 mt-4">
        {OPTIONS.map((o) => (
          <div key={o.id} className="card">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 flex-none rounded-[12px] grid place-items-center text-[22px]" style={{ background: "var(--paper2)" }}>{o.emoji}</div>
              <div className="flex-1">
                <div className="font-semibold text-[15.5px]">{o.title}</div>
                <p className="text-[13px] mt-0.5" style={{ color: "var(--ink-soft)" }}>{o.desc}</p>
              </div>
            </div>
            <ul className="mt-2.5 pl-1 grid gap-1">
              {o.happens.map((h) => (
                <li key={h} className="text-[12.5px] flex gap-2" style={{ color: "var(--ink-soft)" }}><span style={{ color: "var(--paddy)" }}>•</span>{h}</li>
              ))}
            </ul>
            {o.id === "RETIRE" && (
              <div className="text-[12.3px] mt-2 rounded-[10px] px-2.5 py-2" style={{ background: "var(--paddy-tint)", color: "var(--paddy-deep)" }}>
                Phí nuôi dưỡng: <b>{fmtVnd(retireFeeVnd)}/tháng</b> — minh bạch, chủ yếu là thức ăn + công cô Lan.
              </div>
            )}
            <div className="flex items-center justify-between mt-3">
              <span className="text-[12px] italic" style={{ color: "var(--ink-soft)" }}>{o.tone}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(o.id)}>Chọn</button>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11.8px] mt-4 leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        Không có lựa chọn nào là "đúng" hơn. Bạn có thể suy nghĩ thêm — màn này sẽ luôn ở đây, không có thời hạn.
      </p>

      {opt && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center" style={{ background: "rgba(24,34,28,.5)" }} onClick={(e) => e.target === e.currentTarget && setConfirm(null)}>
          <div className="w-full max-w-[460px] rounded-t-[22px] p-[22px]" style={{ background: "var(--paper)" }}>
            <div className="w-[38px] h-1 rounded-[3px] mx-auto mb-3.5" style={{ background: "var(--line)" }} />
            <div className="text-[26px] mb-1">{opt.emoji}</div>
            <h3 className="display text-[19px]">{opt.title}</h3>
            <p className="lede mt-1.5 mb-1">{opt.desc}</p>
            {opt.id === "MEAT" && (
              <p className="text-[12px] mt-2 rounded-[10px] px-2.5 py-2" style={{ background: "#FCF3E8", border: "1px solid #F0D9B4", color: "#7a4d1a" }}>
                Xác nhận: farm sẽ sơ chế theo đúng quy định giết mổ & kiểm dịch. Đây là bước không thể hoàn tác.
              </p>
            )}
            {opt.id === "RETIRE" && (
              <p className="text-[12px] mt-2" style={{ color: "var(--ink-soft)" }}>Các bạn gà sẽ ở lại farm. Phí nuôi dưỡng {fmtVnd(retireFeeVnd)}/tháng, đối soát tay như các khoản khác.</p>
            )}
            <button className="btn btn-primary mt-4" onClick={xacNhan} disabled={pending} aria-busy={pending}>
              {pending ? "Đang gửi tới nông trại…" : "Xác nhận lựa chọn này"}
            </button>
            {/* Khoá luôn đường lùi trong lúc gửi: đóng sheet giữa chừng thì việc vẫn
                chạy tiếp ở server mà người dùng lại tưởng mình vừa huỷ được. */}
            <button className="btn btn-ghost mt-2" disabled={pending} onClick={() => setConfirm(null)}>
              Để mình suy nghĩ thêm
            </button>
          </div>
        </div>
      )}
    </>
  );
}
