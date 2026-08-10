export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { canViewBarn, requireUser } from "@/lib/auth";
import BarnLocked from "@/components/BarnLocked";
import { CarePayBox, ChonKhoi } from "@/components/CareForms";
import {
  CARE_TINH_TRANG_VI, khoiLabel, ngayConLai, tinhTrang,
} from "@/lib/care";
import { RETIRE_CARE_VND } from "@/data/catalog";
import { fmtVnd } from "@/lib/pricing";

/**
 * NUÔI DƯỠNG ĐÀN NGHỈ HƯU - chỗ khoản 60.000đ/tháng thật sự tồn tại.
 *
 * Trước trang này, chọn "cho nghỉ hưu" ở màn kết chu kỳ ghi đúng một dòng
 * `LifecycleDecision.retireFeeVnd = 60000` rồi thôi: không hoá đơn, không mã chuyển
 * khoản, `/admin` không biết có ai vừa chọn. Màn kia thì đã hứa *"Phí nuôi dưỡng
 * 60.000đ/tháng, đối soát tay như các khoản khác"* - một lời hứa không có gì phía sau.
 *
 * ⚠️ §9.32 - **trang này không bao giờ được doạ.** Quá hạn thì nói thật là quá hạn và
 * nói rõ đàn vẫn được chăm. Không đếm ngược, không "nếu không đóng thì…", không màu đỏ
 * báo động. Người ta đang trả tiền để một con vật họ thương được sống tiếp; dùng chính
 * con vật đó làm đòn bẩy thu tiền là thứ sản phẩm này không làm.
 */
