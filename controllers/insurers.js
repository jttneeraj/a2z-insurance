const moment = require("moment");
const { Sequelize, Op } = require("sequelize");
const {
    MysqlInsurersModel,
    mysqldb,
} = require("../models/mysqldb/insurer");
const { ResponseHandler } = require("../utils/response-handler");
const CommonService = require("../services/common");

/**
 * @openapi
 * /admin/insurers/add:
 *   post:
 *     tags:
 *       - Insurers
 *     summary: Add new insurer
 *     description: Create a new insurer with unique code.
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
 *                 example: ICICI Lombard
 *               code:
 *                 type: string
 *                 example: ICICI
 *               short_name:
 *                 type: string
 *                 example: ICICI
 *               logo_url:
 *                 type: string
 *                 example: https://example.com/logo.png
 *               api_base_url:
 *                 type: string
 *                 example: https://api.insurer.com
 *               support_email:
 *                 type: string
 *                 example: support@insurer.com
 *               support_phone:
 *                 type: string
 *                 example: "9876543210"
 *               is_active:
 *                 type: integer
 *                 enum: [0, 1]
 *                 example: 1
 *
 *     responses:
 *       200:
 *         description: Insurer added successfully
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
 *                   example: Insurer added successfully
 *                 result:
 *                   type: object
 *
 *       400:
 *         description: Duplicate insurer code
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
 *                   example: Insurer code already exists
 *
 *       500:
 *         description: Server error
 */
const add = async (req, res) => {
    const payload = req.body;

    try {
        const existing = await MysqlInsurersModel.findByQuery({
            code: payload.code,
        });

        if (existing) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Insurer code already exists",
            });
        }

        const DBPayload = {
            name: payload.name,
            code: payload.code,
            short_name: payload.short_name || null,
            logo_url: payload.logo_url || null,
            api_base_url: payload.api_base_url || null,
            support_email: payload.support_email || null,
            support_phone: payload.support_phone || null,
            is_active: payload.is_active !== undefined ? payload.is_active : 1,
        };

        const result = await MysqlInsurersModel.add(DBPayload);

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Insurer added successfully",
            result,
        });
    } catch (error) {
        console.log(error);
        CommonService.errorHandler(error, {
            url: "/admin/insurers/add",
            operation: "ADD INSURER",
            relative_detail: "Error occurred during adding insurer",
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
 * /admin/insurers/list:
 *   post:
 *     tags:
 *       - Insurers
 *     summary: Get insurers list
 *     description: Fetch paginated list of insurers with search and status filter.
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
 *                 example: icici
 *               is_active:
 *                 type: integer
 *                 enum: [0, 1]
 *                 example: 1
 *
 *     responses:
 *       200:
 *         description: Insurers fetched successfully
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
 *                   example: Insurers fetched successfully
 *                 count:
 *                   type: integer
 *                   example: 50
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
                { short_name: { [Op.like]: `%${payload.search}%` } },
            ];
        }

        if (payload.is_active !== undefined) {
            conditions.is_active = payload.is_active;
        }

        const count = await MysqlInsurersModel.findAllCount(conditions);

        const result = await MysqlInsurersModel.find(
            null,
            conditions,
            [["id", "DESC"]],
            start,
            limit
        );

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Insurers fetched successfully",
            count,
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
 * /admin/insurers/{id}:
 *   get:
 *     tags:
 *       - Insurers
 *     summary: Get insurer detail
 *     description: Fetch insurer details by ID.
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
 *         description: Insurer fetched successfully
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
 *                   example: Insurer fetched successfully
 *                 result:
 *                   type: object
 *
 *       404:
 *         description: Insurer not found
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
 *                   example: Insurer not found
 *
 *       500:
 *         description: Server error
 */
const detail = async (req, res) => {
    try {
        const result = await MysqlInsurersModel.findById(req.params.id);

        if (!result) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Insurer not found",
            });
        }

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Insurer fetched successfully",
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
 * /admin/insurers/update/{id}:
 *   put:
 *     tags:
 *       - Insurers
 *     summary: Update insurer
 *     description: Update insurer details.
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
 *                 example: HDFC Ergo
 *               code:
 *                 type: string
 *                 example: HDFC
 *               short_name:
 *                 type: string
 *                 example: HDFC
 *               logo_url:
 *                 type: string
 *               api_base_url:
 *                 type: string
 *               support_email:
 *                 type: string
 *               support_phone:
 *                 type: string
 *
 *     responses:
 *       200:
 *         description: Insurer updated successfully
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
 *                   example: Insurer updated successfully
 *
 *       404:
 *         description: Insurer not found
 *
 *       500:
 *         description: Server error
 */
const update = async (req, res) => {
    const payload = req.body;

    try {
        const id = req.params.id;

        const existing = await MysqlInsurersModel.findById(id);

        if (!existing) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Insurer not found",
            });
        }

        const duplicateCode = await MysqlInsurersModel.findByCodeExceptId(
            payload.code,
            id
        );

        if (duplicateCode) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Insurer code already exists",
            });
        }

        const DBPayload = {
            name: payload.name,
            code: payload.code,
            short_name: payload.short_name || null,
            logo_url: payload.logo_url || null,
            api_base_url: payload.api_base_url || null,
            support_email: payload.support_email || null,
            support_phone: payload.support_phone || null,
        };

        await MysqlInsurersModel.update(id, DBPayload);

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Insurer updated successfully",
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
 * /admin/insurers/update-status/{id}:
 *   patch:
 *     tags:
 *       - Insurers
 *     summary: Update insurer status
 *     description: Enable or disable an insurer.
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
 *                   example: Insurer status updated successfully
 *
 *       500:
 *         description: Server error
 */
const updateStatus = async (req, res) => {
    try {
        await MysqlInsurersModel.update(req.params.id, {
            is_active: req.body.is_active,
        });

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Insurer status updated successfully",
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



