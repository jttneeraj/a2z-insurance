const moment = require("moment");
const { Sequelize, Op } = require("sequelize");
const {
    MysqlApiAepsAgentRegistrationModel,
    mysqldb,
} = require("../models/mysqldb/api-aeps-agent-registration");
const { MysqlUserModel } = require("../models/mysqldb/user");
const { insuranceAuthLogin } = require("../services/third-party");
const { ResponseHandler } = require("../utils/response-handler");
const {
    MysqlTransactionTypeModel,
} = require("../models/mysqldb/transaction-type");

/**
 * @openapi
 * /aeps-api/insurance/auth-login:
 *   post:
 *     tags:
 *       - CMS
 *     summary: View whitelist accounts and active banks
 *     description: Fetches whitelist accounts and active banks for making payment loads.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               selected_bank_amount:
 *                 type: number
 *                 description: The selected bank amount.
 *               selected_mode:
 *                 type: string
 *                 description: The selected mode (e.g., BC_POINT or OTHER_PAYMENT).
 *               display_change_or_commission:
 *                 type: boolean
 *                 description: Whether to display change or commission.
 *     responses:
 *       200:
 *         description: Returns a list of whitelist accounts and active banks.
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
 *                 result:
 *                   type: object
 *                   properties:
 *                     selected_bank_amount:
 *                       type: number
 *                     selected_mode:
 *                       type: string
 *                     display_change_or_commission:
 *                       type: boolean
 *                     whitelist_accounts:
 *                       type: array
 *                       items:
 *                         type: object
 *                     bank_list:
 *                       type: array
 *                       items:
 *                         type: object
 *       400:
 *         description: No whitelist account found.
 *       500:
 *         description: Failed to fetch banks.
 */

const authLogin = async (req, res) => {
    console.log('-------------------Insurance authLogin called------------------');

    const userdata = req.headers.userdata;
    const user = JSON.parse(userdata);
    const userId = user.id;
    try {
        if (!userId) {
            return res.status(401).json({ status: 0, message: 'Unauthorized' });
        }
        // const userDetails = await MysqlUserModel.findOneById(
        //     ['id', 'aeps_kyc', 'is_aeps_onboard'],
        //     userId
        // ); 

        const userDetails = await MysqlUserModel.getAepsKycAndPermission(
            userId
        );

        console.log("🚀 ~ authLogin ~ userDetails:", userDetails)

        if (!userDetails) {
            return new ResponseHandler(res).error({

                message: "User not found",
            });
        }

        return await redirection(userDetails[0], req, res, "WEB");
    } catch (err) {
        console.error("AEPS line 105 autologin error:", err);
        return new ResponseHandler(res).error({

            message: "Internal Server Error",
        });

    }
};

const redirection = async (userDetails, req, res, mode) => {
    console.log('in the redirection function');

    try {
        // if (userDetails.id !== 16) {
        //     const isActiveService = await getServiceWithCondition({ api_id: 149 });

        //     if (isActiveService.distributon_status_id === 0) {
        //         return res.json({
        //             status: 2,
        //             url: '',
        //             message: isActiveService.message
        //         });
        //     }
        // }

        if (userDetails.id !== 16) {
            const transactionType = await MysqlTransactionTypeModel.findOne({
                attributes: ["distribution_sevice_status", "message"],
                conditions: { name: "CMS" },
            });
            if (!transactionType) {
                return new ResponseHandler(res).failure({
                    message: req.t("SERVICE_NOT_fOUND"),
                });
            }

            console.log('transactionType --->', transactionType);


            if (transactionType.distribution_sevice_status !== "UP") {
                console.log('-----------------line 145 ------------------');

                return new ResponseHandler(res).failure({
                    message: transactionType.message,
                });
            }
        }

        const aepsKyc = String(userDetails.aeps_kyc || "").trim().toUpperCase();
        console.log("line 154 Normalized aepsKyc --->", aepsKyc);

        if (!["1", "VERIFIED"].includes(aepsKyc)) {
            return new ResponseHandler(res).failure({
                message: "You have not done your Aeps Kyc",
            });
        }

        const isAepsOnboard = String(userDetails.aeps_onboard || "").trim().toUpperCase();
        console.log("🚀 ~ redirection ~ isAepsOnboard:", isAepsOnboard)
        if (!["1", "YES"].includes(isAepsOnboard)) {
            return new ResponseHandler(res).failure({

                message: "Your Service is not activated.",
            });
        }

        // location check
        const lat = req.body.lat || null;
        const long = req.body.long || null;
        /*  if (!lat || !long) {
             return new ResponseHandler(res).failure({ 
                 message: "Your location not found.",
             });
         } */

        // Get merchant details
        const merchantDetails = await MysqlApiAepsAgentRegistrationModel.findOne(
            ['merchant_login_id'],
            {
                user_id: 1,
                agent_id: userDetails.id
            }
        );

        if (!merchantDetails) {
            return new ResponseHandler(res).failure({
                message: "Check your AEPS KYC or contact help-desk.",
            });
        }

        const merchantId = merchantDetails.merchant_login_id;

        // call external API
        const insurance_super_mercahnt_id = process.env.INSURANCE_SUPER_MERCHANT_ID;
        const insurance_super_merchant_username = process.env.INSURANCE_SUPER_MERCHANT_USERNAME;
        const insurance_super_merchant_key = process.env.INSURANCE_SUPER_MERCHANT_KEY;
        const insurance_base_url = process.env.INSURANCE_BASE_URL;

        const vendorApiResp = await insuranceAuthLogin({
            insurance_base_url,
            insurance_super_merchant_key,
            merchant_id: merchantId,
            insurance_super_merchant_username,
            insurance_super_mercahnt_id,
        });

        console.log("🚀 ~line 211 insurance.js in AEPS redirection ~ vendorApiResp:", vendorApiResp)

        // const value = JSON.parse(vendorApiResp);

        let value;
        try {
            value = typeof vendorApiResp === "string"
                ? JSON.parse(vendorApiResp)
                : vendorApiResp;
        } catch (err) {
            console.error("Line 218 JSON parse error:", err);
            value = {
                status: 0,
                message: "Failed to parse response",
                data: "",
            };
        }

       
        if (value.status !== 1) {
            return new ResponseHandler(res).failure({
                message: value.message || "Internal Server Error",
            });
        }


        return new ResponseHandler(res).success({
            error: error,
            status: status,
            message: value.message,
            url: value.data
        });


    } catch (err) {
        console.error("redirection error:", err);
        return new ResponseHandler(res).error({
            message: "Internal Server Error",
        });
    }
};

module.exports = {
    authLogin,
};


