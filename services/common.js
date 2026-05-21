const logger = require("../winston.js").logger;

const CommonService = module.exports;
const moment = require("moment");

// COMMON ERROR HANDLER FOR COMPLETE APP
module.exports.errorHandler = async (error, info_data) => {
	let info_error_data = {
		...info_data,
	};

	let file = "";
	let file_location = "";
	let line_number = "";
	let function_name = "";

	if ("stack" in error && error.stack) {
		// Parse the stack trace
		let stack_lines = error.stack.split("\n");
		// Get file name and line number
		let line_with_file = stack_lines[1];
		let index_of_at = line_with_file.lastIndexOf("@");
		file = line_with_file.slice(line_with_file.lastIndexOf("/") + 1, index_of_at);
		file_location = line_with_file.slice(line_with_file.lastIndexOf("(") + 1, line_with_file.lastIndexOf(")"));
		line_number = line_with_file.slice(index_of_at + 1);

		// Get function name
		let function_nameLine = stack_lines[2];
		function_name = function_nameLine.slice(function_nameLine.lastIndexOf(" ") + 1);

		console.log(`Error in file ${file} on line ${line_number} in function ${function_name}`);

		info_error_data = {
			...info_data,
			message: error.stack,
			// url: "/api/auth/login",
			file: file,
			file_location: file_location,
			line_number: line_number,
			function_api: function_name,
			// operation: "To login user",
			// relative_detail: "Got error while tried to perform login",
			error: JSON.stringify(error) || error.toString(),
			error_obj: error,
		};
	}

	logger.error(info_error_data);
};

module.exports.randomNumber = (min = 1, max = 999999999, digits = 6) => {
	// Calculate full range
	let range = max - min;

	// Generate number string padded with zeros
	let random = Math.floor(Math.random() * range + min).toString();
	random = random.padStart(digits, 0);
	return process.env.APP_MODE == "PRODUCTION" ? random.slice(0, digits) : process.env.DEFAULT_OTP;
};

module.exports.numberToDate = function (stringDate) {
	// console.log("stringDate list == ", stringDate)
	if (stringDate && stringDate != "") {
		stringDate = stringDate + "";
		var year = stringDate.substring(0, 4);
		var month = stringDate.substring(6, 4);
		var date = stringDate.substring(8, 6);
		return new Date(year + "-" + month + "-" + date + "T00:00:00");
	} else {
		return stringDate;
	}
};

module.exports.upDownService = function (value) {
	const up_down_service = { Up: "UP", Down: "DOWN" };
	var up_down_services = [];
	for (let x in up_down_service) {
		let inxed = x;
		let data = up_down_service[x];
		let new_content = {
			label: x,
			value: data,
			active: data == value ? true : false,
		};
		up_down_services.push(new_content);
	}
	return up_down_services;
};
module.exports.activeInactiveService = function (value) {
	const active_inactive_service = { Active: "ACTIVE", Inactive: "INACTIVE" };
	var active_inactive_services = [];
	for (let x in active_inactive_service) {
		let inxed = x;
		let data = active_inactive_service[x];
		let new_content = {
			label: x,
			value: data,
			active: data == value ? true : false,
		};
		active_inactive_services.push(new_content);
	}
	return active_inactive_services;
};
module.exports.flatPercentService = function (value) {
	const flatPercentservice = { Flat: "FLAT", Percent: "PERCENT" };
	var flatPercentservices = [];
	for (let x in flatPercentservice) {
		let inxed = x;
		let data = flatPercentservice[x];
		let new_content = {
			label: x,
			value: data,
			active: data == value ? true : false,
		};
		flatPercentservices.push(new_content);
	}
	return flatPercentservices;
};
module.exports.mposCardType = function (value) {
	const flatPercentservice = { VISA: "VISA", AMEX: "AMEX", RUPAY: "RUPAY", MASTER: "MASTER", OTHER: "OTHER" };
	var flatPercentservices = [];
	for (let x in flatPercentservice) {
		let data = flatPercentservice[x];
		let new_content = {
			label: x,
			value: data,
			active: data == value ? true : false,
		};
		flatPercentservices.push(new_content);
	}
	return flatPercentservices;
};
module.exports.paymentGatewayCardType = function (value, otherValue) {
	let gatewayCardType = {};
	if (otherValue == "UPI") {
		gatewayCardType = { CREDIT_CARD: "CREDIT_CARD", BANK_ACCOUNT: "BANK_ACCOUNT" };
	} else {
		gatewayCardType = { OTHER: "OTHER", RUPAY: "RUPAY" };
	}
	var gatewayCardTypes = [];
	for (let x in gatewayCardType) {
		let data = gatewayCardType[x];
		let new_content = {
			label: this.capitalizeFirstLetter(x),
			value: data,
			active: data == value ? true : false,
		};
		gatewayCardTypes.push(new_content);
	}
	return gatewayCardTypes;
};

