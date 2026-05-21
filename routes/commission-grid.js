const express = require('express');
const router = express.Router();


const multer = require("multer");


const commissionGridController = require("../controllers/commission-grid");


const upload = multer({
    dest: "uploads/commission-grid/"
});

router.post(
    "/import",
    upload.single("file"),
    commissionGridController.importCommissionGrid
);
router.post(
    "/lookup",
    commissionGridController.lookupCommissionGrid
);

module.exports = router;

