'use strict';
const express = require('express');
const GenreController = require('../controllers/genreController');

const router = express.Router();
router.get('/', GenreController.list);

module.exports = router;
