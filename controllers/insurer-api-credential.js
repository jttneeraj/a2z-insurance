const { Op } = require("sequelize");
const { MysqlInsurerApiCredentialsModel } = require("../models/mysqldb/insurer-api-credential");
const { MysqlInsurersModel } = require("../models/mysqldb/insurer");
const CommonService = require("../services/common");

/**
 * @openapi
 * /admin/insurer-api-credentials/add:
 *   post:
 *     tags:
 *       - Insurer API Credentials
 *     summary: Add insurer API credentials
 *     description: Create API credentials for an insurer based on environment (UAT/PROD).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - insurer_id
 *               - environment
 *             properties:
 *               insurer_id:
 *                 type: integer
 *                 example: 1
 *               environment:
 *                 type: string
 *                 enum: [UAT, PROD]
 *                 example: UAT
 *               base_url:
 *                 type: string
 *                 example: https://api.insurer.com
 *               client_id:
 *                 type: string
 *                 example: client123
 *               client_secret:
 *                 type: string
 *                 example: secret123
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *               token_url:
 *                 type: string
 *               quote_url:
 *                 type: string
 *               proposal_url:
 *                 type: string
 *               payment_url:
 *                 type: string
 *               policy_pdf_url:
 *                 type: string
 *               is_active:
 *                 type: integer
 *                 enum: [0, 1]
 *                 example: 1
 *
 *     responses:
 *       200:
 *         description: Credential added successfully
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
 *                   example: Insurer API credential added successfully
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
 *                       value: Credential already exists for this insurer and environment
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

        const existing = await MysqlInsurerApiCredentialsModel.findByQuery({
            insurer_id: payload.insurer_id,
            environment: payload.environment,
        });

        if (existing) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Credential already exists for this insurer and environment",
            });
        }

        const DBPayload = {
            insurer_id: payload.insurer_id,
            environment: payload.environment || "UAT",
            base_url: payload.base_url || null,
            client_id: payload.client_id || null,
            client_secret: payload.client_secret || null,
            username: payload.username || null,
            password: payload.password || null,
            token_url: payload.token_url || null,
            quote_url: payload.quote_url || null,
            proposal_url: payload.proposal_url || null,
            payment_url: payload.payment_url || null,
            policy_pdf_url: payload.policy_pdf_url || null,
            is_active: payload.is_active !== undefined ? payload.is_active : 1,
        };

        const result = await MysqlInsurerApiCredentialsModel.add(DBPayload);

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Insurer API credential added successfully",
            result,
        });
    } catch (error) {
        console.log(error);
        CommonService.errorHandler(error, {
            url: "/admin/insurer-api-credentials/add",
            operation: "ADD INSURER API CREDENTIAL",
            relative_detail: "Error occurred during adding insurer API credential",
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
 * /admin/insurer-api-credentials/list:
 *   post:
 *     tags:
 *       - Insurer API Credentials
 *     summary: Get insurer API credentials list
 *     description: Fetch paginated list of API credentials with filters.
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
 *               environment:
 *                 type: string
 *                 enum: [UAT, PROD]
 *                 example: PROD
 *               is_active:
 *                 type: integer
 *                 enum: [0, 1]
 *                 example: 1
 *               search:
 *                 type: string
 *                 example: uat
 *
 *     responses:
 *       200:
 *         description: Credentials fetched successfully
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
 *                   example: Insurer API credentials fetched successfully
 *                 count:
 *                   type: integer
 *                   example: 10
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
        if (payload.environment) conditions.environment = payload.environment;
        if (payload.is_active !== undefined) conditions.is_active = payload.is_active;

        if (payload.search) {
            conditions[Op.or] = [
                { environment: { [Op.like]: `%${payload.search}%` } },
                { base_url: { [Op.like]: `%${payload.search}%` } },
            ];
        }

        const count = await MysqlInsurerApiCredentialsModel.findAllCount(conditions);

        const result = await MysqlInsurerApiCredentialsModel.find(
            null,
            conditions,
            [["id", "DESC"]],
            start,
            limit
        );

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Insurer API credentials fetched successfully",
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
 * /admin/insurer-api-credentials/{id}:
 *   get:
 *     tags:
 *       - Insurer API Credentials
 *     summary: Get insurer API credential detail
 *     description: Fetch a single API credential by ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 2
 *
 *     responses:
 *       200:
 *         description: Credential fetched successfully
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
 *                   example: Insurer API credential fetched successfully
 *                 result:
 *                   type: object
 *
 *       404:
 *         description: Credential not found
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
 *                   example: Insurer API credential not found
 *
 *       500:
 *         description: Server error
 */
const detail = async (req, res) => {
    try {
        const result = await MysqlInsurerApiCredentialsModel.findById(req.params.id);

        if (!result) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Insurer API credential not found",
            });
        }

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Insurer API credential fetched successfully",
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
 * /admin/insurer-api-credentials/update/{id}:
 *   put:
 *     tags:
 *       - Insurer API Credentials
 *     summary: Update insurer API credential
 *     description: Update API credential details for an insurer.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 2
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
 *               environment:
 *                 type: string
 *                 enum: [UAT, PROD]
 *               base_url:
 *                 type: string
 *               client_id:
 *                 type: string
 *               client_secret:
 *                 type: string
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *               token_url:
 *                 type: string
 *               quote_url:
 *                 type: string
 *               proposal_url:
 *                 type: string
 *               payment_url:
 *                 type: string
 *               policy_pdf_url:
 *                 type: string
 *
 *     responses:
 *       200:
 *         description: Credential updated successfully
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
 *                   example: Insurer API credential updated successfully
 *
 *       404:
 *         description: Credential not found
 *
 *       500:
 *         description: Server error
 */
const update = async (req, res) => {
    const payload = req.body;

    try {
        const existing = await MysqlInsurerApiCredentialsModel.findById(req.params.id);

        if (!existing) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Insurer API credential not found",
            });
        }

        const DBPayload = {
            insurer_id: payload.insurer_id,
            environment: payload.environment || "UAT",
            base_url: payload.base_url || null,
            client_id: payload.client_id || null,
            client_secret: payload.client_secret || null,
            username: payload.username || null,
            password: payload.password || null,
            token_url: payload.token_url || null,
            quote_url: payload.quote_url || null,
            proposal_url: payload.proposal_url || null,
            payment_url: payload.payment_url || null,
            policy_pdf_url: payload.policy_pdf_url || null,
        };

        await MysqlInsurerApiCredentialsModel.update(req.params.id, DBPayload);

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Insurer API credential updated successfully",
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
 * /admin/insurer-api-credentials/update-status/{id}:
 *   patch:
 *     tags:
 *       - Insurer API Credentials
 *     summary: Update credential status
 *     description: Enable or disable insurer API credential.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 2
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
 *                   example: Insurer API credential status updated successfully
 *
 *       500:
 *         description: Server error
 */
const updateStatus = async (req, res) => {
    try {
        await MysqlInsurerApiCredentialsModel.update(req.params.id, {
            is_active: req.body.is_active,
        });

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Insurer API credential status updated successfully",
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