# ChicChic — coverage manifest của audit

**Coverage bổ sung 09/09/2026:** catalog-actions/decor-catalog/decor-proof, DecorCatalogForm/FarmPlayground/render-coop-preview, schema/gate danh mục và API reservations thuộc slice mới. Các action ownership, inventory, payment, market, handover, Family và completeTask đã có regression PG; tests/experience.test.tsx render SVG và validator. HTTP smoke mở rộng các trang và action thay đổi. [runbook trải nghiệm 09/09](docs/engineering/CC-EXPERIENCE-20260909.md) ghi ma trận kiểm chứng. Con số snapshot bên dưới chỉ của audit 06/09.

**Bổ sung coverage 08/09/2026:** `session-scope.ts`, `scope-path.ts`, auth/middleware/layout, Enter/Exit/SessionScopeSync và `check-session-schema.cjs` thuộc CC-B08. `task-store.ts`/`de-xuat.ts`/learning-actions/worker-actions thuộc phần CC-B06 đã sửa. `integration/security.pg.test.ts`, `scripts/smoke-security.cjs`, CI và migration scope bổ sung chứng cứ; [runbook](docs/engineering/CC-B08-SECURITY.md) là điểm vào cho source mới.

## Snapshot

| Chỉ số | Giá trị |
|---|---:|
| commit | `60f7b87ed03a2e3534bca47255cb247368a810d7` |
| file Git đã đọc | 255 |
| tổng dòng | 59.565 |
| tổng bytes | 3.246.034 |
| TypeScript/TSX | 225 (110 `.ts`, 115 `.tsx`) |
| Markdown | 11 |
| Prisma schema/seed | 2 |
| test file | 25 |
| Prisma model | 51 |
| syntax parse error | 0 trong static parse |

## Phạm vi theo thư mục

| Khu vực | File | Cách đọc |
|---|---:|---|
| `src/app` | 95 | route/page/server action, auth và ownership map |
| `src/components` | 47 | form, task, upload, family/worker UI |
| `src/lib` | 53 | domain logic, jobs, payments, harvest, learning, auth |
| `tests` | 25 | test titles + source invariant coverage; không giả định integration |
| `prisma` | 2 | schema toàn bộ + seed |
| docs/config/public | 33 | toàn bộ Markdown, package, config, asset names |

## Cách tạo bằng chứng

Script audit đọc từng path từ `git ls-files`, ghi byte/line/SHA-256, headings, imports/exports và TypeScript parse diagnostics vào inventory nội bộ. Các finding trong `01-CODEBASE-AUDIT.md` được kiểm lại bằng `rg/nl` trên source và dẫn permalink commit cố định.

## Giới hạn diễn giải

“Đã đọc toàn bộ” ở đây nghĩa là đã quét/đọc mọi file tracked trong snapshot và đọc sâu các đường nghiệp vụ nêu trong audit. Nó không có nghĩa đã chạy mọi route với DB, đã quay video UI, đã kiểm worker ngoài đời hay đã chứng minh bug concurrency bằng production traffic. Các risk chưa tái hiện được đánh dấu là static risk và có UAT/integration case tương ứng.
