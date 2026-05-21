const  express = require('express');
const router = express.Router();
 
 

const AddonsController = require("../controllers/addon");

// Addons
router.post("/add", AddonsController.add);
router.post("/list", AddonsController.list);
router.get("/:id", AddonsController.detail);
router.put("/update/:id", AddonsController.update);
router.patch("/status/:id", AddonsController.updateStatus);

module.exports = router;

            