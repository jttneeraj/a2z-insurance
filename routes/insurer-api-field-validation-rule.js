const  express = require('express');
const router = express.Router();
  
const InsurerApiFieldValidationRuleController = require("../controllers/insurer-api-field-validation-rule");
 
// Insurer API Field Validation Rule
router.post("/add", InsurerApiFieldValidationRuleController.add);
router.post("/list", InsurerApiFieldValidationRuleController.list);
router.get("/:id", InsurerApiFieldValidationRuleController.detail);
router.put("/update/:id", InsurerApiFieldValidationRuleController.update);
router.patch("/status/:id", InsurerApiFieldValidationRuleController.updateStatus);

module.exports = router;

            