# ChicChic - hướng dẫn cho agent

**Đọc [CODEMAP.md](CODEMAP.md) TRƯỚC KHI sửa bất cứ file nào.** Đó là bản đồ module/hàm/luồng dữ liệu của repo này: route nào đi qua cổng quyền nào, chỗ nào được phép ghi DB, sửa một thứ thì kéo theo những gì.

Ba mục phải xem mỗi lần đụng code:

- **§8 "Sửa X thì đụng vào đâu"** - bảng tra cứu ngược, xem trước khi gõ dòng đầu tiên.
- **§9 Bất biến** - nhất là: việc chỉ `DONE` khi có ảnh/video minh chứng; `Barn.outside` chỉ đổi trong `completeTask`; mọi trang chuồng bắt buộc đăng nhập.
- **§10 Bẫy đã gặp** - những chỗ đã mất thời gian một lần rồi.

**Mỗi lần develop xong, phải rà soát và cập nhật tất cả tài liệu liên quan nếu bị ảnh hưởng, trước khi báo hoàn tất và trong cùng commit với code.** Bao gồm CODEMAP, README, tài liệu BA/PRD/technical design, hướng dẫn setup/deploy, migration/rollback, test/UAT và MEMORY/handoff tùy thay đổi. Quy ước áp dụng cả khi sửa hành vi, cấu hình hoặc quy trình hiện có. Giữ tài liệu mô tả đúng trạng thái đã triển khai, kết quả kiểm thử và giới hạn còn lại; không ghi kế hoạch chưa làm thành tính năng đã có. Khi bàn giao, liệt kê tài liệu đã cập nhật; nếu không cần đổi tài liệu, ghi rõ lý do.

Thêm route, server action hay bảng mới: cập nhật CODEMAP (§2/§3/§6/§8). Sửa code xong: chạy `npx tsc --noEmit`, `npm run lint` và `npm test`.

**`npm test`** là bộ kiểm bất biến §9 (~1 giây, không nối DB) - xem **CODEMAP §13** để biết nó phủ tới đâu và **không** phủ cái gì. Nó không thay được việc chạy thử thật: cổng quyền và mọi phép ghi DB vẫn phải kiểm bằng tay theo công thức ở §13.

Ngôn ngữ của sản phẩm và của mọi trao đổi trong repo này là **tiếng Việt** - comment, thông báo cho người dùng, commit message đều vậy.
