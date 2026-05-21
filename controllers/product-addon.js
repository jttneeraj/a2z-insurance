const { Op } = require("sequelize");
const { MysqlProductAddonsModel } = require("../models/mysqldb/product-addon");
const { MysqlInsuranceProductsModel } = require("../models/mysqldb/insurance-product");
const { MysqlInsurerProductsModel } = require("../models/mysqldb/insurer-product");
const { MysqlAddonsModel } = require("../models/mysqldb/addon");
const CommonService = require("../services/common");

/**
 * @openapi
 * /admin/product-addons/add:
 *   post:
 *     tags:
 *       - Product Addons
 *     summary: Add product addon
 *     description: Add mapping between product, insurer product and addon.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - product_id
 *               - insurer_product_id
 *               - addon_id
 *             properties:
 *               product_id:
 *                 type: integer
 *               insurer_product_id:
 *                 type: integer
 *               addon_id:
 *                 type: integer
 *               insurer_addon_code:
 *                 type: string
 *               is_mandatory:
 *                 type: integer
 *                 example: 0
 *               is_active:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       200:
 *         description: Product addon added successfully
 *       400:
 *         description: Invalid product / insurer product / addon OR duplicate mapping
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

        const addon = await MysqlAddonsModel.findById(payload.addon_id);
        if (!addon) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Invalid addon",
            });
        }

        const existing = await MysqlProductAddonsModel.findByQuery({
            product_id: payload.product_id,
            insurer_product_id: payload.insurer_product_id,
            addon_id: payload.addon_id,
        });

        if (existing) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Product addon mapping already exists",
            });
        }

        const DBPayload = {
            product_id: payload.product_id,
            insurer_product_id: payload.insurer_product_id,
            addon_id: payload.addon_id,
            insurer_addon_code: payload.insurer_addon_code || null,
            is_mandatory: payload.is_mandatory !== undefined ? payload.is_mandatory : 0,
            is_active: payload.is_active !== undefined ? payload.is_active : 1,
        };

        const result = await MysqlProductAddonsModel.add(DBPayload);

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Product addon added successfully",
            result,
        });
    } catch (error) {
        console.log(error);
        CommonService.errorHandler(error, {
            url: "/admin/product-addons/add",
            operation: "ADD PRODUCT ADDON",
            relative_detail: "Error occurred during adding product addon",
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
 * /admin/product-addons/list:
 *   post:
 *     tags:
 *       - Product Addons
 *     summary: List product addons
 *     description: Fetch product addon list with filters and pagination.
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
 *               addon_id:
 *                 type: integer
 *               is_active:
 *                 type: integer
 *               search:
 *                 type: string
 *                 description: Search by insurer addon code
 *               start:
 *                 type: integer
 *                 example: 0
 *               limit:
 *                 type: integer
 *                 example: 10
 *     responses:
 *       200:
 *         description: Product addons fetched successfully
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
        if (payload.addon_id) conditions.addon_id = payload.addon_id;
        if (payload.is_active !== undefined) conditions.is_active = payload.is_active;

        if (payload.search) {
            conditions[Op.or] = [
                { insurer_addon_code: { [Op.like]: `%${payload.search}%` } },
            ];
        }

        const count = await MysqlProductAddonsModel.findAllCount(conditions);

        const result = await MysqlProductAddonsModel.find(
            null,
            conditions,
            [["id", "DESC"]],
            start,
            limit
        );

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Product addons fetched successfully",
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
 * /admin/product-addons/{id}:
 *   get:
 *     tags:
 *       - Product Addons
 *     summary: Get product addon detail
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Product addon fetched successfully
 *       404:
 *         description: Product addon not found
 *       500:
 *         description: Something went wrong
 */
const detail = async (req, res) => {
    try {
        const result = await MysqlProductAddonsModel.findById(req.params.id);

        if (!result) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Product addon not found",
            });
        }

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Product addon fetched successfully",
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
 * /admin/product-addons/update/{id}:
 *   put:
 *     tags:
 *       - Product Addons
 *     summary: Update product addon
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
 *               addon_id:
 *                 type: integer
 *               insurer_addon_code:
 *                 type: string
 *               is_mandatory:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Product addon updated successfully
 *       404:
 *         description: Product addon not found
 *       500:
 *         description: Something went wrong
 */
const update = async (req, res) => {
    const payload = req.body;

    try {
        const existing = await MysqlProductAddonsModel.findById(req.params.id);

        if (!existing) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Product addon not found",
            });
        }

        const DBPayload = {
            product_id: payload.product_id,
            insurer_product_id: payload.insurer_product_id,
            addon_id: payload.addon_id,
            insurer_addon_code: payload.insurer_addon_code || null,
            is_mandatory: payload.is_mandatory !== undefined ? payload.is_mandatory : 0,
        };

        await MysqlProductAddonsModel.update(req.params.id, DBPayload);

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Product addon updated successfully",
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
 * /admin/product-addons/update-status/{id}:
 *   patch:
 *     tags:
 *       - Product Addons
 *     summary: Update product addon status
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
 *         description: Product addon status updated successfully
 *       500:
 *         description: Something went wrong
 */
const updateStatus = async (req, res) => {
    try {
        await MysqlProductAddonsModel.update(req.params.id, {
            is_active: req.body.is_active,
        });

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Product addon status updated successfully",
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