'use strict';
// Bộ nhớ đệm theo thời gian sống (TTL) trong tiến trình. Dùng cho kết quả đọc nhiều, ít đổi (xếp hạng, thống kê).
// Chiến lược làm mất hiệu lực: (1) hết TTL; (2) xóa toàn bộ ngay khi dữ liệu nguồn thay đổi
// (chấm điểm, sửa tác phẩm, duyệt bình luận, dựng lại tổng hợp). Trên Vercel mỗi bản sao hàm có bộ nhớ riêng,
// nên đây là đệm cục bộ từng bản sao: đúng nhờ TTL ngắn, không cần đồng bộ giữa các bản sao.
class TtlCache {
    constructor({ max = 200 } = {}) {
        this.map = new Map();
        this.max = max;
        this.hits = 0;
        this.misses = 0;
    }

    async getOrSet(key, ttlMs, loader) {
        const now = Date.now();
        const entry = this.map.get(key);
        if (entry && entry.expires > now) {
            this.hits += 1;
            return { value: entry.value, hit: true };
        }
        this.misses += 1;
        const value = await loader();
        this.map.set(key, { value, expires: now + ttlMs });
        if (this.map.size > this.max) this.map.delete(this.map.keys().next().value); // bỏ mục cũ nhất
        return { value, hit: false };
    }

    clear() { this.map.clear(); }

    stats() { return { size: this.map.size, hits: this.hits, misses: this.misses }; }
}

const cache = new TtlCache();
cache.TtlCache = TtlCache;
module.exports = cache;
