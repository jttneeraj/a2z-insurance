const  express = require('express');
const router = express.Router();
  
const InsurerApiFieldMasterController = require("../controllers/insurer-api-field-master"); 

// Insurer API Field Master
router.post("/add", InsurerApiFieldMasterController.add);
router.post("/list", InsurerApiFieldMasterController.list);
router.get("/:id", InsurerApiFieldMasterController.detail);
router.put("/update/:id", InsurerApiFieldMasterController.update);
router.patch("/status/:id", InsurerApiFieldMasterController.updateStatus); 


module.exports = router;

            