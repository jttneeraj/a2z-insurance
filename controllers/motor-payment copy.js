const { mysqldb } = require("../models/mysqldb/quote-request");
const { MysqlQuoteProposalsModel } = require("../models/mysqldb/quote-proposal");
const { MysqlProposalPaymentsModel } = require("../models/mysqldb/proposal-payment");

const CommonService = require("../services/common");
const InsurerFactory = require("../services/insurers/insurer.factory");

const initiate = async (req, res) => {
    const payload = req.body;

    try {
        if (!payload.proposal_id) {
            return res.status(400).json({ error: 1, status: 0, message: "proposal_id is required" });
        }

        const proposal = await MysqlQuoteProposalsModel.findById(payload.proposal_id);
        if (!proposal) {
            return res.status(404).json({ error: 1, status: 0, message: "Proposal not found" });
        }

        const insurerCode = String(payload.insurer_code || "MOCK_DIGIT").trim().toUpperCase();
        const insurerId = proposal.insurer_id;

        const transaction = await mysqldb.transaction();
        let payment;

        try {
            payment = await MysqlProposalPaymentsModel.add(
                {
                    proposal_id: proposal.id,
                    quote_request_id: proposal.quote_request_id,
                    quote_result_id: proposal.quote_result_id,
                    lead_id: proposal.lead_id,
                    insurer_id: insurerId,
                    payment_status: "PENDING",
                    payment_mode: payload.paymentMode || payload.payment_mode || "EB",
                    amount: proposal.final_premium,
                    currency: "INR",
                    success_return_url: payload.successReturnUrl || payload.success_return_url || `${process.env.CLIENT_APP_URL || ""}/payment/success`,
                    cancel_return_url: payload.cancelReturnUrl || payload.cancel_return_url || `${process.env.CLIENT_APP_URL || ""}/payment/cancel`,
                    insurer_application_id: payload.applicationId || payload.application_id || null,
                },
                transaction
            );

            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }

        const paymentService = InsurerFactory.getMotorPaymentService(insurerCode);

        const insurerPayment = await paymentService.initiatePayment({
            payment,
            proposal,
            insurerId,
            payload: {
                ...payload,
                insurer_code: insurerCode,
                successReturnUrl: payment.success_return_url,
                cancelReturnUrl: payment.cancel_return_url,
            },
        });

        const normalized = insurerPayment.response_payload;

        await MysqlProposalPaymentsModel.update(payment.id, {
            payment_link: normalized.payment_link || null,
            payment_status: normalized.payment_status || "PENDING",
            amount: normalized.amount || payment.amount,
            insurer_payment_id: normalized.insurer_payment_id || null,
            insurer_request_reference: normalized.insurer_request_reference || null,
        });

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Payment link generated successfully",
            result: {
                payment_id: payment.id,
                proposal_id: proposal.id,
                payment_status: normalized.payment_status || "PENDING",
                payment_link: normalized.payment_link || null,
                amount: normalized.amount || payment.amount,
                insurer_payment_id: normalized.insurer_payment_id || null,
            },
        });
    } catch (error) {
        console.log(error);

        CommonService.errorHandler(error, {
            url: "/customer/motor/payment/initiate",
            operation: "INITIATE MOTOR PAYMENT",
            relative_detail: "Error occurred during payment initiate",
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

        return res.status(500).json({ error: 1, status: 0, message: "Something went wrong" });
    }
};

const detail = async (req, res) => {
    try {
        const payment = await MysqlProposalPaymentsModel.findById(req.params.id);
        if (!payment) {
            return res.status(404).json({ error: 1, status: 0, message: "Payment not found" });
        }

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Payment fetched successfully",
            result: payment,
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ error: 1, status: 0, message: "Something went wrong" });
    }
};

module.exports = { initiate, detail };
