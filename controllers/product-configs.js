const { Op, Sequelize } = require("sequelize");
const { MysqlProductConfigsModel } = require("../models/mysqldb/product-config");
const { MysqlInsuranceProductsModel } = require("../models/mysqldb/insurance-product");
const { MysqlInsurerProductsModel } = require("../models/mysqldb/insurer-product");
const CommonService = require("../services/common");

/**
 * @openapi
 * /admin/product-configs/add:
 *   post:
 *     tags:
 *       - Product Configs
 *     summary: Add product config
 *     description: Create configuration for a product and insurer product combination.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - product_id
 *               - insurer_product_id
 *             properties:
 *               product_id:
 *                 type: integer
 *               insurer_product_id:
 *                 type: integer
 *               min_vehicle_age:
 *                 type: integer
 *                 example: 0
 *               max_vehicle_age:
 *                 type: integer
 *                 example: 15
 *               policy_duration:
 *                 type: integer
 *                 example: 1
 *               inspection_required:
 *                 type: integer
 *                 example: 0
 *               kyc_required:
 *                 type: integer
 *                 example: 1
 *               payment_required:
 *                 type: integer
 *                 example: 1
 *               is_active:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       200:
 *         description: Product config added successfully
 *       400:
 *         description: Invalid product / insurer product OR config already exists
 *       500:
 *         description: Something went wrong
 */
const add = async (req, res) => {
    const payload = req.body;

    try {
        const product = await MysqlInsuranceProductsModel.findById(payload.product_id);

        if (!product) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Invalid product",
            });
        }

        const insurerProduct = await MysqlInsurerProductsModel.findById(payload.insurer_product_id);

        if (!insurerProduct) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Invalid insurer product",
            });
        }

        const existing = await MysqlProductConfigsModel.findByQuery({
            product_id: payload.product_id,
            insurer_product_id: payload.insurer_product_id,
        });

        if (existing) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Product config already exists",
            });
        }

        const DBPayload = {
            product_id: payload.product_id,
            insurer_product_id: payload.insurer_product_id,
            min_vehicle_age: payload.min_vehicle_age || 0,
            max_vehicle_age: payload.max_vehicle_age || 0,
            policy_duration: payload.policy_duration || 1,
            inspection_required: payload.inspection_required !== undefined ? payload.inspection_required : 0,
            kyc_required: payload.kyc_required !== undefined ? payload.kyc_required : 1,
            payment_required: payload.payment_required !== undefined ? payload.payment_required : 1,
            is_active: payload.is_active !== undefined ? payload.is_active : 1,
        };

        const result = await MysqlProductConfigsModel.add(DBPayload);

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Product config added successfully",
            result,
        });
    } catch (error) {
        console.log(error);
        CommonService.errorHandler(error, {
            url: "/admin/product-configs/add",
            operation: "ADD PRODUCT CONFIG",
            relative_detail: "Error occurred during adding product config",
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
 * /admin/product-configs/list:
 *   post:
 *     tags:
 *       - Product Configs
 *     summary: List product configs
 *     description: Fetch product configuration list with filters and pagination.
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               product_id:
 *                 type: integer
 *               insurer_product_id:
 *                 type: integer
 *               is_active:
 *                 type: integer
 *               start:
 *                 type: integer
 *                 example: 0
 *               limit:
 *                 type: integer
 *                 example: 10
 *     responses:
 *       200:
 *         description: Product configs fetched successfully
 *       500:
 *         description: Something went wrong
 */
const list = async (req, res) => {
    const payload = req.body;

    try {
        const start = payload.start || 0;
        const limit = payload.limit || 10;

        const conditions = {};

        if (payload.product_id) conditions.product_id = payload.product_id;
        if (payload.insurer_product_id) conditions.insurer_product_id = payload.insurer_product_id;
        if (payload.is_active !== undefined) conditions.is_active = payload.is_active;

        const count = await MysqlProductConfigsModel.findAllCount(conditions);

        const result = await MysqlProductConfigsModel.find(
            null,
            conditions,
            [["id", "DESC"]],
            start,
            limit
        );

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Product configs fetched successfully",
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
 * /admin/product-configs/{id}:
 *   get:
 *     tags:
 *       - Product Configs
 *     summary: Get product config detail
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Product config fetched successfully
 *       404:
 *         description: Product config not found
 *       500:
 *         description: Something went wrong
 */
const detail = async (req, res) => {
    try {
        const result = await MysqlProductConfigsModel.findById(req.params.id);

        if (!result) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Product config not found",
            });
        }

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Product config fetched successfully",
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
 * /admin/product-configs/update/{id}:
 *   put:
 *     tags:
 *       - Product Configs
 *     summary: Update product config
 *     description: Update configuration values for a product config.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               product_id:
 *                 type: integer
 *               insurer_product_id:
 *                 type: integer
 *               min_vehicle_age:
 *                 type: integer
 *               max_vehicle_age:
 *                 type: integer
 *               policy_duration:
 *                 type: integer
 *               inspection_required:
 *                 type: integer
 *               kyc_required:
 *                 type: integer
 *               payment_required:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Product config updated successfully
 *       404:
 *         description: Product config not found
 *       500:
 *         description: Something went wrong
 */
const update = async (req, res) => {
    const payload = req.body;

    try {
        const existing = await MysqlProductConfigsModel.findById(req.params.id);

        if (!existing) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Product config not found",
            });
        }

        const DBPayload = {
            product_id: payload.product_id,
            insurer_product_id: payload.insurer_product_id,
            min_vehicle_age: payload.min_vehicle_age || 0,
            max_vehicle_age: payload.max_vehicle_age || 0,
            policy_duration: payload.policy_duration || 1,
            inspection_required: payload.inspection_required !== undefined ? payload.inspection_required : 0,
            kyc_required: payload.kyc_required !== undefined ? payload.kyc_required : 1,
            payment_required: payload.payment_required !== undefined ? payload.payment_required : 1,
        };

        await MysqlProductConfigsModel.update(req.params.id, DBPayload);

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Product config updated successfully",
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
 * /admin/product-configs/update-status/{id}:
 *   patch:
 *     tags:
 *       - Product Configs
 *     summary: Update product config status
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
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
 *                 example: 1
 *     responses:
 *       200:
 *         description: Product config status updated successfully
 *       500:
 *         description: Something went wrong
 */
const updateStatus = async (req, res) => {
    try {
        await MysqlProductConfigsModel.update(req.params.id, {
            is_active: req.body.is_active,
        });

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Product config status updated successfully",
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