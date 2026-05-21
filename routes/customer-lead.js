const  express = require('express');
const router = express.Router();
  
const customerLeadController = require("../controllers/customer-lead");
 
// Insurer API Field Validation Rule
router.post("/add", customerLeadController.add);
router.get("/:id", customerLeadController.detail);

module.exports = router;

            