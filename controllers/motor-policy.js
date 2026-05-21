const { MysqlMotorPolicyDocumentsModel } = require("../models/mysqldb/motor-policy-document");
const CommonService = require("../services/common");
const InsurerFactory = require("../services/insurers/insurer.factory");

const buildLogContext = (payload) => ({
    lead_id: payload.lead_id || null,
    quote_request_id: payload.quote_request_id || null,
    quote_result_id: payload.quote_result_id || null,
    proposal_id: payload.proposal_id || null,
    payment_id: payload.payment_id || null,
    policy_id: payload.policy_id || null,
});

const status = async (req, res) => {
    const payload = req.body;

    try {
        const insurerCode = String(payload.insurer_code || "MOCK_DIGIT").trim().toUpperCase();
        const insurerId = payload.insurer_id || 1;

        const policyService = InsurerFactory.getMotorPolicyService(insurerCode);

        const result = await policyService.checkPolicyStatus({
            insurerId,
            payload: { ...payload, insurer_code: insurerCode },
            logContext: buildLogContext(payload),
        });

        const normalized = result.response_payload;

        await MysqlMotorPolicyDocumentsModel.add({
            proposal_id: payload.proposal_id || null,
            payment_id: payload.payment_id || null,
            quote_request_id: payload.quote_request_id || null,
            lead_id: payload.lead_id || null,
            insurer_id: insurerId,
            policy_number: normalized.policy_number || payload.policy_number || null,
            policy_status: normalized.policy_status || null,
            payment_status: normalized.payment_status || null,
            kyc_status: normalized.kyc_status || null,
            insurer_policy_id: normalized.insurer_policy_id || null,
            raw_policy_status: result.raw_response_payload || result.response_payload,
        });

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Policy status fetched successfully",
            result: normalized,
        });
    } catch (error) {
        console.log(error);

        CommonService.errorHandler(error, {
            url: "/customer/motor/policy/status",
            operation: "MOTOR POLICY STATUS",
            relative_detail: "Error occurred during policy status check",
        });

        if (error.insurer_error) {
            return res.status(error.http_status_code || 502).json({
                error: 1,
                status: 0,
                message: error.message || "Insurer API failed",
                insurer: error.insurer || "UNKNOWN",
                api: error.api || "UNKNOWN",
                http_status_code: error.http_status_code || null,
                insurer_response: error.insurer_response || null,
            });
        }

        return res.status(500).json({ error: 1, status: 0, message: "Something went wrong" });
    }
};

const generatePdf = async (req, res) => {
    const payload = req.body;

    try {
        const insurerCode = String(payload.insurer_code || "MOCK_DIGIT").trim().toUpperCase();
        const insurerId = payload.insurer_id || 1;

        const policyService = InsurerFactory.getMotorPolicyService(insurerCode);

        const result = await policyService.generatePdf({
            insurerId,
            payload: { ...payload, insurer_code: insurerCode },
            logContext: buildLogContext(payload),
        });

        const normalized = result.response_payload;

        await MysqlMotorPolicyDocumentsModel.add({
            proposal_id: payload.proposal_id || null,
            payment_id: payload.payment_id || null,
            quote_request_id: payload.quote_request_id || null,
            lead_id: payload.lead_id || null,
            insurer_id: insurerId,
            policy_number: payload.policy_number || payload.policyNumber || null,
            insurer_policy_id: payload.policy_id || payload.policyId || payload.insurer_policy_id || null,
            document_type: "POLICY_SCHEDULE",
            document_code: normalized.document_code || null,
            document_url: normalized.document_url || null,
            document_source: normalized.document_source || null,
            raw_pdf_response: result.raw_response_payload || result.response_payload,
        });

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Policy PDF generated successfully",
            result: normalized,
        });
    } catch (error) {
        console.log(error);

        CommonService.errorHandler(error, {
            url: "/customer/motor/policy/pdf",
            operation: "MOTOR POLICY PDF",
            relative_detail: "Error occurred during policy PDF generation",
        });

        if (error.insurer_error) {
            return res.status(error.http_status_code || 502).json({
                error: 1,
                status: 0,
                message: error.message || "Insurer API failed",
                insurer: error.insurer || "UNKNOWN",
                api: error.api || "UNKNOWN",
                http_status_code: error.http_status_code || null,
                insurer_response: error.insurer_response || null,
            });
        }

        return res.status(500).json({ error: 1, status: 0, message: "Something went wrong" });
    }
};

module.exports = { status, generatePdf };
