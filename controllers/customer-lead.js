const { Op } = require("sequelize");
const { MysqlCustomerLeadsModel } = require("../models/mysqldb/customer-lead");
const CommonService = require("../services/common");


/**
 * @openapi
 * /customer/leads/add:
 *   post:
 *     tags:
 *       - Customer Leads
 *     summary: Add new customer lead
 *     description: Create a new customer lead with auto-generated reference number.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - mobile_number
 *             properties:
 *               full_name:
 *                 type: string
 *                 example: Neeraj Prajapati
 *               mobile_number:
 *                 type: string
 *                 example: "9876543210"
 *               email:
 *                 type: string
 *                 example: neeraj@example.com
 *               source:
 *                 type: string
 *                 example: WEB
 *
 *     responses:
 *       200:
 *         description: Customer lead created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: integer
 *                   example: 0
 *                 status:
 *                   type: integer
 *                   example: 1
 *                 message:
 *                   type: string
 *                   example: Customer lead created successfully
 *                 result:
 *                   type: object
 *
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: integer
 *                   example: 1
 *                 status:
 *                   type: integer
 *                   example: 0
 *                 message:
 *                   type: string
 *                   example: Mobile number is required
 *
 *       500:
 *         description: Server error
 */
const add = async (req, res) => {
    const payload = req.body;

    try {
        if (!payload.mobile_number) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Mobile number is required",
            });
        }

        const today = new Date();
        const ymd = today.toISOString().slice(0, 10).replace(/-/g, "");

        const count = await MysqlCustomerLeadsModel.findAllCount({
            lead_reference_no: {
                [Op.like]: `LD-${ymd}-%`,
            },
        });

        const leadReferenceNo = `LD-${ymd}-${String(count + 1).padStart(6, "0")}`;

        const DBPayload = {
            lead_reference_no: leadReferenceNo,
            full_name: payload.full_name || null,
            mobile_number: payload.mobile_number,
            email: payload.email || null,
            source: payload.source || "WEB",
            lead_status: "NEW",
            is_active: 1,
        };

        const result = await MysqlCustomerLeadsModel.add(DBPayload);

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Customer lead created successfully",
            result,
        });
    } catch (error) {
        console.log(error);

        CommonService.errorHandler(error, {
            url: "/customer/leads/add",
            operation: "ADD CUSTOMER LEAD",
            relative_detail: "Error occurred during adding customer lead",
        });

        return res.status(500).json({
            error: 1,
            status: 0,
            message: "Something went wrong",
        });
    }
};


/**
 * @openapi
 * /customer/leads/{id}:
 *   get:
 *     tags:
 *       - Customer Leads
 *     summary: Get customer lead detail
 *     description: Fetch customer lead details by ID.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *
 *     responses:
 *       200:
 *         description: Customer lead fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: integer
 *                   example: 0
 *                 status:
 *                   type: integer
 *                   example: 1
 *                 message:
 *                   type: string
 *                   example: Customer lead fetched successfully
 *                 result:
 *                   type: object
 *
 *       404:
 *         description: Customer lead not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: integer
 *                   example: 1
 *                 status:
 *                   type: integer
 *                   example: 0
 *                 message:
 *                   type: string
 *                   example: Customer lead not found
 *
 *       500:
 *         description: Server error
 */
const detail = async (req, res) => {
    try {
        const result = await MysqlCustomerLeadsModel.findById(req.params.id);

        if (!result) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Customer lead not found",
            });
        }

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Customer lead fetched successfully",
            result,
        });
    } catch (error) {
        console.log(error);

        return res.status(500).json({
            error: 1,
            status: 0,
            message: "Something went wrong",
        });
    }
};

module.exports = {
    add,
    detail,
};