module.exports.yesNoService = function (value) {
	const yesNos = { Yes: "YES", No: "NO" };
	var yesNoss = [];
	for (let x in yesNos) {
		let inxed = x;
		let data = yesNos[x];
		let new_content = {
			label: x,
			value: data,
			active: data == value ? true : false,
		};
		yesNoss.push(new_content);
	}
	return yesNoss;
};

module.exports.companyPaymentBanksLabelValue = function (value) {
	const active_inactive_service = { Working: "WORKING", "Manual Activate": "MANUAL_ACTIVATE", Reject: "REJECT" };
	var active_inactive_services = [];
	for (let x in active_inactive_service) {
		let inxed = x;
		let data = active_inactive_service[x];
		let new_content = {
			label: x,
			value: data,
			active: data == value ? true : false,
		};
		active_inactive_services.push(new_content);
	}
	return active_inactive_services;
};

module.exports.workingManualActivateRejectService = function (value) {
	const active_inactive_service = { Working: "WORKING", "Manual Activate": "MANUAL_ACTIVATE", Reject: "REJECT" };
	var active_inactive_services = [];
	for (let x in active_inactive_service) {
		let inxed = x;
		let data = active_inactive_service[x];
		let new_content = {
			label: x,
			value: data,
			active: data == value ? true : false,
		};
		active_inactive_services.push(new_content);
	}
	return active_inactive_services;
};

module.exports.from_date = function (date) {
	if (date) return moment(date).format(process.env.MYSQL_DATE_FORMAT) + " 00:00:00";
	else return moment().format(process.env.MYSQL_DATE_FORMAT) + " 00:00:00";
};
module.exports.to_date = function (date) {
	if (date) return moment(date).format(process.env.MYSQL_DATE_FORMAT) + " 23:59:59";
	else return moment().format(process.env.MYSQL_DATE_FORMAT) + " 23:59:59";
};

module.exports.capitalizeFirstLetter = function (string) {
	return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
};
module.exports.getOffset = function (page, limit) {
	if (page) offset = page * limit;
	else offset = 0;
	return offset;
};
module.exports.isNumber = function (value) {
	const floatNumber = parseFloat(value);
	return typeof floatNumber === "number";
};
module.exports.setValueToLabel = function (string) {
	return {
		label: this.capitalizeFirstLetter(string),
		value: string,
	};
};
module.exports.selectActiveResult = function (arrayList, item) {
	const newArayList = [];
	arrayList.forEach((element) => {
		let new_item = {};
		new_item.label = element.name;
		new_item.value = element.id;
		new_item.active = element.id == item ? true : false;
		newArayList.push(new_item);
	});
	return newArayList;
};

module.exports.getActiveResult = function (arrayList, item) {
	const new_item = {};
	arrayList.forEach((element) => {
		if (element.id == item) {
			new_item.label = element.name;
			new_item.value = element.id;
		}
	});
	return new_item;
};
module.exports.resultWithLabelAndValue = function (array_list, item = null) {
	const newArayList = [];
	array_list.forEach((element) => {
		let new_item = {};
		new_item.label = element.name;
		new_item.value = element.id;
		newArayList.push(new_item);
	});
	return newArayList;
};
module.exports.commissionTypes = function () {
	return [
		{ label: "Flat", value: "FLAT" },
		{ label: "Percent", value: "PERCENT" },
	];
};
module.exports.statusTypes = function () {
	return [
		{ label: "Active", value: "ACTIVE" },
		{ label: "Inactive", value: "INACTIVE" },
	];
};
module.exports.genderTypes = function () {
	return [
		{ label: "Male", value: "MALE" },
		{ label: "Female", value: "Female" },
		{ label: "Na", value: "NA" },
	];
};
module.exports.servicePermissionTypes = function () {
	return [
		{ label: "Yes", value: "YES" },
		{ label: "No", value: "NO" },
	];
};
module.exports.userdocumentKycTypes = function () {
	return [
		{ label: "Pending", value: "PENDING" },
		{ label: "VERIFIED", value: "VERIFIED" },
		{ label: "Not Verified", value: "NOT_VERIFIED" },
		{ label: "Rejected", value: "REJECTED" },
	];
};
module.exports.aadhaarKycTypes = function () {
	return [
		{ label: "Pending", value: "PENDING" },
		{ label: "VERIFIED", value: "VERIFIED" },
		{ label: "Not Verified", value: "NOT_VERIFIED" },
		{ label: "Rejected", value: "REJECTED" },
		{ label: "Name not matched", value: "NAME_NOT_MATCHED" },
	];
};

