const  express = require('express');
const router = express.Router(); 


const ProductDocumentRequirementController = require("../controllers/product-document-requirement");

// Product Documents
router.post("/add", ProductDocumentRequirementController.add);
router.post("/list", ProductDocumentRequirementController.list);
router.get("/:id", ProductDocumentRequirementController.detail);
router.put("/update/:id", ProductDocumentRequirementController.update);
router.patch("/status/:id", ProductDocumentRequirementController.updateStatus); 

module.exports = router;

            