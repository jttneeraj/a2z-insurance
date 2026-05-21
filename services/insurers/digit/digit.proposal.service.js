const DigitConfig = require("./digit.config");
const DigitAuthService = require("./digit.auth.service");
const DigitMapper = require("./digit.mapper");
const { postJson } = require("../common/insurer-http-client");
const InsurerApiLogService = require("../common/insurer-api-log.service");

class DigitProposalService {
    async createMotorProposal({ proposal, quoteRequest, quoteResult, selectedPlan, payload = {} }) {
        let apiLog = null;

        const environment = payload?.environment || "UAT";
        const insurerId = quoteResult.insurer_id;
        const insurerCode = String(payload?.insurer_code || "DIGIT").trim().toUpperCase();

        if (!insurerId) {
            throw new Error("insurerId is required for Digit proposal service");
        }

        const config = DigitConfig.getConfig(environment);

        const requestPayload = DigitMapper.buildCreateQuotePayload
            ? await DigitMapper.buildCreateQuotePayload({
                proposal,
                quoteRequest,
                quoteResult,
                selectedPlan,
                payload,
            })
            : this.buildFallbackCreateQuotePayload({ proposal, quoteRequest, quoteResult, payload });

        const requestHeaders = {
            "content-type": "application/json",
            integrationid: config.createQuoteIntegrationId,
        };

        try {
            apiLog = await InsurerApiLogService.createLog({
                insurer_id: insurerId,
                insurer_code: insurerCode,
                lead_id: quoteRequest.lead_id || null,
                quote_request_id: quoteRequest.id,
                quote_result_id: quoteResult.id,
                proposal_id: proposal.id,

                api_name: "MOTOR_CREATE_PROPOSAL",
                api_endpoint: config.executorUrl,
                integration_id: config.createQuoteIntegrationId,
                http_method: "POST",

                request_headers: requestHeaders,
                request_payload: requestPayload,
            });

            const accessToken = await DigitAuthService.getAccessToken({
                environment,
                insurerId,
                insurerCode,
                quoteRequestId: quoteRequest.id,
                quoteResultId: quoteResult.id,
                leadId: quoteRequest.lead_id || null,
                proposalId: proposal.id,
            });

            const response = await postJson(
                config.executorUrl,
                requestPayload,
                {
                    ...requestHeaders,
                    authorization: `Bearer ${accessToken}`,
                }
            );

            if (!response.success) {

                console.log(
                    "Digit proposal validationMessages response.body?.error?.validationMessages:",
                    JSON.stringify(response.body?.error?.validationMessages, null, 2)
                );

                const error = new Error("Insurer proposal API failed");
                error.insurer_error = true;
                error.insurer = insurerCode;
                error.api = "MOTOR_CREATE_PROPOSAL";
                error.http_status_code = response.statusCode;
                error.insurer_response = response.body;
                throw error;
            }

            const normalizedResponse = DigitMapper.normalizeCreateQuoteResponse
                ? DigitMapper.normalizeCreateQuoteResponse(response.body)
                : this.normalizeCreateQuoteResponse(response.body);

            await InsurerApiLogService.markSuccess(apiLog.id, {
                response_payload: response.body,
                http_status_code: response.statusCode,
            });

            return {
                api_name: "MOTOR_CREATE_PROPOSAL",
                api_endpoint: config.executorUrl,
                integration_id: config.createQuoteIntegrationId,

                request_headers: requestHeaders,
                request_payload: requestPayload,

                response_payload: normalizedResponse,
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

    buildFallbackCreateQuotePayload({ proposal, quoteRequest, quoteResult, payload = {} }) {
        return {
            proposalId: proposal.id,
            quoteRequestId: quoteRequest.id,
            quoteRequestNo: quoteRequest.quote_request_no,
            quoteResultId: quoteResult.id,
            leadId: quoteRequest.lead_id || null,
            insurerId: quoteResult.insurer_id,
            proposer: {
                name: payload.proposer_name || proposal.proposer_name || null,
                mobile: payload.proposer_mobile || proposal.proposer_mobile || null,
                email: payload.proposer_email || proposal.proposer_email || null,
            },
            premium: quoteResult.final_premium,
        };
    }

    normalizeCreateQuoteResponse(responsePayload) {
        return {
            insurer_proposal_reference_no:
                responsePayload?.applicationId ||
                responsePayload?.policyNumber ||
                null,
            application_id: responsePayload?.applicationId || null,
            policy_number: responsePayload?.policyNumber || null,
            proposal_status: responsePayload?.policyStatus || "CREATED",
            payment_status: responsePayload?.paymentStatus || "PENDING",
            kyc_status: responsePayload?.kycStatus?.kycVerificationStatus || null,
        };
    }
}

module.exports = new DigitProposalService();