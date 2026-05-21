const  express = require('express');
const router = express.Router();
  
const MotorQuoteRequestController = require("../controllers/motor-quote-request");
 
router.post("/add", MotorQuoteRequestController.add);

module.exports = router;

///test test

            