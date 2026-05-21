// controllers/insurer-api-field-validation-rule.js

const { Op } = require("sequelize");
const { MysqlInsurerApiFieldValidationRuleModel } = require("../models/mysqldb/insurer-api-field-validation-rule");
const { MysqlInsurerApiFieldMasterModel } = require("../models/mysqldb/insurer-api-field-master");
const { MysqlInsurersModel } = require("../models/mysqldb/insurer");
const CommonService = require("../services/common");


/**
 * @openapi
 * /admin/insurer-api-field-validation-rule/add:
 *   post:
 *     tags:
 *       - Insurer API Field Validation Rule
 *     summary: Add validation rule
 *     description: Create a validation rule for a specific insurer field and context.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - insurer_id
 *               - field_name
 *               - validation_context_code
 *               - validation_rule_text
 *             properties:
 *               insurer_id:
 *                 type: integer
 *                 example: 1
 *               field_name:
 *                 type: string
 *                 example: vehicle_registration_number
 *               validation_context_code:
 *                 type: string
 *                 example: QUOTE
 *               validation_rule_text:
 *                 type: string
 *                 example: required|regex:^[A-Z0-9-]+$
 *               is_active:
 *                 type: integer
 *                 enum: [0, 1]
 *                 example: 1
 *
 *     responses:
 *       200:
 *         description: Validation rule added successfully
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
 *                   example: Validation rule added successfully
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
 *                     invalidField:
 *                       value: Invalid field name for this insurer
 *                     duplicate:
 *                       value: Validation rule already exists
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

        const field = await MysqlInsurerApiFieldMasterModel.findByQuery({
            insurer_id: payload.insurer_id,
            field_name: payload.field_name,
        });

        if (!field) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Invalid field name for this insurer",
            });
        }

        const existing = await MysqlInsurerApiFieldValidationRuleModel.findByQuery({
            insurer_id: payload.insurer_id,
            field_name: payload.field_name,
            validation_context_code: payload.validation_context_code,
            validation_rule_text: payload.validation_rule_text,
        });

        if (existing) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Validation rule already exists",
            });
        }

        const DBPayload = {
            insurer_id: payload.insurer_id,
            field_name: payload.field_name,
            validation_context_code: payload.validation_context_code,
            validation_rule_text: payload.validation_rule_text,
            is_active: payload.is_active !== undefined ? payload.is_active : 1,
        };

        const result = await MysqlInsurerApiFieldValidationRuleModel.add(DBPayload);

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Validation rule added successfully",
            result,
        });
    } catch (error) {
        console.log(error);
        CommonService.errorHandler(error, {
            url: "/admin/insurer-api-field-validation-rule/add",
            operation: "ADD INSURER API FIELD VALIDATION RULE",
            relative_detail: "Error occurred during adding insurer API field validation rule",
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
 * /admin/insurer-api-field-validation-rule/list:
 *   post:
 *     tags:
 *       - Insurer API Field Validation Rule
 *     summary: Get validation rules list
 *     description: Fetch paginated validation rules with filters.
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
 *               field_name:
 *                 type: string
 *                 example: vehicle_registration_number
 *               validation_context_code:
 *                 type: string
 *                 example: QUOTE
 *               is_active:
 *                 type: integer
 *                 enum: [0, 1]
 *                 example: 1
 *               search:
 *                 type: string
 *                 example: required
 *
 *     responses:
 *       200:
 *         description: Validation rules fetched successfully
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
 *                   example: Validation rules fetched successfully
 *                 count:
 *                   type: integer
 *                   example: 15
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
        if (payload.field_name) conditions.field_name = payload.field_name;
        if (payload.validation_context_code) {
            conditions.validation_context_code = payload.validation_context_code;
        }
        if (payload.is_active !== undefined) conditions.is_active = payload.is_active;

        if (payload.search) {
            conditions[Op.or] = [
                { field_name: { [Op.like]: `%${payload.search}%` } },
                { validation_context_code: { [Op.like]: `%${payload.search}%` } },
                { validation_rule_text: { [Op.like]: `%${payload.search}%` } },
            ];
        }

        const count = await MysqlInsurerApiFieldValidationRuleModel.findAllCount(conditions);

        const result = await MysqlInsurerApiFieldValidationRuleModel.find(
            null,
            conditions,
            [["id", "DESC"]],
            start,
            limit
        );

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Validation rules fetched successfully",
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
 * /admin/insurer-api-field-validation-rule/{id}:
 *   get:
 *     tags:
 *       - Insurer API Field Validation Rule
 *     summary: Get validation rule detail
 *     description: Fetch a specific validation rule by ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 10
 *
 *     responses:
 *       200:
 *         description: Validation rule fetched successfully
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
 *                   example: Validation rule fetched successfully
 *                 result:
 *                   type: object
 *
 *       404:
 *         description: Validation rule not found
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
 *                   example: Validation rule not found
 *
 *       500:
 *         description: Server error
 */
const detail = async (req, res) => {
    try {
        const result = await MysqlInsurerApiFieldValidationRuleModel.findById(req.params.id);

        if (!result) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Validation rule not found",
            });
        }

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Validation rule fetched successfully",
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
 * /admin/insurer-api-field-validation-rule/update/{id}:
 *   put:
 *     tags:
 *       - Insurer API Field Validation Rule
 *     summary: Update validation rule
 *     description: Update existing validation rule.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 10
 *
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               insurer_id:
 *                 type: integer
 *               field_name:
 *                 type: string
 *               validation_context_code:
 *                 type: string
 *               validation_rule_text:
 *                 type: string
 *
 *     responses:
 *       200:
 *         description: Validation rule updated successfully
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
 *                   example: Validation rule updated successfully
 *
 *       404:
 *         description: Validation rule not found
 *
 *       500:
 *         description: Server error
 */
const update = async (req, res) => {
    const payload = req.body;

    try {
        const existing = await MysqlInsurerApiFieldValidationRuleModel.findById(req.params.id);

        if (!existing) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Validation rule not found",
            });
        }

        const DBPayload = {
            insurer_id: payload.insurer_id,
            field_name: payload.field_name,
            validation_context_code: payload.validation_context_code,
            validation_rule_text: payload.validation_rule_text,
        };

        await MysqlInsurerApiFieldValidationRuleModel.update(req.params.id, DBPayload);

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Validation rule updated successfully",
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
 * /admin/insurer-api-field-validation-rule/update-status/{id}:
 *   patch:
 *     tags:
 *       - Insurer API Field Validation Rule
 *     summary: Update validation rule status
 *     description: Enable or disable validation rule.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 10
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
 *                   example: Validation rule status updated successfully
 *
 *       500:
 *         description: Server error
 */
const updateStatus = async (req, res) => {
    try {
        await MysqlInsurerApiFieldValidationRuleModel.update(req.params.id, {
            is_active: req.body.is_active,
        });

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Validation rule status updated successfully",
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