const { MysqlQuoteRequestVehicleDetailsModel } = require("../../../models/mysqldb/quote-request-vehicle-detail");
const { MysqlQuoteRequestOwnerDetailsModel } = require("../../../models/mysqldb/quote-request-owner-detail");
const { MysqlQuoteRequestPolicyDetailsModel } = require("../../../models/mysqldb/quote-request-policy-detail");
const { log } = require("winston");

function toDateOnly(value) {
    if (!value) return null;
    if (typeof value === "string") return value.substring(0, 10);

    try {
        return new Date(value).toISOString().substring(0, 10);
    } catch (error) {
        return null;
    }
}

function addOneYearMinusOneDay(startDate) {
    const date = startDate ? new Date(startDate) : new Date();
    const endDate = new Date(date);
    endDate.setFullYear(endDate.getFullYear() + 1);
    endDate.setDate(endDate.getDate() - 1);
    return endDate.toISOString().substring(0, 10);
}

function getToday() {
    return new Date().toISOString().substring(0, 10);
}

function getManufactureDate(vehicleDetail, payload = {}) {
    if (payload.manufactureDate) return payload.manufactureDate;
    if (payload.manufacture_date) return payload.manufacture_date;
    if (vehicleDetail?.manufacturing_year) return `${vehicleDetail.manufacturing_year}-01-01`;
    return "2022-01-01";
}

function mapNcbToDigit(value) {
    const ncb = Number(value || 0);

    if (ncb >= 50) return "FIFTY";
    if (ncb >= 45) return "FORTY_FIVE";
    if (ncb >= 35) return "THIRTY_FIVE";
    if (ncb >= 25) return "TWENTY_FIVE";
    if (ncb >= 20) return "TWENTY";
    return "ZERO";
}

function splitName(fullName = "") {
    const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);

    return {
        firstName: parts[0] || "Test",
        lastName: parts.slice(1).join(" ") || "User",
    };
}

function parseAmount(value) {
    if (value === null || value === undefined) return 0;
    return Number(String(value).replace(/[^0-9.]/g, "")) || 0;
}

function normalizeBoolean(value, fallback = false) {
    if (value === true || value === false) return value;
    if (value === 1 || value === "1") return true;
    if (value === 0 || value === "0") return false;
    if (String(value).toLowerCase() === "true") return true;
    if (String(value).toLowerCase() === "false") return false;
    return fallback;
}

function normalizeGender(value) {
    const gender = String(value || "").trim().toUpperCase();
    if (["MALE", "M"].includes(gender)) return "MALE";
    if (["FEMALE", "F"].includes(gender)) return "FEMALE";
    return "MALE";
}

function normalizeDigitQuickQuoteResponse(responsePayload) {
    const contract = responsePayload?.contract || {};
    const coverages = contract?.coverages || {};
    const ownDamage = coverages?.ownDamage || {};
    const thirdParty = coverages?.thirdPartyLiability || {};
    const vehicleIdv = responsePayload?.vehicle?.vehicleIDV || {};
    const serviceTax = responsePayload?.serviceTax || {};

    const netPremium = parseAmount(
        responsePayload?.netPremium ||
        ownDamage?.policyNetPremiumWithoutZeroDepWithoutPreInspection
    );

    const grossPremium = parseAmount(
        responsePayload?.grossPremium ||
        ownDamage?.policyGrossPremiumWithoutZeroDepWithoutPreInspection
    );

    const gstAmount = parseAmount(serviceTax?.totalTax);
    const ownDamagePremium = parseAmount(ownDamage?.netPremium || ownDamage?.withoutZeroDepNetPremium);
    const thirdPartyPremium = parseAmount(thirdParty?.netPremium);

    return {
        insurer_quote_reference_no: responsePayload?.enquiryId || responsePayload?.applicationId || null,
        plan_name: "Digit Motor Comprehensive",
        policy_type: contract?.subInsuranceProductCode || "PB",
        idv: vehicleIdv?.idv || 0,
        min_idv: vehicleIdv?.minimumIdv || 0,
        max_idv: vehicleIdv?.maximumIdv || 0,
        own_damage_premium: ownDamagePremium,
        third_party_premium: thirdPartyPremium,
        addon_premium: 0,
        discount_amount: parseAmount(responsePayload?.discounts?.specialDiscountAmount),
        net_premium: netPremium,
        gst_amount: gstAmount,
        final_premium: grossPremium || netPremium + gstAmount,
        currency: "INR",
        quote_valid_till: contract?.quotationAvailabilityEndDate || null,
    };
}

