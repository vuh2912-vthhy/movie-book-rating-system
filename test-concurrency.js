const axios = require('axios'); 

async function runConcurrentTest() {
    console.log("Bắt đầu bắn 5 request cùng lúc vào hệ thống...");
    const requests = [];
    
    // Khởi tạo 5 yêu cầu API chuẩn bị nạp đạn
    for (let i = 1; i <= 5; i++) {
        requests.push(
            axios.post('http://localhost:3000/api/reviews', {
                movieId: 1, // Đảm bảo bộ phim này đang có sẵn trong DB
                rating: 5,
                content: `Bài test truy cập đồng thời số ${i}`
            })
        );
    }
    
    try {
        // Promise.all sẽ bóp cò, gửi cả 5 yêu cầu đi ở cùng một tích tắc
        await Promise.all(requests);
        console.log("✅ Toàn bộ 5 request đã chạy xong thành công!");
    } catch (error) {
        console.log("❌ Có lỗi xảy ra:", error.response ? error.response.data : error.message);
    }
}

runConcurrentTest();