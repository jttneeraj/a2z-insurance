const DigitConfig = require("./digit.config");
const { postJson } = require("../common/insurer-http-client");
const InsurerApiLogService = require("../common/insurer-api-log.service");

class DigitAuthService {
    async getAccessToken({
        environment = "UAT",
        insurerId,
        insurerCode = "DIGIT",
        leadId = null,
        quoteRequestId = null,
        quoteResultId = null,
        proposalId = null,
        paymentId = null,
        policyId = null,
    }) {
        if (!insurerId) {
            throw new Error("insurerId is required for Digit token generation logging");
        }

        let apiLog = null;
        const config = DigitConfig.getConfig(environment);

        const requestPayload = {
            username: config.username,
            password: config.password,
        };

        try {
            apiLog = await InsurerApiLogService.createLog({
                insurer_id: insurerId,
                insurer_code: String(insurerCode || "DIGIT").toUpperCase(),

                lead_id: leadId,
                quote_request_id: quoteRequestId,
                quote_result_id: quoteResultId,
                proposal_id: proposalId,
                payment_id: paymentId,
                policy_id: policyId,

                api_name: "TOKEN_GENERATION",
                api_endpoint: config.authUrl,
                integration_id: null,
                http_method: "POST",

                request_headers: {
                    "content-type": "application/json",
                },
                request_payload: {
                    username: config.username ? "******" : null,
                    password: config.password ? "******" : null,
                },
            });

            const response = await postJson(
                config.authUrl,
                requestPayload,
                {
                    "content-type": "application/json",
                }
            );

            if (!response.success) {
                const error = new Error("Digit token generation failed");
                error.insurer_error = true;
                error.insurer = "DIGIT";
                error.api = "TOKEN_GENERATION";
                error.http_status_code = response.statusCode;
                error.insurer_response = response.body;
                throw error;
            }

            if (!response.body?.access_token) {
                const error = new Error("Digit token response missing access_token");
                error.insurer_error = true;
                error.insurer = "DIGIT";
                error.api = "TOKEN_GENERATION";
                error.http_status_code = response.statusCode;
                error.insurer_response = response.body;
                throw error;
            }

            await InsurerApiLogService.markSuccess(apiLog.id, {
                response_payload: {
                    access_token: "******",
                    refresh_token: response.body?.refresh_token ? "******" : null,
                    expiresIn: response.body?.expiresIn || null,
                },
                http_status_code: response.statusCode,
            });
            
            return response.body.access_token;
        } catch (error) {

            console.log('digit.auth.service getAccessToken  catch error===>', error);
            

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

module.exports = new DigitAuthService();