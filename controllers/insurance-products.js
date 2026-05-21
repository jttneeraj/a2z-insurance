const moment = require("moment");
const { Sequelize, Op } = require("sequelize");
const {
    MysqlInsuranceProductsModel,
    mysqldb,
} = require("../models/mysqldb/insurance-product");
const { MysqlInsuranceTypesModel } = require("../models/mysqldb/insurance-type"); 
const { ResponseHandler } = require("../utils/response-handler");
 

/**
 * @openapi
 * /admin/insurance-products/add:
 *   post:
 *     tags:
 *       - Insurance Products
 *     summary: Add new insurance product
 *     description: Create a new insurance product linked to an insurance type.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - insurance_type_id
 *               - name
 *               - code
 *             properties:
 *               insurance_type_id:
 *                 type: integer
 *                 example: 1
 *               name:
 *                 type: string
 *                 example: Comprehensive Car Insurance
 *               code:
 *                 type: string
 *                 example: COMP_CAR
 *               category:
 *                 type: string
 *                 example: Motor
 *               description:
 *                 type: string
 *                 example: Covers damages and third-party liability
 *               is_active:
 *                 type: integer
 *                 enum: [0, 1]
 *                 example: 1
 *
 *     responses:
 *       200:
 *         description: Insurance product added successfully
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
 *                   example: Insurance product added successfully
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
 *                     invalidType:
 *                       value: Invalid insurance type
 *                     duplicateCode:
 *                       value: Product code already exists
 *
 *       500:
 *         description: Server error
 */
 
const add = async (req, res) => {
    const payload = req.body;

    try {
        const insuranceType = await MysqlInsuranceTypesModel.findById(
            payload.insurance_type_id
        );

        if (!insuranceType) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Invalid insurance type",
            });
        }

        const existing = await MysqlInsuranceProductsModel.findByQuery({
            code: payload.code,
        });

        if (existing) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Product code already exists",
            });
        }

        const DBPayload = {
            insurance_type_id: payload.insurance_type_id,
            name: payload.name,
            code: payload.code,
            category: payload.category || null,
            description: payload.description || null,
            is_active: payload.is_active !== undefined ? payload.is_active : 1,
        };

        const result = await MysqlInsuranceProductsModel.add(DBPayload);

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Insurance product added successfully",
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
 * /admin/insurance-products/list:
 *   post:
 *     tags:
 *       - Insurance Products
 *     summary: Get insurance products list
 *     description: Fetch paginated list of insurance products with filters.
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
 *               insurance_type_id:
 *                 type: integer
 *                 example: 1
 *               is_active:
 *                 type: integer
 *                 enum: [0, 1]
 *                 example: 1
 *               search:
 *                 type: string
 *                 example: motor
 *
 *     responses:
 *       200:
 *         description: Insurance products fetched successfully
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
 *                   example: Insurance products fetched successfully
 *                 count:
 *                   type: integer
 *                   example: 100
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

        if (payload.insurance_type_id) {
            conditions.insurance_type_id = payload.insurance_type_id;
        }

        if (payload.is_active !== undefined) {
            conditions.is_active = payload.is_active;
        }

        if (payload.search) {
            conditions[Op.or] = [
                { name: { [Op.like]: `%${payload.search}%` } },
                { code: { [Op.like]: `%${payload.search}%` } },
                { category: { [Op.like]: `%${payload.search}%` } },
            ];
        }

        const count = await MysqlInsuranceProductsModel.findAllCount(conditions);

        const result = await MysqlInsuranceProductsModel.find(
            null,
            conditions,
            [["id", "DESC"]],
            start,
            limit
        );

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Insurance products fetched successfully",
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
 * /admin/insurance-products/{id}:
 *   get:
 *     tags:
 *       - Insurance Products
 *     summary: Get insurance product detail
 *     description: Fetch a single insurance product by ID.
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
 *         description: Insurance product fetched successfully
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
 *                   example: Insurance product fetched successfully
 *                 result:
 *                   type: object
 *
 *       404:
 *         description: Insurance product not found
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
 *                   example: Insurance product not found
 *
 *       500:
 *         description: Server error
 */
const detail = async (req, res) => {
    try {
        const result = await MysqlInsuranceProductsModel.findById(req.params.id);

        if (!result) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Insurance product not found",
            });
        }

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Insurance product fetched successfully",
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
 * /admin/insurance-products/update/{id}:
 *   put:
 *     tags:
 *       - Insurance Products
 *     summary: Update insurance product
 *     description: Update insurance product details.
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
 *               - insurance_type_id
 *               - name
 *               - code
 *             properties:
 *               insurance_type_id:
 *                 type: integer
 *                 example: 1
 *               name:
 *                 type: string
 *                 example: Third Party Insurance
 *               code:
 *                 type: string
 *                 example: TP_ONLY
 *               category:
 *                 type: string
 *               description:
 *                 type: string
 *
 *     responses:
 *       200:
 *         description: Insurance product updated successfully
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
 *                   example: Insurance product updated successfully
 *
 *       404:
 *         description: Insurance product not found
 *
 *       500:
 *         description: Server error
 */
const update = async (req, res) => {
    const payload = req.body;

    try {
        const id = req.params.id;

        const existing = await MysqlInsuranceProductsModel.findById(id);

        if (!existing) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Insurance product not found",
            });
        }

        const DBPayload = {
            insurance_type_id: payload.insurance_type_id,
            name: payload.name,
            code: payload.code,
            category: payload.category || null,
            description: payload.description || null,
        };

        await MysqlInsuranceProductsModel.update(id, DBPayload);

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Insurance product updated successfully",
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
 * /admin/insurance-products/update-status/{id}:
 *   patch:
 *     tags:
 *       - Insurance Products
 *     summary: Update insurance product status
 *     description: Enable or disable an insurance product.
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
 *                   example: Insurance product status updated successfully
 *
 *       500:
 *         description: Server error
 */
const updateStatus = async (req, res) => {
    try {
        await MysqlInsuranceProductsModel.update(req.params.id, {
            is_active: req.body.is_active,
        });

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Insurance product status updated successfully",
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
