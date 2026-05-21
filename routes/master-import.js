const express = require('express');
const router = express.Router();

const importMasterController = require('../controllers/import-master');
// const { validateInput } = require('../validations/common'); 

const multer = require('multer');
const upload = multer({
    dest: "uploads/master-files/",
    /*  fileFilter: (req, file, cb) => {
         if (
             file.mimetype ===
             "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
             file.originalname.endsWith(".xlsx")
         ) {
             cb(null, true);
         } else {
             cb(new Error("Only .xlsx files are allowed"));
         }
     }, */

    fileFilter: (req, file, cb) => {
        const isXlsx =
            file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
            file.originalname.endsWith(".xlsx");

        const isTxt =
            file.mimetype === "text/plain" ||
            file.originalname.endsWith(".txt");

        if (isXlsx || isTxt) {
            cb(null, true);
        } else {
            cb(new Error("Only .xlsx and .txt files are allowed"));
        }
    }
});


router.post("/master-file-import", upload.single("file"), importMasterController.importMasterXlsx);

module.exports = router;


