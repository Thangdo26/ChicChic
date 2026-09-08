-- Chạy TRƯỚC khi quay về code không hiểu scope. Giữ schema/audit để không mất lịch sử.
-- Thu hồi cookie CHILD ở server; không nâng quyền cho phiên đang trong tay bé.
BEGIN;
DELETE FROM "Session" WHERE "scope" = 'CHILD';
COMMIT;
