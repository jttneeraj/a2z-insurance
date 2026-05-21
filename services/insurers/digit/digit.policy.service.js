const DigitConfig = require("./digit.config");
const DigitMapper = require("./digit.mapper");
const DigitExecutorService = require("./digit.executor.service");

class DigitPolicyService {
    async checkPolicyStatus({ insurerId, payload, logContext = {} }) {
        const environment = payload?.environment || "UAT";
        const config = DigitConfig.getConfig(environment);
        const policyNumber = payload.policyNumber || payload.policy_number;

        if (!policyNumber) {
            const error = new Error("policy_number is required for policy status");
            error.insurer_error = true;
            error.insurer = payload?.insurer_code || "DIGIT";
            error.api = "MOTOR_POLICY_STATUS";
            error.http_status_code = 400;
            throw error;
        }

        const result = await DigitExecutorService.execute({
            environment,
            insurerId,
            insurerCode: payload?.insurer_code || "DIGIT",
            apiName: "MOTOR_POLICY_STATUS",
            integrationId: config.policyStatusIntegrationId,
            requestPayload: DigitMapper.buildPolicyStatusPayload({ policyNumber }),
            logContext,
        });

        return {
            ...result,
            response_payload: DigitMapper.normalizePolicyStatusResponse(result.response_payload),
            raw_response_payload: result.response_payload,
        };
    }

    async generatePdf({ insurerId, payload, logContext = {} }) {
        const environment = payload?.environment || "UAT";
        const config = DigitConfig.getConfig(environment);
        const policyId = payload.policyId || payload.policy_id || payload.insurer_policy_id;
        const authorization = payload.headerAuthorization || payload.header_authorization || payload.authorization;

        if (!policyId || !authorization) {
            const error = new Error("policy_id and header_authorization are required for PDF generation");
            error.insurer_error = true;
            error.insurer = payload?.insurer_code || "DIGIT";
            error.api = "MOTOR_POLICY_PDF";
            error.http_status_code = 400;
            throw error;
        }

        const result = await DigitExecutorService.execute({
            environment,
            insurerId,
            insurerCode: payload?.insurer_code || "DIGIT",
            apiName: "MOTOR_POLICY_PDF",
            integrationId: config.pdfGenerationIntegrationId,
            requestPayload: DigitMapper.buildPdfPayload({ policyId, authorization }),
            logContext,
        });

        return {
            ...result,
            response_payload: DigitMapper.normalizePdfResponse(result.response_payload),
            raw_response_payload: result.response_payload,
        };
    }
}
module.exports = new DigitPolicyService();
