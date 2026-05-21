const { Op } = require("sequelize");
const { MysqlAddonsModel } = require("../models/mysqldb/addon");
const CommonService = require("../services/common");

/**
 * @openapi
 * /admin/addons/add:
 *   post:
 *     tags:
 *       - Addons
 *     summary: Add new addon
 *     description: Create a new addon with unique code.
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
 *                 example: Zero Depreciation
 *               code:
 *                 type: string
 *                 example: ZERO_DEP
 *               description:
 *                 type: string
 *                 example: Covers full claim without depreciation deduction
 *               is_active:
 *                 type: integer
 *                 enum: [0, 1]
 *                 example: 1
 *
 *     responses:
 *       200:
 *         description: Addon added successfully
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
 *                   example: Addon added successfully
 *                 result:
 *                   type: object
 *
 *       400:
 *         description: Duplicate addon code
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
 *                   example: Addon code already exists
 *
 *       500:
 *         description: Server error
 */
const add = async (req, res) => {
    const payload = req.body;

    try {
        const existing = await MysqlAddonsModel.findByQuery({
            code: payload.code,
        });

        if (existing) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Addon code already exists",
            });
        }

        const DBPayload = {
            name: payload.name,
            code: payload.code,
            description: payload.description || null,
            is_active: payload.is_active !== undefined ? payload.is_active : 1,
        };

        const result = await MysqlAddonsModel.add(DBPayload);

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Addon added successfully",
            result,
        });
    } catch (error) {
        console.log(error);
        CommonService.errorHandler(error, {
            url: "/admin/addons/add",
            operation: "ADD ADDON",
            relative_detail: "Error occurred during adding addon",
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
 * /admin/addons/list:
 *   post:
 *     tags:
 *       - Addons
 *     summary: Get addons list
 *     description: Fetch paginated list of addons with optional search and status filter.
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
 *                 example: zero
 *               is_active:
 *                 type: integer
 *                 enum: [0, 1]
 *                 example: 1
 *
 *     responses:
 *       200:
 *         description: Addons fetched successfully
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
 *                   example: Addons fetched successfully
 *                 count:
 *                   type: integer
 *                   example: 20
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

        if (payload.is_active !== undefined) conditions.is_active = payload.is_active;

        if (payload.search) {
            conditions[Op.or] = [
                { name: { [Op.like]: `%${payload.search}%` } },
                { code: { [Op.like]: `%${payload.search}%` } },
            ];
        }

        const count = await MysqlAddonsModel.findAllCount(conditions);

        const result = await MysqlAddonsModel.find(
            null,
            conditions,
            [["id", "DESC"]],
            start,
            limit
        );

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Addons fetched successfully",
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
 * /admin/addons/{id}:
 *   get:
 *     tags:
 *       - Addons
 *     summary: Get addon detail
 *     description: Fetch a single addon by ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 3
 *
 *     responses:
 *       200:
 *         description: Addon fetched successfully
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
 *                   example: Addon fetched successfully
 *                 result:
 *                   type: object
 *
 *       404:
 *         description: Addon not found
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
 *                   example: Addon not found
 *
 *       500:
 *         description: Server error
 */
const detail = async (req, res) => {
    try {
        const result = await MysqlAddonsModel.findById(req.params.id);

        if (!result) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Addon not found",
            });
        }

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Addon fetched successfully",
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
 * /admin/addons/update/{id}:
 *   put:
 *     tags:
 *       - Addons
 *     summary: Update addon
 *     description: Update addon details.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 3
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
 *                 example: Engine Protect
 *               code:
 *                 type: string
 *                 example: ENGINE_PROTECT
 *               description:
 *                 type: string
 *                 example: Covers engine damage due to water ingress
 *
 *     responses:
 *       200:
 *         description: Addon updated successfully
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
 *                   example: Addon updated successfully
 *
 *       404:
 *         description: Addon not found
 *
 *       500:
 *         description: Server error
 */
const update = async (req, res) => {
    const payload = req.body;

    try {
        const existing = await MysqlAddonsModel.findById(req.params.id);

        if (!existing) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Addon not found",
            });
        }

        const DBPayload = {
            name: payload.name,
            code: payload.code,
            description: payload.description || null,
        };

        await MysqlAddonsModel.update(req.params.id, DBPayload);

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Addon updated successfully",
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
 * /admin/addons/update-status/{id}:
 *   patch:
 *     tags:
 *       - Addons
 *     summary: Update addon status
 *     description: Enable or disable an addon.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 3
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
 *                   example: Addon status updated successfully
 *
 *       500:
 *         description: Server error
 */
const updateStatus = async (req, res) => {
    try {
        await MysqlAddonsModel.update(req.params.id, {
            is_active: req.body.is_active,
        });

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Addon status updated successfully",
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