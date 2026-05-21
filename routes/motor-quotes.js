const express = require('express');
const router = express.Router();

const MotorQuotesController = require("../controllers/motor-quotes");

router.post("/generate", MotorQuotesController.generate); 
router.post("/select-plan", MotorQuotesController.selectPlan);
router.get("/:quote_request_id", MotorQuotesController.listByQuoteRequest);


module.exports = router;

