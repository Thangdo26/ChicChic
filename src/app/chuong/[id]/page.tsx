export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Coop, FarmerAvatar } from "@/components/Illustrations";
import Chuong3D from "@/components/Chuong3D";
import { DAN_TOI_DA, ganYem, type GaVM } from "@/lib/chuong-3d";
import { MediaStrip, type MediaVM } from "@/components/MediaGallery";
import { ActionButton } from "@/components/Toast";
import PaymentBanner from "@/components/PaymentBanner";
import { toggleRange } from "@/app/actions";
import { barnViewer, getSessionUser } from "@/lib/auth";
import BarnLocked from "@/components/BarnLocked";
import BarnUnpaid from "@/components/BarnUnpaid";
import { InvoiceGate, InvoicePayBox, type InvoiceVM } from "@/components/BillingForms";
import { hoaDonLabel, invoiceTinhTrang } from "@/lib/billing";
import TaskPanel, { type TaskVM } from "@/components/TaskPanel";
import { barnDisplayName, flockProgress, isToday, timeAgo } from "@/lib/decor";
import { canLabel, mauLabel } from "@/lib/weighin";
import { track } from "@/lib/track";
import type { TaskKind, TaskStatus } from "@/lib/tasks";

export default async function BarnDashboard({ params }: { params: { id: string } }) {
  // Trước bản này ở đây là `requireUser` - chặn TRƯỚC khi truy vấn cho khỏi tốn một
  // query rồi mới từ chối. Nay phải tra chuồng trước mới biết nó có phải **chuồng
  // trưng bày** không (§9.5 đã nới, xem `barnViewer`), nên khách vãng lai vào một
  // chuồng riêng tư sẽ tốn thêm đúng một đợt truy vấn trước khi bị đá về đăng nhập.
  // Đổi lại: người chưa có tài khoản nhìn thấy được một cái chuồng thật trước khi
  // được hỏi có muốn đăng ký không - thứ đáng giá hơn hẳn một query trên nhánh hiếm.
  const me = await getSessionUser();

  // ⭐ TRANG NẶNG NHẤT CỦA APP - đo được 2,8s trước khi phẳng hoá.
  //
  // Trước đây đây là MỘT `findUnique` với `include` lồng 3 tầng. Prisma bung nó ra
  // **16 câu lệnh SQL nối tiếp nhau**, mà một lượt đi–về tới Supabase đo được ~282ms
  // ⟹ chỉ riêng câu này đã ăn 2,16 giây. Không phải truy vấn nặng, mà là quá nhiều
  // lượt chờ xếp hàng.
  //
  // Cách sửa: lọc con theo `barn: { slug }` thay vì theo `barnId` lấy từ câu cha, nhờ
  // vậy KHÔNG câu nào phải chờ câu nào - cả cụm đi trong MỘT đợt song song qua pool 5
  // kết nối. Số lượt chờ nối tiếp: 16 → 1.
  //
  // ⚠️ ĐỪNG gộp ngược lại thành `include` lồng cho "gọn". Và đừng bật
  // `previewFeatures = ["relationJoins"]` - nhanh hơn thật nhưng làm sập query engine
  // (§10). Muốn nhanh thì giảm số tầng, đúng như §10 đã kết luận.
  // `Product` KHÔNG có mặt ở đây: ô "Trứng chu kỳ này" đọc từ `HarvestLot` (§11.11).
  // Câu `include: { products }` cũ chỉ còn là tàn dư - kéo về rồi không ai đọc.
  const [barn, decorRows, updates, media, tasks, healthEvents, unreadMsgs, birds, gearRows, eggAgg, lotCount, careAgg, unpaidInvoices, soChuongCuaToi, weighIns] = await Promise.all([
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
    // Bốn con số phụ - TRƯỚC ĐÂY là một `Promise.all` thứ hai chạy SAU đợt trên, vì
    // chúng cần `barn.id` và `flock.id`. Lọc theo `barn: { slug }` thì hết phụ thuộc,
    // nên cả trang gom về ĐÚNG MỘT đợt: 2 lượt chờ nối tiếp → 1.
    //
    // `gearWorn` và `unreadMsgs` chạy vô điều kiện (trước đây có `isLayer`/`isOwner`
    // gác): với chuồng gà thịt hay người không phải chủ thì chúng trả 0, mà chạy song
    // song nên KHÔNG tốn thêm thời gian thật - đổi một truy vấn rẻ lấy một lượt chờ.
    prisma.barnMessage.count({
      // `me` có thể null (khách xem thử chuồng trưng bày) - lúc đó đếm cả bảng cũng
      // vô hại vì thẻ hộp thư chỉ vẽ cho `quyen === "chu"`.
      where: { barn: { slug: params.id }, readAt: null, hiddenAt: null, senderId: { not: me?.id ?? "" } },
    }),
    // ⭐ ĐÀN GÀ THẬT - để hình chuồng vẽ ĐÚNG SỐ CON (§9.43). Trước bản này chỗ đây
    // chỉ là một `birdGear.count`, và hình chuồng vẽ cứng ba con gà cho mọi chuồng:
    // người nhận nuôi 6 con mở app ra đếm được 3.
    //
    // Vẫn đúng một câu lệnh như cái `count` cũ, vẫn đi trong ĐÚNG đợt song song này và
    // vẫn lọc theo `barn: { slug }` nên không câu nào phải chờ câu nào (§10). `take` 50
    // là lưới an toàn cho đàn seed - chuồng thật nhận nhiều nhất `FLOCK_QTY.max` con.
    prisma.bird.findMany({
      where: { flock: { barn: { slug: params.id } }, status: "ALIVE" },
      select: { id: true, name: true, tagCode: true },
      orderBy: { tagCode: "asc" },
      take: 50,
    }),
    // Yếm của cả đàn - MỘT truy vấn phẳng, không `include` lồng từ Bird xuống gear
    // (đúng bài học của trang Đàn gà: lồng hai tầng qua N con là N lượt đi–về).
    prisma.birdGear.findMany({
      where: { bird: { flock: { barn: { slug: params.id } } }, status: { not: "OFF" } },
      select: { birdId: true, status: true, item: { select: { name: true, colorHex: true } } },
    }),
    prisma.harvestLot.aggregate({ where: { barn: { slug: params.id }, type: "EGG" }, _sum: { qty: true } }),
    prisma.harvestLot.count({ where: { barn: { slug: params.id } } }),
    // Kỳ nuôi dưỡng đã đóng tới bao giờ. Đi CHUNG đợt này chứ không phải một truy vấn
    // riêng sau đó - trang chuồng đã từng tốn 16 câu lệnh nối tiếp vì thói quen đó (§10).
    prisma.careOrder.aggregate({
      where: { barn: { slug: params.id }, paymentStatus: "CONFIRMED" },
      _max: { coversTo: true },
    }),
    // Hoá đơn tiền nuôi chưa trả - CHỈ ĐỌC. Phép ghi (phát hành hoá đơn còn thiếu) đi
    // qua `<InvoiceGate>` sau khi trang đã hiện, vì render không được có tác dụng phụ.
    prisma.barnInvoice.findMany({
      where: { barn: { slug: params.id }, paymentStatus: { not: "CONFIRMED" } },
      orderBy: { seq: "asc" },
      select: {
        id: true, seq: true, payCode: true, totalVnd: true, grossVnd: true, creditVnd: true,
        dueAt: true, paymentStatus: true,
      },
    }),
    // Người này đã nuôi chuồng nào chưa - chỉ để quyết định có mời "nhận thêm chuồng"
    // hay không. Đi chung đợt song song nên không tốn thêm lượt chờ nào.
    me ? prisma.barn.count({ where: { ownerId: me.id } }) : Promise.resolve(0),
    // Sổ lớn của đàn gà thịt. Truy vấn vô điều kiện (chuồng gà đẻ trả mảng rỗng) -
    // cùng lý do với `gearWorn`/`unreadMsgs` ở trên: chạy song song thì một truy vấn
    // rẻ không tốn thêm thời gian thật, còn thêm một `if` là thêm một lượt chờ.
    prisma.weighIn.findMany({
      where: { barn: { slug: params.id } },
      orderBy: { weekNo: "asc" },
      select: { id: true, weekNo: true, avgGram: true, sample: true, weighedAt: true },
    }),
  ]);
  if (!barn || !barn.flock) return notFound();
  const xem = await barnViewer(barn);
  if (xem.quyen === "khong") {
    // Chưa đăng nhập thì rất có thể chính họ là chủ chuồng - mời đăng nhập rồi quay
    // lại đúng đây, đừng đóng sập bằng màn "chuồng riêng tư".
    if (!xem.me) redirect(`/dang-nhap?next=${encodeURIComponent(`/chuong/${params.id}`)}`);
    return <BarnLocked slug={barn.slug} />;
  }

  const payment = barn.reservation?.paymentStatus ?? "CONFIRMED";
  const activated = payment === "CONFIRMED";

  const { flock } = barn;
  const isLayer = flock.productLine === "LAYER";
  // Cuối chu kỳ áp dụng cho CẢ HAI dòng. Trước đây điều kiện có `isLayer` nên chuồng gà
  // thịt hết lứa không hiện lối vào màn quyết định - chủ chuồng không bao giờ được hỏi.
  const endOfLay = flock.stage === "END_OF_LAY";
  const closed = flock.stage === "HARVESTED" || flock.stage === "RETIRED";
  const progress = flockProgress(flock.startDate, flock.cycleDays);

  const evt = healthEvents[0];
  const inWithdrawal = !!evt?.withdrawalUntil && new Date(evt.withdrawalUntil) > new Date();

  const decor = decorRows.map((d) => ({
    id: d.id, svgKey: d.item.svgKey, x: d.x, y: d.y, scale: d.scale, flipped: d.flipped, text: d.text,
  }));
  const signLabel = barnDisplayName(barn.label);

  /**
   * ĐÀN GÀ TRÊN HÌNH.
   *
   * ⚠️ `ganYem` là cửa DUY NHẤT dựng một `GaVM` (§9.43) - đừng dựng `{ yem: … }` bằng
   * tay ở đây cho "gọn". Nó là chỗ giữ luật: yếm mới chọn (`PENDING_ON`) thì cô chú
   * chưa ra mặc, nên hình KHÔNG vẽ cái yếm đó - chỉ hiện dấu chờ.
   */
  const gearByBird = new Map(gearRows.map((g) => [g.birdId, g]));
  const dan: GaVM[] = birds.slice(0, DAN_TOI_DA).map((b) => {
    const g = gearByBird.get(b.id);
    return ganYem({
      id: b.id, name: b.name, tagCode: b.tagCode,
      gearStatus: g?.status ?? null,
      gearItemName: g?.item.name ?? null,
      gearColorHex: g?.item.colorHex ?? null,
    });
  });
  const gearWorn = gearRows.length;

  const toVM = (m: (typeof media)[number]): MediaVM => ({
    id: m.id, type: m.type, url: m.url, posterUrl: m.posterUrl, caption: m.caption,
    durationSec: m.durationSec, capturedAt: m.capturedAt.toISOString(), workerName: barn.worker?.name ?? null,
  });
  const todays = media.filter((m) => isToday(m.capturedAt)).map(toVM);
  const strip = todays.length ? todays : media.slice(0, 4).map(toVM);

  const isOwner = xem.quyen === "chu";
  /** Đang xem thử mà chưa có tài khoản - mọi lối tắt sau `requireUser` đều đóng với họ. */
  const khach = !xem.me;
  /** Đã nuôi ít nhất một chuồng ⟹ thôi mời nhận thêm (§11.34). */
  const coChuongKhac = soChuongCuaToi > 0;

  /**
   * HOÁ ĐƠN TIỀN NUÔI (§7.16, §9.33).
   *
   * `quaHan` là thứ khoá chuồng, và nó được **suy ra từ hoá đơn** chứ không đọc một cột
   * `locked` nào - cột trạng thái song song thì sớm muộn cũng có ngày tiền đã về mà
   * chuồng vẫn khoá vì quên cập nhật.
   */
  const toInvoiceVM = (h: (typeof unpaidInvoices)[number]): InvoiceVM => ({
    id: h.id, payCode: h.payCode ?? "", totalVnd: h.totalVnd,
    grossVnd: h.grossVnd, creditVnd: h.creditVnd,
    ten: hoaDonLabel(flock.productLine, h.seq),
    reported: h.paymentStatus === "REPORTED",
    quaHan: invoiceTinhTrang(h) === "qua-han",
    dueAt: h.dueAt.toLocaleDateString("vi-VN"),
  });
  const hdQuaHan = unpaidInvoices.find((h) => invoiceTinhTrang(h) === "qua-han");
  const hdSapDen = unpaidInvoices.find((h) => invoiceTinhTrang(h) === "sap-den-han");

  // Khoá TRƯỚC khi render nội dung chuồng. Chỉ khoá với CHỦ chuồng: admin phải xem được
  // để xử lý, và nông dân thì tuyệt đối không bị chặn (§9.33 - việc chăm đàn không dừng).
  if (isOwner && hdQuaHan?.payCode) {
    return (
      <>
        <InvoiceGate barnSlug={barn.slug} />
        <BarnUnpaid slug={barn.slug} label={barn.label} workerName={barn.worker?.name}
          hd={toInvoiceVM(hdQuaHan)} />
      </>
    );
  }

  // ⭐ Ô "Trứng chu kỳ này" - con số này TỪNG LÀ 0 VĨNH VIỄN với mọi chuồng thật:
  // `Product.qty` không có một lệnh `update` nào trong `src/` (§11.11). Từ nay nó cộng
  // từ `HarvestLot`, tức là mỗi quả đều có ngày thu, người thu và một tấm ảnh kèm theo.
  const eggs = eggAgg._sum.qty ?? 0;
  const careCoverTo = careAgg._max.coversTo;
  // Tín hiệu giữ chân: chủ chuồng có mở chuồng của mình hôm nay không.
  // Chỉ ghi cho CHỦ chuồng - lượt xem chuồng trưng bày không phải là giữ chân.
  if (xem.quyen === "chu") {
    await track("barn_opened", {
      userId: xem.me.id, barnSlug: barn.slug,
      props: {
        productLine: flock.productLine,
        stage: flock.stage,
        freshMediaToday: todays.length,
        openTasks: tasks.filter((t) => t.status === "OPEN").length,
      },
    });
  }
  // Chuồng trưng bày mà người xem không sở hữu → xem cho biết trước khi nhận nuôi.
  // Bao gồm cả **khách chưa đăng nhập** (§9.5 đã nới) - đó mới là người cần được
  // thuyết phục nhất, và trước bản này họ là người duy nhất không được nhìn thấy gì.
  const isDemoView = xem.quyen === "xem-thu";
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
   * chuồng) - nhưng trước bản này thẻ nhắn tin nằm mãi dưới banner cọc, ảnh chuồng,
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
              ? `Hỏi han về đàn gà - ${barn.worker.name} thường trả lời trong ngày`
              // Chưa cọc: nói thẳng là hỏi trước không mất gì. Đây là câu trả lời cho
              // nỗi ngần ngại thật của người sắp chuyển tiền cho người lạ.
              : `Còn phân vân? Hỏi ${barn.worker.name} trước khi cọc - nhắn tin không mất phí.`}
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
      {/* Khách chưa đăng nhập mà bấm "‹ Quay lại" vào `/chuong` thì rơi thẳng vào màn
          đăng nhập - đúng cái vừa cố tránh. Đưa họ về trang chủ. */}
      <Link href={xem.me ? "/chuong" : "/"} className="text-[14px] font-semibold no-underline" style={{ color: "var(--paddy)" }}>‹ Quay lại</Link>
      {/* ---------- Hình chuồng ----------
          Tên gà là do CHỦ CHUỒNG đặt, và chuồng trưng bày thì người lạ cũng mở được
          (§9.5). Nên người đang xem thử chỉ thấy đúng SỐ CON - vẫn đủ để hình dung,
          mà không đem tên riêng của nhà người ta ra cho cả internet đọc. */}
      {isDemoView ? (
        <div className="coopwrap mt-2" style={{ padding: "14px 14px 4px" }}>
          <Coop decor={decor} outside={barn.outside} label={signLabel} soCon={birds.length} />
        </div>
      ) : (
        <Chuong3D
          decor={decor} outside={barn.outside} label={signLabel} dan={dan}
          soConThat={birds.length} coTheDatTen={isLayer}
          danGaHref={isOwner ? `/chuong/${barn.slug}/dan-ga` : null}
        />
      )}
      <h2 className="display text-[20px] mt-3.5 mb-2.5">{barn.label} · {flock.breed.name}</h2>

      {isDemoView && (
        <div className="rounded-[14px] p-3 mb-3" style={{ background: "var(--paddy-tint)", border: "1px solid #CDE0C6" }}>
          <div className="flex gap-2.5 text-[12.7px]">
            👀<div>
              <b>Đây là chuồng để xem thử.</b> Chuồng có thật ở nông trại và ảnh là ảnh chụp
              thật, nhưng chuồng này do người khác nhận nuôi - bạn xem để hình dung, chưa
              giao việc hay trang trí được.
              {/* Nói thẳng thứ đang thiếu, thay vì để họ bấm vào rồi mới bị chặn. */}
              {!xem.me && " Ảnh hằng ngày, hộp thư với cô chú và sổ thu hoạch là của riêng từng chủ chuồng."}
            </div>
          </div>
          <Link
            href={xem.me ? "/nhan-chuong" : "/dang-ky?next=%2Fnhan-chuong"}
            className="btn btn-primary btn-sm mt-2.5 no-underline"
          >
            {xem.me ? "Nhận một chuồng cho riêng bạn →" : "Tạo tài khoản & nhận chuồng →"}
          </Link>
        </div>
      )}

      {/* Kích hoạt phát hành hoá đơn còn thiếu - chạy sau khi trang đã hiện. */}
      {isOwner && activated && <InvoiceGate barnSlug={barn.slug} />}

      {/* Sắp tới hạn: nhắc TRƯỚC, ngay trên trang chuồng. Không đợi tới lúc khoá mới nói -
          một người bị khoá bất ngờ là một người mất lòng tin, dù app có đúng lịch. */}
      {isOwner && hdSapDen?.payCode && (
        <div className="card mb-3" style={{ borderColor: "#EBD8AE" }}>
          <div className="font-bold text-[14px]">🌾 Sắp tới hạn tiền nuôi</div>
          <p className="text-[12.4px] mt-0.5" style={{ color: "var(--ink-soft)" }}>
            Thanh toán trước {hdSapDen.dueAt.toLocaleDateString("vi-VN")} để chuồng chạy
            liền mạch. Đàn gà thì vẫn được chăm bình thường dù thế nào.
          </p>
          <InvoicePayBox hd={toInvoiceVM(hdSapDen)} />
        </div>
      )}

      {/* CHỈ chủ chuồng. Banner này mang `payCode` - mã chuyển khoản của một người cụ
          thể - nên từ lúc khách vãng lai xem được chuồng trưng bày (§9.5) thì thiếu
          `isOwner` ở đây là đưa mã tiền của người khác lên một trang công khai. */}
      {isOwner && barn.reservation && !activated && (
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
          <div className="font-semibold text-[14px]" style={{ color: "var(--yolk-deep)" }}>
            {isLayer ? "🌾 Đàn đã hoàn thành chu kỳ đẻ" : "🌾 Đàn đã tới ngày xuất chuồng"}
          </div>
          <div className="text-[12.7px] mt-0.5" style={{ color: "var(--ink-soft)" }}>Khi bạn sẵn sàng, chọn hướng đi tiếp - nhận thịt, cho nghỉ hưu, hay nuôi lứa mới. Không có thời hạn. ›</div>
        </Link>
      )}

      {closed && (
        <div className="card mb-3" style={{ background: "var(--paddy-tint)" }}>
          <div className="font-semibold text-[14.5px]">{flock.stage === "HARVESTED" ? "🍲 Đàn đã được nhận thịt" : "🌾 Đàn đã nghỉ hưu ở nông trại"}</div>
          <div className="text-[12.8px] mt-1" style={{ color: "var(--ink-soft)" }}>Cảm ơn một mùa {isLayer ? "đẻ" : "vụ"} trọn vẹn cùng {barn.label}.</div>
          <Link href="/nhan-chuong" className="btn btn-primary mt-3 no-underline">Bắt đầu một chuồng mới →</Link>
        </div>
      )}

      {inWithdrawal && (
        <div className="flex gap-2.5 rounded-[14px] p-3 mb-3 text-[12.7px]" style={{ background: "#FCF3E8", border: "1px solid #F0D9B4", color: "#7a4d1a" }}>
          ⏳<div>
            <b>Đàn đang trong thời gian ngừng thuốc.</b> Trứng/thịt trong giai đoạn này <b>không được giao</b> -
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
              Cửa chuồng ngoài đời do {barn.worker?.name ?? "nông dân"} mở - bấm là gửi việc, xong sẽ có ảnh gửi về.
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
                {todays.length ? `${todays.length} ảnh/video nông dân gửi hôm nay` : "Chưa có gì mới hôm nay - đây là những gì gần nhất"}
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
          Chuồng chưa cọc thì thẻ này đã lên trên banner rồi - không vẽ lại lần hai. */}
      {activated && chatCard}

      {/* ---------- Lối tắt ----------
          `khach` = đang xem thử mà CHƯA có tài khoản. Bốn ô dưới đây đều nằm sau
          `requireUser`, nên với họ mỗi cú bấm là một cú rơi vào màn đăng nhập - mời
          xem thử rồi dựng cửa ở mọi lối đi là kiểu mời tệ nhất. Ẩn hẳn, và nói bù
          bằng một dòng ngay dưới lưới. */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 mt-3.5">
        {!khach && (
          <Quick href={`/chuong/${barn.slug}/trang-tri`} ic={activated ? "🎨" : "🔒"} title="Trang trí chuồng"
            sub={!activated ? "Mở khoá sau khi cọc" : decorRows.length ? `${decorRows.length} món đã lắp · sắp xếp lại` : "Thêm biển tên, chậu cây…"} />
        )}
        <Quick href={`/chuong/${barn.slug}/nhat-ky`} ic="📷" title="Ảnh & video"
          sub={media.length ? `${media.length} mục gần đây` : "Hiện trạng chuồng mỗi ngày"} />
        <Quick href={`/chuong/${barn.slug}/truy-xuat`} ic="🔎" title="Truy xuất & QR" sub="Nhật ký lô nuôi" />
        {barn.workerId ? (
          <Quick href={`/nong-dan/${barn.workerId}`} ic="👩‍🌾" title={barn.worker?.name ?? "Nông dân"} sub="Người chăm chuồng" />
        ) : (
          // Chỉ mời nhận thêm chuồng khi người ta CHƯA có chuồng nào. Người đang nuôi
          // rồi thì lời mời này là quảng cáo chen vào giữa chuồng của chính họ.
          !coChuongKhac && <Quick href="/nhan-chuong" ic="💚" title="Nhận thêm chuồng" sub="Đặt mua trước" />
        )}
        {/* Chỉ đàn gà đẻ mới có tên từng con để mà phân biệt - broiler đi theo cả lứa. */}
        {isLayer && !khach && (
          <Quick href={`/chuong/${barn.slug}/dan-ga`} ic="🧣" title="Đàn gà & yếm"
            sub={gearWorn > 0
              ? `${gearWorn}/${flock.size} con có yếm`
              : "Nhận ra từng con trong ảnh"} />
        )}
        {!khach && (
          <Quick href={`/chuong/${barn.slug}/thu-hoach`} ic={isLayer ? "🥚" : "🍗"} title="Sổ thu hoạch"
            sub={lotCount > 0
              ? `${lotCount} lô đã ghi${eggs > 0 ? ` · ${eggs} quả` : ""}`
              : "Chưa có lô nào được ghi"} />
        )}
        {/* Chỉ hiện khi đàn ĐÃ nghỉ hưu - trước đó chưa có khoản nào phải đóng, bày ra
            sớm chỉ làm người ta tưởng mình đang nợ tiền. */}
        {flock.stage === "RETIRED" && !khach && (
          <Quick href={`/chuong/${barn.slug}/nghi-huu`} ic="🌾" title="Đàn nghỉ hưu"
            sub={careCoverTo
              ? `Đã đóng tới ${new Date(careCoverTo).toLocaleDateString("vi-VN")}`
              : "Phí nuôi dưỡng theo kỳ"} />
        )}
      </div>

      {/* Nói bù cho những ô vừa ẩn: liệt kê thẳng thứ họ chưa mở được, thay vì để họ
          đoán xem app còn gì. Giấu tính năng đi mà không nói là cách chắc chắn để
          người ta tưởng sản phẩm chỉ có bằng này. */}
      {khach && (
        <p className="text-[12.2px] mt-2.5 text-center leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          Khi có chuồng của riêng mình, bạn còn <b>trang trí chuồng</b>, <b>đặt tên từng con gà</b>,{" "}
          <b>giao việc cho cô chú</b>, <b>nhắn tin hỏi han</b> và một <b>sổ thu hoạch</b> ghi từng lô trứng.
        </p>
      )}

      {/* ---------- SỔ LỚN: đàn gà thịt lớn lên ----------
          Chỉ gà thịt, và chỉ khi ĐÃ CÓ số. Vì sao khối này tồn tại: một lứa gà thịt
          nuôi ~75 ngày, và trong suốt 75 ngày đó trang này không nói được câu nào cụ
          thể về đàn - chủ chuồng gà đẻ ngày nào cũng có quả trứng để nhìn, còn ở đây
          chỉ có một thanh tiến độ nhích một vạch. Cân nặng là con số DUY NHẤT đổi mỗi
          tuần và đổi theo hướng tốt lên.

          Không có số thì KHÔNG vẽ gì - không khung rỗng, không đường cong chuẩn để so,
          không nội suy tuần bị bỏ lỡ. Một biểu đồ đẹp mà bịa thì đúng bằng lời hứa của
          kẻ đi lừa (§9.11). */}
      {!isLayer && weighIns.length > 0 && (() => {
        const max = Math.max(...weighIns.map((w) => w.avgGram));
        const dau = weighIns[0];
        const cuoi = weighIns[weighIns.length - 1];
        return (
          <div className="card mt-3.5">
            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0">
                <div className="font-bold text-[14px]">⚖️ Đàn đang lớn</div>
                <div className="text-[12px]" style={{ color: "var(--ink-soft)" }}>
                  Cô chú cân mẫu mỗi tuần, có ảnh cái cân kèm theo
                </div>
              </div>
              <div className="flex-none text-right">
                <div className="display font-bold text-[19px]" style={{ color: "var(--paddy-deep)" }}>
                  {canLabel(cuoi.avgGram)}
                </div>
                <div className="text-[11.4px]" style={{ color: "var(--ink-soft)" }}>mỗi con · tuần {cuoi.weekNo}</div>
              </div>
            </div>

            {/* Cột đơn giản, không thư viện biểu đồ: mỗi tuần một cột cao theo tỉ lệ
                với tuần nặng nhất. Tuần chưa cân thì KHÔNG có cột - chỗ trống nói đúng
                sự thật là tuần đó không ai cân. */}
            <div className="flex items-end gap-1.5 mt-3" style={{ height: 74 }}>
              {weighIns.map((w) => (
                <div key={w.id} className="flex-1 flex flex-col items-center justify-end gap-1" style={{ height: "100%" }}>
                  <span className="text-[10px] tabular-nums" style={{ color: "var(--ink-soft)" }}>
                    {canLabel(w.avgGram)}
                  </span>
                  <div
                    title={`Tuần ${w.weekNo} · ${canLabel(w.avgGram)}/con · ${mauLabel(w.sample)}`}
                    style={{
                      width: "100%", borderRadius: "5px 5px 2px 2px",
                      height: `${Math.max(8, Math.round((w.avgGram / max) * 100))}%`,
                      background: w === cuoi ? "var(--paddy)" : "var(--paddy-tint)",
                      border: "1px solid var(--paddy-tint)",
                    }}
                  />
                  <span className="text-[10px]" style={{ color: "var(--ink-soft)" }}>T{w.weekNo}</span>
                </div>
              ))}
            </div>

            <div className="text-[12.2px] mt-2.5" style={{ color: "var(--ink-soft)" }}>
              {weighIns.length >= 2
                ? <>Từ tuần {dau.weekNo} tới nay đàn tăng <b style={{ color: "var(--ink)" }}>{canLabel(cuoi.avgGram - dau.avgGram)}</b> mỗi con · {mauLabel(cuoi.sample)}.</>
                : <>Mới có một lần cân · {mauLabel(cuoi.sample)}. Tuần sau có số nữa là so được.</>}
            </div>
          </div>
        );
      })()}

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
