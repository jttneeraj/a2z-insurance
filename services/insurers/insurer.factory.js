const MockQuoteService = require("./mock/mock.quote.service");
const DigitQuoteService = require("./digit/digit.quote.service");

const MockProposalService = require("./mock/mock.proposal.service");
const DigitProposalService = require("./digit/digit.proposal.service");

const MockPaymentService = require("./mock/mock.payment.service");
const DigitPaymentService = require("./digit/digit.payment.service");

const MockKycService = require("./mock/mock.kyc.service");
const DigitKycService = require("./digit/digit.kyc.service");

const MockPolicyService = require("./mock/mock.policy.service");
const DigitPolicyService = require("./digit/digit.policy.service");

function normalizeCode(insurerCode) {
    return String(insurerCode || "MOCK_DIGIT").trim().toUpperCase();
}

function isMock(code) {
    return code === "MOCK" || code === "MOCK_DIGIT";
}

function isDigit(code) {
    return code === "DIGIT" || code === "DIGIT_ONE";
}

class InsurerFactory {
    getMotorQuoteService(insurerCode) {
        const code = normalizeCode(insurerCode);

        if (isDigit(code)) return DigitQuoteService;
        if (isMock(code)) return MockQuoteService;

        return MockQuoteService;
    }

    getMotorProposalService(insurerCode) {
        const code = normalizeCode(insurerCode);

        if (isDigit(code)) return DigitProposalService;
        if (isMock(code)) return MockProposalService;

        return MockProposalService;
    }

    getMotorPaymentService(insurerCode) {
        const code = normalizeCode(insurerCode);

        if (isDigit(code)) return DigitPaymentService;
        if (isMock(code)) return MockPaymentService;

        return MockPaymentService;
    }

    getMotorKycService(insurerCode) {
        const code = normalizeCode(insurerCode);

        if (isDigit(code)) return DigitKycService;
        if (isMock(code)) return MockKycService;

        return MockKycService;
    }

    getMotorPolicyService(insurerCode) {
        const code = normalizeCode(insurerCode);

        if (isDigit(code)) return DigitPolicyService;
        if (isMock(code)) return MockPolicyService;

        return MockPolicyService;
    }
}

module.exports = new InsurerFactory();