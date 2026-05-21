base_url = http://localhost:4015/api/admin


S.No	masterType	file	db table
1	vehicle_master	Vehicle Master_New (1).xlsx	insurer_vehicle_master
2	voluntary_deductible_master	Volunatry Deductible Master.xlsx	insurer_voluntary_deductible_master
3	state_rto_city_pincode_master	State RTO City Pincode Master.xlsx	geo_rto_city_map, geo_city_default_pincode, geo_pincode_locality_master
4	state_code_master	State Code Master.xlsx	geo_state_master
5	previous_policy_type_master	Previous Policy Type Master.xlsx	insurer_previous_policy_type_master, insurer_product_previous_policy_type_map
6	pin_code_and_rto_master_2023	Pin Code and RTO Master 2023.xlsx	geo_pincode_master_2023, geo_rto_master_2023
7	motor_product_code_description	Motor Product Code Description.xlsx	insurer_motor_product_master, insurer_motor_product_cover_map, insurer_subinsurance_product_code, insurer_addon_age_limit_master
8	ncb_master	NCB Master.xlsx	insurer_ncb_master
9	nominee_master	Nominee Master.xlsx	insurer_nominee_relation_master
10	motor_previous_insurer_list	Motor Previous Insurer List.xlsx	insurer_previous_insurer_master
11	cv_vehicle_type_master	CV Vehicle Type Master.xlsx	insurer_cv_vehicle_type_master, insurer_cv_usage_type_master, insurer_cv_permit_usage_type_master
12	error_mapping	Error Mapping.xlsx	insurer_error_mapping
13	faq_motor	FAQ Motor.xlsx	insurer_motor_faq_master
14	doc_type_master	Doc Type Master.xlsx	insurer_kyc_document_type_master, insurer_mismatch_type_master
15	api_integration_all_master	API Integration All Master.xlsx	integration_insurance_company_master, integration_pincode_master, integration_rto_master, integration_state_master
16	api_fields_validation	API Fields Validation.xlsx	insurer_api_field_master, insurer_api_field_validation_rule

----------------------------------------------------------------------------------------------------------------------

Test Order:
1. Insurance Types
2. Insurers
3. Insurance Products
4. Insurer Products
5. Product Configs
6. Product Document Requirements
7. Addons
8. Product Addons
9. Insurer API Credentials
10. Insurer API Field Master
11. Insurer API Field Validation Rules


____________________________________________________________________________________________

Build APIs in this order:

Vehicle detail input API
registration number / new vehicle flow
RTO, vehicle make/model/variant, fuel type
Quote request API
customer + vehicle + product + insurer
save request in quote tables
Validation engine
use insurer_api_field_master
use insurer_api_field_validation_rule
Prepare insurer request payload
map your system fields to insurer API fields
Call insurer quote API
initially mock Digit One response if real API not available
Save quote response
premium, IDV, addons, taxes, quote reference
Return quote comparison response
frontend can show insurer card/list
My recommendation

Go with this next:

Option A: Create Customer Quote DB + APIs first
After that, we move to proposal, KYC, payment, policy PDF.

------------------------------------------------------------
Need to recheck : 
api/customer/motor/quotes/generate


..........................
**** DONE **** 
Master/Admin setup 
Master data import 
Customer lead 
Motor quote request 
Mock quote generation 
Quote result listing 
Select plan 
Proposal create 
Proposal detail 

^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
Lead → Quote Request → Generate Quote → Quote List → Select Plan → Proposal Create → Proposal Detail

________________________________________________
************NEXT*****************
Replace Mock Quote with Real Insurer Integration Layer
Internal Quote API
↓
Insurer Factory
↓
Digit Adapter
↓
Digit API
_____________________________________________________________

1. Take backup / git commit current working code
2. Apply shared-lib schema/model files first
3. Run SQL tables/alter scripts
4. Apply services/insurers files
5. Apply controllers/routes
6. Restart server
7. Test MOCK_DIGIT first

Quote → Select Plan → Proposal → Payment → KYC → Policy Status → PDF
_____________________________________________________

Remaining main flow:

1. Create Quote / Proposal
2. KYC Status
3. Payment API
4. Policy Status
5. PDF Generation