class DigitMapper {
    async getQuoteDetails(quoteRequestId) {
        const vehicleDetail = await MysqlQuoteRequestVehicleDetailsModel.findByQuery({ quote_request_id: quoteRequestId });
        const ownerDetail = await MysqlQuoteRequestOwnerDetailsModel.findByQuery({ quote_request_id: quoteRequestId });
        const policyDetail = await MysqlQuoteRequestPolicyDetailsModel.findByQuery({ quote_request_id: quoteRequestId });

        return { vehicleDetail, ownerDetail, policyDetail };
    }

    async buildQuickQuotePayload({ quoteRequest, payload = {} }) {
        const quoteRequestId = quoteRequest.id;
        const { vehicleDetail, ownerDetail, policyDetail } = await this.getQuoteDetails(quoteRequestId);

        const startDate = payload.startDate || payload.policy_start_date || getToday();
        const ownerName = splitName(ownerDetail?.full_name);

        return {
            pincode: payload.pincode || ownerDetail?.pincode || "176040",
            previousInsurer: this.buildPreviousInsurer(policyDetail, payload, startDate),
            preInspection: {
                isPreInspectionOpted: normalizeBoolean(payload.isPreInspectionOpted || payload.is_pre_inspection_opted, false),
            },
            contract: {
                policyHolderType: payload.policyHolderType || ownerDetail?.owner_type || "INDIVIDUAL",
                insuranceProductCode: payload.insuranceProductCode || "20101",
                endDate: payload.endDate || payload.policy_end_date || addOneYearMinusOneDay(startDate),
                externalPolicyNumber: payload.externalPolicyNumber || null,
                isNCBTransfer: normalizeBoolean(payload.isNCBTransfer || payload.is_ncb_transfer, false),
                subInsuranceProductCode: payload.subInsuranceProductCode || "PB",
                coverages: this.buildDefaultCoverages(payload),
                startDate,
            },
            enquiryId: payload.enquiryId || payload.enquiry_id || quoteRequest.quote_request_no,
            pospInfo: {
                isPOSP: normalizeBoolean(payload.isPOSP || payload.is_posp, false),
            },
            vehicle: this.buildVehicle(vehicleDetail, payload, startDate),
            _debugMappedFrom: {
                ownerName,
                ownerMobile: ownerDetail?.mobile_number || null,
                ownerEmail: ownerDetail?.email || null,
            },
        };
    }



    async buildCreateQuotePayload({ quoteRequest, proposal, quoteResult, selectedPlan, payload = {} }) {
        const quoteRequestId = quoteRequest.id;
        const { vehicleDetail, ownerDetail, policyDetail } = await this.getQuoteDetails(quoteRequestId);

        const startDate =
            payload.startDate ||
            payload.policy_start_date ||
            toDateOnly(policyDetail?.policy_start_date) ||
            null;

        const endDate =
            payload.endDate ||
            payload.policy_end_date ||
            toDateOnly(policyDetail?.policy_end_date) ||
            null;

        const proposerName = splitName(
            payload.proposer_name ||
            proposal?.proposer_name ||
            ownerDetail?.full_name
        );

        const digitEnquiryId =
            payload.enquiryId ||
            payload.enquiry_id ||
            quoteResult?.insurer_quote_reference_no ||
            quoteRequest.quote_request_no;

        return {
            persons: [
                this.buildPolicyHolderPerson({ ownerDetail, proposal, payload, proposerName }),
            ],

            pincode: payload.pincode || ownerDetail?.pincode || "342001",

            previousInsurer: this.buildPreviousInsurer(policyDetail, payload, startDate),

            preInspection: {
                isPreInspectionOpted: normalizeBoolean(
                    payload.isPreInspectionOpted || payload.is_pre_inspection_opted,
                    false
                ),
            },

            kyc: {
                ckycReferenceNumber:
                    payload.ckycReferenceNumber ||
                    payload.ckyc_reference_number ||
                    payload.pan_number ||
                    ownerDetail?.pan_number ||
                    null,

                isKYCDone: normalizeBoolean(payload.isKYCDone || payload.is_kyc_done, false),

                ckycReferenceDocId:
                    payload.ckycReferenceDocId ||
                    payload.ckyc_reference_doc_id ||
                    "D07",

                photo: payload.photo || null,

                dateOfBirth:
                    payload.dateOfBirth ||
                    payload.date_of_birth ||
                    toDateOnly(ownerDetail?.dob) ||
                    "2000-01-01",
            },

            contract: {
                policyHolderType: payload.policyHolderType || ownerDetail?.owner_type || "INDIVIDUAL",
                insuranceProductCode: payload.insuranceProductCode || "20101",
                endDate,
                externalPolicyNumber: payload.externalPolicyNumber || null,
                subInsuranceProductCode: payload.subInsuranceProductCode || "PB",
                coverages: this.buildCreateQuoteCoverages(payload),
                startDate,
            },

            nominee: {
                firstName: payload.nomineeFirstName || payload.nominee_first_name || "Test",
                lastName: payload.nomineeLastName || payload.nominee_last_name || "Nominee",
                dateOfBirth: payload.nomineeDateOfBirth || payload.nominee_date_of_birth || "1990-01-01",
                middleName: payload.nomineeMiddleName || payload.nominee_middle_name || null,
                personType: "INDIVIDUAL",
                relation: payload.nomineeRelation || payload.nominee_relation || "FATHER",
            },

            motorQuestions: {
                selfInspection: normalizeBoolean(payload.selfInspection || payload.self_inspection, true),
                furtherAgreement: payload.furtherAgreement || null,
                financer: payload.financer || null,
            },

            enquiryId: digitEnquiryId,

            pospInfo: {
                isPOSP: normalizeBoolean(payload.isPOSP || payload.is_posp, false),
            },

            vehicle: this.buildVehicle(vehicleDetail, payload, startDate, quoteResult, policyDetail),
        };
    }

