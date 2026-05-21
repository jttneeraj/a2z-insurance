const  express = require('express');
const router = express.Router();
 
/* const { validateInput } = require('../validations/common');
const { authLoginValidation } = require('../validations/cms');  */
 

const InsuranceTypesController = require("../controllers/insurance-types");
const InsurersController = require("../controllers/insurers");
const InsuranceProductsController = require("../controllers/insurance-products");
const InsurerProductsController = require("../controllers/insurer-products");

// Insurance Types
router.post("/insurance-types/add", InsuranceTypesController.add);
router.post("/insurance-types/list", InsuranceTypesController.list);
router.get("/insurance-types/:id", InsuranceTypesController.detail);
router.put("/insurance-types/update/:id", InsuranceTypesController.update);
router.patch("/insurance-types/status/:id", InsuranceTypesController.updateStatus);

// Insurers
router.post("/insurers/add", InsurersController.add);
router.post("/insurers/list", InsurersController.list);
router.get("/insurers/:id", InsurersController.detail);
router.put("/insurers/update/:id", InsurersController.update);
router.patch("/insurers/status/:id", InsurersController.updateStatus);

// Insurance Products
router.post("/insurance-products/add", InsuranceProductsController.add);
router.post("/insurance-products/list", InsuranceProductsController.list);
router.get("/insurance-products/:id", InsuranceProductsController.detail);
router.put("/insurance-products/update/:id", InsuranceProductsController.update);
router.patch("/insurance-products/status/:id", InsuranceProductsController.updateStatus);

// Insurer Products
router.post("/insurer-products/add", InsurerProductsController.add);
router.post("/insurer-products/list", InsurerProductsController.list);
router.get("/insurer-products/:id", InsurerProductsController.detail);
router.put("/insurer-products/update/:id", InsurerProductsController.update);
router.patch("/insurer-products/status/:id", InsurerProductsController.updateStatus);


module.exports = router;


            