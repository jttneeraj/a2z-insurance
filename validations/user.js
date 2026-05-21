const { check, param, checkExact } = require('express-validator');
const { MysqlUserModel } = require("../models/mysqldb/user");
const { Op } = require('sequelize');
const CommonService = require('../services/common');


const userListValidation = [
    check('role_id').custom((value, { req }) => {
        if (value) {
            var regEx = /^[0-9]+$/;
            if (!regEx.test(value))
                throw new Error("Invalid format of role ID value");
            if (value < 0) {
                throw new Error("Invalid value of role ID");
            }
        }
        return true
    }),
    check('sort_field').custom((value, { req }) => {
        if (value) {
            const allowed_criteria = ['id'];
            if (!allowed_criteria.includes(value))
                throw new Error("Invalid sort_field value, only allowed " + allowed_criteria.toString());
        }
        return true
    }),
    check('sort_order').custom((value, { req }) => {
        if (value) {
            const allowed_criteria = ["DESC", "ASC"];
            if (!allowed_criteria.includes(value))
                throw new Error("Invalid sort_order value, only allowed " + allowed_criteria.toString());
        }
        return true
    }),
    check('filter.status').custom((value, { req }) => {
        if (value) {
            const allowed_criteria = ["ACTIVE", "INACTIVE"];
            if (!allowed_criteria.includes(value))
                throw new Error("Invalid status value, only allowed " + allowed_criteria.toString());
        }
        return true
    }),
    check('filter.account_number').custom((value, { req }) => {
        if (value) {
            var regEx = /^[0-9a-zA-Z]+$/;
            if (!regEx.test(value))
                throw new Error("Invalid account_number format for User Id");
        }
        return true
    }),
    check('page').custom((value, { req }) => {
        if (value) {
            var regEx = /^[0-9]+$/;
            if (!regEx.test(value))
                throw new Error("Invalid format of page value");
            if (value < 0) {
                throw new Error("Invalid value of page");
            }
        }
        return true
    }),
    check('limit').custom((value, { req }) => {
        if (value) {
            var regEx = /^[0-9]+$/;
            if (!regEx.test(value))
                throw new Error("Invalid limit value");
            if (value < 0) {
                throw new Error("Invalid value of limit");
            }
        }
        return true
    }),
    check('total_records').custom((value, { req }) => {
        if (value) {
            var regEx = /^[0-9]+$/;
            if (!regEx.test(value))
                throw new Error("Invalid total_records value");
            if (value < 0) {
                throw new Error("Invalid value of total_records");
            }
        }
        return true
    }),
]


const userViewValidation = [
    param('id').notEmpty().trim().withMessage("Param Id is required").isInt().withMessage("Param id must be integer").custom(async (value, { req }) => {
        const result = await MysqlUserModel.findById(value, ['id']);
        if (!result) {
            throw new Error(req.t('USER_NOT_FOUND'));
        }
        return true
    }),
]
const userInfoUpdateValidation = [
    param('id').notEmpty().trim().withMessage("Param Id is required").isInt().withMessage("Param id must be integer").custom(async (value, { req }) => {
        const result = await MysqlUserModel.findById(value, ['id']);
        if (!result) {
            throw new Error(req.t('USER_NOT_FOUND'));
        }
        return true
    }),
    check('name').notEmpty().trim().withMessage('name filed is required')
        .isLength({ min: 3 }).withMessage("minimum length 3 is required")
        .isLength({ max: 35 }).withMessage("maximum length 35 is required")
        .escape(),
    check('email').notEmpty().trim().withMessage('email filed is required')
        .isLength({ min: 3 }).withMessage("minimum length 3 is required")
        .isLength({ max: 35 }).withMessage("maximum length 35 is required")
        .custom(async (value, { req }) => {
            let conditions = {};
            conditions.email = value
            const id = req.params.id;
            conditions.id = { [Op.not]: id }
            const is_data_exist = await MysqlUserModel.findByCondition(["id"], conditions);
            if (is_data_exist.length) {
                throw new Error("email id already exists")
            }
            return true;
        })
        .escape(),
    check('mobile').notEmpty().trim().withMessage("mobile is required")
        .isLength({ min: 10 }).withMessage("minimum length 10 is required")
        .isLength({ max: 10 }).withMessage("maximum length 10 is required")
        .custom(async (value, { req }) => {
            var regEx = /^[6-9]{1}[0-9]{9}$/;
            if (!regEx.test(value))
                throw new Error("Invalid format of mobile");
            let conditions = {};
            conditions.mobile = value
            const id = req.params.id;
            conditions.id = { [Op.not]: id }
            const is_data_exist = await MysqlUserModel.findByCondition(["id"], conditions);
            if (is_data_exist.length) {
                throw new Error("mobile already exists")
            }
            return true;
        }).escape(),
    check('reason').custom(async (value, { req }) => {
        const status = req.body.status;
        if (status == 'INACTIVE') {
            if (value == '' || value == undefined)
                throw new Error("reason field is required")
            if (value.length < 3)
                throw new Error("reason must contain atleast 3 char")
            if (value.length > 255)
                throw new Error("reason must contain almost 255 char")
        }
        return true;
    })
        .escape(),
    check('gender').notEmpty().trim().withMessage("gender field is required")
        .isIn(["MALE", "FEMALE", "OTHER"]).withMessage("Invalid value of gender")
        .escape(),
    check('is_login_permission').notEmpty().trim().withMessage("is login permission field is required")
        .isIn(["YES", "NO"]).withMessage("Invalid value of is_login_permission")
        .escape(),
    check('status').notEmpty().trim().withMessage("status is required")
        .isIn(["ACTIVE", "INACTIVE"]).withMessage("Invalid value of status")
        .escape(),
    check('remark').notEmpty().trim().withMessage("Remark is required")
        .isLength({ min: 3 }).withMessage("Remark, minimum length 3 is required")
        .isLength({ max: 255 }).withMessage("Remark, maximum length 255 is required")
        .escape(),
]

module.exports = {
    userListValidation,
    userViewValidation,
    userInfoUpdateValidation
}