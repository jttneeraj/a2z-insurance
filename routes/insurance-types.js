const  express = require('express');
const router = express.Router();
 
/* const { validateInput } = require('../validations/common');
const { authLoginValidation } = require('../validations/cms');  */
 

const InsuranceTypesController = require("../controllers/insurance-types"); 

// Insurance Types
router.post("/add", InsuranceTypesController.add);
router.post("/list", InsuranceTypesController.list);
router.get("/:id", InsuranceTypesController.detail);
router.put("/update/:id", InsuranceTypesController.update);
router.patch("/status/:id", InsuranceTypesController.updateStatus); 


module.exports = router;


            