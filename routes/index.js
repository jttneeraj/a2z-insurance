var express = require('express');
var router = express.Router();
const multer = require('multer');
const path = require('path');

// Multer configuration for handling file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Specify the directory where you want to save the uploaded files
        let dest = path.join(__dirname, '../public/storage/temp');
        // cb(null, 'temp/');
        cb(null, dest);
    },
    filename: function (req, file, cb) {
        // Specify the filename for the uploaded file
        // console.log("file.originalname", file.originalname)
        cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage });

const indexController = require('../controllers/index');
// const { loginValidation } = require('../validations/auth');


router.get('/', indexController.index)
router.post('/test-post', indexController.test_post)
router.post('/test-file-upload', indexController.test_file_upload)






module.exports = router;