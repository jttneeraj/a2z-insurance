const DigitConfig = require("./digit.config");
const DigitAuthService = require("./digit.auth.service");
const { postJson } = require("../common/insurer-http-client");
const InsurerApiLogService = require("../common/insurer-api-log.service");

class DigitExecutorService {
    async execute({
        environment = "UAT",
        insurerId,
        insurerCode = "DIGIT",
        logContext = {},
        apiName,
        integrationId,
        requestPayload,
    }) {
        if (!insurerId) {
            throw new Error("insurerId is required for Digit executor logging");
        }

        const config = DigitConfig.getConfig(environment);

        const requestHeaders = {
            "content-type": "application/json",
            integrationid: integrationId,
        };

        let apiLog = null;

        try {
            apiLog = await InsurerApiLogService.createLog({
                insurer_id: insurerId,
                insurer_code: insurerCode,

                lead_id: logContext.lead_id || null,
                quote_request_id: logContext.quote_request_id || null,
                quote_result_id: logContext.quote_result_id || null,
                proposal_id: logContext.proposal_id || null,
                payment_id: logContext.payment_id || null,
                policy_id: logContext.policy_id || null,

                api_name: apiName,
                api_endpoint: config.executorUrl,
                integration_id: integrationId,
                http_method: "POST",
                request_headers: requestHeaders,
                request_payload: requestPayload,
            });

            const accessToken = await DigitAuthService.getAccessToken({
                environment,
                insurerId,
                insurerCode,
                leadId: logContext.lead_id || null,
                quoteRequestId: logContext.quote_request_id || null,
                quoteResultId: logContext.quote_result_id || null,
                proposalId: logContext.proposal_id || null,
                paymentId: logContext.payment_id || null,
                policyId: logContext.policy_id || null,
            });

            const response = await postJson(config.executorUrl, requestPayload, {
                ...requestHeaders,
                authorization: `Bearer ${accessToken}`,
            });

            if (!response.success) {
                const error = new Error(`${apiName} failed`);
                error.insurer_error = true;
                error.insurer = insurerCode;
                error.api = apiName;
                error.http_status_code = response.statusCode;
                error.insurer_response = response.body;
                throw error;
            }

            await InsurerApiLogService.markSuccess(apiLog.id, {
                response_payload: response.body,
                http_status_code: response.statusCode,
            });

            return {
                api_name: apiName,
                api_endpoint: config.executorUrl,
                integration_id: integrationId,
                request_headers: requestHeaders,
                request_payload: requestPayload,
                response_payload: response.body,
                raw_response_payload: response.body,
                http_status_code: response.statusCode,
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

module.exports = new DigitExecutorService();