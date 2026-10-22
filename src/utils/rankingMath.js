'use strict';

const average2 = (sum, count) => (count > 0 ? Math.floor((sum * 200 + count) / (count * 2)) / 100 : null);

const round = (value, digits) => Number(value.toFixed(digits));

const weightedScore = (sum, count, minVotes, prior) => round((sum + minVotes * prior) / (count + minVotes), 4);

module.exports = { average2, weightedScore, round };
