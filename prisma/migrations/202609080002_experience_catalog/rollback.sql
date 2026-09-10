-- Giữ schema bổ sung và mọi món/chứng từ đã có. Không DROP hoặc DELETE.
-- Code cũ chưa hiểu active: dừng mua decor trong cửa sổ rollback hoặc sửa tiếp.
-- Không dùng stockQty=0 để thay active: sẽ làm sai sổ tồn kho.
SELECT COUNT(*) AS "monDangNgungBan" FROM "DecorItem" WHERE "active" = false;
