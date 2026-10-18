-- Ngày 13: Vercel có hệ tệp chỉ đọc nên ảnh bìa lưu thẳng trong CSDL (MEDIUMBLOB, tối đa 2 MB/tệp).
-- Ảnh nằm NGOÀI mọi đường dẫn thực thi và chỉ được trả qua GET /api/v1/files/:id kèm kiểu nội dung do máy chủ xác định.
-- Chạy MỘT lần trên mỗi CSDL.
ALTER TABLE files ADD COLUMN content MEDIUMBLOB NULL AFTER sha256;
