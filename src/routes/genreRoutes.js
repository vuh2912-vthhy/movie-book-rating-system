'use strict';
const express = require('express');
const GenreController = require('../controllers/genreController');
const { verifyToken, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();
router.get('/', GenreController.list);
// Quản lý thể loại: chỉ ADMIN (genre.manage)
router.post('/', verifyToken, authorize('genre.manage'), GenreController.create);
router.put('/:id', verifyToken, authorize('genre.manage'), GenreController.update);
router.delete('/:id', verifyToken, authorize('genre.manage'), GenreController.remove);

module.exports = router;
