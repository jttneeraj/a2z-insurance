const InsurerApiLogService = require("../common/insurer-api-log.service");

class MockProposalService {
    async createMotorProposal({ proposal, quoteRequest, quoteResult, selectedPlan, payload }) {
        let apiLog = null;

        const insurerCode = String(payload?.insurer_code || "MOCK").trim().toUpperCase();

        const apiMeta = {
            insurer_id: quoteResult.insurer_id,
            insurer_code: insurerCode,
            lead_id: quoteRequest.lead_id || null,
            quote_request_id: quoteRequest.id,
            quote_result_id: quoteResult.id,
            proposal_id: proposal.id,
            api_name: "MOTOR_CREATE_PROPOSAL",
            api_endpoint: "/mock/motor/proposal",
            integration_id: null,
            http_method: "POST",
        };

        const requestPayload = {
            proposal_id: proposal.id,
            quote_request_id: quoteRequest.id,
            quote_request_no: quoteRequest.quote_request_no,
            quote_result_id: quoteResult.id,
            selected_plan_id: selectedPlan?.id || null,
            lead_id: quoteRequest.lead_id || null,
            insurer_id: quoteResult.insurer_id,
            insurer_code: insurerCode,
            proposer_name: payload.proposer_name || proposal.proposer_name || null,
            proposer_mobile: payload.proposer_mobile || proposal.proposer_mobile || null,
            proposer_email: payload.proposer_email || proposal.proposer_email || null,
            final_premium: quoteResult.final_premium,
        };

        try {
            apiLog = await InsurerApiLogService.createLog({
                ...apiMeta,
                request_headers: null,
                request_payload: requestPayload,
            });

            const responsePayload = {
                insurer_proposal_reference_no: `MOCK-PROP-${proposal.id}`,
                application_id: `MOCK-APP-${proposal.id}`,
                proposal_status: "CREATED",
                policy_number: null,
                payment_status: "PENDING",
                kyc_status: "PENDING",
                insurer_id: quoteResult.insurer_id,
                insurer_code: insurerCode,
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

module.exports = new MockProposalService();
