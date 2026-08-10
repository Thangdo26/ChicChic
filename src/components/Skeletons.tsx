/**
 * Khung chờ dùng chung cho mọi `loading.tsx`.
 *
 * Ở đây có đúng **một** luật, và nó là lý do file này tồn tại:
 * **khung chờ phải cùng hình với trang thật.**
 *
 * Một khung sai hình còn tệ hơn không có khung nào. Mắt bám vào một bố cục trong
 * vài giây, rồi trang thật hiện ra với bố cục khác hẳn - người dùng phải đọc lại
 * từ đầu, và cảm giác là *trang vừa giật một cái*, không phải *trang vừa tải xong*.
 * Trước bản này repo có đúng một `loading.tsx` ở gốc, hình dạng của **trang chuồng**,
 * và nó hiện ra cho cả `/cho`, `/admin`, `/nong-trai` - ba trang không giống trang
 * chuồng ở chỗ nào cả.
 *
 * Vì sao chuyện này đáng làm hẳn một đợt: mỗi lượt tải trang ở đây tốn **vài giây
 * thật** (CODEMAP §11.23 và §11.31) - đó là trần hiệu năng của cả sản phẩm và không
 * gọt được ở tầng code. Không sửa được thời gian chờ thì sửa **cái người ta nhìn
 * trong lúc chờ**.
 *
 * Hai điều cố ý:
 *
 * - **Không có chữ nào trong này.** Không "Đang tải…", không "Vui lòng đợi". Chữ giả
 *   bị trình đọc màn hình đọc lên rồi biến mất, và một dòng chữ đứng im khiến trang
 *   trông như đã hỏng. `aria-busy` nói đúng chuyện đó cho máy, còn với mắt thì hiệu
 *   ứng chạy đã đủ.
 * - **Không đếm đúng số phần tử thật.** Khung chỉ gợi *hình*, không hứa *số lượng* -
 *   vẽ 6 ô rồi trang thật ra 2 ô là một lời hứa hụt.
 *
 * `prefers-reduced-motion` đã được `globals.css` tắt hiệu ứng toàn cục, nên khung
 * vẫn hiện nhưng đứng yên - đúng ý người bật cài đặt đó.
 */

/** Một khối xám nhấp nháy. `r` = bo góc, mặc định theo `.skel`. */
export function O({ h, w, r, className = "" }: { h: number; w?: number | string; r?: number; className?: string }) {
  return <div className={`skel ${className}`} style={{ height: h, width: w, borderRadius: r }} />;
}

/** Bọc ngoài cho mọi khung chờ - báo cho trình đọc màn hình biết đây là vùng đang tải. */
export function Khung({ children }: { children: React.ReactNode }) {
  return <div className="screen" aria-busy="true" aria-label="Đang tải">{children}</div>;
}

/** Dòng "‹ Quay lại" ở đầu các trang con của chuồng. */
export const KhungQuayLai = () => <O h={16} w={132} r={6} />;

/** Cụm nhãn nhỏ + tiêu đề lớn, có ở hầu hết mọi trang. */
export function KhungDau({ rong = "58%" }: { rong?: string }) {
  return (
    <div className="mt-2 grid gap-2">
      <O h={11} w={84} r={5} />
      <O h={22} w={rong} r={7} />
    </div>
  );
}

/** Một thẻ `.card` rỗng. */
export const KhungThe = ({ h = 96 }: { h?: number }) => <O h={h} r={18} />;

/** Danh sách thẻ xếp dọc - hộp việc, danh sách chuồng, sổ thu hoạch… */
export function KhungDanhSach({ so = 3, h = 84 }: { so?: number; h?: number }) {
  return (
    <div className="grid gap-2.5">
      {Array.from({ length: so }, (_, i) => <O key={i} h={h} r={16} />)}
    </div>
  );
}

/** Lưới ô vuông - lối tắt trang chuồng, gian hàng trên chợ, cửa hàng trang trí. */
export function KhungLuoi({ so = 4, h = 84, cot = "grid-cols-2 lg:grid-cols-3" }: { so?: number; h?: number; cot?: string }) {
  return (
    <div className={`grid ${cot} gap-2.5`}>
      {Array.from({ length: so }, (_, i) => <O key={i} h={h} r={14} />)}
    </div>
  );
}

/**
 * Khung chung cho **trang con của chuồng** (nhật ký, sổ thu hoạch, đàn gà, truy xuất…).
 * Bảy trang đó chia đúng một bố cục: dòng "‹ Chuồng của tôi" → nhãn + tên chuồng →
 * phần nội dung riêng. Chỉ phần nội dung được truyền vào.
 */
export function KhungTrangCon({ children }: { children: React.ReactNode }) {
  return (
    <Khung>
      <KhungQuayLai />
      <KhungDau />
      <div className="mt-3.5">{children}</div>
    </Khung>
  );
}

/** Dải ảnh ngang trong nhật ký và hồ sơ nông dân. */
export function KhungDaiAnh() {
  return (
    <div className="flex gap-2.5 overflow-hidden">
      {Array.from({ length: 4 }, (_, i) => <O key={i} h={112} w={148} r={14} className="flex-none" />)}
    </div>
  );
}
