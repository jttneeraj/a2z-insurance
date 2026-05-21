const { MysqlQuoteRequestsModel, mysqldb } = require("../models/mysqldb/quote-request");
const { MysqlQuoteInsurerRequestsModel } = require("../models/mysqldb/quote-insurer-request");
const { MysqlQuoteInsurerResponsesModel } = require("../models/mysqldb/quote-insurer-response");
const { MysqlQuoteResultsModel } = require("../models/mysqldb/quote-result");
const { MysqlQuoteSelectedPlanModel } = require("../models/mysqldb/quote-selected-plan");

const CommonService = require("../services/common");
const InsurerFactory = require("../services/insurers/insurer.factory");

/**
 * @openapi
 * /customer/motor/quotes/generate:
 *   post:
 *     tags:
 *       - Motor Quotes
 *     summary: Generate motor quote
 *     description: Generate motor insurance quote using selected insurer adapter. Supports MOCK_DIGIT for internal testing and DIGIT for real insurer integration.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - quote_request_id
 *             properties:
 *               quote_request_id:
 *                 type: integer
 *                 example: 3
 *               insurer_id:
 *                 type: integer
 *                 example: 3
 *               insurer_product_id:
 *                 type: integer
 *                 example: 1
 *               insurer_code:
 *                 type: string
 *                 example: MOCK_DIGIT
 *                 description: Use MOCK_DIGIT for mock flow or DIGIT for real Digit flow.
 *               environment:
 *                 type: string
 *                 example: UAT
 *                 description: Required only for real insurer API environment such as DIGIT UAT/PROD.
 *     responses:
 *       200:
 *         description: Motor quote generated successfully
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
 *                   example: Motor quote generated successfully
 *                 result:
 *                   type: object
 *                   properties:
 *                     quote_request_id:
 *                       type: integer
 *                       example: 3
 *                     quote_request_no:
 *                       type: string
 *                       example: QT-20260505-000003
 *                     quotes:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           quote_result_id:
 *                             type: integer
 *                             example: 10
 *                           insurer_id:
 *                             type: integer
 *                             example: 3
 *                           insurer_product_id:
 *                             type: integer
 *                             example: 1
 *                           insurer_quote_reference_no:
 *                             type: string
 *                             example: MOCK-QT-20260505-000003
 *                           plan_name:
 *                             type: string
 *                             example: Mock Motor Comprehensive
 *                           policy_type:
 *                             type: string
 *                             example: COMPREHENSIVE
 *                           idv:
 *                             type: number
 *                             example: 450000
 *                           final_premium:
 *                             type: number
 *                             example: 12173
 *                           currency:
 *                             type: string
 *                             example: INR
 *                           is_recommended:
 *                             type: integer
 *                             example: 1
 *       400:
 *         description: Validation error
 *       404:
 *         description: Quote request not found
 *       502:
 *         description: Insurer API failed or quote generation failed
 *       500:
 *         description: Server error
 */
