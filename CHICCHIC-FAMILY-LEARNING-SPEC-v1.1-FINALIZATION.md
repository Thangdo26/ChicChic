# ChicChic Family Learning — Spec v1.1 (Finalization & Delta)

**Delta theo yêu cầu chủ dự án 09/09/2026:** parent tự xác nhận và mở suất Family, không cần admin mời hoặc duyệt. Giữ enrollment riêng của FL-D04 và toàn bộ cam kết/giới hạn FL-D01…FL-D24 còn lại. Cờ vận hành/PAUSED không bị tự vượt; child space cần cha mẹ còn sở hữu chuồng. Cảnh tương tác chỉ local state, nội dung học hiện hữu giữ nguyên. [runbook trải nghiệm 09/09](docs/engineering/CC-EXPERIENCE-20260909.md) ghi source, migration và kiểm thử.

**Ghi chú triển khai 08/09/2026 (không sửa quyết định FL-D01…FL-D24):** server scope ADULT/CHILD, token rotation/audit và transaction của Family suggestion/approval đã được triển khai theo [runbook CC-B08](docs/engineering/CC-B08-SECURITY.md). Parent vẫn duyệt một chạm trong scope ADULT. Bằng chứng PG/HTTP không thay thế browser UAT.

> **Implementation review 2026-09-06:** giữ nguyên mọi quyết định `LOCKED` của v1.0/v1.1. Khi triển khai, đọc thêm [Family UX](05-FAMILY-LEARNING-UX.md), [audit](01-CODEBASE-AUDIT.md) và [technical design](06-TECHNICAL-DESIGN.md). Các điểm child/adult session scope và lifecycle/safety gate là yêu cầu bổ sung về tính đúng của hệ thống, không phải đảo FL-D01…FL-D24.

> Phiên bản: `1.1` · Ngày chốt: `2026-08-12`
> **Quan hệ với v1.0:** Tài liệu này **ngồi trên** `CHICCHIC-NEXT-PLAN-FAMILY-LEARNING.md` (v1.0).
> v1.0 vẫn là **spec chi tiết có thẩm quyền** (data model, epics, test, migration…). v1.1 chỉ **chốt lại một quyết định + thêm ghi chú review**; khi hai bên xung đột thì **v1.1 thắng**.
> **Đưa cho Claude Code CẢ HAI file.** Không viết lại v1.0.

---

## A. Xác nhận 4 quyết định của chủ dự án (2026-08-12)

| Câu hỏi | Trả lời | Đã khoá ở v1.0 |
|---|---|---|
| Q1 — Vòng hành động thật của bé? | Có, nhưng nhẹ: mở rộng danh sách việc chăm cho nông dân để bé chọn; bố mẹ đã đăng nhập là đủ control | FL-D07 (§10.4, §16.2, Epic 6) — **được tinh chỉnh ở §B dưới** |
| Q2 — Nhóm tuổi? | Cả hai nhóm | FL-D02 (5–6 và 7–8) ✅ |
| Q3 — Mặc định gà đẻ, giết mổ/tiền sau cổng phụ huynh? | Có | FL-D03 + FL-D12 + §15.3 ✅ |
| Q4 — B2C phụ huynh trước, trường học sau? | Đồng ý | §25 (B2C pilot → B2B P2) ✅ |

→ Không quyết định `LOCKED` nào của v1.0 bị đảo. Chỉ **một** hạng mục được làm rõ: Q1.

---

## B. CHỐT Q1 — Vòng "care-wish" (thay lời cuối cho FL-D07)

**Nguyên tắc giữ nguyên (không thương lượng):** trẻ **không bao giờ** trực tiếp tạo `BarnTask`, đổi tiền hay đổi trạng thái farm. Trẻ chỉ tạo `ChildSuggestion` không side effect (FL-D06, §9.6, §16.2). Cha mẹ là người thực hiện.

**Tinh chỉnh chốt cứng (`LOCKED`):**

- **FL-D21 `LOCKED`** — Thêm `ChildSuggestionKind.CARE_WISH`. Bé chọn từ một **catalog đóng** các mong muốn chăm sóc, mỗi mong muốn map tới **một loại việc chăm thật** của nông dân. Không free text.
  - Catalog khởi đầu (đóng, khai báo trong `src/data/learning-curriculum.ts` hoặc catalog riêng, có `optionKey`):
    `CHO_AN_RAU` · `KIEM_TRA_NUOC` · `DON_O_DE` · `CHUP_CAN_CANH` · `RA_VUON` (chỉ nếu farm cho phép và an toàn). Mở rộng sau khi pilot có tín hiệu.
- **FL-D22 `LOCKED`** — Cha mẹ duyệt tại `/gia-dinh/de-xuat`. Với `CARE_WISH` được duyệt, cha mẹ **một chạm trong cùng session đã đăng nhập** biến nó thành `BarnTask` thật cho nông dân. **Không** thêm nghi thức Adult-Space nặng (đúng ý "bố mẹ đăng nhập rồi là đủ"). Đây là **hành động của cha mẹ**, có cổng `parent + owns barn` — không phải của trẻ.
- **FL-D23 `LOCKED`** — Việc sinh ra vẫn chịu **mọi bất biến hiện có**: §9.1 (xong ⟹ có ảnh minh chứng), §9.2 (nút tạo *việc*, không đổi hiện thực), §9.35 (rate limit — giới hạn số care-wish/tuần/chuồng để không dội việc lên nông dân), §24.2 (một ảnh phục vụ mọi gia đình gắn với chuồng, nông dân được từ chối).
- **FL-D24 `LOCKED`** — **Đóng vòng học tập (optional):** khi việc care-wish hoàn thành + gắn tag (`CHO_AN`/`UONG_NUOC`/… ở §18.3), nó phát `CARE_TASK_COMPLETED` như mọi việc khác → materializer có thể sinh learning moment tương ứng. Tag một chạm, **không bắt buộc**, không thêm form cho nông dân.

