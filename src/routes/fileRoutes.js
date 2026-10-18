'use strict';
const express = require('express');
const multer = require('multer');
const FileController = require('../controllers/fileController');
const { verifyToken, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();
// Bộ nhớ (không ghi đĩa: Vercel chỉ đọc); giới hạn 2 MB, đúng 1 tệp, trường 'file'.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });

// Ảnh bìa công khai (chỉ ảnh đã qua kiểm tra chữ ký)
router.get('/:id', FileController.serve);
// Tải ảnh bìa: quyền title.update (MODERATOR, ADMIN) kiểm ở máy chủ
router.post('/titles/:id/poster', verifyToken, authorize('title.update'), upload.single('file'), FileController.uploadPoster);

module.exports = router;