const generate = async (req, res) => {
    const payload = req.body;
    
    console.log("🚀 ~ generate ~ payload:", payload)

    try {
        if (!payload.quote_request_id) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Quote request id is required",
            });
        }

        const quoteRequest = await MysqlQuoteRequestsModel.findById(payload.quote_request_id);

        if (!quoteRequest) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Quote request not found",
            });
        }

        const insurerId = payload.insurer_id || 1;
        const insurerProductId = payload.insurer_product_id || 1;
        const insurerCode = String(payload.insurer_code || "MOCK_DIGIT").trim().toUpperCase();

        const insurerQuoteService = InsurerFactory.getMotorQuoteService(insurerCode);

        const insurerQuote = await insurerQuoteService.generateMotorQuote({
            quoteRequest,
            insurerId,
            insurerProductId,
            payload,
        });

        const normalizedQuote =
            insurerQuote.normalized_quote ||
            insurerQuote.response_payload ||
            null;

        const rawResponse =
            insurerQuote.raw_response ||
            insurerQuote.raw_response_payload ||
            insurerQuote.response_payload ||
            null;

        const isInsurerQuoteSuccess =
            insurerQuote.response_status === "RECEIVED" &&
            normalizedQuote &&
            normalizedQuote.insurer_quote_reference_no;

        const transaction = await mysqldb.transaction();

        try {
            const insurerRequest = await MysqlQuoteInsurerRequestsModel.add(
                {
                    quote_request_id: quoteRequest.id,
                    insurer_id: insurerId,
                    insurer_product_id: insurerProductId,
                    request_reference_no: `REQ-${quoteRequest.quote_request_no}`,
                    api_endpoint: insurerQuote.api_endpoint,
                    request_payload: insurerQuote.request_payload,
                    request_headers: insurerQuote.request_headers || null,
                    request_status: insurerQuote.request_status || "SUCCESS",
                    requested_at: new Date(),
                    response_received_at: new Date(),
                    retry_count: 0,
                    error_message: null,
                },
                transaction
            );

            const insurerResponse = await MysqlQuoteInsurerResponsesModel.add(
                {
                    quote_insurer_request_id: insurerRequest.id,
                    quote_request_id: quoteRequest.id,
                    insurer_id: insurerId,
                    http_status_code: insurerQuote.http_status_code || 200,
                    response_payload: rawResponse,
                    response_status: isInsurerQuoteSuccess ? "RECEIVED" : "FAILED",
                    insurer_quote_reference_no:
                        normalizedQuote?.insurer_quote_reference_no || null,
                    error_code: insurerQuote.error_code || null,
                    error_message: isInsurerQuoteSuccess
                        ? null
                        : insurerQuote.error_message || "Insurer quote generation failed",
                    received_at: new Date(),
                },
                transaction
            );

            if (!isInsurerQuoteSuccess) {
                await transaction.commit();

                return res.status(502).json({
                    error: 1,
                    status: 0,
                    message: "Insurer quote generation failed",
                    result: {
                        quote_request_id: quoteRequest.id,
                        quote_request_no: quoteRequest.quote_request_no,
                        insurer_request_id: insurerRequest.id,
                        insurer_response_id: insurerResponse.id,
                        error_code: insurerQuote.error_code || null,
                        error_message:
                            insurerQuote.error_message || "Insurer quote generation failed",
                    },
                });
            }

            const quoteResult = await MysqlQuoteResultsModel.add(
                {
                    quote_request_id: quoteRequest.id,
                    insurer_id: insurerId,
                    insurer_product_id: insurerProductId,
                    quote_insurer_response_id: insurerResponse.id,
                    insurer_quote_reference_no: normalizedQuote.insurer_quote_reference_no,
                    plan_name: normalizedQuote.plan_name,
                    policy_type: normalizedQuote.policy_type,
                    idv: normalizedQuote.idv,
                    min_idv: normalizedQuote.min_idv,
                    max_idv: normalizedQuote.max_idv,
                    own_damage_premium: normalizedQuote.own_damage_premium,
                    third_party_premium: normalizedQuote.third_party_premium,
                    addon_premium: normalizedQuote.addon_premium,
                    discount_amount: normalizedQuote.discount_amount,
                    net_premium: normalizedQuote.net_premium,
                    gst_amount: normalizedQuote.gst_amount,
                    final_premium: normalizedQuote.final_premium,
                    currency: normalizedQuote.currency || "INR",
                    is_recommended: 1,
                    quote_valid_till: normalizedQuote.quote_valid_till,
                    result_status: "ACTIVE",
                },
                transaction
            );

            await MysqlQuoteRequestsModel.update(
                quoteRequest.id,
                {
                    quote_status: "QUOTE_GENERATED",
                },
                transaction
            );

            await transaction.commit();

            return res.status(200).json({
                error: 0,
                status: 1,
                message: "Motor quote generated successfully",
                result: {
                    quote_request_id: quoteRequest.id,
                    quote_request_no: quoteRequest.quote_request_no,
                    quotes: [
                        {
                            quote_result_id: quoteResult.id,
                            insurer_id: insurerId,
                            insurer_product_id: insurerProductId,
                            insurer_quote_reference_no: quoteResult.insurer_quote_reference_no,
                            plan_name: quoteResult.plan_name,
                            policy_type: quoteResult.policy_type,
                            idv: quoteResult.idv,
                            final_premium: quoteResult.final_premium,
                            currency: quoteResult.currency,
                            is_recommended: quoteResult.is_recommended,
                        },
                    ],
                },
            });
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (error) {
        console.log(error);

        CommonService.errorHandler(error, {
            url: "/customer/motor/quotes/generate",
            operation: "GENERATE MOTOR QUOTE",
            relative_detail: "Error occurred during motor quote generation",
        });

        if (error.insurer_error) {
            return res.status(error.http_status_code || 502).json({
                error: 1,
                status: 0,
                message: error.message || "Insurer API failed",
                insurer: error.insurer || "UNKNOWN",
                api: error.api || "UNKNOWN",
                http_status_code: error.http_status_code || null,
                insurer_response: error.insurer_response || null,
            });
        }

        return res.status(500).json({
            error: 1,
            status: 0,
            message: "Something went wrong",
        });
    }
};

