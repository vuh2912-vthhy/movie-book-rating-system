'use strict';
// Công thức thuần (không truy cập CSDL) dùng chung cho chấm điểm và thống kê, để kiểm thử đơn vị được.

// Trung bình làm tròn 2 chữ số kiểu ROUND() của MySQL (0,5 làm tròn lên), tính bằng số nguyên để không sai số dấu phẩy động.
const average2 = (sum, count) => (count > 0 ? Math.floor((sum * 200 + count) / (count * 2)) / 100 : null);

const round = (value, digits) => Number(value.toFixed(digits));

// Điểm xếp hạng có xét độ tin cậy (trung bình Bayes): (v*R + m*C) / (v + m) = (tổng + m*C) / (số lượt + m)
//   sum: tổng điểm; count: số lượt chấm (v); minVotes: ngưỡng tin cậy (m); prior: điểm trung bình toàn hệ thống (C).
// count = 0 thì kết quả đúng bằng prior.
const weightedScore = (sum, count, minVotes, prior) => round((sum + minVotes * prior) / (count + minVotes), 4);

module.exports = { average2, weightedScore, round };
