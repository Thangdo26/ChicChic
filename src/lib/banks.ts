/**
 * Danh sách ngân hàng Việt Nam — dữ liệu tĩnh, **không gọi mạng**.
 *
 * Vì sao có file này: ô "Ngân hàng" của tài khoản nhận tiền trước đây là một ô chữ
 * tự do. Người bán gõ *"Vietcom"*, *"VCB"*, *"ngân hàng ngoại thương"* — ba chuỗi
 * cho cùng một ngân hàng — rồi người trực nông trại phải đoán khi ngồi chuyển tiền.
 * Đây là chỗ gõ sai một chữ thì **tiền của người khác không về được**, nên nó phải là
 * một danh sách chọn chứ không phải một ô trống.
 *
 * `bin` là mã 6 số của NAPAS, thứ mà VietQR và mọi cổng chuyển khoản dùng để định
 * danh ngân hàng. Giữ nó ở đây để sau này tra tên chủ tài khoản hoặc dựng mã QR
 * chuyển tiền cho người bán đều có sẵn khoá, không phải map lại từ tên.
 *
 * ⚠️ **Không tự ý sắp xếp lại.** Thứ tự đang là "hay dùng nhất trước" — người bán
 * quét mắt từ trên xuống, đảo về a-b-c là bắt mọi người cuộn.
 * ⚠️ Thêm ngân hàng thì thêm cả `bin` đúng; sai `bin` mà sau này bật tra cứu tên thì
 * nó tra vào một ngân hàng khác và trả về "không tìm thấy" một cách khó hiểu.
 */
export type Bank = { bin: string; ma: string; ten: string };

export const BANKS: readonly Bank[] = [
  { bin: "970436", ma: "VCB", ten: "Vietcombank" },
  { bin: "970418", ma: "BIDV", ten: "BIDV" },
  { bin: "970405", ma: "VBA", ten: "Agribank" },
  { bin: "970415", ma: "ICB", ten: "VietinBank" },
  { bin: "970422", ma: "MB", ten: "MB Bank" },
  { bin: "970407", ma: "TCB", ten: "Techcombank" },
  { bin: "970416", ma: "ACB", ten: "ACB" },
  { bin: "970432", ma: "VPB", ten: "VPBank" },
  { bin: "970423", ma: "TPB", ten: "TPBank" },
  { bin: "970403", ma: "STB", ten: "Sacombank" },
  { bin: "970443", ma: "SHB", ten: "SHB" },
  { bin: "970431", ma: "EIB", ten: "Eximbank" },
  { bin: "970441", ma: "VIB", ten: "VIB" },
  { bin: "970426", ma: "MSB", ten: "MSB" },
  { bin: "970437", ma: "HDB", ten: "HDBank" },
  { bin: "970448", ma: "OCB", ten: "OCB" },
  { bin: "970429", ma: "SCB", ten: "SCB" },
  { bin: "970454", ma: "VCCB", ten: "Ngân hàng Bản Việt" },
  { bin: "970400", ma: "SGICB", ten: "SaigonBank" },
  { bin: "970409", ma: "BAB", ten: "BacABank" },
  { bin: "970419", ma: "NCB", ten: "NCB" },
  { bin: "970412", ma: "PVCB", ten: "PVcomBank" },
  { bin: "970414", ma: "OCEANBANK", ten: "OceanBank" },
  { bin: "970425", ma: "ABB", ten: "ABBANK" },
  { bin: "970427", ma: "VAB", ten: "VietABank" },
  { bin: "970428", ma: "NAB", ten: "Nam A Bank" },
  { bin: "970430", ma: "PGB", ten: "PGBank" },
  { bin: "970433", ma: "VIETBANK", ten: "VietBank" },
  { bin: "970438", ma: "BVB", ten: "BaoVietBank" },
  { bin: "970440", ma: "SEAB", ten: "SeABank" },
  { bin: "970442", ma: "HLO", ten: "Hong Leong Bank" },
  { bin: "970449", ma: "LPB", ten: "LPBank" },
  { bin: "970452", ma: "KLB", ten: "KienLongBank" },
  { bin: "546034", ma: "CAKE", ten: "CAKE by VPBank" },
  { bin: "546035", ma: "Ubank", ten: "Ubank by VPBank" },
  { bin: "963388", ma: "TIMO", ten: "Timo by BVBank" },
  { bin: "971005", ma: "VIETTELPAY", ten: "Viettel Money" },
  { bin: "971011", ma: "VNPTMONEY", ten: "VNPT Money" },
];

const THEO_TEN = new Map(BANKS.map((b) => [b.ten.toLowerCase(), b]));

/**
 * Tra ngân hàng theo TÊN đã lưu.
 *
 * Trả `null` cho tên không nằm trong danh sách — và đó là chuyện **bình thường**, không
 * phải lỗi: những tài khoản điền trước bản này mang chuỗi tự do người dùng gõ. Chỗ gọi
 * phải giữ nguyên chuỗi cũ và vẫn hiện được, đừng ép về rỗng rồi làm mất số tài khoản
 * của người ta.
 */
export const bankTheoTen = (ten: string | null | undefined): Bank | null =>
  ten ? THEO_TEN.get(ten.trim().toLowerCase()) ?? null : null;

export const laBankHopLe = (ten: string) => THEO_TEN.has(ten.trim().toLowerCase());

/**
 * Số tài khoản: chỉ chữ và số. Người ta hay gõ kèm dấu cách hoặc gạch cho dễ đọc, và
 * hay dán cả cụm từ app ngân hàng ra.
 *
 * ⚠️ **Không kiểm độ dài theo từng ngân hàng.** Mỗi nhà một kiểu (Vietcombank 13 số,
 * MB 10–16, ví điện tử là số điện thoại), và đoán sai thì app từ chối một số tài khoản
 * có thật — hỏng nặng hơn hẳn cái nó định ngăn.
 */
export const donSoTaiKhoan = (raw: string) =>
  String(raw ?? "").replace(/[^0-9A-Za-z]/g, "").slice(0, 24);