/**
 * @openapi
 * /customer/motor/quotes/{quote_request_id}:
 *   get:
 *     tags:
 *       - Motor Quotes
 *     summary: Get quote results by quote request ID
 *     description: Fetch all active generated quote results for a specific quote request.
 *     parameters:
 *       - in: path
 *         name: quote_request_id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 3
 *     responses:
 *       200:
 *         description: Quote results fetched successfully
 *       400:
 *         description: Quote request id is required
 *       404:
 *         description: Quote request not found
 *       500:
 *         description: Server error
 */
const listByQuoteRequest = async (req, res) => {
    try {
        const quoteRequestId = req.params.quote_request_id;

        if (!quoteRequestId) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Quote request id is required",
            });
        }

        const quoteRequest = await MysqlQuoteRequestsModel.findById(quoteRequestId);

        if (!quoteRequest) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Quote request not found",
            });
        }

        const result = await MysqlQuoteResultsModel.find(
            null,
            {
                quote_request_id: quoteRequestId,
                result_status: "ACTIVE",
            },
            [["final_premium", "ASC"]],
            0,
            50
        );

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Quote results fetched successfully",
            result: {
                quote_request_id: quoteRequest.id,
                quote_request_no: quoteRequest.quote_request_no,
                quote_status: quoteRequest.quote_status,
                quotes: result,
            },
        });
    } catch (error) {
        console.log(error);

        CommonService.errorHandler(error, {
            url: "/customer/motor/quotes/:quote_request_id",
            operation: "LIST MOTOR QUOTE RESULTS",
            relative_detail: "Error occurred during fetching motor quote results",
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
 * /customer/motor/quotes/select-plan:
 *   post:
 *     tags:
 *       - Motor Quotes
 *     summary: Select quote plan
 *     description: Select a specific quote result plan for a quote request.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - quote_request_id
 *               - quote_result_id
 *             properties:
 *               quote_request_id:
 *                 type: integer
 *                 example: 3
 *               quote_result_id:
 *                 type: integer
 *                 example: 10
 *     responses:
 *       200:
 *         description: Quote plan selected successfully
 *       400:
 *         description: Validation error or plan already selected
 *       404:
 *         description: Quote request or quote result not found
 *       500:
 *         description: Server error
 */
const selectPlan = async (req, res) => {
    const payload = req.body;

    try {
        if (!payload.quote_request_id) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Quote request id is required",
            });
        }

        if (!payload.quote_result_id) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Quote result id is required",
            });
        }

        const quoteRequest = await MysqlQuoteRequestsModel.findById(payload.quote_request_id);

        if (!quoteRequest) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Quote request not found",
            });
        }

        const quoteResult = await MysqlQuoteResultsModel.findById(payload.quote_result_id);

        if (!quoteResult) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Quote result not found",
            });
        }

        if (Number(quoteResult.quote_request_id) !== Number(payload.quote_request_id)) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Quote result does not belong to this quote request",
            });
        }

        const existingSelectedPlan = await MysqlQuoteSelectedPlanModel.findByQuery({
            quote_request_id: payload.quote_request_id,
        });

        if (existingSelectedPlan) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Plan already selected for this quote request",
            });
        }

        const transaction = await mysqldb.transaction();

        try {
            const selectedPlan = await MysqlQuoteSelectedPlanModel.add(
                {
                    quote_request_id: quoteRequest.id,
                    quote_result_id: quoteResult.id,
                    lead_id: quoteRequest.lead_id,
                    insurer_id: quoteResult.insurer_id,
                    selection_status: "SELECTED",
                },
                transaction
            );

            await MysqlQuoteRequestsModel.update(
                quoteRequest.id,
                {
                    quote_status: "PLAN_SELECTED",
                    selected_insurer_id: quoteResult.insurer_id,
                    selected_quote_result_id: quoteResult.id,
                },
                transaction
            );

            await MysqlQuoteResultsModel.update(
                quoteResult.id,
                {
                    result_status: "SELECTED",
                },
                transaction
            );

            await transaction.commit();

            return res.status(200).json({
                error: 0,
                status: 1,
                message: "Quote plan selected successfully",
                result: {
                    selected_plan_id: selectedPlan.id,
                    quote_request_id: quoteRequest.id,
                    quote_result_id: quoteResult.id,
                    insurer_id: quoteResult.insurer_id,
                    final_premium: quoteResult.final_premium,
                    selection_status: selectedPlan.selection_status,
                },
            });
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (error) {
        console.log(error);

        CommonService.errorHandler(error, {
            url: "/customer/motor/quotes/select-plan",
            operation: "SELECT MOTOR QUOTE PLAN",
            relative_detail: "Error occurred during selecting motor quote plan",
        });

        return res.status(500).json({
            error: 1,
            status: 0,
            message: "Something went wrong",
        });
    }
};

module.exports = {
    generate,
    listByQuoteRequest,
    selectPlan,
};
