const { MysqlRemitterModel } = require("../models/mysqldb/remitter");
const CommonService = require("./common");
const { senderVerificationOTP } = require("./sms");
const {ResponseHandler} = require("../utils/response-handler");
const { MysqlBalanceModel } = require("../models/mysqldb/balance");

const search = async (req, res) => {
	const { wallet_type } = req.body;
	const { mobile } = req.params;
	const userdata = req.headers.userdata;
    const user = JSON.parse(userdata);
    const user_id = user.id; // get logged user id

	const attributes = ["id", "first_name", "last_name", "mobile", "pincode", "address", "is_verified", "wallet_one","wallet_two","wallet_three", "upi_wallet", "upi_wallet_two","remitter_order_id"];
	const remitter = await MysqlRemitterModel.findOne(attributes, { mobile: mobile });

	if (remitter) {
		const {remitter_limit} =  await setWalletLimit({remitter,wallet_type,user_id})
		if (remitter.is_verified == "YES") {
			
			console.log("remitter_limit",remitter_limit)
			delete remitter.dataValues.wallet_one;
			delete remitter.dataValues.wallet_two;
			delete remitter.dataValues.wallet_three;
			delete remitter.dataValues.upi_wallet;
			delete remitter.dataValues.upi_wallet_two;
			const mergedObj = { ...remitter.dataValues, ...remitter_limit };
			if(remitter.pincode && remitter.address){
				//return { status: 1, error: 0, message: req.t("SENDER_REGISTERED"), result: mergedObj };
				return new ResponseHandler(res).success({status: 1, error: 0, message: 'SENDER_REGISTERED', result: mergedObj})
			}
			return new ResponseHandler(res).success({status: 4, error: 0, message: 'SENDER_PARTIAL_REGISTERD', result: mergedObj})
			//return { status: 4, error: 0, message: req.t("SENDER_PARTIAL_REGISTERD"), result: mergedObj };
		} else {
			delete remitter.dataValues.wallet_one;
			delete remitter.dataValues.wallet_two;
			delete remitter.dataValues.wallet_three;
			delete remitter.dataValues.upi_wallet;
			delete remitter.dataValues.upi_wallet_two;
			const mergedObj = { ...remitter.dataValues, ...remitter_limit };
			if(!remitter.pincode || !remitter.address){
				return new ResponseHandler(res).success({status: 4, error: 0, message: 'SENDER_PARTIAL_REGISTERD', result: mergedObj})
				//return { status: 4, error: 0, message: req.t("SENDER_PARTIAL_REGISTERD"), result: mergedObj };
			}
			const otp = CommonService.generateOtp();
			senderVerificationOTP(otp);
			return new ResponseHandler(res).success({status: 3, error: 0, message: 'SENDER_NOT_VERIFIED', result: mergedObj})
			//return { status: 3, error: 0, message: req.t("SENDER_NOT_VERIFIED"), result:mergedObj };
		}
	}
	return new ResponseHandler(res).success({status: 2, error: 0, message: 'SENDER_NOT_FOUND'})
	return { status: 2, error: 0, message: req.t("SENDER_NOT_FOUND"), result: {} };
};
const add = async (req, res) => {
	const payload = ({ mobile, first_name, last_name, pincode, address } = req.body);
	let remitter = await MysqlRemitterModel.findOne(['id','first_name','last_name','pincode','address'], { mobile: mobile });
	const otp = CommonService.generateOtp();
	payload.otp = otp;
	if(remitter){
		remitter.first_name = first_name;
		remitter.last_name = last_name;
		remitter.pincode = pincode;
		remitter.address = address;
		remitter.otp = otp;
		remitter.is_verified = 'NO';
		await remitter.save();
	}else{
		remitter = await MysqlRemitterModel.create(payload);
		senderVerificationOTP(otp);
	}
	return new ResponseHandler(res).success({status: 1, error: 0, message: 'SENDER_REGISTERD_VERIFICAITON_PENDING', result: {id:remitter.id}})
};
const verify = async (req,res) => {
	const id = req.params.id;
	const { otp } = req.body;
	const result = await MysqlRemitterModel.findById(["id", "otp"], id);
	if (result.otp == otp) {
		result.is_verified = "YES";
		await result.save();
		return new ResponseHandler(res).success({message: 'SENDER_SUCCESSFULY_VERIFIED'})
		//return { status: 1, error: 0, message: req.t("SENDER_SUCCESSFULY_VERIFIED"), result: {} };
	} else return new ResponseHandler(res).failure({message: 'INVALID_OTP'})
};
const resendOtp = async (req,res) => {
	const id = req.params.id;
	const result = await MysqlRemitterModel.findById(["id", "otp"], id);
	const otp = result.otp;
	senderVerificationOTP(otp);
	return new ResponseHandler(res).success({message: 'SENDER_OTP_RESEND'})
	//return { status: 1, error: 0, message: req.t("SENDER_OTP_RESEND"), result: {} };
};
const setWalletLimit =  async (payload)=>{

	const {remitter,wallet_type,user_id} = payload;	
	//console.log(wallet_type)
	//console.log(remitter)
	// const monthly_limit = (wallet_type==='UPI_ONE' || wallet_type ==='UPI_TWO') ? Number(process.env.UPI_MONTHLY_LIMIT) : Number(process.env.WALELT_ONE_MONTHLY_LIMIT);
	const monthly_limit = 
    (wallet_type === 'PAYOUT_WALLET' || wallet_type === 'PAYOUT_UPI') ? 0 :
    (wallet_type === 'UPI_ONE' || wallet_type === 'UPI_TWO') ? Number(process.env.UPI_MONTHLY_LIMIT) :
    Number(process.env.WALELT_ONE_MONTHLY_LIMIT);

	const remitter_limit = {
		monthly_limit: monthly_limit
	}
	switch(wallet_type){
		case 'A2Z_PLUS_WALLET':
			remitter_limit.used_limit = monthly_limit - Number(remitter.wallet_one);
			remitter_limit.remaining_limit = Number(remitter.wallet_one);
			break;
		case 'A2Z_PLUS_WALLET_TWO':
			remitter_limit.used_limit = monthly_limit - Number(remitter.wallet_two);
			remitter_limit.remaining_limit = Number(remitter.wallet_two);
			break;
		case 'A2Z_PLUS_WALLET_THREE':
			remitter_limit.used_limit = monthly_limit - Number(remitter.wallet_three);
			remitter_limit.remaining_limit = Number(remitter.wallet_three);
			break;
		case 'UPI_ONE':
			remitter_limit.used_limit = monthly_limit - Number(remitter.upi_wallet);
			remitter_limit.remaining_limit = Number(remitter.upi_wallet);
			break;
		case 'UPI_TWO':
			remitter_limit.used_limit = monthly_limit - Number(remitter.upi_wallet_two);
			remitter_limit.remaining_limit = Number(remitter.upi_wallet_two);
			break;
		case 'PAYOUT_WALLET':
			remitter_limit.used_limit = 0;
			var conditions = {'user_id': user_id};
			var payoutBal =  await MysqlBalanceModel.findOne(['payout_wallet'], conditions);
			if (payoutBal && payoutBal.payout_wallet !== undefined) {
				remitter_limit.remaining_limit = Number(payoutBal.payout_wallet);
			} else {
				remitter_limit.remaining_limit = 0; // fallback if no record found
			}
			break;
		case 'PAYOUT_UPI':
			remitter_limit.used_limit = 0;
			var conditions = {'user_id': user_id};
			var payoutBal =  await MysqlBalanceModel.findOne(['payout_wallet'], conditions);
			if (payoutBal && payoutBal.payout_wallet !== undefined) {
				remitter_limit.remaining_limit = Number(payoutBal.payout_wallet);
			} else {
				remitter_limit.remaining_limit = 0; // fallback if no record found
			}
			break;		
		case 'CREDIT_CARD':
			remitter_limit.used_limit = 0;
			remitter_limit.remaining_limit = 0;
			remitter_limit.monthly_limit = 0;
			break;
		default :
			break;
		
	}
	return {remitter_limit}
}
module.exports = {
	search,
	add,
	verify,
	resendOtp,
	setWalletLimit
};
