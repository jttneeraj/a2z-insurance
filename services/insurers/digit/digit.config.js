require("dotenv").config();

const DigitConfig = {
    getConfig(environment = "UAT") {
        if (String(environment).toUpperCase() === "PROD") {
            return {
                environment: "PROD",
                authUrl: process.env.DIGIT_PROD_AUTH_URL,
                executorUrl: process.env.DIGIT_PROD_EXECUTOR_URL,
                username: process.env.DIGIT_PROD_USERNAME,
                password: process.env.DIGIT_PROD_PASSWORD,
                quickQuoteIntegrationId: process.env.DIGIT_PROD_QUICK_QUOTE_ID,
                createQuoteIntegrationId: process.env.DIGIT_PROD_CREATE_QUOTE_ID,
                kycStatusIntegrationId: process.env.DIGIT_PROD_KYC_STATUS_ID,
                pdfGenerationIntegrationId: process.env.DIGIT_PROD_PDF_ID,
                policyStatusIntegrationId: process.env.DIGIT_PROD_POLICY_STATUS_ID,
                paymentIntegrationId: process.env.DIGIT_PROD_PAYMENT_ID,
            };
        }
        return {
            environment: "UAT",
            authUrl: "https://preprod-oneapi.godigit.com/OneAPI/v1/auth",
            executorUrl: "https://preprod-oneapi.godigit.com/OneAPI/v1/executor",
            username: process.env.DIGIT_UAT_USERNAME,
            password: process.env.DIGIT_UAT_PASSWORD,
            quickQuoteIntegrationId: "28233-0100",
            createQuoteIntegrationId: "28234-0100",
            kycStatusIntegrationId: "28235-0100",
            pdfGenerationIntegrationId: "28237-0100",
            policyStatusIntegrationId: "28925-0100",
            paymentIntegrationId: "28926-0100",
        };
    },
};
module.exports = DigitConfig;
