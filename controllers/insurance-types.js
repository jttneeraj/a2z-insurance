const moment = require("moment");
const { Sequelize, Op } = require("sequelize");
const {
    MysqlInsuranceTypesModel,
    mysqldb,
} = require("../models/mysqldb/insurance-type");
const { ResponseHandler } = require("../utils/response-handler");
const CommonService = require("../services/common");

/**
 * @openapi
 * /admin/insurance-types/add:
 *   post:
 *     tags:
 *       - Insurance Types
 *     summary: Add new insurance type
 *     description: Create a new insurance type with unique code.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - code
 *             properties:
 *               name:
 *                 type: string
 *                 example: Motor Insurance
 *               code:
 *                 type: string
 *                 example: MOTOR
 *               description:
 *                 type: string
 *                 example: Covers vehicle insurance
 *               is_active:
 *                 type: integer
 *                 example: 1
 *
 *     responses:
 *       200:
 *         description: Insurance type added successfully
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
 *                   example: Insurance type added successfully
 *                 result:
 *                   type: object
 *
 *       400:
 *         description: Duplicate insurance type code
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
 *                   example: Insurance type code already exists
 *
 *       500:
 *         description: Server error
 */
const add = async (req, res) => {
    const payload = req.body;

    try {
        const existing = await MysqlInsuranceTypesModel.findByQuery({
            code: payload.code,
        });

        if (existing) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Insurance type code already exists",
            });
        }

        const DBPayload = {
            name: payload.name,
            code: payload.code,
            description: payload.description || null,
            is_active: payload.is_active !== undefined ? payload.is_active : 1,
        };

        const result = await MysqlInsuranceTypesModel.add(DBPayload);

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Insurance type added successfully",
            result,
        });
    } catch (error) {
        console.log(error);
        CommonService.errorHandler(error, {
            url: "/admin/insurance-types/add",
            operation: "ADD INSURANCE TYPE",
            relative_detail: "Error occurred during adding insurance type",
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
 * /admin/insurance-types/list:
 *   post:
 *     tags:
 *       - Insurance Types
 *     summary: Get insurance types list
 *     description: Fetch paginated list with optional search and status filter.
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               start:
 *                 type: integer
 *                 example: 0
 *               limit:
 *                 type: integer
 *                 example: 10
 *               search:
 *                 type: string
 *                 example: motor
 *               is_active:
 *                 type: integer
 *                 example: 1
 *
 *     responses:
 *       200:
 *         description: Insurance types fetched successfully
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
 *                   example: Insurance types fetched successfully
 *                 count:
 *                   type: integer
 *                   example: 25
 *                 result:
 *                   type: array
 *                   items:
 *                     type: object
 *
 *       500:
 *         description: Server error
 */
const list = async (req, res) => {
    const payload = req.body;

    try {
        const start = payload.start || 0;
        const limit = payload.limit || 10;

        const conditions = {};

        if (payload.search) {
            conditions[Op.or] = [
                { name: { [Op.like]: `%${payload.search}%` } },
                { code: { [Op.like]: `%${payload.search}%` } },
            ];
        }

        if (payload.is_active !== undefined) {
            conditions.is_active = payload.is_active;
        }

        const count = await MysqlInsuranceTypesModel.findAllCount(conditions);

        const result = await MysqlInsuranceTypesModel.find(
            null,
            conditions,
            [["id", "DESC"]],
            start,
            limit
        );

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Insurance types fetched successfully",
            count,
            result,
        });
    } catch (error) {
        console.log(error);
        CommonService.errorHandler(error, {
            url: "/admin/insurance-types/list",
            operation: "LIST INSURANCE TYPES",
            relative_detail: "Error occurred during insurance type list",
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
 * /admin/insurance-types/{id}:
 *   get:
 *     tags:
 *       - Insurance Types
 *     summary: Get insurance type detail
 *     description: Fetch a single insurance type by ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *
 *     responses:
 *       200:
 *         description: Insurance type fetched successfully
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
 *                   example: Insurance type fetched successfully
 *                 result:
 *                   type: object
 *
 *       404:
 *         description: Insurance type not found
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
 *                   example: Insurance type not found
 *
 *       500:
 *         description: Server error
 */
const detail = async (req, res) => {
    try {
        const result = await MysqlInsuranceTypesModel.findById(req.params.id);

        if (!result) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Insurance type not found",
            });
        }

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Insurance type fetched successfully",
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


/**
 * @openapi
 * /admin/insurance-types/update/{id}:
 *   put:
 *     tags:
 *       - Insurance Types
 *     summary: Update insurance type
 *     description: Update name, code, and description of an insurance type.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - code
 *             properties:
 *               name:
 *                 type: string
 *                 example: Health Insurance
 *               code:
 *                 type: string
 *                 example: HEALTH
 *               description:
 *                 type: string
 *                 example: Covers medical expenses
 *
 *     responses:
 *       200:
 *         description: Insurance type updated successfully
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
 *                   example: Insurance type updated successfully
 *
 *       404:
 *         description: Insurance type not found
 *
 *       500:
 *         description: Server error
 */
const update = async (req, res) => {
    const payload = req.body;

    try {
        const id = req.params.id;

        const existing = await MysqlInsuranceTypesModel.findById(id);

        if (!existing) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Insurance type not found",
            });
        }

        const duplicateCode = await MysqlInsuranceTypesModel.findByCodeExceptId(
            payload.code,
            id
        );

        if (duplicateCode) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Insurance type code already exists",
            });
        }
        

        const DBPayload = {
            name: payload.name,
            code: payload.code,
            description: payload.description || null,
        };

        await MysqlInsuranceTypesModel.update(id, DBPayload);

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Insurance type updated successfully",
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


/**
 * @openapi
 * /admin/insurance-types/update-status/{id}:
 *   patch:
 *     tags:
 *       - Insurance Types
 *     summary: Update insurance type status
 *     description: Enable or disable an insurance type.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - is_active
 *             properties:
 *               is_active:
 *                 type: integer
 *                 enum: [0, 1]
 *                 example: 1
 *
 *     responses:
 *       200:
 *         description: Status updated successfully
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
 *                   example: Insurance type status updated successfully
 *
 *       500:
 *         description: Server error
 */
const updateStatus = async (req, res) => {
    try {
        await MysqlInsuranceTypesModel.update(req.params.id, {
            is_active: req.body.is_active,
        });

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Insurance type status updated successfully",
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
    list,
    detail,
    update,
    updateStatus,
};


