const DigitConfig = require("./digit.config");
const DigitMapper = require("./digit.mapper");
const DigitExecutorService = require("./digit.executor.service");

class DigitPaymentService {
    async initiatePayment({ payment, proposal, insurerId, payload = {} }) {
        const environment = payload?.environment || "UAT";
        const config = DigitConfig.getConfig(environment);

        const finalInsurerId =
            insurerId ||
            payment?.insurer_id ||
            proposal?.insurer_id;

        if (!finalInsurerId) {
            throw new Error("insurerId is required for Digit payment service");
        }

        const applicationId =
            payload.applicationId ||
            payload.application_id ||
            payment?.insurer_application_id ||
            proposal?.insurer_application_id;

        if (!applicationId) {
            const error = new Error("Digit applicationId is required for payment link generation");
            error.insurer_error = true;
            error.insurer = payload?.insurer_code || "DIGIT";
            error.api = "MOTOR_PAYMENT_LINK";
            error.http_status_code = 400;
            throw error;
        }

        const requestPayload = DigitMapper.buildPaymentPayload({
            applicationId,
            payload,
        });

        const result = await DigitExecutorService.execute({
            environment,
            insurerId: finalInsurerId,
            insurerCode: payload?.insurer_code || "DIGIT",
            apiName: "MOTOR_PAYMENT_LINK",
            integrationId: config.paymentIntegrationId,
            requestPayload,
            logContext: {
                lead_id: proposal?.lead_id || null,
                quote_request_id: proposal?.quote_request_id || null,
                quote_result_id: proposal?.quote_result_id || null,
                proposal_id: proposal?.id || null,
                payment_id: payment?.id || null,
            },
        });

        return {
            ...result,
            response_payload: DigitMapper.normalizePaymentResponse(result.response_payload),
            raw_response_payload: result.response_payload,
        };
    }
}

module.exports = new DigitPaymentService();