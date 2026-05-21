const express = require("express");
const router = express.Router();

const MotorKycController = require("../controllers/motor-kyc");

router.post("/status", MotorKycController.status);

module.exports = router;
