const  express = require('express');
const router = express.Router();
  
const ProductConfigController = require("../controllers/product-configs"); 
// Product Configs
router.post("/add", ProductConfigController.add);
router.post("/list", ProductConfigController.list);
router.get("/:id", ProductConfigController.detail);
router.put("/update/:id", ProductConfigController.update);
router.patch("/status/:id", ProductConfigController.updateStatus); 

module.exports = router;

            