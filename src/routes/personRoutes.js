'use strict';
const express = require('express');
const PersonController = require('../controllers/personController');
const { verifyToken, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();
router.get('/', PersonController.list);
router.get('/:id', PersonController.getById);
// Thêm, sửa nhân vật: MODERATOR và ADMIN (person.manage)
router.post('/', verifyToken, authorize('person.manage'), PersonController.create);
router.put('/:id', verifyToken, authorize('person.manage'), PersonController.update);

module.exports = router;
