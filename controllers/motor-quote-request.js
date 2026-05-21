const { Op } = require("sequelize");

const { MysqlQuoteRequestsModel, mysqldb } = require("../models/mysqldb/quote-request");
const { MysqlQuoteRequestVehicleDetailsModel } = require("../models/mysqldb/quote-request-vehicle-detail");
const { MysqlQuoteRequestOwnerDetailsModel } = require("../models/mysqldb/quote-request-owner-detail");
const { MysqlQuoteRequestPolicyDetailsModel } = require("../models/mysqldb/quote-request-policy-detail");
const { MysqlCustomerLeadsModel } = require("../models/mysqldb/customer-lead");

const CommonService = require("../services/common");

const {
    validateMotorQuoteMasters,
} = require("../services/motor-quote-master-validation");

/**
 * @openapi
 * /customer/motor/quote-request/add:
 *   post:
 *     tags:
 *       - Motor Quote Request
 *     summary: Create motor quote request
 *     description: Create a new motor quote request with vehicle, owner, and policy details.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - lead_id
 *               - insurance_type_id
 *               - product_id
 *             properties:
 *               lead_id:
 *                 type: integer
 *                 example: 1
 *               insurance_type_id:
 *                 type: integer
 *                 example: 2
 *               product_id:
 *                 type: integer
 *                 example: 5
 *
 *               request_source:
 *                 type: string
 *                 example: WEB
 *
 *               # Vehicle Details
 *               registration_type:
 *                 type: string
 *                 example: REGISTERED
 *               vehicle_registration_number:
 *                 type: string
 *                 example: RJ14AB1234
 *               rto_code:
 *                 type: string
 *                 example: RJ14
 *               rto_city:
 *                 type: string
 *                 example: Jaipur
 *               make_code:
 *                 type: string
 *                 example: MARUTI
 *               make_name:
 *                 type: string
 *                 example: Maruti Suzuki
 *               model_code:
 *                 type: string
 *                 example: SWIFT
 *               model_name:
 *                 type: string
 *                 example: Swift
 *               variant_code:
 *                 type: string
 *                 example: VXI
 *               variant_name:
 *                 type: string
 *                 example: VXI Petrol
 *               fuel_type:
 *                 type: string
 *                 example: PETROL
 *               vehicle_type:
 *                 type: string
 *                 example: CAR
 *               cubic_capacity:
 *                 type: integer
 *                 example: 1197
 *               seating_capacity:
 *                 type: integer
 *                 example: 5
 *               manufacturing_year:
 *                 type: integer
 *                 example: 2022
 *               registration_date:
 *                 type: string
 *                 format: date
 *                 example: 2022-06-15
 *               engine_number:
 *                 type: string
 *                 example: ENG123456
 *               chassis_number:
 *                 type: string
 *                 example: CHS123456
 *
 *               # Owner Details
 *               owner_type:
 *                 type: string
 *                 example: INDIVIDUAL
 *               full_name:
 *                 type: string
 *                 example: Neeraj Prajapati
 *               mobile_number:
 *                 type: string
 *                 example: "9876543210"
 *               email:
 *                 type: string
 *                 example: neeraj@example.com
 *               gender:
 *                 type: string
 *                 example: MALE
 *               dob:
 *                 type: string
 *                 format: date
 *                 example: 1995-08-20
 *               pan_number:
 *                 type: string
 *                 example: ABCDE1234F
 *               address_line1:
 *                 type: string
 *                 example: Street 1
 *               address_line2:
 *                 type: string
 *                 example: Area Name
 *               city:
 *                 type: string
 *                 example: Jodhpur
 *               state_code:
 *                 type: string
 *                 example: RJ
 *               state_name:
 *                 type: string
 *                 example: Rajasthan
 *               pincode:
 *                 type: string
 *                 example: "342001"
 *
 *               # Policy Details
 *               policy_case:
 *                 type: string
 *                 example: ROLLOVER
 *               previous_insurer_code:
 *                 type: string
 *                 example: HDFC
 *               previous_insurer_name:
 *                 type: string
 *                 example: HDFC Ergo
 *               previous_policy_type:
 *                 type: string
 *                 example: COMPREHENSIVE
 *               previous_policy_number:
 *                 type: string
 *                 example: POL123456
 *               previous_policy_expiry_date:
 *                 type: string
 *                 format: date
 *                 example: 2025-06-30
 *               claim_made_last_year:
 *                 type: integer
 *                 example: 0
 *               previous_ncb_percent:
 *                 type: integer
 *                 example: 20
 *               applicable_ncb_percent:
 *                 type: integer
 *                 example: 25
 *               is_policy_expired:
 *                 type: integer
 *                 example: 0
 *               break_in_days:
 *                 type: integer
 *                 example: 0
 *
 *     responses:
 *       200:
 *         description: Motor quote request created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: integer
 *                   example: 0
 *                 status:
 *                   type: integer
 *                   example: 1
 *                 message:
 *                   type: string
 *                   example: Motor quote request created successfully
 *                 result:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     quote_request_no:
 *                       type: string
 *                       example: QT-20260501-000001
 *                     lead_id:
 *                       type: integer
 *                       example: 1
 *                     quote_status:
 *                       type: string
 *                       example: DRAFT
 *
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               examples:
 *                 missingLead:
 *                   value:
 *                     error: 1
 *                     status: 0
 *                     message: Lead id is required
 *                 missingInsuranceType:
 *                   value:
 *                     error: 1
 *                     status: 0
 *                     message: Insurance type id is required
 *                 missingProduct:
 *                   value:
 *                     error: 1
 *                     status: 0
 *                     message: Product id is required
 *
 *       404:
 *         description: Lead not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example:
 *                 error: 1
 *                 status: 0
 *                 message: Customer lead not found
 *
 *       500:
 *         description: Server error
 */
