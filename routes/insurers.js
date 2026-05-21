const  express = require('express');
const router = express.Router();
 
 
const InsurersController = require("../controllers/insurers");
 


// Insurers
router.post("/add", InsurersController.add);
router.post("/list", InsurersController.list);
router.get("/:id", InsurersController.detail);
router.put("/update/:id", InsurersController.update);
router.patch("/status/:id", InsurersController.updateStatus);
 


module.exports = router;


            