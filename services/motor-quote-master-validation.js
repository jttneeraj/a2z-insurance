const { MysqlGeoRtoMaster2023Model } = require("../models/mysqldb/geo-rto-master-2023");
const { MysqlInsurerVehicleMasterModel } = require("../models/mysqldb/insurer-vehicle-master");
const { MysqlInsurerPreviousPolicyTypeMasterModel } = require("../models/mysqldb/insurer-previous-policy-type-master");
const { MysqlInsurerPreviousInsurerMasterModel } = require("../models/mysqldb/insurer-previous-insurer-master");
const { MysqlInsurerNcbMasterModel } = require("../models/mysqldb/insurer-ncb-master");

const validateMotorQuoteMasters_ = async (payload) => {
    const errors = [];

    if (payload.rto_code) {
        const rto = await MysqlRtoMasterModel.findByQuery({
            rto_code: payload.rto_code,
        });

        if (!rto) {
            errors.push("Invalid RTO code");
        }
    }

    if (payload.make_code || payload.model_code || payload.variant_code) {
        const vehicle = await MysqlVehicleMasterModel.findByQuery({
            make_code: payload.make_code,
            model_code: payload.model_code,
            variant_code: payload.variant_code,
        });

        if (!vehicle) {
            errors.push("Invalid vehicle make/model/variant");
        }
    }

    if (payload.previous_policy_type) {
        const previousPolicyType = await MysqlPreviousPolicyTypeModel.findByQuery({
            previous_policy_type_code: payload.previous_policy_type,
        });

        if (!previousPolicyType) {
            errors.push("Invalid previous policy type");
        }
    }

    if (payload.previous_insurer_code) {
        const previousInsurer = await MysqlMotorPreviousInsurerModel.findByQuery({
            previous_insurer_code: payload.previous_insurer_code,
        });

        if (!previousInsurer) {
            errors.push("Invalid previous insurer");
        }
    }

    if (payload.previous_ncb_percent !== undefined && payload.previous_ncb_percent !== null) {
        const ncb = await MysqlNcbMasterModel.findByQuery({
            ncb_percent: payload.previous_ncb_percent,
        });

        if (!ncb) {
            errors.push("Invalid NCB percentage");
        }
    }

    return {
        is_valid: errors.length === 0,
        errors,
    };
};

const validateMotorQuoteMasters = async (payload) => {
    const errors = [];

    if (payload.rto_code) {
        const rto = await MysqlGeoRtoMaster2023Model.findByQuery({
            rto_code: payload.rto_code,
        });

        if (!rto) {
            errors.push("Invalid RTO code");
        }
    }

    if (payload.vehicle_code) {
        const vehicle = await MysqlInsurerVehicleMasterModel.findByQuery({
            vehicle_code: payload.vehicle_code,
        });

        if (!vehicle) {
            errors.push("Invalid vehicle code");
        }
    }

    if (payload.previous_policy_type) {
        const previousPolicyType = await MysqlInsurerPreviousPolicyTypeMasterModel.findByQuery({
            previous_policy_type_code: payload.previous_policy_type,
        });

        if (!previousPolicyType) {
            errors.push("Invalid previous policy type");
        }
    }

    if (payload.previous_insurer_code) {
        const previousInsurer = await MysqlInsurerPreviousInsurerMasterModel.findByQuery({
            previous_insurer_code: payload.previous_insurer_code,
        });

        if (!previousInsurer) {
            errors.push("Invalid previous insurer");
        }
    }

    if (payload.previous_ncb_percent !== undefined && payload.previous_ncb_percent !== null) {
        const ncb = await MysqlInsurerNcbMasterModel.findByQuery({
            ncb_percent: payload.previous_ncb_percent,
        });

        if (!ncb) {
            errors.push("Invalid NCB percentage");
        }
    }

    return {
        is_valid: errors.length === 0,
        errors,
    };
};

module.exports = {
    validateMotorQuoteMasters,
}; 