const add = async (req, res) => {
    const payload = req.body;

    try {
        if (!payload.lead_id) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Lead id is required",
            });
        }

        if (!payload.insurance_type_id) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Insurance type id is required",
            });
        }

        if (!payload.product_id) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Product id is required",
            });
        }

        const lead = await MysqlCustomerLeadsModel.findById(payload.lead_id);

        if (!lead) {
            return res.status(404).json({
                error: 1,
                status: 0,
                message: "Customer lead not found",
            });
        }

        const masterValidation = await validateMotorQuoteMasters(payload);

        if (!masterValidation.is_valid) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Master validation failed",
                validation_errors: masterValidation.errors,
            });
        }

        const today = new Date();
        const ymd = today.toISOString().slice(0, 10).replace(/-/g, "");

        const count = await MysqlQuoteRequestsModel.findAllCount({
            quote_request_no: {
                [Op.like]: `QT-${ymd}-%`,
            },
        });

        const quoteRequestNo = `QT-${ymd}-${String(count + 1).padStart(6, "0")}`;


        const transaction = await mysqldb.transaction();

        try {
            const quoteRequest = await MysqlQuoteRequestsModel.add(
                {
                    quote_request_no: quoteRequestNo,
                    lead_id: payload.lead_id,
                    insurance_type_id: payload.insurance_type_id,
                    product_id: payload.product_id,
                    quote_status: "DRAFT",
                    request_source: payload.request_source || "WEB",
                    is_active: 1,
                },
                transaction
            );

            await MysqlQuoteRequestVehicleDetailsModel.add(
                {
                    quote_request_id: quoteRequest.id,
                    registration_type: payload.registration_type || "REGISTERED",
                    vehicle_registration_number: payload.vehicle_registration_number || null,
                    rto_code: payload.rto_code || null,
                    rto_city: payload.rto_city || null,
                    make_code: payload.make_code || null,
                    make_name: payload.make_name || null,
                    model_code: payload.model_code || null,
                    model_name: payload.model_name || null,
                    variant_code: payload.variant_code || null,
                    variant_name: payload.variant_name || null,
                    fuel_type: payload.fuel_type || null,
                    vehicle_type: payload.vehicle_type || null,
                    cubic_capacity: payload.cubic_capacity || null,
                    seating_capacity: payload.seating_capacity || null,
                    manufacturing_year: payload.manufacturing_year || null,
                    registration_date: payload.registration_date || null,
                    engine_number: payload.engine_number || null,
                    chassis_number: payload.chassis_number || null,
                    vehicle_code: payload.vehicle_code || null, 

                    is_active: 1,
                },
                transaction
            );

            await MysqlQuoteRequestOwnerDetailsModel.add(
                {
                    quote_request_id: quoteRequest.id,
                    owner_type: payload.owner_type || "INDIVIDUAL",
                    full_name: payload.full_name || lead.full_name || null,
                    mobile_number: payload.mobile_number || lead.mobile_number || null,
                    email: payload.email || lead.email || null,
                    gender: payload.gender || null,
                    dob: payload.dob || null,
                    pan_number: payload.pan_number || null,
                    address_line1: payload.address_line1 || null,
                    address_line2: payload.address_line2 || null,
                    city: payload.city || null,
                    state_code: payload.state_code || null,
                    state_name: payload.state_name || null,
                    pincode: payload.pincode || null,
                    is_active: 1,
                },
                transaction
            );

            await MysqlQuoteRequestPolicyDetailsModel.add(
                {
                    quote_request_id: quoteRequest.id,
                    policy_case: payload.policy_case || "ROLLOVER",
                    previous_insurer_code: payload.previous_insurer_code || null,
                    previous_insurer_name: payload.previous_insurer_name || null,
                    previous_policy_type: payload.previous_policy_type || null,
                    previous_policy_number: payload.previous_policy_number || null,
                    previous_policy_expiry_date: payload.previous_policy_expiry_date || null,

                    policy_start_date: payload.policy_start_date || null,
                    policy_end_date: payload.policy_end_date || null,
                    current_third_party_policy: payload.current_third_party_policy || null,
                    original_previous_policy_type: payload.original_previous_policy_type || null,
                    selected_idv: payload.selected_idv || payload.idv || null,

                    claim_made_last_year: payload.claim_made_last_year || 0,
                    previous_ncb_percent: payload.previous_ncb_percent || null,
                    applicable_ncb_percent: payload.applicable_ncb_percent || null,
                    is_policy_expired: payload.is_policy_expired || 0,
                    break_in_days: payload.break_in_days || null,
                    is_active: 1,
                },
                transaction
            );

            await transaction.commit();

            return res.status(200).json({
                error: 0,
                status: 1,
                message: "Motor quote request created successfully",
                result: {
                    id: quoteRequest.id,
                    quote_request_no: quoteRequest.quote_request_no,
                    lead_id: quoteRequest.lead_id,
                    quote_status: quoteRequest.quote_status,
                },
            });
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (error) {

        console.log(error);

        CommonService.errorHandler(error, {
            url: "/customer/motor/quote-request/add",
            operation: "ADD MOTOR QUOTE REQUEST",
            relative_detail: "Error occurred during adding motor quote request",
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
};