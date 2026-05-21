const express = require("express");
const router = express.Router();

const MotorProposalController = require("../controllers/motor-proposal");

router.post("/add", MotorProposalController.add);
router.get("/:id", MotorProposalController.detail);

module.exports = router;