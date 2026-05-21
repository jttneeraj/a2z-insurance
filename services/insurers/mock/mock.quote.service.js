const InsurerApiLogService = require("../common/insurer-api-log.service");

class MockQuoteService {
    async generateMotorQuote({ quoteRequest, insurerId, insurerProductId, payload }) {
        let apiLog = null;

        const insurerCode = String(payload?.insurer_code || "MOCK").trim().toUpperCase();

        const apiMeta = {
            insurer_id: insurerId,
            insurer_code: insurerCode,
            lead_id: quoteRequest.lead_id || null,
            quote_request_id: quoteRequest.id,
            api_name: "MOTOR_QUOTE",
            api_endpoint: "/mock/motor/quote",
            integration_id: null,
            http_method: "POST",
        };

        const requestPayload = {
            quote_request_id: quoteRequest.id,
            quote_request_no: quoteRequest.quote_request_no,
            insurer_id: insurerId,
            insurer_product_id: insurerProductId,
            insurer_code: insurerCode,
        };

        try {
            apiLog = await InsurerApiLogService.createLog({
                ...apiMeta,
                request_headers: null,
                request_payload: requestPayload,
            });

            const responsePayload = {
                insurer_quote_reference_no: `MOCK-${quoteRequest.quote_request_no}`,
                plan_name: "Mock Motor Comprehensive",
                policy_type: "COMPREHENSIVE",

                idv: 450000,
                min_idv: 400000,
                max_idv: 500000,

                own_damage_premium: 6200,
                third_party_premium: 3416,
                addon_premium: 1200,
                discount_amount: 500,
                net_premium: 10316,
                gst_amount: 1857,
                final_premium: 12173,

                currency: "INR",
                quote_valid_till: null,

                insurer_code: insurerCode,
                insurer_id: insurerId,
                insurer_product_id: insurerProductId,
            };

            await InsurerApiLogService.markSuccess(apiLog.id, {
                response_payload: responsePayload,
                http_status_code: 200,
            });

            return {
                api_name: apiMeta.api_name,
                api_endpoint: apiMeta.api_endpoint,
                integration_id: apiMeta.integration_id,

                request_headers: null,
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

module.exports = new MockQuoteService();