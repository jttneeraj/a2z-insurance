const ThirdPartyService = require("shared-library/services/third-party");
// const ThirdPartyService = require("shared-library/services/third-party");

const getSenderWalletLimit = async (payload) => {
	return await ThirdPartyService.getWalletLimit(payload);
};
const transaction = async (payload) =>{
	return await ThirdPartyService.walletPaymentTransaction(payload);
}
const upiTransaction = async (payload) =>{
	return await ThirdPartyService.upiTransaction(payload);
}
const accountVerificationDetails = async (payload) => {
	return await ThirdPartyService.accountVerification(payload);
};
const upiVerificationDetails = async (payload) => {
	return await ThirdPartyService.upiVerification(payload);
};
const addVendorBeneficiry = async (payload) => {
	return await ThirdPartyService.addBeneficiary(payload);
};
const addUpiBeneficiary = async (payload) => {
	return await ThirdPartyService.addUpiBeneficiary(payload);
};
const makeTwoFactorAuthentication = async (payload) => {
	return await ThirdPartyService.twoFactorAuthentication(payload);
};
const sendOtpForAepsKyc = async (payload) => {
	return await ThirdPartyService.sendOtpForAepsKyc(payload);
};
const verifyOtpForAepsKyc = async (payload) => {
	return await  ThirdPartyService.verifyOtpForAepsKyc(payload);
};
const aepsKyc = async (payload) => {
	return await  ThirdPartyService.aepsKyc(payload);
};
const aepsOnboard = async (payload) => {
	return await  ThirdPartyService.aepsOnboard(payload);
};
const aepsTransaction = async (payload) => {
	return await  ThirdPartyService.aepsTransaction(payload);
};
const validateRemitterSearch = async (payload) => {
	return await  ThirdPartyService.validateRemitterSearch(payload);
};
const validateRemitterAadhaar = async (payload) => {
	return await  ThirdPartyService.validateRemitterAadhaar(payload);
};
const remitterSendOtp = async (payload) => {
	return await  ThirdPartyService.remitterSendOtp(payload);
};
const verifyRemitterOtp = async (payload) => {
	return await  ThirdPartyService.verifyRemitterOtp(payload);
};
const verifyRemitterKyc = async (payload) => {
	return await  ThirdPartyService.verifyRemitterKyc(payload);
};
const processRemitterEkyc = async (payload) => {
	return await  ThirdPartyService.processRemitterEkyc(payload);
};
const processGenerateOTP = async (payload) => {
	return await  ThirdPartyService.processGenerateOTP(payload);
};
const processRemitterRegistration = async (payload) => {
	return await  ThirdPartyService.processRemitterRegistration(payload);
};
const sendDmtTransactionOtp = async (payload) => {
	return await  ThirdPartyService.sendDmtTransactionOtp(payload);
};
const verifyDmtTransactionOtp = async (payload) => {
	return await  ThirdPartyService.verifyDmtTransactionOtp(payload);
};
const dmtTransaction = async (payload) =>{
	return await ThirdPartyService.dmtTransaction(payload);
}
const processTransactionDmt = async (payload) => {
	return await  ThirdPartyService.processTransactionDmt(payload);
};
const fingpayCmsAuthLogin = async (payload) => {
	return await ThirdPartyService.fingpayCmsAuthLogin(payload);
};

const insuranceAuthLogin = async (payload) => {
	return await ThirdPartyService.insuranceAuthLogin(payload);
};
const cashDepositTransaction = async (payload) => {
	return await  ThirdPartyService.cashDepositTransaction(payload);
};
   
module.exports = {
	getSenderWalletLimit,
	transaction,
	accountVerificationDetails,
	addVendorBeneficiry,
	makeTwoFactorAuthentication,
	sendOtpForAepsKyc,
	verifyOtpForAepsKyc,
	aepsKyc,
	aepsOnboard,
	aepsTransaction,
    validateRemitterSearch,
    validateRemitterAadhaar,
    remitterSendOtp,
    verifyRemitterOtp,
    verifyRemitterKyc,
    processRemitterEkyc,
    processGenerateOTP,
    processRemitterRegistration,
    sendDmtTransactionOtp,
    verifyDmtTransactionOtp,
    dmtTransaction,
    processTransactionDmt,
	upiVerificationDetails,
	upiTransaction,
	addUpiBeneficiary,
    fingpayCmsAuthLogin,
	insuranceAuthLogin,
	cashDepositTransaction
};