export default async function NghiHuu({ params }: { params: { id: string } }) {
  const next = `/chuong/${params.id}/nghi-huu`;
  // requireUser Ở DÒNG ĐẦU, trước mọi truy vấn nặng (bẫy §10).
  const me = await requireUser(next);
  const barn = await prisma.barn.findUnique({
    where: { slug: params.id },
    select: {
      id: true, slug: true, label: true, ownerId: true, isPublic: true, workerId: true,
      flock: { select: { stage: true, productLine: true } },
      worker: { select: { name: true } },
    },
  });
  if (!barn) return notFound();
  if (!(await canViewBarn(barn, next))) return <BarnLocked slug={barn.slug} />;

  const laChu = barn.ownerId === me.id || me.role === "ADMIN";

  // Một truy vấn danh sách + một `aggregate` cho hạn xa nhất, chạy SONG SONG. Hạn KHÔNG
  // suy ra từ danh sách đã cắt - đó là cách tạo ra một con số sai âm thầm (§10).
  const [orders, xa] = await Promise.all([
    prisma.careOrder.findMany({
      where: { barnId: barn.id },
      orderBy: { createdAt: "desc" },
      take: 24,
      select: {
        id: true, months: true, monthlyVnd: true, totalVnd: true, payCode: true,
        paymentStatus: true, coversFrom: true, coversTo: true, createdAt: true, paidAt: true,
      },
    }),
    prisma.careOrder.aggregate({
      where: { barnId: barn.id, paymentStatus: "CONFIRMED" },
      _max: { coversTo: true },
    }),
  ]);

  const hanDen = xa._max.coversTo;
  const tt = tinhTrang(hanDen);
  const conLai = ngayConLai(hanDen);
  const dangCho = orders.find((o) => o.paymentStatus !== "CONFIRMED");
  const daNghiHuu = barn.flock?.stage === "RETIRED";

  return (
    <div className="screen">
      <div className="flex items-center gap-2 mt-1">
        <Link href={`/chuong/${barn.slug}`} className="btn btn-ghost btn-sm no-underline">‹ Chuồng</Link>
      </div>

      <div className="text-center mt-2">
        <span className="eyebrow">Nuôi dưỡng</span>
        <h2 className="display text-[21px] mt-1 leading-tight">🌾 Đàn nghỉ hưu ở {barn.label}</h2>
        <p className="text-[12.8px] mt-1" style={{ color: "var(--ink-soft)" }}>
          Các bạn gà sống tiếp ở vườn, không vào lò mổ. Phí nuôi dưỡng chủ yếu là thức ăn
          và công {barn.worker?.name ?? "cô chú nông dân"}.
        </p>
      </div>

      {!daNghiHuu ? (
        <div className="soft text-center py-6 mt-3">
          <div className="text-[26px]">🐔</div>
          <div className="font-semibold text-[14px] mt-1">Đàn này chưa nghỉ hưu</div>
          <p className="text-[12.6px] mt-1" style={{ color: "var(--ink-soft)" }}>
            Khi đàn hết chu kỳ, bạn sẽ được chọn giữa nhận thịt, cho nghỉ hưu, hoặc nuôi
            lứa mới. Chưa tới lúc đó thì chưa có khoản nào phải đóng.
          </p>
        </div>
      ) : (
        <>
          {/* Tình trạng - một câu, không đếm ngược, không màu báo động (§9.32). */}
          <div className="card mt-3">
            <div className="font-bold text-[14px]">{CARE_TINH_TRANG_VI[tt]}</div>
            {hanDen ? (
              <div className="text-[12.8px] mt-1" style={{ color: "var(--ink-soft)" }}>
                Đã đóng tới <b>{new Date(hanDen).toLocaleDateString("vi-VN")}</b>
                {conLai !== null && conLai >= 0 && ` · còn ${conLai} ngày`}
              </div>
            ) : (
              <div className="text-[12.8px] mt-1" style={{ color: "var(--ink-soft)" }}>
                Phí nuôi dưỡng <b>{fmtVnd(RETIRE_CARE_VND)}/tháng</b>, đóng trước theo kỳ.
              </div>
            )}
            {tt === "het-han" && (
              <p className="text-[12.2px] mt-2 rounded-[10px] px-2.5 py-2"
                style={{ background: "var(--paddy-tint)", color: "var(--paddy-deep)" }}>
                Đàn vẫn được chăm bình thường - tụi mình không bao giờ để chuyện tiền ảnh
                hưởng tới các bạn gà. Khi nào tiện thì đóng kỳ tiếp giúp tụi mình nhé.
              </p>
            )}
          </div>

          {laChu && (
            dangCho?.payCode ? (
              <CarePayBox
                orderId={dangCho.id} payCode={dangCho.payCode} totalVnd={dangCho.totalVnd}
                months={dangCho.months} reported={dangCho.paymentStatus === "REPORTED"}
              />
            ) : (
              <div className="card mt-3">
                <div className="font-bold text-[14px]">Đóng kỳ nuôi dưỡng</div>
                <ChonKhoi barnSlug={barn.slug} monthlyVnd={RETIRE_CARE_VND} />
              </div>
            )
          )}

          <div className="mt-4">
            <div className="flex items-center gap-2.5">
              <span className="font-bold text-[12.5px] tracking-wide uppercase" style={{ color: "var(--ink-soft)" }}>
                Các kỳ đã đóng
              </span>
              <span className="flex-1 h-px" style={{ background: "var(--line-soft)" }} />
            </div>
            {orders.length === 0 ? (
              <p className="text-[12.6px] mt-2" style={{ color: "var(--ink-soft)" }}>
                Chưa có kỳ nào. Đóng kỳ đầu tiên ở khối bên trên nhé.
              </p>
            ) : (
              <div className="grid gap-2 mt-2.5">
                {orders.map((o) => (
                  <div key={o.id} className="card">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[13.6px]">
                        {khoiLabel(o.months)} · {fmtVnd(o.totalVnd)}
                      </span>
                      <span className="text-[11.8px]" style={{ color: "var(--ink-soft)" }}>
                        {o.paymentStatus === "CONFIRMED" ? "✓ đã đóng"
                          : o.paymentStatus === "REPORTED" ? "⏳ chờ đối soát" : "chưa chuyển khoản"}
                      </span>
                    </div>
                    <div className="text-[11.8px] mt-1" style={{ color: "var(--ink-soft)" }}>
                      {o.coversFrom && o.coversTo
                        ? `Phủ ${new Date(o.coversFrom).toLocaleDateString("vi-VN")} → ${new Date(o.coversTo).toLocaleDateString("vi-VN")}`
                        : `Đặt ${new Date(o.createdAt).toLocaleDateString("vi-VN")}`}
                      {o.payCode && ` · ${o.payCode}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <p className="text-[11.4px] text-center mt-4" style={{ color: "var(--ink-soft)" }}>
        Mỗi lần bạn đóng kỳ, nông dân nhận một việc chụp ảnh các bạn gà để gửi bạn.
      </p>
    </div>
  );
}
