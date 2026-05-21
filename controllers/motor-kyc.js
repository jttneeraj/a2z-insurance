const CommonService = require("../services/common");
const InsurerFactory = require("../services/insurers/insurer.factory");

const status = async (req, res) => {
    const payload = req.body;

    try {
        const insurerCode = String(payload.insurer_code || "MOCK_DIGIT").trim().toUpperCase();
        const insurerId = Number(payload.insurer_id);
        if (!insurerId) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "insurer_id is required",
            });
        }

        const kycService = InsurerFactory.getMotorKycService(insurerCode);

        const result = await kycService.checkKycStatus({
            insurerId,
            payload: { ...payload, insurer_code: insurerCode },
            logContext: {
                lead_id: payload.lead_id || null,
                quote_request_id: payload.quote_request_id || null,
                quote_result_id: payload.quote_result_id || null,
                proposal_id: payload.proposal_id || null,
                payment_id: payload.payment_id || null,
                policy_id: payload.policy_id || null,
            },
        });

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "KYC status fetched successfully",
            result: result.response_payload,
        });
    } catch (error) {
        console.log(error);

        CommonService.errorHandler(error, {
            url: "/customer/motor/kyc/status",
            operation: "MOTOR KYC STATUS",
            relative_detail: "Error occurred during KYC status check",
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

module.exports = { status };