    buildPolicyHolderPerson({ ownerDetail, proposal, payload = {}, proposerName }) {
        console.log("🚀 ~ DigitMapper ~ buildPolicyHolderPerson ~ proposerName:", proposerName)
        console.log("🚀 ~ DigitMapper ~ buildPolicyHolderPerson ~ payload:", payload)
        console.log("🚀 ~ DigitMapper ~ buildPolicyHolderPerson ~ proposal:", proposal)
        console.log("🚀 ~ DigitMapper ~ buildPolicyHolderPerson ~ ownerDetail:", ownerDetail)
        
        return {
            firstName: payload.firstName || payload.first_name || proposerName.firstName,
            identificationDocuments: [],
            lastName: payload.lastName || payload.last_name || proposerName.lastName,
            addresses: [
                {
                    addressType: "PRIMARY_RESIDENCE",
                    flatNumber: payload.flatNumber || payload.flat_number || null,
                    streetNumber: payload.streetNumber || payload.street_number || null,
                    street:
                        payload.street ||
                        payload.address_line1 ||
                        ownerDetail?.address_line1 ||
                        "Test Address",
                    district: payload.district || null,
                    city: payload.city || ownerDetail?.city || "Jodhpur",
                    country: "IN",
                    pincode: payload.pincode || ownerDetail?.pincode || "176040",
                    //state: payload.state || payload.state_code || ownerDetail?.state_code || "8",
                     state: "8",
                },
            ],
            communications: [
                {
                    communicationType: "MOBILE",
                    communicationId:
                        payload.mobile ||
                        payload.proposer_mobile ||
                        proposal?.proposer_mobile ||
                        ownerDetail?.mobile_number ||
                        "9876543210",
                    isPrefferedCommunication: true,
                },
                {
                    communicationType: "EMAIL",
                    communicationId:
                        payload.email ||
                        payload.proposer_email ||
                        proposal?.proposer_email ||
                        ownerDetail?.email ||
                        "test@example.com",
                    isPrefferedCommunication: true,
                },
            ],
            isVehicleOwner: true,
            isInsuredPerson: true,
            gender: normalizeGender(payload.gender || ownerDetail?.gender),
            isPolicyHolder: true,
            dateOfBirth: payload.dateOfBirth || payload.date_of_birth || toDateOnly(ownerDetail?.dob) || "2000-01-01",
            isDriver: true,
            personType: payload.personType || payload.person_type || "INDIVIDUAL",
        };
    }

