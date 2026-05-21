const DigitConfig = require("./digit.config");
const DigitMapper = require("./digit.mapper");
const DigitExecutorService = require("./digit.executor.service");

class DigitKycService {
    async checkKycStatus({ insurerId, payload, logContext = {} }) {
        const environment = payload?.environment || "UAT";
        const config = DigitConfig.getConfig(environment);
        const policyNumber = payload.policyNumber || payload.policy_number;

        if (!policyNumber) {
            const error = new Error("policy_number is required for KYC status");
            error.insurer_error = true;
            error.insurer = payload?.insurer_code || "DIGIT";
            error.api = "MOTOR_KYC_STATUS";
            error.http_status_code = 400;
            throw error;
        }

        const result = await DigitExecutorService.execute({
            environment,
            insurerId,
            insurerCode: payload?.insurer_code || "DIGIT",
            apiName: "MOTOR_KYC_STATUS",
            integrationId: config.kycStatusIntegrationId,
            requestPayload: DigitMapper.buildKycStatusPayload({ policyNumber }),
            logContext,
        });

        return {
            ...result,
            response_payload: DigitMapper.normalizeKycStatusResponse(result.response_payload),
            raw_response_payload: result.response_payload,
        };
    }
}
module.exports = new DigitKycService();
