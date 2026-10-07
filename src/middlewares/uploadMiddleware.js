// src/middlewares/uploadMiddleware.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Cấu hình nơi lưu trữ: Lưu NGOÀI thư mục public (ngoài vùng thực thi trực tiếp)
const uploadDir = path.join(__dirname, '../../storage/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

// Giới hạn dung lượng tệp (tối đa 2MB)
const limits = {
    fileSize: 2 * 1024 * 1024 
};

const upload = multer({ storage, limits });

// Middleware kiểm tra chữ ký tệp thực (Magic Bytes) chống giả mạo đuôi .jpg/.png
const verifyMagicBytes = async (req, res, next) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: "Không có tệp nào được tải lên!" });
    }

    try {
        // Sử dụng dynamic import để tương thích với file-type (ESM-only)
        const { fileTypeFromFile } = await import('file-type');
        const detectedType = await fileTypeFromFile(req.file.path);
        
        // Danh sách các định dạng hình ảnh cho phép
        const allowedTypes = ['jpg', 'jpeg', 'png', 'webp'];

        if (!detectedType || !allowedTypes.includes(detectedType.ext)) {
            // Xóa ngay tệp rác/mã độc vừa được đẩy lên thư mục tạm
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ 
                success: false, 
                error: { code: "INVALID_FILE_SIGNATURE" },
                message: "Bảo mật từ chối: Chữ ký tệp thực không khớp với định dạng hình ảnh hợp lệ!" 
            });
        }

        req.verifiedFile = req.file;
        next();
    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        return res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { upload, verifyMagicBytes };