    buildPreviousInsurer(policyDetail, payload = {}, startDate) {
        return {
            previousInsurerCode:
                payload.previousInsurerCode ||
                payload.previous_insurer_code ||
                policyDetail?.previous_insurer_code ||
                "113",

            previousPolicyExpiryDate:
                payload.previousPolicyExpiryDate ||
                payload.previous_policy_expiry_date ||
                toDateOnly(policyDetail?.previous_policy_expiry_date) ||
                startDate,

            isClaimInLastYear: normalizeBoolean(
                payload.isClaimInLastYear ??
                payload.is_claim_in_last_year ??
                policyDetail?.claim_made_last_year,
                false
            ),

            previousNoClaimBonus:
                payload.previousNoClaimBonus ||
                payload.previous_no_claim_bonus ||
                mapNcbToDigit(policyDetail?.previous_ncb_percent),

            previousPolicyNumber:
                payload.previousPolicyNumber ||
                payload.previous_policy_number ||
                policyDetail?.previous_policy_number ||
                "NA",

            isPreviousInsurerKnown: true,

            currentThirdPartyPolicy:
                payload.currentThirdPartyPolicy ||
                payload.current_third_party_policy ||
                null,

            previousPolicyType:
                payload.digitPreviousPolicyType ||
                payload.digit_previous_policy_type ||
                null,

            originalPreviousPolicyType:
                payload.originalPreviousPolicyType ||
                payload.original_previous_policy_type ||
                null,
        };
    }

    buildVehicle(vehicleDetail, payload = {}, startDate, quoteResult = null, policyDetail = null) {
        const vehicleMaincode =
            payload.vehicleMaincode ||
            payload.vehicle_maincode ||
            vehicleDetail?.vehicle_code ||
            payload.vehicle_code;

        if (!vehicleMaincode) {
            throw new Error("Digit vehicleMaincode is missing. Please pass/save valid Digit vehicle_code.");
        }

        return {
            isVehicleNew: normalizeBoolean(
                payload.isVehicleNew ?? payload.is_vehicle_new,
                String(vehicleDetail?.registration_type || "REGISTERED").toUpperCase() === "NEW"
            ),

            vehicleMaincode,

            licensePlateNumber:
                payload.licensePlateNumber ||
                payload.license_plate_number ||
                vehicleDetail?.vehicle_registration_number ||
                "KA01ED4289",

            registrationAuthority:
                payload.registrationAuthority ||
                payload.registration_authority ||
                vehicleDetail?.rto_code ||
                "KA01",

            engineNumber:
                payload.engineNumber ||
                payload.engine_number ||
                vehicleDetail?.engine_number ||
                "ENGINE12345",

            vehicleIdentificationNumber:
                payload.vehicleIdentificationNumber ||
                payload.vehicle_identification_number ||
                payload.chassis_number ||
                vehicleDetail?.chassis_number ||
                "CHASSIS12345",

            manufactureDate: getManufactureDate(vehicleDetail, payload),

            registrationDate:
                payload.registrationDate ||
                payload.registration_date ||
                toDateOnly(vehicleDetail?.registration_date) ||
                startDate,

            vehicleIDV: {
                idv: Number(
                    payload.idv ||
                    payload.vehicle_idv ||
                    //payload.selected_idv ||
                    // quoteResult?.idv ||
                    // policyDetail?.selected_idv ||
                    0
                ), 
            },
        };
    }

    buildDefaultCoverages(payload = {}) {
        return {
            isIMT23: false,
            personalAccident: { selection: normalizeBoolean(payload.personalAccidentSelection || payload.personal_accident_selection, false) },
            addons: {
                returnToInvoice: { selection: normalizeBoolean(payload.returnToInvoice || payload.return_to_invoice, false) },
                rimProtection: { selection: normalizeBoolean(payload.rimProtection || payload.rim_protection, false) },
                consumables: { selection: normalizeBoolean(payload.consumables, false) },
                partsDepreciation: { selection: normalizeBoolean(payload.partsDepreciation || payload.parts_depreciation, false) },
                engineProtection: { selection: normalizeBoolean(payload.engineProtection || payload.engine_protection, false) },
                tyreProtection: { selection: normalizeBoolean(payload.tyreProtection || payload.tyre_protection, false) },
                roadSideAssistance: { selection: normalizeBoolean(payload.roadSideAssistance || payload.road_side_assistance, false) },
            },
            accessories: {
                electrical: { selection: false },
                nonElectrical: { selection: false },
                cng: { selection: false },
            },
            voluntaryDeductible: null,
            isGeoExt: false,
            legalLiability: {
                nonFarePaxLL: { selection: false },
                unnamedPaxLL: { selection: false },
                workersCompensationLL: { selection: false },
                paidDriverLL: { selection: false },
                employeesLL: { selection: false },
                cleanersLL: { selection: false },
            },
            thirdPartyLiability: { isTPPD: false },
            unnamedPA: {
                unnamedPaidDriver: { selection: false },
                unnamedPax: { selection: false },
                unnamedConductor: { selection: false },
                unnamedHirer: { selection: false },
                unnamedPillionRider: { selection: false },
                unnamedCleaner: { selection: false },
            },
            isOverturningExclusionIMT47: false,
            isTheftAndConversionRiskIMT43: false,
            ownDamage: {
                discount: {
                    userSpecialDiscountPercent: String(payload.userSpecialDiscountPercent || payload.user_special_discount_percent || "0"),
                },
            },
        };
    }

