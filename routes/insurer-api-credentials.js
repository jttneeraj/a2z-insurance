const  express = require('express');
const router = express.Router();
 
const InsurerApiCredentialsController = require("../controllers/insurer-api-credential"); 

// Insurer API Credentials
router.post("/add", InsurerApiCredentialsController.add);
router.post("/list", InsurerApiCredentialsController.list);
router.get("/:id", InsurerApiCredentialsController.detail);
router.put("/update/:id", InsurerApiCredentialsController.update);
router.patch("/status/:id", InsurerApiCredentialsController.updateStatus); 

module.exports = router;

            