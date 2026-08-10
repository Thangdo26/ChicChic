export const dynamic = "force-dynamic";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser, getWorkerSession } from "@/lib/auth";
import { logout } from "@/app/auth-actions";
import { Coop } from "@/components/Illustrations";
import { ActionButton } from "@/components/Toast";
import BarnCardMenu from "@/components/BarnCardMenu";
import { barnDisplayName, flockProgress, isToday, timeAgo } from "@/lib/decor";
import { fmtVnd } from "@/lib/pricing";
import { stageLabel } from "@/lib/flock";
import { duKienHoanNhieuChuong, tongKhoan } from "@/lib/refunds";
import {
  REFUND_KIND_VI, REFUND_STATUS_MAU, REFUND_STATUS_VI,
  type RefundKind, type RefundStatus,
} from "@/lib/refund";

export default async function Account() {
  const me = await getSessionUser();
  if (!me) redirect("/dang-nhap?next=%2Ftai-khoan");

  // Tài khoản nông dân có cổng riêng - hộp việc chứ không phải danh sách chuồng nhận nuôi.
  // Nhưng nếu nông trại đã TẠM DỪNG tài khoản thì dừng ở đây và nói rõ lý do:
  // đá tiếp sang /nong-trai sẽ bị requireWorker đá ngược lại → vòng lặp vô tận.
  const worker = await getWorkerSession();
  if (worker?.active) redirect("/nong-trai");
  if (worker) {
    return (
      <div className="screen text-center">
        <div className="text-[38px] mt-6">⏸️</div>
        <h1 className="display text-[21px] mt-2">Tài khoản đang tạm dừng</h1>
        <p className="lede mt-2 px-2">
          Nông trại đã tạm dừng tài khoản của {worker.name}. Trong lúc này cô/chú chưa vào được
          hộp việc. Liên hệ nông trại để mở lại giúp nhé.
        </p>
        <div className="grid gap-2 mt-5">
          <ActionButton action={logout} className="btn btn-ghost" pendingLabel="…">Đăng xuất</ActionButton>
        </div>
      </div>
    );
  }

  // Phẳng hoá vì cùng bệnh với trang chuồng: `include` lồng qua N chuồng bung ra hàng
  // chục câu lệnh NỐI TIẾP, mà mỗi lượt đi–về DB là một lần chờ thật (§10). Lọc con
  // theo `barn: { ownerId }` để cả cụm đi trong MỘT đợt song song.
  //
  // `_count` đổi sang `groupBy` - vừa nhanh hơn, vừa đúng luật đã ghi ở §10.
  const [barns, decorRows, mediaRows, mediaCounts, eggSums, refunds, payAcc] = await Promise.all([
    prisma.barn.findMany({
      where: { ownerId: me.id },
      orderBy: { createdAt: "desc" },
      include: {
        worker: { select: { name: true } },
        reservation: { select: { paymentStatus: true, depositVnd: true, priceEstimateVnd: true } },
        flock: { include: { breed: { select: { name: true } } } },
      },
    }),
    prisma.barnDecor.findMany({
      where: { barn: { ownerId: me.id } }, orderBy: { z: "asc" },
      select: { id: true, barnId: true, x: true, y: true, scale: true, flipped: true, text: true, item: { select: { svgKey: true } } },
    }),
    // Chỉ cần "ảnh mới nhất của từng chuồng". Lấy 1 ảnh/chuồng bằng truy vấn riêng là
    // bẫy N+1; lấy một nắm rồi chọn ở Node rẻ hơn nhiều so với N lượt đi–về.
    prisma.barnMedia.findMany({
      where: { barn: { ownerId: me.id } }, orderBy: { capturedAt: "desc" }, take: 60,
      select: { barnId: true, capturedAt: true },
    }),
    prisma.barnMedia.groupBy({ by: ["barnId"], where: { barn: { ownerId: me.id } }, _count: { _all: true } }),
    // ⭐ Số trứng THẬT từ sổ thu hoạch. Trang này vẫn đang đọc `Product.qty` - cột không
    // có một lệnh `update` nào trong `src/` (§11.11), nên ô "🥚 … quả" ở đây LUÔN là 0.
    // Trang chuồng đã vá từ đợt sổ thu hoạch, trang này thì sót lại.
    prisma.harvestLot.groupBy({
      by: ["barnId"], where: { barn: { ownerId: me.id }, type: "EGG" }, _sum: { qty: true },
    }),
    // Khoản nông trại còn nợ. Đây là chỗ DUY NHẤT người ta thấy chúng: hoàn trả chuồng
    // xong thì chuồng biến khỏi danh sách trên kia, mà khoản nợ thì vẫn còn - không có
    // khối này thì tiền của họ nằm trong DB mà không có đường nào nhìn thấy.
    prisma.refund.findMany({
      where: { userId: me.id, kind: { not: "MARKET" } },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true, kind: true, amountVnd: true, paidVnd: true, status: true,
        barnLabel: true, reason: true, adminNote: true, createdAt: true, paidAt: true,
      },
    }),
    prisma.payoutAccount.findUnique({ where: { userId: me.id }, select: { bankName: true } }),
  ]);

  // Con số "hoàn trả thì được trả lại bao nhiêu" cho từng thẻ chuồng - BA truy vấn cho
  // cả danh sách, không phải ba nhân N (§10).
  const hoanTheoChuong = await duKienHoanNhieuChuong(barns.map((b) => b.id));

  const decorBy = new Map<string, typeof decorRows>();
  for (const d of decorRows) (decorBy.get(d.barnId) ?? decorBy.set(d.barnId, []).get(d.barnId)!).push(d);
  // `mediaRows` đã sắp mới-nhất-trước nên dòng đầu gặp của mỗi chuồng chính là ảnh mới nhất.
  const lastMediaBy = new Map<string, Date>();
  for (const m of mediaRows) if (!lastMediaBy.has(m.barnId)) lastMediaBy.set(m.barnId, m.capturedAt);
  const eggBy = new Map(eggSums.map((r) => [r.barnId, r._sum.qty ?? 0]));

  // Chỉ khoản CHƯA chuyển mới cộng vào con số lớn - `PAID` là chuyện đã xong, gộp vào
  // thì người ta tưởng còn được nhận thêm ngần ấy nữa.
  const choHoan = refunds
    .filter((r) => r.status === "REQUESTED" || r.status === "APPROVED")
    .reduce((s, r) => s + r.amountVnd, 0);

  const totalMedia = mediaCounts.reduce((s, r) => s + r._count._all, 0);
  const freshToday = barns.filter((b) => {
    const t = lastMediaBy.get(b.id);
    return !!t && isToday(t);
  }).length;
  const waitingDeposit = barns.filter((b) => b.reservation && b.reservation.paymentStatus !== "CONFIRMED").length;

  return (
    <div className="screen">
      {/* ---------- Hồ sơ ---------- */}
      <div className="flex items-center gap-3">
        <div className="grid place-items-center rounded-full flex-none display font-bold text-[20px]"
          style={{ width: 48, height: 48, background: "var(--paddy-tint)", color: "var(--paddy-deep)" }}>
          {(me.name ?? me.email).trim().charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="display text-[20px] leading-tight truncate">{me.name ?? "Chào bạn"}</h1>
          <p className="text-[12.4px] truncate" style={{ color: "var(--ink-soft)" }}>{me.email}</p>
        </div>
        <ActionButton action={logout} className="btn btn-ghost btn-sm flex-none" pendingLabel="…">Đăng xuất</ActionButton>
      </div>

      {barns.length > 0 && (
        <div className="statusband mt-3.5">
          <div><div className="sb-k">Chuồng của bạn</div><div className="sb-v">{barns.length}</div></div>
          <div className="w-px self-stretch flex-none" style={{ background: "rgba(255,255,255,.18)" }} />
          <div><div className="sb-k">Ảnh & video</div><div className="sb-v">{totalMedia}</div></div>
          <div className="w-px self-stretch flex-none" style={{ background: "rgba(255,255,255,.18)" }} />
          <div><div className="sb-k">Có tin hôm nay</div><div className="sb-v">{freshToday}</div></div>
        </div>
      )}

      {waitingDeposit > 0 && (
        <div className="rounded-[14px] p-3 mt-3 text-[12.7px]" style={{ background: "var(--yolk-tint)", border: "1px solid #EBD8AE", color: "var(--yolk-deep)" }}>
          🔒 Bạn có <b>{waitingDeposit} chuồng</b> chưa hoàn tất cọc. Xong cọc là mở khoá trang trí và nhận thêm chuồng mới được.
        </div>
      )}

      {/* ---------- Nông trại nợ bạn ----------
          Đặt TRÊN danh sách chuồng, cố ý: chuồng đã hoàn trả thì biến khỏi danh sách,
          nên nếu khối này nằm dưới cùng thì người vừa rời đi phải cuộn qua hết những
          thứ không còn liên quan mới thấy tiền của mình. Ai còn nợ ai là câu hỏi đầu
          tiên, không phải câu hỏi cuối. */}
      {refunds.length > 0 && (
        <div className="card mt-3.5" style={{ background: "linear-gradient(180deg,#FFFDF7,#FBF4E4)", borderColor: "#EBD8AE" }}>
          <div className="font-bold text-[14px]">↩️ Nông trại hoàn lại cho bạn</div>
          {choHoan > 0 && (
            <div className="flex justify-between items-baseline mt-2">
              <span className="text-[13px]">Đang chờ chuyển</span>
              <b className="display text-[19px]" style={{ color: "var(--paddy-deep)" }}>{fmtVnd(choHoan)}</b>
            </div>
          )}

          <div className="grid gap-1.5 mt-2.5">
            {refunds.map((r) => (
              <div key={r.id} className="text-[12.4px] pt-1.5" style={{ borderTop: "1px dashed var(--line)" }}>
                <div className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {REFUND_KIND_VI[r.kind as RefundKind]}
                    {r.barnLabel ? ` · ${r.barnLabel}` : ""}
                  </span>
                  <b className="flex-none">{fmtVnd(r.paidVnd ?? r.amountVnd)}</b>
                </div>
                <div className="font-semibold mt-0.5" style={{ color: REFUND_STATUS_MAU[r.status as RefundStatus] }}>
                  {REFUND_STATUS_VI[r.status as RefundStatus]}
                  {r.paidAt && ` · ${new Date(r.paidAt).toLocaleDateString("vi-VN")}`}
                </div>
                {/* Từ chối thì lý do là thứ DUY NHẤT đáng đọc ở dòng này. */}
                {r.status === "REJECTED" && r.adminNote && (
                  <div className="mt-0.5" style={{ color: "var(--ink-soft)" }}>{r.adminNote}</div>
                )}
              </div>
            ))}
          </div>

          {/* Không có tài khoản nhận tiền thì khoản nợ có ghi cũng không đi đâu được.
              Nói ngay ở đây, đừng để họ chờ rồi tự hỏi vì sao tiền chưa về. */}
          {choHoan > 0 && !payAcc && (
            <div className="text-[12.4px] mt-2.5 font-semibold" style={{ color: "#8A5A1A" }}>
              ⚠️ Bạn chưa điền tài khoản nhận tiền - nông trại chưa biết chuyển về đâu.{" "}
              <Link href="/cho/cua-toi" style={{ color: "var(--paddy)" }}>Điền ngay ›</Link>
            </div>
          )}
        </div>
      )}

      {/* ---------- Danh sách chuồng ---------- */}
      <div className="label">Chuồng tôi đang nuôi</div>

      {barns.length === 0 ? (
        <div className="soft text-center py-7">
          <div className="text-[30px]">🐣</div>
          <div className="font-semibold text-[14.5px] mt-1.5">Bạn chưa nhận nuôi chuồng nào</div>
          <p className="text-[12.8px] mt-1 px-3" style={{ color: "var(--ink-soft)" }}>
            Chọn giống, cách cho ăn và số gà - cô chú nông dân sẽ chăm giúp và gửi ảnh mỗi ngày.
          </p>
          <Link href="/nhan-chuong" className="btn btn-primary mt-3.5 no-underline">Nhận chuồng đầu tiên →</Link>
        </div>
      ) : (
        <div className="grid gap-3 mt-1">
          {barns.map((b) => {
            const paid = !b.reservation || b.reservation.paymentStatus === "CONFIRMED";
            const isLayer = b.flock?.productLine === "LAYER";
            const eggs = eggBy.get(b.id) ?? 0;
            const prog = b.flock ? flockProgress(b.flock.startDate, b.flock.cycleDays) : null;
            const lastMedia = lastMediaBy.get(b.id);

            return (
              <div key={b.id} className="card" style={!paid ? { borderColor: "#EBD8AE" } : undefined}>
                <div className="flex items-start gap-3">
                  <Link href={`/chuong/${b.slug}`} className="flex-none rounded-[12px] overflow-hidden no-underline"
                    style={{ width: 86, background: "linear-gradient(180deg,#EAF1E3,#DCE8D2)", border: "1px solid var(--line)" }}>
                    <Coop
                      label={barnDisplayName(b.label)}
                      outside={b.outside}
                      decor={(decorBy.get(b.id) ?? []).map((d) => ({ id: d.id, svgKey: d.item.svgKey, x: d.x, y: d.y, scale: d.scale, flipped: d.flipped, text: d.text }))}
                    />
                  </Link>

                  <div className="flex-1 min-w-0">
                    <Link href={`/chuong/${b.slug}`} className="no-underline">
                      <div className="font-semibold text-[14.6px] truncate" style={{ color: "var(--ink)" }}>{b.label}</div>
                    </Link>
                    <div className="text-[12.2px] mt-0.5 truncate" style={{ color: "var(--ink-soft)" }}>
                      {b.flock?.breed.name} · {isLayer ? "gà đẻ" : "gà thịt"} · {b.flock?.size} con
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {!paid ? (
                        <span className="text-[11px] font-semibold rounded-full px-2 py-0.5"
                          style={{ background: "var(--yolk-tint)", color: "var(--yolk-deep)" }}>
                          🔒 {b.reservation!.paymentStatus === "REPORTED" ? "Chờ đối soát cọc" : `Cần cọc ${fmtVnd(b.reservation!.depositVnd)}`}
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold rounded-full px-2 py-0.5"
                          style={{ background: "var(--paddy-tint)", color: "var(--paddy-deep)" }}>
                          {b.flock ? stageLabel(b.flock.stage, b.flock.productLine) : "Đang nuôi"}
                        </span>
                      )}
                      {paid && (
                        <span className="text-[11px] font-semibold rounded-full px-2 py-0.5"
                          style={{ background: "var(--paper2)", color: "var(--ink-soft)" }}>
                          {isLayer ? `🥚 ${eggs} quả` : `📅 ngày ${prog?.day}/${prog?.total}`}
                        </span>
                      )}
                    </div>
                  </div>

                  <BarnCardMenu
                    barnSlug={b.slug} barnLabel={b.label}
                    hoanVnd={tongKhoan(hoanTheoChuong.get(b.id) ?? [])}
                  />
                </div>

                <div className="flex items-center justify-between gap-2 mt-2.5 pt-2.5" style={{ borderTop: "1px solid var(--line-soft)" }}>
                  <span className="text-[11.8px] min-w-0 truncate" style={{ color: "var(--ink-soft)" }}>
                    {lastMedia
                      ? `${isToday(lastMedia) ? "🟢 Có tin hôm nay" : `📷 Ảnh mới ${timeAgo(lastMedia)}`} · ${b.worker?.name ?? "Nông dân"} chăm`
                      : `${b.worker?.name ?? "Nông dân"} đang chuẩn bị đàn cho bạn`}
                  </span>
                  <Link href={`/chuong/${b.slug}`} className="flex-none text-[12.6px] font-semibold no-underline whitespace-nowrap" style={{ color: "var(--paddy)" }}>
                    Vào chuồng ›
                  </Link>
                </div>
              </div>
            );
          })}

          {/* LỐI VÀO DUY NHẤT còn lại để nhận thêm chuồng khi đã có chuồng. Ba chỗ mời
              mọc kia (thanh điều hướng, danh sách chuồng, lưới lối tắt trong chuồng) đã
              bỏ - nhưng bỏ HẾT thì người thật sự muốn nuôi con thứ hai không còn đường
              nào ngoài gõ tay đường dẫn. Nên nó ở lại đây, dạng dòng chữ chứ không phải
              nút: /tai-khoan là chỗ người ta chủ động đi tìm, không phải chỗ bị chào mời. */}
          <Link href="/nhan-chuong" className="text-[12.6px] font-semibold text-center mt-1 no-underline"
            style={{ color: "var(--paddy)" }}>
            + Nhận thêm một chuồng nữa
          </Link>
        </div>
      )}

      {/* ---------- Chợ nông trại ----------
          Lối vào duy nhất cho người dùng thường: thanh trên chỉ có logo + chuông + tài
          khoản, nên chợ phải nằm ở đây, cạnh danh sách chuồng. */}
      <Link href="/cho" className="card flex items-center gap-3 mt-3.5 no-underline">
        <span className="flex-none text-[18px]">🏪</span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[14px]">Chợ nông trại</div>
          <div className="text-[12px]" style={{ color: "var(--ink-soft)" }}>
            Bận không nhận được trứng? Chuyển lại cho người khác - hoặc mua thêm từ chuồng bạn bè.
          </div>
        </div>
        <span className="flex-none font-semibold text-[14px]" style={{ color: "var(--paddy)" }}>›</span>
      </Link>

      <p className="text-[11.6px] mt-5 leading-relaxed" style={{ color: "var(--ink-soft)" }}>
        Muốn dừng nuôi một chuồng? Bấm dấu <b>⋯</b> ở chuồng đó → <b>Hoàn trả chuồng cho trang trại</b>.
        Đàn gà vẫn được cô chú chăm sóc bình thường sau khi hoàn trả, và phần tiền nuôi của những
        ngày chưa nuôi tới sẽ được trả lại - số cụ thể hiện ngay trước lúc bạn bấm.
      </p>
    </div>
  );
}
