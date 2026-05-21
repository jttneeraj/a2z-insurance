const DigitConfig = require("./digit.config");
const DigitAuthService = require("./digit.auth.service");
const DigitMapper = require("./digit.mapper");
const { postJson } = require("../common/insurer-http-client");
const InsurerApiLogService = require("../common/insurer-api-log.service");

class DigitQuoteService {
    async generateMotorQuote({ quoteRequest, insurerId, insurerProductId, payload }) {
        let apiLog = null;

        const environment = payload?.environment || "UAT";
        const config = DigitConfig.getConfig(environment);

        const requestPayload = await DigitMapper.buildQuickQuotePayload({
            quoteRequest,
            insurerId,
            insurerProductId,
            payload,
        });

        const requestHeaders = {
            "content-type": "application/json",
            integrationid: config.quickQuoteIntegrationId,
        };

        try {
            apiLog = await InsurerApiLogService.createLog({
                insurer_id: insurerId,
                insurer_code: payload?.insurer_code || "DIGIT",
                lead_id: quoteRequest.lead_id || null,
                quote_request_id: quoteRequest.id,

                api_name: "MOTOR_QUOTE",
                api_endpoint: config.executorUrl,
                integration_id: config.quickQuoteIntegrationId,
                http_method: "POST",

                request_headers: requestHeaders,
                request_payload: requestPayload,
            });

            // const accessToken = await DigitAuthService.getAccessToken(environment);
            const accessToken = await DigitAuthService.getAccessToken({
                environment,
                insurerId,
                insurerCode: payload?.insurer_code || "DIGIT",
                quoteRequestId: quoteRequest.id,
                leadId: quoteRequest.lead_id || null,
            });

            const response = await postJson(
                config.executorUrl,
                requestPayload,
                {
                    ...requestHeaders,
                    authorization: `Bearer ${accessToken}`,
                }
            );

            console.log('---digit quote service generateMotorQuote response==>', response);


            if (!response.success) {


                console.log(
                    "Digit quote validationMessages response.body?.error?.validationMessages:",
                    JSON.stringify(response.body?.error?.validationMessages, null, 2)
                );


                const error = new Error("Insurer motor quote API failed");
                error.insurer_error = true;
                error.insurer = payload?.insurer_code || "DIGIT";
                error.api = "MOTOR_QUOTE";
                error.http_status_code = response.statusCode;
                error.insurer_response = response.body;
                throw error;
            }

            const normalizedResponse = DigitMapper.normalizeQuickQuoteResponse(response.body);

            await InsurerApiLogService.markSuccess(apiLog.id, {
                response_payload: response.body,
                http_status_code: response.statusCode,
            });

            return {
                api_endpoint: config.executorUrl,
                integration_id: config.quickQuoteIntegrationId,

                request_payload: requestPayload,

                // normalized response will be saved in quote_results
                response_payload: normalizedResponse,

                // raw Digit response for internal reference
                raw_response_payload: response.body,

                http_status_code: response.statusCode,
                request_status: "SUCCESS",
                response_status: "RECEIVED",
            };
        } catch (error) {

            console.log('line 95 digit quote service generateMotorQuote catch error===>', error);


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

module.exports = new DigitQuoteService();