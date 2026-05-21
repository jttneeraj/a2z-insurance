const InsurerApiLogService = require("../common/insurer-api-log.service");

class MockPaymentService {
    async initiatePayment({ payment, proposal, insurerId, payload }) {
        let apiLog = null;
        const insurerCode = String(payload?.insurer_code || "MOCK_DIGIT").trim().toUpperCase();
        const requestPayload = {
            payment_id: payment.id,
            proposal_id: proposal.id,
            quote_request_id: proposal.quote_request_id,
            amount: payment.amount,
            insurer_id: insurerId,
            insurer_code: insurerCode,
        };

        try {
            apiLog = await InsurerApiLogService.createLog({
                insurer_id: insurerId,
                insurer_code: insurerCode,
                lead_id: proposal.lead_id || null,
                quote_request_id: proposal.quote_request_id || null,
                quote_result_id: proposal.quote_result_id || null,
                proposal_id: proposal.id,
                payment_id: payment.id,
                api_name: "MOTOR_PAYMENT_LINK",
                api_endpoint: "/mock/motor/payment/initiate",
                integration_id: null,
                http_method: "POST",
                request_headers: null,
                request_payload: requestPayload,
            });

            const responsePayload = {
                insurer_request_reference: `MOCK-PAY-REQ-${payment.id}`,
                payment_link: `https://mock-payment.local/pay/${payment.id}`,
                amount: Number(payment.amount || proposal.final_premium || 0),
                insurer_payment_id: `MOCK-PAY-${payment.id}`,
                payment_status: "PENDING",
            };

            await InsurerApiLogService.markSuccess(apiLog.id, {
                response_payload: responsePayload,
                http_status_code: 200,
            });

            return {
                api_name: "MOTOR_PAYMENT_LINK",
                api_endpoint: "/mock/motor/payment/initiate",
                integration_id: null,
                request_payload: requestPayload,
                response_payload: responsePayload,
                raw_response_payload: responsePayload,
                http_status_code: 200,
                request_status: "SUCCESS",
                response_status: "RECEIVED",
                error_code: null,
                error_message: null,
            };
        } catch (error) {
            if (apiLog?.id) {
                await InsurerApiLogService.markFailed(apiLog.id, {
                    response_payload: error.insurer_response || null,
                    http_status_code: error.http_status_code || 500,
                    error_message: error.message,
                });
            }
            throw error;
        }
    }
}
module.exports = new MockPaymentService();
