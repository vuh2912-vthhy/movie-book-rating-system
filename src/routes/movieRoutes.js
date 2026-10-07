const express = require('express');
const router = express.Router();
const MovieController = require('../controllers/movieController');
const { upload, verifyMagicBytes } = require('../middlewares/uploadMiddleware');
// Endpoint tải lên hình ảnh/poster phim an toàn (Phải đặt ở trên cùng)
router.post('/upload-poster', upload.single('poster'), verifyMagicBytes, (req, res) => {
    try {
        res.status(200).json({
            success: true,
            message: "Tải tệp an toàn thành công!",
            filePath: `/storage/uploads/${req.verifiedFile.filename}`
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// Các định tuyến khác
router.get('/trending', MovieController.getTrending);
router.get('/search', MovieController.searchAndPaginate);
module.exports = router;