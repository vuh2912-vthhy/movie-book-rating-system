'use strict';
const bcrypt = require('bcrypt');

const password = process.env.DEMO_PASSWORD;
if (!password || password.length < 8) {
    console.error('Hãy đặt biến môi trường DEMO_PASSWORD (tối thiểu 8 ký tự, có chữ và số).');
    process.exit(1);
}

bcrypt.hash(password, 10).then((hash) => console.log(hash));
