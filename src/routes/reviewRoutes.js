const express = require('express');
const router = express.Router();
const ReviewController = require('../controllers/reviewController');

// Đưa các định tuyến về đúng "nhà" của nó
router.post('/', ReviewController.create);
router.put('/:id', ReviewController.update);

// Chốt chặn bắt buộc phải có để server.js nhận diện được
module.exports = router;