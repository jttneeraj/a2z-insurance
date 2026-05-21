const express = require("express");
const router = express.Router();

const MotorPaymentController = require("../controllers/motor-payment");

router.post("/initiate", MotorPaymentController.initiate);
router.get("/status/:id", MotorPaymentController.detail);

module.exports = router;
