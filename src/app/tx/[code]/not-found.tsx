import Link from "next/link";

/**
 * Màn "không tìm thấy" của RIÊNG trang truy xuất công khai.
 *
 * Màn chung (`app/not-found.tsx`) nói *"Không tìm thấy chuồng này - xem chuồng demo"*,
 * đúng cho người đang lạc trong app nhưng sai hẳn với người vừa quét mã trên hộp trứng
 * ai đó tặng: họ không đi tìm chuồng nào cả, và mời họ xem chuồng demo là trả lời lạc
 * câu hỏi của họ.
 *
 * Cũng CỐ Ý không nói rõ "mã này không tồn tại" hay "mã này đã bị thu hồi" - hai câu
 * đó giúp người dò biết mình đoán gần đúng tới đâu.
 */
export default function TraceNotFound() {
  return (
    <div className="screen text-center">
      <div className="text-[40px] mt-8">🔖</div>
      <h1 className="display text-[22px] mt-2">Không đọc được mã này</h1>
      <p className="lede mt-2">
        Mã có thể bị gõ thiếu một ký tự, hoặc lô hàng này không còn được truy xuất.
        Thử nhìn lại nhãn trên hộp và gõ đúng dãy chữ dưới mã QR nhé.
      </p>
      <div className="grid gap-2 mt-5">
        <Link href="/" className="btn btn-primary no-underline">ChicChic là gì?</Link>
      </div>
      <p className="text-[11.6px] mt-4" style={{ color: "var(--ink-soft)" }}>
        Mỗi lô trứng/gà ở ChicChic có một mã riêng, quét ra ảnh do chính người chăm chụp
        lúc thu hoạch.
      </p>
    </div>
  );
}
