const { Op } = require("sequelize");
const { MysqlProductDocumentRequirementsModel } = require("../models/mysqldb/product-document-requirement");
const CommonService = require("../services/common");

/**
 * @openapi
 * /admin/product-document-requirements/add:
 *   post:
 *     tags:
 *       - Product Document Requirements
 *     summary: Add product document requirement
 *     description: Create document requirement mapping for a product and insurer product.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - product_id
 *               - insurer_product_id
 *               - document_code
 *               - document_name
 *             properties:
 *               product_id:
 *                 type: integer
 *               insurer_product_id:
 *                 type: integer
 *               document_code:
 *                 type: string
 *               document_name:
 *                 type: string
 *               is_required:
 *                 type: integer
 *                 example: 1
 *               is_active:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       200:
 *         description: Product document requirement added successfully
 *       400:
 *         description: Document requirement already exists
 *       500:
 *         description: Something went wrong
 */

const add = async (req, res) => {
    const payload = req.body;

    try {
        const existing = await MysqlProductDocumentRequirementsModel.findByQuery({
            product_id: payload.product_id,
            insurer_product_id: payload.insurer_product_id,
            document_code: payload.document_code,
        });

        if (existing) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Document requirement already exists",
            });
        }

        const DBPayload = {
            product_id: payload.product_id,
            insurer_product_id: payload.insurer_product_id,
            document_code: payload.document_code,
            document_name: payload.document_name,
            is_required: payload.is_required !== undefined ? payload.is_required : 1,
            is_active: payload.is_active !== undefined ? payload.is_active : 1,
        };

        const result = await MysqlProductDocumentRequirementsModel.add(DBPayload);

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Product document requirement added successfully",
            result,
        });
    } catch (error) {
        console.log(error);
        CommonService.errorHandler(error, {
            url: "/admin/product-document-requirements/add",
            operation: "ADD PRODUCT DOCUMENT REQUIREMENT",
            relative_detail: "Error occurred during adding product document requirement",
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
 * /admin/product-document-requirements/list:
 *   post:
 *     tags:
 *       - Product Document Requirements
 *     summary: List product document requirements
 *     description: Fetch document requirements with filters and pagination.
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
 *               search:
 *                 type: string
 *                 description: Search by document code or name
 *               start:
 *                 type: integer
 *                 example: 0
 *               limit:
 *                 type: integer
 *                 example: 10
 *     responses:
 *       200:
 *         description: Product document requirements fetched successfully
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

        if (payload.search) {
            conditions[Op.or] = [
                { document_code: { [Op.like]: `%${payload.search}%` } },
                { document_name: { [Op.like]: `%${payload.search}%` } },
            ];
        }

        const count = await MysqlProductDocumentRequirementsModel.findAllCount(conditions);

        const result = await MysqlProductDocumentRequirementsModel.find(
            null,
            conditions,
            [["id", "DESC"]],
            start,
            limit
        );

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Product document requirements fetched successfully",
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
 * /admin/product-document-requirements/{id}:
 *   get:
 *     tags:
 *       - Product Document Requirements
 *     summary: Get product document requirement detail
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Product document requirement fetched successfully
 *       404:
 *         description: Product document requirement not found
 *       500:
 *         description: Something went wrong
 */
const detail = async (req, res) => {
    try {
        const result = await MysqlProductDocumentRequirementsModel.findById(req.params.id);

        if (!result) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Product document requirement not found",
            });
        }

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Product document requirement fetched successfully",
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
 * /admin/product-document-requirements/update/{id}:
 *   put:
 *     tags:
 *       - Product Document Requirements
 *     summary: Update product document requirement
 *     description: Update document requirement mapping.
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
 *               document_code:
 *                 type: string
 *               document_name:
 *                 type: string
 *               is_required:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Product document requirement updated successfully
 *       404:
 *         description: Product document requirement not found
 *       500:
 *         description: Something went wrong
 */

const update = async (req, res) => {
    const payload = req.body;

    try {
        const existing = await MysqlProductDocumentRequirementsModel.findById(req.params.id);

        if (!existing) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Product document requirement not found",
            });
        }

        const DBPayload = {
            product_id: payload.product_id,
            insurer_product_id: payload.insurer_product_id,
            document_code: payload.document_code,
            document_name: payload.document_name,
            is_required: payload.is_required !== undefined ? payload.is_required : 1,
        };

        await MysqlProductDocumentRequirementsModel.update(req.params.id, DBPayload);

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Product document requirement updated successfully",
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
 * /admin/product-document-requirements/update-status/{id}:
 *   patch:
 *     tags:
 *       - Product Document Requirements
 *     summary: Update product document requirement status
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
 *         description: Product document requirement status updated successfully
 *       500:
 *         description: Something went wrong
 */
const updateStatus = async (req, res) => {
    try {
        await MysqlProductDocumentRequirementsModel.update(req.params.id, {
            is_active: req.body.is_active,
        });

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Product document requirement status updated successfully",
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