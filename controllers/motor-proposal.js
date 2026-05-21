const { mysqldb } = require("../models/mysqldb/quote-request");

const { MysqlQuoteRequestsModel } = require("../models/mysqldb/quote-request");
const { MysqlQuoteResultsModel } = require("../models/mysqldb/quote-result");
const { MysqlQuoteSelectedPlanModel } = require("../models/mysqldb/quote-selected-plan");
const { MysqlQuoteProposalsModel } = require("../models/mysqldb/quote-proposal");

const CommonService = require("../services/common");
const InsurerFactory = require("../services/insurers/insurer.factory");

/**
 * @openapi
 * /customer/motor/proposal/add:
 *   post:
 *     tags:
 *       - Motor Proposal
 *     summary: Create motor proposal
 *     description: Create internal proposal and call selected insurer proposal adapter dynamically.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - quote_request_id
 *             properties:
 *               quote_request_id:
 *                 type: integer
 *                 example: 101
 *               insurer_code:
 *                 type: string
 *                 example: MOCK_DIGIT
 *               environment:
 *                 type: string
 *                 example: UAT
 *               proposer_name:
 *                 type: string
 *                 example: Neeraj Prajapati
 *               proposer_mobile:
 *                 type: string
 *                 example: "9876543210"
 *               proposer_email:
 *                 type: string
 *                 example: neeraj@example.com
 *     responses:
 *       200:
 *         description: Proposal created successfully
 *       400:
 *         description: Validation/business error
 *       404:
 *         description: Resource not found
 *       502:
 *         description: Insurer proposal API failed
 *       500:
 *         description: Server error
 */