    buildCreateQuoteCoverages(payload = {}) {
        const coverages = this.buildDefaultCoverages(payload);

        coverages.accessories = {
            cng: { selection: false, insuredAmount: null },
            electrical: { selection: false, insuredAmount: null },
            nonElectrical: { selection: false, insuredAmount: null },
        };
        coverages.personalAccident = {
            coverTerm: payload.personalAccidentCoverTerm || null,
            selection: normalizeBoolean(payload.personalAccidentSelection || payload.personal_accident_selection, false),
            insuredAmount: payload.personalAccidentInsuredAmount || null,
        };
        coverages.fire = { selection: false };
        coverages.theft = { selection: false };

        return coverages;
    }

    buildPaymentPayload({ applicationId, payload = {} }) {
        return {
            paymentMode: payload.paymentMode || payload.payment_mode || "EB",
            successReturnUrl: payload.successReturnUrl || payload.success_return_url,
            cancelReturnUrl: payload.cancelReturnUrl || payload.cancel_return_url,
            applicationId,
        };
    }

    buildKycStatusPayload({ policyNumber }) {
        return { queryParam: { policyNumber } };
    }

    buildPolicyStatusPayload({ policyNumber }) {
        return { queryParam: { policyNumber } };
    }

    buildPdfPayload({ policyId, authorization }) {
        return {
            policyId,
            headerParam: { Authorization: authorization },
        };
    }

    normalizeQuickQuoteResponse(responsePayload) {
        return normalizeDigitQuickQuoteResponse(responsePayload);
    }

    normalizeCreateQuoteResponse(responsePayload) {
        return {
            insurer_proposal_reference_no: responsePayload?.applicationId || responsePayload?.policyNumber || null,
            application_id: responsePayload?.applicationId || null,
            policy_number: responsePayload?.policyNumber || null,
            proposal_status: responsePayload?.policyStatus || "CREATED",
            kyc_status: responsePayload?.kycStatus?.kycVerificationStatus || null,
            payment_status: responsePayload?.paymentStatus || null,
            final_premium: parseAmount(responsePayload?.grossPremium || responsePayload?.payment?.premiumAmount),
        };
    }

    normalizePaymentResponse(responsePayload) {
        return {
            insurer_request_reference: responsePayload?.requestReference || null,
            payment_link: responsePayload?.paymentLink || null,
            amount: Number(responsePayload?.premium || 0),
            insurer_payment_id: responsePayload?.digitPaymentId || null,
            payment_status: responsePayload?.paymentLink ? "PENDING" : "FAILED",
        };
    }

    normalizeKycStatusResponse(responsePayload) {
        return {
            policy_number: responsePayload?.policyNumber || responsePayload?.kycStatus?.policyNumber || null,
            policy_status: responsePayload?.policyStatus || responsePayload?.kycStatus?.policyStatus || null,
            payment_status: responsePayload?.paymentStatus || responsePayload?.kycStatus?.paymentStatus || null,
            kyc_status: responsePayload?.kycVerificationStatus || responsePayload?.kycStatus?.kycVerificationStatus || null,
            kyc_reason: responsePayload?.kycReason || responsePayload?.kycStatus?.kycReason || null,
            reference_id: responsePayload?.referenceId || responsePayload?.kycStatus?.referenceId || null,
        };
    }

    normalizePolicyStatusResponse(responsePayload) {
        return {
            policy_number: responsePayload?.policyNumber || null,
            policy_status: responsePayload?.policyStatus || null,
            payment_status: responsePayload?.payment?.paymentStatus || responsePayload?.kycStatus?.paymentStatus || null,
            kyc_status: responsePayload?.kycStatus?.kycVerificationStatus || null,
            insurer_policy_id: responsePayload?.applicationId || null,
            premium_amount: parseAmount(responsePayload?.payment?.premiumAmount),
        };
    }

    normalizePdfResponse(responsePayload) {
        return {
            document_url: responsePayload?.schedulePath || responsePayload?.schedulePathHC || null,
            document_code: responsePayload?.scheduleDocumentCode || responsePayload?.scheduleHCDocumentCode || null,
            document_source: responsePayload?.pdfSource || null,
            schedule_dms_doc_id: responsePayload?.scheduleDmsDocId || null,
        };
    }
}

module.exports = new DigitMapper();
