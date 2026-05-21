const { getTDS, getIncludingGstAmount } = require("shared-library/services/common");

const calculateCommission = (user_parents, commission, amount) => {

    let retailer_charge = agentCharge(amount, commission.agent_charge, commission.charge_commission_type);

    let retailer_commission = getCommission(amount, commission.agent_commission, commission.charge_commission_type);

    let distributor_commission = getCommission(amount, commission.distributor_commission, commission.charge_commission_type);

    let md_commission = getCommission(amount, commission.md_commission, commission.charge_commission_type);

    let admin_commission = getCommission(amount, commission.admin_commission, commission.charge_commission_type);

    

    
    if (user_parents.distributor_id == 0) {
        admin_commission += distributor_commission;
        distributor_commission = 0;
    }
    if (user_parents.md_id == 0) {
        admin_commission += md_commission;
        md_commission = 0;
    }

    return result_data = {
        retailer: {
            id: user_parents.user_id,
            commission: Number(retailer_commission),
            charge: Number(retailer_charge),
            tds: getTDS(retailer_commission,user_parents.user_pan_status),
            gst: getIncludingGstAmount(retailer_charge)

        },
        md: {
            id: Number(user_parents.md_id),
            commission:  Number(md_commission),
            charge: 0,
            tds: (md_commission > 0 ) ? getTDS(md_commission,user_parents.md_pan_status) : 0,
            gst: 0
        },
        distributor: {
            id: Number(user_parents.distributor_id),
            commission:  Number(distributor_commission),
            charge: 0,
            tds: (distributor_commission) ? getTDS(distributor_commission,user_parents.distributer_pan_status) : 0,
            gst: 0
        },
        admin: {
            id: 1,
            commission:  Number(admin_commission),
            charge: 0,
            tds: 0,
            gst: 0
        },

    };

}
function agentCharge(amount, charge, chargeType) {

    let result = 0;
    if (chargeType == 'PERCENT')
        result = (Number(amount) * charge) / 100;
    else
        result = charge;
    return result;


}
function getCommission(amount, commission, commission_type) {
    amount  = Number(amount)
    commission  = Number(commission)
    let result = 0;
    if (commission_type =='PERCENT')
        result = (amount * commission) / 100;
    else
        result = commission;
    return result;
}
/* function getTDS(amount,pan_status='YES') {
    amount = Number(amount)
    const per = (pan_status === 'YES') ? Number(process.env.PAN_WHITELIST_TDS_DEDUCTION_RATE) : Number(process.env.TDS_DEDUCTION_RATE);
    return (amount * per) / 100;
}
function getExcludingGstAmount(amount) {
    amount = Number(amount)
    return (amount * 18)/100;
}
 */
module.exports = {
    calculateCommission,
    agentCharge,
    getCommission
}