const add_bk = async (req, res) => {
    const payload = req.body;

    try {
        if (!payload.quote_request_id) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Quote request id is required",
            });
        }

        const quoteRequest = await MysqlQuoteRequestsModel.findById(payload.quote_request_id);

        if (!quoteRequest) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Quote request not found",
            });
        }

        const insurerCode = String(payload.insurer_code || "MOCK_DIGIT").trim().toUpperCase();

        let selectedPlan = null;
        let quoteResult = null;

        if (payload.quote_result_id) {
            quoteResult = await MysqlQuoteResultsModel.findById(payload.quote_result_id);

            if (!quoteResult) {
                return res.status(404).json({
                    error: 1,
                    status: 0,
                    message: "Quote result not found",
                });
            }
        } else {
            selectedPlan = await MysqlQuoteSelectedPlanModel.findByQuery({
                quote_request_id: payload.quote_request_id,
            });

            if (!selectedPlan) {
                return res.status(400).json({
                    error: 1,
                    status: 0,
                    message: "No plan selected for this quote request",
                });
            }

            quoteResult = await MysqlQuoteResultsModel.findById(selectedPlan.quote_result_id);

            if (!quoteResult) {
                return res.status(404).json({
                    error: 1,
                    status: 0,
                    message: "Quote result not found",
                });
            }
        }

        if (insurerCode === "DIGIT" && !quoteResult.insurer_quote_reference_no) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Digit quote reference is missing. Please generate Digit quote successfully before creating proposal.",
            });
        }


        const existingProposal = await MysqlQuoteProposalsModel.findByQuery({
            quote_request_id: payload.quote_request_id,
        });

        if (existingProposal) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Proposal already created",
            });
        }


        const transaction = await mysqldb.transaction();
        let proposal = null;

        try {
            proposal = await MysqlQuoteProposalsModel.add(
                {
                    quote_request_id: quoteRequest.id,
                    quote_result_id: quoteResult.id,
                    lead_id: quoteRequest.lead_id,
                    insurer_id: quoteResult.insurer_id,
                    proposal_status: "CREATED",
                    proposer_name: payload.proposer_name || null,
                    proposer_mobile: payload.proposer_mobile || null,
                    proposer_email: payload.proposer_email || null,
                    final_premium: quoteResult.final_premium,
                },
                transaction
            );

            await MysqlQuoteRequestsModel.update(
                quoteRequest.id,
                {
                    quote_status: "PROPOSAL_CREATED",
                },
                transaction
            );

            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }

        const insurerProposalService = InsurerFactory.getMotorProposalService(insurerCode);

        const insurerProposal = await insurerProposalService.createMotorProposal({
            proposal,
            quoteRequest,
            quoteResult,
            selectedPlan,
            payload: {
                ...payload,
                insurer_code: insurerCode,
            },
        });

        const normalizedProposal =
            insurerProposal.normalized_proposal ||
            insurerProposal.response_payload ||
            null;

        const isInsurerProposalSuccess =
            insurerProposal.response_status === "RECEIVED" &&
            normalizedProposal;

        if (!isInsurerProposalSuccess) {
            await MysqlQuoteProposalsModel.update(proposal.id, {
                proposal_status: "INSURER_PROPOSAL_FAILED",
            });

            return res.status(502).json({
                error: 1,
                status: 0,
                message: "Insurer proposal creation failed",
                result: {
                    proposal_id: proposal.id,
                    quote_request_id: quoteRequest.id,
                    quote_request_no: quoteRequest.quote_request_no,
                    insurer_id: quoteResult.insurer_id,
                    error_code: insurerProposal.error_code || null,
                    error_message:
                        insurerProposal.error_message || "Insurer proposal creation failed",
                },
            });
        }

        const proposalUpdatePayload = {
            proposal_status: "INSURER_PROPOSAL_CREATED",
            insurer_application_id: normalizedProposal.application_id || null,
            insurer_policy_number: normalizedProposal.policy_number || null,
            insurer_proposal_reference_no: normalizedProposal.insurer_proposal_reference_no || null,
            kyc_status: normalizedProposal.kyc_status || null,
            payment_status: normalizedProposal.payment_status || null,
        };

        await MysqlQuoteProposalsModel.update(proposal.id, proposalUpdatePayload);

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Proposal created successfully",
            result: {
                proposal_id: proposal.id,
                quote_request_id: quoteRequest.id,
                quote_request_no: quoteRequest.quote_request_no,
                insurer_id: quoteResult.insurer_id,
                insurer_code: insurerCode,
                final_premium: quoteResult.final_premium,
                proposal_status: proposalUpdatePayload.proposal_status,
                insurer_application_id: proposalUpdatePayload.insurer_application_id,
                insurer_policy_number: proposalUpdatePayload.insurer_policy_number,
                insurer_proposal_reference_no: proposalUpdatePayload.insurer_proposal_reference_no,
                kyc_status: proposalUpdatePayload.kyc_status,
                payment_status: proposalUpdatePayload.payment_status,
                insurer_proposal: normalizedProposal,
            },
        });
    } catch (error) {
        console.log("motor proposal catch error===> ", error);

        CommonService.errorHandler(error, {
            url: "/customer/motor/proposal/add",
            operation: "ADD MOTOR PROPOSAL",
            relative_detail: "Error occurred during proposal creation",
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

        return res.status(500).json({
            error: 1,
            status: 0,
            message: "Something went wrong",
        });
    }
};

const add_1 = async (req, res) => {
    const payload = req.body;

    try {
        if (!payload.quote_request_id) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Quote request id is required",
            });
        }

        const insurerCode = String(payload.insurer_code || "MOCK_DIGIT").trim().toUpperCase();

        const quoteRequest = await MysqlQuoteRequestsModel.findById(payload.quote_request_id);

        if (!quoteRequest) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Quote request not found",
            });
        }

        let selectedPlan = null;
        let quoteResult = null;

        if (payload.quote_result_id) {
            quoteResult = await MysqlQuoteResultsModel.findById(payload.quote_result_id);

            if (!quoteResult) {
                return res.status(404).json({
                    error: 1,
                    status: 0,
                    message: "Quote result not found",
                });
            }

            if (Number(quoteResult.quote_request_id) !== Number(payload.quote_request_id)) {
                return res.status(400).json({
                    error: 1,
                    status: 0,
                    message: "quote_result_id does not belong to this quote_request_id",
                });
            }
        } else {
            selectedPlan = await MysqlQuoteSelectedPlanModel.findByQuery({
                quote_request_id: payload.quote_request_id,
            });

            if (!selectedPlan) {
                return res.status(400).json({
                    error: 1,
                    status: 0,
                    message: "No plan selected for this quote request",
                });
            }

            quoteResult = await MysqlQuoteResultsModel.findById(selectedPlan.quote_result_id);

            if (!quoteResult) {
                return res.status(404).json({
                    error: 1,
                    status: 0,
                    message: "Quote result not found",
                });
            }
        }

        if (insurerCode === "DIGIT" && !quoteResult.insurer_quote_reference_no) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Digit quote reference is missing. Please generate Digit quote successfully before creating proposal.",
            });
        }

        const existingProposal = await MysqlQuoteProposalsModel.findByQuery({
            quote_request_id: payload.quote_request_id,
        });

        if (existingProposal) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Proposal already created",
            });
        }

        const transaction = await mysqldb.transaction();
        let proposal = null;

        try {
            proposal = await MysqlQuoteProposalsModel.add(
                {
                    quote_request_id: quoteRequest.id,
                    quote_result_id: quoteResult.id,
                    lead_id: quoteRequest.lead_id,
                    insurer_id: quoteResult.insurer_id,
                    proposal_status: "CREATED",
                    proposer_name: payload.proposer_name || null,
                    proposer_mobile: payload.proposer_mobile || null,
                    proposer_email: payload.proposer_email || null,
                    final_premium: quoteResult.final_premium,
                },
                transaction
            );

            await MysqlQuoteRequestsModel.update(
                quoteRequest.id,
                { quote_status: "PROPOSAL_CREATED" },
                transaction
            );

            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }

        const insurerProposalService = InsurerFactory.getMotorProposalService(insurerCode);

        const insurerProposal = await insurerProposalService.createMotorProposal({
            proposal,
            quoteRequest,
            quoteResult,
            selectedPlan,
            payload: {
                ...payload,
                insurer_code: insurerCode,
            },
        });

        const normalizedProposal =
            insurerProposal.normalized_proposal ||
            insurerProposal.response_payload ||
            null;

        if (!(insurerProposal.response_status === "RECEIVED" && normalizedProposal)) {
            await MysqlQuoteProposalsModel.update(proposal.id, {
                proposal_status: "INSURER_PROPOSAL_FAILED",
            });

            return res.status(502).json({
                error: 1,
                status: 0,
                message: "Insurer proposal creation failed",
            });
        }

        const proposalUpdatePayload = {
            proposal_status: "INSURER_PROPOSAL_CREATED",
            insurer_application_id: normalizedProposal.application_id || null,
            insurer_policy_number: normalizedProposal.policy_number || null,
            insurer_proposal_reference_no: normalizedProposal.insurer_proposal_reference_no || null,
            kyc_status: normalizedProposal.kyc_status || null,
            payment_status: normalizedProposal.payment_status || null,
        };

        await MysqlQuoteProposalsModel.update(proposal.id, proposalUpdatePayload);

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Proposal created successfully",
            result: {
                proposal_id: proposal.id,
                quote_request_id: quoteRequest.id,
                quote_request_no: quoteRequest.quote_request_no,
                quote_result_id: quoteResult.id,
                insurer_id: quoteResult.insurer_id,
                insurer_code: insurerCode,
                final_premium: quoteResult.final_premium,
                ...proposalUpdatePayload,
                insurer_proposal: normalizedProposal,
            },
        });
    } catch (error) {
        console.log("motor proposal catch error===> ", error);

        CommonService.errorHandler(error, {
            url: "/customer/motor/proposal/add",
            operation: "ADD MOTOR PROPOSAL",
            relative_detail: "Error occurred during proposal creation",
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

        return res.status(500).json({
            error: 1,
            status: 0,
            message: error.message || "Something went wrong",
        });
    }
};

const add = async (req, res) => {
    const payload = req.body;

    try {
        if (!payload.quote_request_id) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Quote request id is required",
            });
        }

        const insurerCode = String(payload.insurer_code || "MOCK_DIGIT").trim().toUpperCase();
        const mockInsurers = ["MOCK", "MOCK_DIGIT"];
        const isMockInsurer = mockInsurers.includes(insurerCode);
        const isRealInsurer = !isMockInsurer;

        if (isRealInsurer && !payload.quote_result_id) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "quote_result_id is required for real insurer proposal. Please generate quote first.",
            });
        }

        const quoteRequest = await MysqlQuoteRequestsModel.findById(payload.quote_request_id);

        if (!quoteRequest) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Quote request not found",
            });
        }

        let selectedPlan = null;
        let quoteResult = null;

        if (payload.quote_result_id) {
            quoteResult = await MysqlQuoteResultsModel.findById(payload.quote_result_id);

            if (!quoteResult) {
                return res.status(404).json({
                    error: 1,
                    status: 0,
                    message: "Quote result not found",
                });
            }

            if (Number(quoteResult.quote_request_id) !== Number(payload.quote_request_id)) {
                return res.status(400).json({
                    error: 1,
                    status: 0,
                    message: "quote_result_id does not belong to this quote_request_id",
                });
            }
        } else {
            selectedPlan = await MysqlQuoteSelectedPlanModel.findByQuery({
                quote_request_id: payload.quote_request_id,
            });

            if (!selectedPlan) {
                return res.status(400).json({
                    error: 1,
                    status: 0,
                    message: "No plan selected for this quote request",
                });
            }

            quoteResult = await MysqlQuoteResultsModel.findById(selectedPlan.quote_result_id);

            if (!quoteResult) {
                return res.status(404).json({
                    error: 1,
                    status: 0,
                    message: "Quote result not found",
                });
            }
        }

        if (insurerCode === "DIGIT" && !quoteResult.insurer_quote_reference_no) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Digit quote reference is missing. Please generate Digit quote successfully before creating proposal.",
            });
        }

        const existingProposal = await MysqlQuoteProposalsModel.findByQuery({
            quote_request_id: payload.quote_request_id,
        });

        if (existingProposal) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Proposal already created",
            });
        }

        const transaction = await mysqldb.transaction();
        let proposal = null;

        try {
            proposal = await MysqlQuoteProposalsModel.add(
                {
                    quote_request_id: quoteRequest.id,
                    quote_result_id: quoteResult.id,
                    lead_id: quoteRequest.lead_id,
                    insurer_id: quoteResult.insurer_id,
                    proposal_status: "CREATED",
                    proposer_name: payload.proposer_name || null,
                    proposer_mobile: payload.proposer_mobile || null,
                    proposer_email: payload.proposer_email || null,
                    final_premium: quoteResult.final_premium,
                },
                transaction
            );

            await MysqlQuoteRequestsModel.update(
                quoteRequest.id,
                { quote_status: "PROPOSAL_CREATED" },
                transaction
            );

            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }

        const insurerProposalService = InsurerFactory.getMotorProposalService(insurerCode);

        const insurerProposal = await insurerProposalService.createMotorProposal({
            proposal,
            quoteRequest,
            quoteResult,
            selectedPlan,
            payload: {
                ...payload,
                insurer_code: insurerCode,
            },
        });

        const normalizedProposal =
            insurerProposal.normalized_proposal ||
            insurerProposal.response_payload ||
            null;

        if (!(insurerProposal.response_status === "RECEIVED" && normalizedProposal)) {
            await MysqlQuoteProposalsModel.update(proposal.id, {
                proposal_status: "INSURER_PROPOSAL_FAILED",
            });

            return res.status(502).json({
                error: 1,
                status: 0,
                message: "Insurer proposal creation failed",
            });
        }

        const proposalUpdatePayload = {
            proposal_status: "INSURER_PROPOSAL_CREATED",
            insurer_application_id: normalizedProposal.application_id || null,
            insurer_policy_number: normalizedProposal.policy_number || null,
            insurer_proposal_reference_no: normalizedProposal.insurer_proposal_reference_no || null,
            kyc_status: normalizedProposal.kyc_status || null,
            payment_status: normalizedProposal.payment_status || null,
        };

        await MysqlQuoteProposalsModel.update(proposal.id, proposalUpdatePayload);

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Proposal created successfully",
            result: {
                proposal_id: proposal.id,
                quote_request_id: quoteRequest.id,
                quote_request_no: quoteRequest.quote_request_no,
                quote_result_id: quoteResult.id,
                insurer_id: quoteResult.insurer_id,
                insurer_code: insurerCode,
                final_premium: quoteResult.final_premium,
                ...proposalUpdatePayload,
                insurer_proposal: normalizedProposal,
            },
        });
    } catch (error) {
        console.log("motor proposal catch error===> ", error);

        CommonService.errorHandler(error, {
            url: "/customer/motor/proposal/add",
            operation: "ADD MOTOR PROPOSAL",
            relative_detail: "Error occurred during proposal creation",
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

        return res.status(500).json({
            error: 1,
            status: 0,
            message: error.message || "Something went wrong",
        });
    }
};

/**
 * @openapi
 * /customer/motor/proposal/{id}:
 *   get:
 *     tags:
 *       - Motor Proposal
 *     summary: Get motor proposal detail
 *     description: Fetch proposal details by proposal ID.
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *     responses:
 *       200:
 *         description: Proposal fetched successfully
 *       404:
 *         description: Proposal not found
 *       500:
 *         description: Server error
 */
const detail = async (req, res) => {
    try {
        const result = await MysqlQuoteProposalsModel.findById(req.params.id);

        if (!result) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Proposal not found",
            });
        }

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Proposal fetched successfully",
            result,
        });
    } catch (error) {
        console.log(error);

        CommonService.errorHandler(error, {
            url: "/customer/motor/proposal/:id",
            operation: "GET MOTOR PROPOSAL DETAIL",
            relative_detail: "Error occurred during fetching proposal detail",
        });

        return res.status(500).json({
            error: 1,
            status: 0,
            message: "Something went wrong",
        });
    }
};

module.exports = {
    add,
    detail,
};