**Mở rộng danh mục việc nông dân (đúng ý Q1):** danh mục care thật được mở rộng để bé có menu đa dạng. Đây là thay đổi nhỏ, xếp vào **Epic 6** (suggestion) + một ghi chú ở **Epic 1/Epic 7** cho farmer UI tag. Giữ farmer workload ≤ mục tiêu §4 (≤30 phút/farm/tuần).

---

## C. Ghi chú review (đối chiếu source thật trước khi code)

1. **Đường "chủ chuồng tạo việc cho nông dân" đã có chưa?** Decor và "nhận thịt" đều tạo `BarnTask` → nhiều khả năng đã có cơ chế owner→task tái dùng được. **Xác minh trong source**; nếu có, FL-D22 chỉ là thêm một `TaskKind`/preset và một entry point từ `/gia-dinh/de-xuat`. Nếu chưa có đường owner-initiated tổng quát, thêm **tối thiểu**, gated `parent + owns barn`, đúng luật tầng §11.1.
2. **recent-auth (Epic 2) khả thi** — repo đã có OTP email + password + `lib/nhip.ts` rate limit; dùng lại, đừng dựng cơ chế auth mới.
3. **Negative-content test (§21.5)** — mượn luôn guard ngôn ngữ doạ dẫm đã có ở `tests/nuoi-duong.test.ts` (§9.32): quét child content chặn `nếu không` / `sẽ bị` / "gà buồn vì con" / "sắp hết hạn" / "mua ngay". Đồng bộ một danh sách cấm, đừng viết hai bản.
4. **FL-D13 giữ nguyên** — Family flock (LAYER) kết thúc bằng `RETIRE`; `RENEW` hoãn tới khi có multi-flock history (§12.5, §26 mục 7). CARE_WISH **không** đụng vòng đời.
5. **§18.4 giữ nguyên** — health/death **không** tự sinh child moment; chờ `HealthEvent` runtime + content playbook được chuyên gia duyệt (khớp §11.16 của repo: model có, runtime chưa).
6. **Epic 0 vẫn bắt buộc** — dọn drift trong `HUONG-DAN-SETUP-DEPLOY` (24h/3h, buyer gate cũ, phí giao) trước khi bắt đầu, đúng như v1.0 §20 Epic 0 yêu cầu.

---

## D. Thứ tự thực thi (giữ nguyên Epic 0→8 của v1.0)

Không đổi thứ tự. Chỉ chèn CARE_WISH:

- **Epic 1** — thêm ghi chú: chuẩn bị danh mục `TaskKind`/preset care mở rộng (chưa nối UI trẻ).
- **Epic 6** — hiện thực FL-D21..D24: `CARE_WISH` catalog + review→one-tap tạo task ở `/gia-dinh/de-xuat` + đóng vòng optional sang learning moment.
- **Epic 7** — farmer tag một chạm cho care thật (optional), đo tải nông dân.

Mọi Acceptance Criteria, test strategy (§21), migration (§22), NO-GO (§23) của v1.0 **giữ nguyên**, cộng thêm:
- Test: `child-suggestion.test.ts` phủ `CARE_WISH` (optionKey ngoài allowlist bị từ chối; suggestion không tạo task; **chỉ** hành động của cha mẹ mới tạo task; rate limit care-wish).
- Integration: bé tạo CARE_WISH → không có `BarnTask` mới; cha mẹ duyệt → đúng một `BarnTask`; bấm hai lần → vẫn một (so-sánh-rồi-đặt).

---

## E. Prompt handoff cập nhật cho Claude Code

> Đọc **`CHICCHIC-FAMILY-LEARNING-SPEC-v1.1-FINALIZATION.md` trước, rồi `CHICCHIC-NEXT-PLAN-FAMILY-LEARNING.md` (v1.0)**, sau đó `CODEMAP.md` (§8 §9 §10 §11 §13) và phần liên quan `HUONG-DAN-SETUP-DEPLOY.md`. v1.1 thắng khi xung đột. Triển khai theo Epic 0→8, mỗi lần một Epic. Trước khi sửa, đối chiếu Prisma schema/source thật và báo divergence, **không đoán cho khớp**. Q1 đã chốt: trẻ chỉ tạo `ChildSuggestion` (gồm `CARE_WISH`) không side effect; **chỉ cha mẹ** mới biến care-wish đã duyệt thành `BarnTask` thật, một chạm trong session hiện tại, gated `parent + owns barn`; giữ mọi bất biến quyền/tiền/proof-media/so-sánh-rồi-đặt/luật tầng. Không mở MEAT/RENEW cho Family flock. Không thu dữ liệu trẻ ngoài scope. Mọi route/action/model mới cập nhật CODEMAP + test trong cùng commit. Chạy `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`; thay đổi DB/concurrency thì thêm script kiểm riêng và dọn sạch.

---

## F. Những gì v1.1 KHÔNG đổi

Mọi thứ khác trong v1.0 giữ nguyên hiệu lực: FL-D01–D20, North Star, §8 game mechanics cấm, §9 sáu chương, §12 data model, §14 domain event/materializer, §17 privacy, §20 epics, §21 test, §22 rollout, §23 NO-GO, §27 "agent tuyệt đối không được tự quyết", §28 Definition of Done. v1.1 chỉ bổ sung FL-D21–D24 và các ghi chú §C.
