const { Op } = require("sequelize");
const { MysqlInsurerApiFieldMasterModel } = require("../models/mysqldb/insurer-api-field-master");
const { MysqlInsurersModel } = require("../models/mysqldb/insurer");
const CommonService = require("../services/common");

/**
 * @openapi
 * /admin/insurer-api-field-master/add:
 *   post:
 *     tags:
 *       - Insurer API Field Master
 *     summary: Add insurer API field
 *     description: Create a new API field definition for an insurer.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - insurer_id
 *               - field_name
 *             properties:
 *               insurer_id:
 *                 type: integer
 *                 example: 1
 *               field_name:
 *                 type: string
 *                 example: vehicle_registration_number
 *               field_description:
 *                 type: string
 *                 example: Vehicle registration number field
 *               character_length:
 *                 type: integer
 *                 example: 15
 *               field_type:
 *                 type: string
 *                 example: string
 *               is_active:
 *                 type: integer
 *                 enum: [0, 1]
 *                 example: 1
 *
 *     responses:
 *       200:
 *         description: Field added successfully
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
 *                   example: Insurer API field added successfully
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
 *                 status:
 *                   type: integer
 *                 message:
 *                   type: string
 *                   examples:
 *                     invalidInsurer:
 *                       value: Invalid insurer
 *                     duplicate:
 *                       value: Field name already exists for this insurer
 *
 *       500:
 *         description: Server error
 */
const add = async (req, res) => {
    const payload = req.body;

    try {
        const insurer = await MysqlInsurersModel.findById(payload.insurer_id);

        if (!insurer) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Invalid insurer",
            });
        }

        const existing = await MysqlInsurerApiFieldMasterModel.findByQuery({
            insurer_id: payload.insurer_id,
            field_name: payload.field_name,
        });

        if (existing) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Field name already exists for this insurer",
            });
        }

        const DBPayload = {
            insurer_id: payload.insurer_id,
            field_name: payload.field_name,
            field_description: payload.field_description || null,
            character_length: payload.character_length || null,
            field_type: payload.field_type || null,
            is_active: payload.is_active !== undefined ? payload.is_active : 1,
        };

        const result = await MysqlInsurerApiFieldMasterModel.add(DBPayload);

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Insurer API field added successfully",
            result,
        });
    } catch (error) {
        console.log(error);
        CommonService.errorHandler(error, {
            url: "/admin/insurer-api-field-master/add",
            operation: "ADD INSURER API FIELD MASTER",
            relative_detail: "Error occurred during adding insurer API field master",
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
 * /admin/insurer-api-field-master/list:
 *   post:
 *     tags:
 *       - Insurer API Field Master
 *     summary: Get insurer API fields list
 *     description: Fetch paginated list of API fields with filters.
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
 *               insurer_id:
 *                 type: integer
 *                 example: 1
 *               field_type:
 *                 type: string
 *                 example: string
 *               is_active:
 *                 type: integer
 *                 enum: [0, 1]
 *                 example: 1
 *               search:
 *                 type: string
 *                 example: vehicle
 *
 *     responses:
 *       200:
 *         description: Fields fetched successfully
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
 *                   example: Insurer API fields fetched successfully
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

        if (payload.insurer_id) conditions.insurer_id = payload.insurer_id;
        if (payload.field_type) conditions.field_type = payload.field_type;
        if (payload.is_active !== undefined) conditions.is_active = payload.is_active;

        if (payload.search) {
            conditions[Op.or] = [
                { field_name: { [Op.like]: `%${payload.search}%` } },
                { field_description: { [Op.like]: `%${payload.search}%` } },
                { field_type: { [Op.like]: `%${payload.search}%` } },
            ];
        }

        const count = await MysqlInsurerApiFieldMasterModel.findAllCount(conditions);

        const result = await MysqlInsurerApiFieldMasterModel.find(
            null,
            conditions,
            [["id", "DESC"]],
            start,
            limit
        );

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Insurer API fields fetched successfully",
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
 * /admin/insurer-api-field-master/{id}:
 *   get:
 *     tags:
 *       - Insurer API Field Master
 *     summary: Get insurer API field detail
 *     description: Fetch a single API field by ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 5
 *
 *     responses:
 *       200:
 *         description: Field fetched successfully
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
 *                   example: Insurer API field fetched successfully
 *                 result:
 *                   type: object
 *
 *       404:
 *         description: Field not found
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
 *                   example: Insurer API field not found
 *
 *       500:
 *         description: Server error
 */
const detail = async (req, res) => {
    try {
        const result = await MysqlInsurerApiFieldMasterModel.findById(req.params.id);

        if (!result) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Insurer API field not found",
            });
        }

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Insurer API field fetched successfully",
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
 * /admin/insurer-api-field-master/update/{id}:
 *   put:
 *     tags:
 *       - Insurer API Field Master
 *     summary: Update insurer API field
 *     description: Update API field details.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 5
 *
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - insurer_id
 *               - field_name
 *             properties:
 *               insurer_id:
 *                 type: integer
 *               field_name:
 *                 type: string
 *               field_description:
 *                 type: string
 *               character_length:
 *                 type: integer
 *               field_type:
 *                 type: string
 *
 *     responses:
 *       200:
 *         description: Field updated successfully
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
 *                   example: Insurer API field updated successfully
 *
 *       404:
 *         description: Field not found
 *
 *       500:
 *         description: Server error
 */
const update = async (req, res) => {
    const payload = req.body;

    try {
        const existing = await MysqlInsurerApiFieldMasterModel.findById(req.params.id);

        if (!existing) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Insurer API field not found",
            });
        }

        const DBPayload = {
            insurer_id: payload.insurer_id,
            field_name: payload.field_name,
            field_description: payload.field_description || null,
            character_length: payload.character_length || null,
            field_type: payload.field_type || null,
        };

        await MysqlInsurerApiFieldMasterModel.update(req.params.id, DBPayload);

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Insurer API field updated successfully",
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
 * /admin/insurer-api-field-master/update-status/{id}:
 *   patch:
 *     tags:
 *       - Insurer API Field Master
 *     summary: Update API field status
 *     description: Enable or disable insurer API field.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 5
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
 *                   example: Insurer API field status updated successfully
 *
 *       500:
 *         description: Server error
 */
const updateStatus = async (req, res) => {
    try {
        await MysqlInsurerApiFieldMasterModel.update(req.params.id, {
            is_active: req.body.is_active,
        });

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Insurer API field status updated successfully",
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