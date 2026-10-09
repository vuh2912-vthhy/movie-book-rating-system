// src/middlewares/uploadMiddleware.js
const multer = require('multer');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Vercel (serverless) có hệ tệp chỉ đọc, chỉ ghi được vào thư mục tạm.
// Ở đó tệp tải lên KHÔNG được giữ lâu dài: ngày 13/10 sẽ chuyển sang lưu trữ ngoài.
// Thư mục chỉ được tạo khi có yêu cầu tải lên, không tạo lúc nạp module (tránh sập khi khởi động).
const uploadDir = process.env.VERCEL
    ? path.join(os.tmpdir(), 'uploads')
    : path.join(__dirname, '../../storage/uploads');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        try {
            fs.mkdirSync(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
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
        // Sử dụng dynamic import để nạp thư viện
        const fileType = await import('file-type');
        
        // Trích xuất hàm đọc tệp bao quát mọi phiên bản của thư viện
        const checkSignature = fileType.fileTypeFromFile 
                            || fileType.fromFile 
                            || (fileType.default && (fileType.default.fileTypeFromFile || fileType.default.fromFile));
        
        // Đọc cấu trúc byte thực tế của tệp
        const detectedType = await checkSignature(req.file.path);
        
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