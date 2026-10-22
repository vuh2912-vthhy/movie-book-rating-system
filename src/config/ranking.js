'use strict';

const toPositive = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};

module.exports = Object.freeze({
    minVotes: Math.floor(toPositive(process.env.RANKING_MIN_VOTES, 25)),
    fallbackPriorMean: toPositive(process.env.RANKING_PRIOR_MEAN, 3.0)
});
