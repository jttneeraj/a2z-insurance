const  express = require('express');
const router = express.Router();
 
const InsurerProductsController = require("../controllers/insurer-products");
 

// Insurer Products
router.post("/add", InsurerProductsController.add);
router.post("/list", InsurerProductsController.list);
router.get("/:id", InsurerProductsController.detail);
router.put("/update/:id", InsurerProductsController.update);
router.patch("/status/:id", InsurerProductsController.updateStatus);


module.exports = router;


            