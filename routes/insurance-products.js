const  express = require('express');
const router = express.Router();
 
 
const InsuranceProductsController = require("../controllers/insurance-products"); 
 

// Insurance Products
router.post("/add", InsuranceProductsController.add);
router.post("/list", InsuranceProductsController.list);
router.get("/:id", InsuranceProductsController.detail);
router.put("/update/:id", InsuranceProductsController.update);
router.patch("/status/:id", InsuranceProductsController.updateStatus); 


module.exports = router;


            