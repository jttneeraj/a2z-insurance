const { MysqlInsurerApiLogModel } = require(
    process.env.SHARED_LIBRARY_PATH + "/services/models"
);

const insurerApiLogModel = new MysqlInsurerApiLogModel().model;

class InsurerApiLogService {
    async createLog(data, transaction = null) {
        return insurerApiLogModel.create(
            {
                insurer_id: data.insurer_id,
                insurer_code: data.insurer_code || null,

                lead_id: data.lead_id || null,
                customer_id: data.customer_id || null,

                quote_request_id: data.quote_request_id || null,
                quote_result_id: data.quote_result_id || null,
                proposal_id: data.proposal_id || null,
                payment_id: data.payment_id || null,
                policy_id: data.policy_id || null,

                api_name: data.api_name,
                api_endpoint: data.api_endpoint || null,
                integration_id: data.integration_id || null,
                http_method: data.http_method || "POST",

                request_headers: data.request_headers || null,
                request_payload: data.request_payload || null,

                status: "PENDING",
                requested_at: new Date(),
            },
            { transaction }
        );
    }
 

    async markSuccess(logId, data = {}, transaction = null) {
        if (!logId) return null;

        return insurerApiLogModel.update(
            {
                api_endpoint: data.api_endpoint || null,
                integration_id: data.integration_id || null,
                response_payload: data.response_payload || null,
                http_status_code: data.http_status_code || 200,
                status: "SUCCESS",
                error_message: null,
                responded_at: new Date(),
            },
            {
                where: { id: logId },
                transaction,
            }
        );
    }

    async markFailed(logId, data = {}, transaction = null) {
        if (!logId) return null;

        return insurerApiLogModel.update(
            {
                response_payload: data.response_payload || null,
                http_status_code: data.http_status_code || 500,
                status: "FAILED",
                error_message: data.error_message || null,
                responded_at: new Date(),
            },
            {
                where: { id: logId },
                transaction,
            }
        );
    }
}

module.exports = new InsurerApiLogService();