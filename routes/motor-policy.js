const express = require("express");
const router = express.Router();

const MotorPolicyController = require("../controllers/motor-policy");

router.post("/status", MotorPolicyController.status);
router.post("/pdf", MotorPolicyController.generatePdf);

module.exports = router;
