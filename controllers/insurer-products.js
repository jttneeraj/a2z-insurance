const moment = require("moment");
const { Sequelize, Op } = require("sequelize");
const {
    MysqlInsurerProductsModel,
    mysqldb,
} = require("../models/mysqldb/insurer-product"); 

const { MysqlInsurersModel } = require("../models/mysqldb/insurer"); 
const { MysqlInsuranceProductsModel } = require("../models/mysqldb/insurance-product"); 


const { ResponseHandler } = require("../utils/response-handler");

/**
 * @openapi
 * /admin/insurer-products/add:
 *   post:
 *     tags:
 *       - Insurer Products
 *     summary: Map insurer with product
 *     description: Create a mapping between insurer and insurance product.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - insurer_id
 *               - product_id
 *               - insurer_product_code
 *             properties:
 *               insurer_id:
 *                 type: integer
 *                 example: 1
 *               product_id:
 *                 type: integer
 *                 example: 10
 *               insurer_product_code:
 *                 type: string
 *                 example: ICICI_CAR_COMP
 *               api_product_code:
 *                 type: string
 *                 example: API123
 *               is_quote_enabled:
 *                 type: integer
 *                 enum: [0, 1]
 *                 example: 1
 *               is_policy_enabled:
 *                 type: integer
 *                 enum: [0, 1]
 *                 example: 1
 *               is_active:
 *                 type: integer
 *                 enum: [0, 1]
 *                 example: 1
 *
 *     responses:
 *       200:
 *         description: Mapping created successfully
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
 *                   example: Insurer product added successfully
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
 *                     invalidProduct:
 *                       value: Invalid product
 *                     duplicateMapping:
 *                       value: Insurer product mapping already exists
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

        const product = await MysqlInsuranceProductsModel.findById(
            payload.product_id
        );

        if (!product) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Invalid product",
            });
        }

        const existing = await MysqlInsurerProductsModel.findByQuery({
            insurer_id: payload.insurer_id,
            product_id: payload.product_id,
        });

        if (existing) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Insurer product mapping already exists",
            });
        }

        const DBPayload = {
            insurer_id: payload.insurer_id,
            product_id: payload.product_id,
            insurer_product_code: payload.insurer_product_code,
            api_product_code: payload.api_product_code || null,
            is_quote_enabled:
                payload.is_quote_enabled !== undefined
                    ? payload.is_quote_enabled
                    : 1,
            is_policy_enabled:
                payload.is_policy_enabled !== undefined
                    ? payload.is_policy_enabled
                    : 1,
            is_active: payload.is_active !== undefined ? payload.is_active : 1,
        };

        const result = await MysqlInsurerProductsModel.add(DBPayload);

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Insurer product added successfully",
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
 * /admin/insurer-products/list:
 *   post:
 *     tags:
 *       - Insurer Products
 *     summary: Get insurer product mappings
 *     description: Fetch paginated list of insurer-product mappings with filters.
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
 *               product_id:
 *                 type: integer
 *                 example: 10
 *               is_active:
 *                 type: integer
 *                 enum: [0, 1]
 *                 example: 1
 *
 *     responses:
 *       200:
 *         description: Insurer products fetched successfully
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
 *                   example: Insurer products fetched successfully
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

        if (payload.insurer_id) {
            conditions.insurer_id = payload.insurer_id;
        }

        if (payload.product_id) {
            conditions.product_id = payload.product_id;
        }

        if (payload.is_active !== undefined) {
            conditions.is_active = payload.is_active;
        }

        const count = await MysqlInsurerProductsModel.findAllCount(conditions);

        const result = await MysqlInsurerProductsModel.find(
            null,
            conditions,
            [["id", "DESC"]],
            start,
            limit
        );

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Insurer products fetched successfully",
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
 * /admin/insurer-products/{id}:
 *   get:
 *     tags:
 *       - Insurer Products
 *     summary: Get insurer product mapping detail
 *     description: Fetch a single insurer-product mapping by ID.
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
 *         description: Mapping fetched successfully
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
 *                   example: Insurer product fetched successfully
 *                 result:
 *                   type: object
 *
 *       404:
 *         description: Mapping not found
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
 *                   example: Insurer product not found
 *
 *       500:
 *         description: Server error
 */
const detail = async (req, res) => {
    try {
        const result = await MysqlInsurerProductsModel.findById(req.params.id);

        if (!result) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Insurer product not found",
            });
        }

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Insurer product fetched successfully",
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
 * /admin/insurer-products/update/{id}:
 *   put:
 *     tags:
 *       - Insurer Products
 *     summary: Update insurer product mapping
 *     description: Update mapping between insurer and product.
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
 *               - product_id
 *               - insurer_product_code
 *             properties:
 *               insurer_id:
 *                 type: integer
 *                 example: 1
 *               product_id:
 *                 type: integer
 *                 example: 10
 *               insurer_product_code:
 *                 type: string
 *                 example: UPDATED_CODE
 *               api_product_code:
 *                 type: string
 *               is_quote_enabled:
 *                 type: integer
 *                 enum: [0, 1]
 *               is_policy_enabled:
 *                 type: integer
 *                 enum: [0, 1]
 *
 *     responses:
 *       200:
 *         description: Mapping updated successfully
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
 *                   example: Insurer product updated successfully
 *
 *       404:
 *         description: Mapping not found
 *
 *       500:
 *         description: Server error
 */
const update = async (req, res) => {
    const payload = req.body;

    try {
        const id = req.params.id;

        const existing = await MysqlInsurerProductsModel.findById(id);

        if (!existing) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Insurer product not found",
            });
        }

        const DBPayload = {
            insurer_id: payload.insurer_id,
            product_id: payload.product_id,
            insurer_product_code: payload.insurer_product_code,
            api_product_code: payload.api_product_code || null,
            is_quote_enabled:
                payload.is_quote_enabled !== undefined
                    ? payload.is_quote_enabled
                    : 1,
            is_policy_enabled:
                payload.is_policy_enabled !== undefined
                    ? payload.is_policy_enabled
                    : 1,
        };

        await MysqlInsurerProductsModel.update(id, DBPayload);

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Insurer product updated successfully",
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
 * /admin/insurer-products/update-status/{id}:
 *   patch:
 *     tags:
 *       - Insurer Products
 *     summary: Update insurer product status
 *     description: Enable or disable insurer-product mapping.
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
 *                   example: Insurer product status updated successfully
 *
 *       500:
 *         description: Server error
 */
const updateStatus = async (req, res) => {
    try {
        await MysqlInsurerProductsModel.update(req.params.id, {
            is_active: req.body.is_active,
        });

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Insurer product status updated successfully",
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