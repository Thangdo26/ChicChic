export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Coop, FarmerAvatar } from "@/components/Illustrations";
import { MediaStrip, type MediaVM } from "@/components/MediaGallery";
import { ActionButton } from "@/components/Toast";
import PaymentBanner from "@/components/PaymentBanner";
import { toggleRange } from "@/app/actions";
import { canViewBarn, requireUser } from "@/lib/auth";
import BarnLocked from "@/components/BarnLocked";
import TaskPanel, { type TaskVM } from "@/components/TaskPanel";
import { barnDisplayName, flockProgress, isToday, timeAgo } from "@/lib/decor";
import { track } from "@/lib/track";
import type { TaskKind, TaskStatus } from "@/lib/tasks";

export default async function BarnDashboard({ params }: { params: { id: string } }) {
  // Chặn TRƯỚC khi truy vấn: khách chưa đăng nhập được chuyển hướng ngay,
  // không phải chờ một query nặng rồi mới bị từ chối.
  // Giữ lại kết quả: `requireUser` đã tra phiên rồi, dùng luôn `me` ở đây thì đợt truy
  // vấn bên dưới không phải chờ thêm một lượt nữa để biết mình là ai.
  const me = await requireUser(`/chuong/${params.id}`);

  // ⭐ TRANG NẶNG NHẤT CỦA APP — đo được 2,8s trước khi phẳng hoá.
  //
  // Trước đây đây là MỘT `findUnique` với `include` lồng 3 tầng. Prisma bung nó ra
  // **16 câu lệnh SQL nối tiếp nhau**, mà một lượt đi–về tới Supabase đo được ~282ms
  // ⟹ chỉ riêng câu này đã ăn 2,16 giây. Không phải truy vấn nặng, mà là quá nhiều
  // lượt chờ xếp hàng.
  //
  // Cách sửa: lọc con theo `barn: { slug }` thay vì theo `barnId` lấy từ câu cha, nhờ
  // vậy KHÔNG câu nào phải chờ câu nào — cả cụm đi trong MỘT đợt song song qua pool 5
  // kết nối. Số lượt chờ nối tiếp: 16 → 1.
  //
  // ⚠️ ĐỪNG gộp ngược lại thành `include` lồng cho "gọn". Và đừng bật
  // `previewFeatures = ["relationJoins"]` — nhanh hơn thật nhưng làm sập query engine
  // (§10). Muốn nhanh thì giảm số tầng, đúng như §10 đã kết luận.
  // `Product` KHÔNG có mặt ở đây: ô "Trứng chu kỳ này" đọc từ `HarvestLot` (§11.11).
  // Câu `include: { products }` cũ chỉ còn là tàn dư — kéo về rồi không ai đọc.
  const [barn, decorRows, updates, media, tasks, healthEvents, unreadMsgs, gearWorn, eggAgg, lotCount] = await Promise.all([
    prisma.barn.findUnique({
      where: { slug: params.id },
      include: {
        worker: true,
        reservation: true,
        flock: { include: { breed: true, feedingPlan: true } },
      },
    }),
    prisma.barnDecor.findMany({
      where: { barn: { slug: params.id } }, orderBy: { z: "asc" }, include: { item: true },
    }),
    // Một chuồng chỉ thuộc MỘT nông dân → dùng barn.worker, khỏi join lại ở từng ghi chép.
    prisma.farmUpdate.findMany({
      where: { barn: { slug: params.id } }, orderBy: { createdAt: "desc" }, take: 6,
      include: { media: true },
    }),
    prisma.barnMedia.findMany({
      where: { barn: { slug: params.id } }, orderBy: { capturedAt: "desc" }, take: 12,
    }),
    prisma.barnTask.findMany({
      where: { barn: { slug: params.id } }, orderBy: { createdAt: "desc" }, take: 8,
      include: { proof: { select: { url: true, type: true } } },
    }),
    prisma.healthEvent.findMany({
      where: { flock: { barn: { slug: params.id } } }, orderBy: { createdAt: "desc" }, take: 1,
    }),
    // Bốn con số phụ — TRƯỚC ĐÂY là một `Promise.all` thứ hai chạy SAU đợt trên, vì
    // chúng cần `barn.id` và `flock.id`. Lọc theo `barn: { slug }` thì hết phụ thuộc,
    // nên cả trang gom về ĐÚNG MỘT đợt: 2 lượt chờ nối tiếp → 1.
    //
    // `gearWorn` và `unreadMsgs` chạy vô điều kiện (trước đây có `isLayer`/`isOwner`
    // gác): với chuồng gà thịt hay người không phải chủ thì chúng trả 0, mà chạy song
    // song nên KHÔNG tốn thêm thời gian thật — đổi một truy vấn rẻ lấy một lượt chờ.
    prisma.barnMessage.count({
      where: { barn: { slug: params.id }, readAt: null, hiddenAt: null, senderId: { not: me.id } },
    }),
    prisma.birdGear.count({
      where: { bird: { flock: { barn: { slug: params.id } } }, status: { not: "OFF" } },
    }),
    prisma.harvestLot.aggregate({ where: { barn: { slug: params.id }, type: "EGG" }, _sum: { qty: true } }),
    prisma.harvestLot.count({ where: { barn: { slug: params.id } } }),
  ]);
  if (!barn || !barn.flock) return notFound();
  if (!(await canViewBarn(barn, `/chuong/${params.id}`))) return <BarnLocked slug={barn.slug} />;

  const payment = barn.reservation?.paymentStatus ?? "CONFIRMED";
  const activated = payment === "CONFIRMED";

  const { flock } = barn;
  const isLayer = flock.productLine === "LAYER";
  const endOfLay = isLayer && flock.stage === "END_OF_LAY";
  const closed = flock.stage === "HARVESTED" || flock.stage === "RETIRED";
  const progress = flockProgress(flock.startDate, flock.cycleDays);

  const evt = healthEvents[0];
  const inWithdrawal = !!evt?.withdrawalUntil && new Date(evt.withdrawalUntil) > new Date();

  const decor = decorRows.map((d) => ({
    id: d.id, svgKey: d.item.svgKey, x: d.x, y: d.y, scale: d.scale, flipped: d.flipped, text: d.text,
  }));
  const signLabel = barnDisplayName(barn.label);

  const toVM = (m: (typeof media)[number]): MediaVM => ({
    id: m.id, type: m.type, url: m.url, posterUrl: m.posterUrl, caption: m.caption,
    durationSec: m.durationSec, capturedAt: m.capturedAt.toISOString(), workerName: barn.worker?.name ?? null,
  });
  const todays = media.filter((m) => isToday(m.capturedAt)).map(toVM);
  const strip = todays.length ? todays : media.slice(0, 4).map(toVM);

  const isOwner = !!me && me.id === barn.ownerId;

  // ⭐ Ô "Trứng chu kỳ này" — con số này TỪNG LÀ 0 VĨNH VIỄN với mọi chuồng thật:
  // `Product.qty` không có một lệnh `update` nào trong `src/` (§11.11). Từ nay nó cộng
  // từ `HarvestLot`, tức là mỗi quả đều có ngày thu, người thu và một tấm ảnh kèm theo.
  const eggs = eggAgg._sum.qty ?? 0;
  // Tín hiệu giữ chân: chủ chuồng có mở chuồng của mình hôm nay không.
  // Chỉ ghi cho CHỦ chuồng — lượt xem chuồng trưng bày không phải là giữ chân.
  if (isOwner) {
    await track("barn_opened", {
      userId: me.id, barnSlug: barn.slug,
      props: {
        productLine: flock.productLine,
        stage: flock.stage,
        freshMediaToday: todays.length,
        openTasks: tasks.filter((t) => t.status === "OPEN").length,
      },
    });
  }
  // Chuồng trưng bày mà người xem không sở hữu → xem cho biết trước khi nhận nuôi.
  const isDemoView = !isOwner && barn.isPublic && me?.role === "USER";
  const taskVMs: TaskVM[] = tasks.map((t) => ({
    id: t.id, kind: t.kind as TaskKind, title: t.title, note: t.note,
    dueAt: t.dueAt?.toISOString() ?? null, status: t.status as TaskStatus,
    createdAt: t.createdAt.toISOString(), doneAt: t.doneAt?.toISOString() ?? null,
    doneNote: t.doneNote, proofUrl: t.proof?.url ?? null, proofType: t.proof?.type ?? null,
  }));
  const rangePending = tasks.some((t) => t.status === "OPEN" && (t.kind === "RANGE_OUT" || t.kind === "RANGE_IN"));

  /**
   * Lối vào hộp thư.
   *
   * Nhắn tin CHƯA BAO GIỜ bị khoá theo tiền cọc (`threadAccess` chỉ hỏi ai là chủ
   * chuồng) — nhưng trước bản này thẻ nhắn tin nằm mãi dưới banner cọc, ảnh chuồng,
   * dải trạng thái và băng ảnh. Người chưa cọc mở app ra thấy một màn hình toàn lời
   * đòi tiền, cuộn không tới chỗ hỏi, nên đúng là "không bấm chat được".
   *
   * Nên khi CHƯA cọc, thẻ này lên ngay dưới banner: lúc người ta còn phân vân có nên
   * trả tiền không, hỏi được một câu là thứ quan trọng nhất trên trang.
   */
  const chatCard = isOwner && barn.worker && (
    <Link href={`/chuong/${barn.slug}/tin-nhan`} className="card flex items-center gap-3 mt-3.5 no-underline"
      style={unreadMsgs > 0 ? { borderColor: "#EBD8AE", background: "#FFFDF6" } : undefined}>
      <span className="flex-none text-[18px]">💬</span>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[13.8px]" style={{ color: "var(--ink)" }}>
          Nhắn với {barn.worker.name}
        </div>
        <div className="text-[11.8px]" style={{ color: "var(--ink-soft)" }}>
          {unreadMsgs > 0
            ? `${unreadMsgs} tin mới chưa đọc`
            : activated
              ? `Hỏi han về đàn gà — ${barn.worker.name} thường trả lời trong ngày`
              // Chưa cọc: nói thẳng là hỏi trước không mất gì. Đây là câu trả lời cho
              // nỗi ngần ngại thật của người sắp chuyển tiền cho người lạ.
              : `Còn phân vân? Hỏi ${barn.worker.name} trước khi cọc — nhắn tin không mất phí.`}
        </div>
      </div>
      {unreadMsgs > 0 && (
        <span className="flex-none text-[11px] font-bold rounded-full px-2 py-0.5"
          style={{ background: "var(--yolk)", color: "#3a2a08" }}>{unreadMsgs}</span>
      )}
      <span className="flex-none font-semibold text-[14px]" style={{ color: "var(--paddy)" }}>›</span>
    </Link>
  );

  return (
    <div className="screen">
      <Link href="/chuong" className="text-[14px] font-semibold no-underline" style={{ color: "var(--paddy)" }}>‹ Quay lại</Link>
      <div className="coopwrap mt-2" style={{ padding: "14px 14px 4px" }}>
        <Coop decor={decor} outside={barn.outside} label={signLabel} />
      </div>
      <h2 className="display text-[20px] mt-3.5 mb-2.5">{barn.label} · {flock.breed.name}</h2>

      {isDemoView && (
        <div className="flex gap-2.5 rounded-[14px] p-3 mb-3 text-[12.7px]"
          style={{ background: "var(--paddy-tint)", border: "1px solid #CDE0C6" }}>
          👀<div>
            <b>Đây là chuồng mô phỏng.</b> Chuồng có thật ở nông trại, nhưng do bạn khác nhận nuôi —
            bạn xem để hình dung, chưa giao việc hay trang trí được.{" "}
            <Link href="/nhan-chuong" className="font-semibold" style={{ color: "var(--paddy)" }}>Nhận chuồng cho riêng bạn ›</Link>
          </div>
        </div>
      )}

      {barn.reservation && !activated && (
        <PaymentBanner
          barnSlug={barn.slug}
          depositVnd={barn.reservation.depositVnd}
          code={barn.reservation.payCode ?? ""}
          bank={process.env.NEXT_PUBLIC_HOLD_BANK ?? "Ngân hàng · số TK · Chủ TK"}
          momo={process.env.NEXT_PUBLIC_HOLD_MOMO ?? "09xxxxxxxx"}
          initialStatus={payment}
        />
      )}

      {/* Chưa cọc → hộp thư đứng NGAY ĐÂY, trên mọi thứ khác. Xem chú thích ở `chatCard`. */}
      {!activated && chatCard}

      {endOfLay && (
        <Link href={`/chuong/${barn.slug}/ket-chu-ky`} className="no-underline block rounded-[16px] p-[14px] mb-3" style={{ background: "var(--yolk-tint)", border: "1px solid #EBD8AE" }}>
          <div className="font-semibold text-[14px]" style={{ color: "var(--yolk-deep)" }}>🌾 Đàn đã hoàn thành chu kỳ đẻ</div>
          <div className="text-[12.7px] mt-0.5" style={{ color: "var(--ink-soft)" }}>Khi bạn sẵn sàng, chọn hướng đi tiếp — nhận thịt, cho nghỉ hưu, hay nuôi lứa mới. Không có thời hạn. ›</div>
        </Link>
      )}

      {closed && (
        <div className="card mb-3" style={{ background: "var(--paddy-tint)" }}>
          <div className="font-semibold text-[14.5px]">{flock.stage === "HARVESTED" ? "🍲 Đàn đã được nhận thịt" : "🌾 Đàn đã nghỉ hưu ở nông trại"}</div>
          <div className="text-[12.8px] mt-1" style={{ color: "var(--ink-soft)" }}>Cảm ơn một mùa đẻ trọn vẹn cùng {barn.label}.</div>
          <Link href="/nhan-chuong" className="btn btn-primary mt-3 no-underline">Bắt đầu một chuồng mới →</Link>
        </div>
      )}

      {inWithdrawal && (
        <div className="flex gap-2.5 rounded-[14px] p-3 mb-3 text-[12.7px]" style={{ background: "#FCF3E8", border: "1px solid #F0D9B4", color: "#7a4d1a" }}>
          ⏳<div>
            <b>Đàn đang trong thời gian ngừng thuốc.</b> Trứng/thịt trong giai đoạn này <b>không được giao</b> —
            tụi mình báo bạn trước thay vì im lặng. <Link href={`/chuong/${barn.slug}/truy-xuat`} style={{ color: "var(--paddy)" }}>Xem chi tiết ›</Link>
          </div>
        </div>
      )}

      <div className="statusband">
        <div>
          <div className="sb-k">{isLayer ? "Trứng chu kỳ này" : "Tiến độ"}</div>
          <div className="sb-v">{isLayer ? `${eggs} quả` : `${progress.day}/${progress.total}`}</div>
        </div>
        <div className="w-px self-stretch flex-none" style={{ background: "rgba(255,255,255,.18)" }} />
        <div><div className="sb-k">Đàn</div><div className="sb-v">{flock.size} con</div></div>
        <div className="w-px self-stretch flex-none" style={{ background: "rgba(255,255,255,.18)" }} />
        <div><div className="sb-k">{barn.worker?.name ?? "Nông dân"}</div><div className="sb-v">Đang chăm</div></div>
      </div>

      {!isLayer && !closed && (
        <>
          <div className="mt-2.5 rounded-full overflow-hidden" style={{ height: 7, background: "var(--paper2)", border: "1px solid var(--line)" }}>
            <div style={{ width: `${progress.pct}%`, height: "100%", background: "var(--paddy)" }} />
          </div>
          <div className="mt-2.5">
            <ActionButton
              action={toggleRange.bind(null, barn.slug)}
              className="btn btn-ghost"
              disabled={!isOwner || rangePending}
              pendingLabel="Đang nhắn nông dân…"
            >
              {rangePending
                ? "⏳ Đang chờ nông dân ra chuồng"
                : barn.outside ? "🏡 Nhờ gọi đàn về chuồng" : "🌿 Nhờ thả đàn ra vườn"}
            </ActionButton>
            <p className="text-[11.5px] mt-1.5 text-center" style={{ color: "var(--ink-soft)" }}>
              Cửa chuồng ngoài đời do {barn.worker?.name ?? "nông dân"} mở — bấm là gửi việc, xong sẽ có ảnh gửi về.
            </p>
          </div>
        </>
      )}

      {/* ---------- Ảnh & video ---------- */}
      {strip.length > 0 && (
        <>
          <div className="flex items-end justify-between gap-2 mt-4 mb-2">
            <div className="min-w-0">
              <div className="font-bold text-[15px]">{todays.length ? "Hôm nay ở chuồng bạn" : "Gần đây ở chuồng bạn"}</div>
              <div className="text-[12px]" style={{ color: "var(--ink-soft)" }}>
                {todays.length ? `${todays.length} ảnh/video nông dân gửi hôm nay` : "Chưa có gì mới hôm nay — đây là những gì gần nhất"}
              </div>
            </div>
            <Link href={`/chuong/${barn.slug}/nhat-ky`} className="flex-none text-[13px] font-semibold no-underline whitespace-nowrap" style={{ color: "var(--paddy)" }}>Tất cả ›</Link>
          </div>
          <MediaStrip list={strip} />
        </>
      )}

      {/* ---------- Hộp thư ----------
          Một hàng riêng phía trên lưới lối tắt: đây là chỗ duy nhất chủ chuồng hỏi được
          một câu mà không phải giao việc, và tin chưa đọc cần được nhìn thấy ngay.
          Chuồng chưa cọc thì thẻ này đã lên trên banner rồi — không vẽ lại lần hai. */}
      {activated && chatCard}

      {/* ---------- Lối tắt ---------- */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 mt-3.5">
        <Quick href={`/chuong/${barn.slug}/trang-tri`} ic={activated ? "🎨" : "🔒"} title="Trang trí chuồng"
          sub={!activated ? "Mở khoá sau khi cọc" : decorRows.length ? `${decorRows.length} món đã lắp · sắp xếp lại` : "Thêm biển tên, chậu cây…"} />
        <Quick href={`/chuong/${barn.slug}/nhat-ky`} ic="📷" title="Ảnh & video"
          sub={media.length ? `${media.length} mục gần đây` : "Hiện trạng chuồng mỗi ngày"} />
        <Quick href={`/chuong/${barn.slug}/truy-xuat`} ic="🔎" title="Truy xuất & QR" sub="Nhật ký lô nuôi" />
        {barn.workerId
          ? <Quick href={`/nong-dan/${barn.workerId}`} ic="👩‍🌾" title={barn.worker?.name ?? "Nông dân"} sub="Người chăm chuồng" />
          : <Quick href="/nhan-chuong" ic="💚" title="Nhận thêm chuồng" sub="Đặt mua trước" />}
        {/* Chỉ đàn gà đẻ mới có tên từng con để mà phân biệt — broiler đi theo cả lứa. */}
        {isLayer && (
          <Quick href={`/chuong/${barn.slug}/dan-ga`} ic="🧣" title="Đàn gà & yếm"
            sub={gearWorn > 0
              ? `${gearWorn}/${flock.size} con có yếm`
              : "Nhận ra từng con trong ảnh"} />
        )}
        <Quick href={`/chuong/${barn.slug}/thu-hoach`} ic={isLayer ? "🥚" : "🍗"} title="Sổ thu hoạch"
          sub={lotCount > 0
            ? `${lotCount} lô đã ghi${eggs > 0 ? ` · ${eggs} quả` : ""}`
            : "Chưa có lô nào được ghi"} />
      </div>

      {/* ---------- Việc giao cho nông dân ---------- */}
      {barn.worker && activated && (
        <TaskPanel
          barnSlug={barn.slug}
          workerName={barn.worker.name}
          tasks={taskVMs}
          canAssign={isOwner}
        />
      )}

      {/* ---------- Nhật ký ---------- */}
      <div className="card mt-3.5">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="font-bold text-[14px] min-w-0 truncate">Cập nhật từ nông trại</div>
          <Link href={`/chuong/${barn.slug}/nhat-ky`} className="flex-none text-[12.5px] font-semibold no-underline whitespace-nowrap" style={{ color: "var(--paddy)" }}>Xem tất cả</Link>
        </div>
        {updates.map((u) => (
          <div key={u.id} className="flex gap-3 py-3" style={{ borderBottom: "1px solid var(--line-soft)" }}>
            <div className="avatar w-[34px] h-[34px] flex-none"><FarmerAvatar /></div>
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-[13px]">{barn.worker?.name ?? "Nông trại"}</span>
              <span className="text-[11.5px]" style={{ color: "var(--ink-soft)" }}> · {timeAgo(u.createdAt)}</span>
              <div className="text-[13.3px] mt-0.5">{u.text}</div>
              {u.media.length > 0 && (
                <MediaStrip compact list={u.media.map((m) => ({
                  id: m.id, type: m.type, url: m.url, posterUrl: m.posterUrl, caption: m.caption,
                  durationSec: m.durationSec, capturedAt: m.capturedAt.toISOString(), workerName: barn.worker?.name ?? null,
                }))} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Quick({ href, ic, title, sub }: { href: string; ic: string; title: string; sub: string }) {
  return (
    <Link href={href} className="quick no-underline">
      <div className="w-8 h-8 rounded-[9px] grid place-items-center" style={{ background: "var(--paddy-tint)", color: "var(--paddy)" }}>{ic}</div>
      <div className="font-semibold text-[14px]">{title}</div>
      <div className="text-[11.8px]" style={{ color: "var(--ink-soft)" }}>{sub}</div>
    </Link>
  );
}
