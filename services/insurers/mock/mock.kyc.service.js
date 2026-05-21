const InsurerApiLogService = require("../common/insurer-api-log.service");

class MockKycService {
    async checkKycStatus({ insurerId, payload, logContext = {} }) {
        let apiLog = null;
        const insurerCode = String(payload?.insurer_code || "MOCK_DIGIT").trim().toUpperCase();
        const requestPayload = { policy_number: payload.policy_number || payload.policyNumber || "MOCK-POLICY" };

        try {
            apiLog = await InsurerApiLogService.createLog({
                insurer_id: insurerId,
                insurer_code: insurerCode,
                ...logContext,
                api_name: "MOTOR_KYC_STATUS",
                api_endpoint: "/mock/motor/kyc/status",
                integration_id: null,
                http_method: "POST",
                request_headers: null,
                request_payload: requestPayload,
            });

            const responsePayload = {
                policy_number: requestPayload.policy_number,
                policy_status: "INCOMPLETE",
                payment_status: "NOT_PAID",
                kyc_status: "DONE",
                kyc_reason: null,
                reference_id: `MOCK-KYC-${Date.now()}`,
            };

            await InsurerApiLogService.markSuccess(apiLog.id, {
                response_payload: responsePayload,
                http_status_code: 200,
            });

            return {
                api_name: "MOTOR_KYC_STATUS",
                api_endpoint: "/mock/motor/kyc/status",
                integration_id: null,
                request_payload: requestPayload,
                response_payload: responsePayload,
                raw_response_payload: responsePayload,
                http_status_code: 200,
                request_status: "SUCCESS",
                response_status: "RECEIVED",
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
module.exports = new MockKycService();
