const  express = require('express');
const router = express.Router();
 
const ProductAddonsController = require("../controllers/product-addon");


// Product Addons
router.post("/add", ProductAddonsController.add);
router.post("/list", ProductAddonsController.list);
router.get("/:id", ProductAddonsController.detail);
router.put("/update/:id", ProductAddonsController.update);
router.patch("/status/:id", ProductAddonsController.updateStatus);

module.exports = router;

            