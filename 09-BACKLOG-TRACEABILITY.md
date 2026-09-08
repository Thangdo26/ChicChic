# ChicChic — backlog có truy vết

Ưu tiên là đề xuất. `P0` = chặn an toàn/tính đúng; `P1` = pilot reliability; `P2` = value; `P3` = scale. Mỗi story phải cập nhật CODEMAP và test cùng commit.

## P0 — không mở pilot commerce nếu chưa đóng

**Theo dõi 08/09/2026:** B08 code/server đã triển khai; 13 ca PG + 37 assertions HTTP kiểm scope/token/CAS, chưa đóng UAT browser nhiều tab. B06 hoàn thành transaction Family approval, trả taskId, khóa gộp task và thứ tự khóa complete/decline việc thường; còn TaskTarget/semantic unique cho mọi nguồn/legacy đối soát. B07, B02–B05, B09 chưa hoàn tất. Dependency Next/Vitest/PostCSS đã vá, audit 0 advisory. Xem [CC-B08/security](docs/engineering/CC-B08-SECURITY.md).

| ID | Story | AC tóm tắt | Phụ thuộc |
|---|---|---|---|
| CC-B01 | lifecycle request/proof | request idempotent; không terminal stage trước proof; task target flock | schema, task |
| CC-B02 | multi-flock history | renew tạo Flock mới; old trace/lot/health đọc được; không deleteMany | B01 |
| CC-B03 | lot eligibility | productLine/stage/type gate; Family không meat; first egg proof | policy |
| CC-B04 | health hold union | nhiều hold không bị latest event che; gate list/cart/claim/delivery | health model |
| CC-B05 | custody vs use-by | policy version, temperature/storage, safety disposition; 7-day không là use-by | B04, ops |
| CC-B06 | task CAS/idempotency | parallel complete/decline chỉ một side effect; return taskId | schema |
| CC-B07 | shipment snapshot | handover/delivery chỉ exact lot IDs/address snapshot; no “all claimed” | B06 |
| CC-B08 | child/adult scope | direct URL/cross-tab child bị chặn; exit đổi scope; audit | auth |
| CC-B09 | media privacy | approved public proof vs private; deletion/retention; no child photo | storage |

## P1 — pilot operability

**Theo dõi CC-B01 (2026-09-07):** đã triển khai request/proof, CAS/idempotency và áp migration production có backup/restore/checksum. Vercel/CI kiểm schema trước build; test PostgreSQL phủ thiếu migration và thiếu CHECK. [Runbook](docs/engineering/CC-B01-LIFECYCLE.md) ghi bằng chứng và phần browser/upload còn chưa nghiệm thu. Chưa đánh dấu các story P0 khác hoàn tất.

| ID | Story | AC |
|---|---|---|
| CC-B10 | outbox transaction | state + domain event/outbox atomic; retry không nhân đôi materializer |
| CC-B11 | observed vs expected | confidence/source/timestamp ở UI và trace |
| CC-B12 | worker queue | semantic task catalog, due/decline/exception, offline retry, workload dashboard |
| CC-B13 | pricing ledger | frozen line/version, coverage/refund, cost imports, margin report |
| CC-B14 | safety incident | hold/recall/refund/replacement runbook + audit |
| CC-B15 | docs drift CI | counts/links/current matrix; stale TODO flagged |

## P2 — family value

`CC-B16` family moments theo event proof; `CC-B17` offline print/album; `CC-B18` parent weekly report; `CC-B19` age variants chuyên gia duyệt; `CC-B20` co-use accessibility.

## P3 — chỉ sau evidence

`CC-B21` RFID/IoT; `CC-B22` push notification; `CC-B23` selective automation; `CC-B24` school pilot; `CC-B25` AI summarization với redaction. Không làm P3 để bù retention hoặc trust chưa đạt.

## Definition of Ready

PO policy đã chốt; target actor/permission; source-of-truth model; migration/rollback; privacy/safety review; copy tiếng Việt; UAT cases; observability; CODEMAP sections impacted.

## Definition of Done

Unit + integration/browser test phù hợp; race/idempotency proof; no stale docs; `tsc`, lint, test, build; migration dry run + backup; support/runbook; feature flag; release note; rollback tested.
