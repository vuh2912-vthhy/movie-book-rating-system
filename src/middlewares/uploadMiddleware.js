const multer = require('multer');
const path = require('path');
const os = require('os');
const fs = require('fs');

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

const limits = {
    fileSize: 2 * 1024 * 1024 
};

const upload = multer({ storage, limits });

const verifyMagicBytes = async (req, res, next) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: "Không có tệp nào được tải lên!" });
    }

    try {
        const fileType = await import('file-type');
        
        const checkSignature = fileType.fileTypeFromFile 
                            || fileType.fromFile 
                            || (fileType.default && (fileType.default.fileTypeFromFile || fileType.default.fromFile));
        
        const detectedType = await checkSignature(req.file.path);
        
        const allowedTypes = ['jpg', 'jpeg', 'png', 'webp'];

        if (!detectedType || !allowedTypes.includes(detectedType.ext)) {
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