module.exports.agreementKycTypes = function () {
	return [
		{ label: "Pending", value: "PENDING" },
		{ label: "Rejected", value: "REJECTED" },
		{ label: "Completed", value: "COMPLETED" },
		{ label: "Not Verified", value: "NOT_VERIFIED" },
	];
};
module.exports.getSelecteResult = function (arrayList, item) {
	const new_item = {};
	arrayList.forEach((element) => {
		if (element.value == item) {
			new_item.label = element.label;
			new_item.value = element.value;
		}
	});
	return new_item;
};
module.exports.selectActiveResultFromLabel = function (arrayList, item) {
	const newArayList = [];
	arrayList.forEach((element) => {
		let new_item = {};
		(new_item.label = element.label), (new_item.value = element.value), (new_item.active = element.value == item ? true : false);
		newArayList.push(new_item);
	});
	return newArayList;
};
module.exports.resgistrationUserRole = function () {
	return [
		{
			label: "Master Distributior",
			value: 3,
		},
		{
			label: "Distributior",
			value: 4,
		},
		{
			label: "Retailer",
			value: 5,
		},
	];
};
module.exports.getSelecteRole = function (value) {
	const roleList = this.resgistrationUserRole();
	const new_item = {};
	roleList.forEach((element) => {
		if (element.value == parseInt(value)) {
			new_item.label = element.label;
			new_item.value = element.value;
		}
	});
	return new_item;
};

module.exports.generateOtp = function () {
	if (process.env.APP_MODE == "PRODUCTION") {
		return Math.floor(100000 + Math.random() * 900000);
	} else {
		return process.env.DEFAULT_OTP;
	}
};

module.exports.clearPayload = function (payload) {
	const empty_payload = {}
	for (let key in payload) {
		if (payload.hasOwnProperty(key)) {
			empty_payload[key] = "";
		}
	}
	return empty_payload;
}
module.exports.calculateChargeCommission = function (amount, charge_commission_type, agent_charge) {

	if (charge_commission_type == 'FLAT')
		return agent_charge
	else
		return (amount * agent_charge) / 100;

}
module.exports.calculateDMTChargeCommission = function (amount) {

	if (amount <= Number(process.env.MINIMUM_DMT_FLAT_AMOUNT))
		return Number(process.env.MINIMUM_DMT_CHARGE_AMOUNT)
	else
		return (amount * Number(process.env.DMT_CHARGE_AMOUNT_IN_PERCENT)) / 100;

}
module.exports.generateRamdomString = function (length = 5) {

	let result = '';
	const characters = 'ABCDEFGHIJKLMNPQRSTUVWXYZ';
	const charactersLength = characters.length;
	let counter = 0;
	while (counter < length) {
		result += characters.charAt(Math.floor(Math.random() * charactersLength));
		counter += 1;
	}
	return result;
}
module.exports.ackno = function (prefix = "RPT",length=5) {

	let result = '';
	const characters = 'ABCDEFGHIJKLMNPQRSTUVWXYZ';
	const charactersLength = characters.length;
	let counter = 0;
	while (counter < length) {
		result += characters.charAt(Math.floor(Math.random() * charactersLength));
		counter += 1;
	}
	if(prefix == "RPT")
		return moment().format('YYYYMMDDHHmmssSSS') + result;
	return prefix + moment().format('YYYYMMDDHHmmssSSS') + result;
}
module.exports.aepsAckno = function (length = 5) {

	let result = '';
	const characters = 'ABCDEFGHIJKLMNPQRSTUVWXYZ';
	const charactersLength = characters.length;
	let counter = 0;
	while (counter < length) {
		result += characters.charAt(Math.floor(Math.random() * charactersLength));
		counter += 1;
	}
	return "AEPS" + moment().format('YYYYMMDDHHmmssSSS') + result;
}
module.exports.splitName = function (name) {
	if (!name || typeof name !== "string") {
		return { first_name: "", middle_name: "", last_name: "" };
	}

	const parts = name.trim().split(/\s+/);

	let first_name = "";
	let middle_name = "";
	let last_name = "";

	if (parts.length === 1) {
		first_name = parts[0];
	} else if (parts.length === 2) {
		[first_name, last_name] = parts;
	} else if (parts.length === 3) {
		[first_name, middle_name, last_name] = parts;
	} else if (parts.length > 3) {
		first_name = parts[0];
		last_name = parts[parts.length - 1];
		middle_name = parts.slice(1, -1).join(" ");
	}

	return { first_name, middle_name, last_name };
}
module.exports.generatePaymentRequestId = function ({user_id}) {
	return "T"+moment().tz("Asia/Kolkata").format("SSS") +  user_id.toString().padStart(6, '0') + Math.floor(1000000 + Math.random() * 9000000).toString();
}
 