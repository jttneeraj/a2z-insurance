const moment = require("moment");
const { Sequelize, Op } = require("sequelize");

const { insuranceAuthLogin } = require("../services/third-party");
const { ResponseHandler } = require("../utils/response-handler");
/* const {
    MysqlTransactionTypeModel,
} = require("../models/mysqldb/transaction-type"); */

const { bulkInsertMasterData, clearMasterTable, parseCvVehicleTypeTxt } = require("../models/mysqldb/master-import");
const { mysqldb } = require(process.env.SHARED_LIBRARY_PATH + "/services/models");

const fs = require("fs");
const { readXlsxFile } = require("../lib/xlsxImporter");

const { error } = require("console");




const MASTER_IMPORT_CONFIG = {
    voluntary_deductible_master: {
        fileName: "Volunatry Deductible Master.xlsx",
        defaultValues: {
            is_active: 1
        },
        tables: [
            {
                tableName: "insurer_voluntary_deductible_master",
                uniqueKeys: ["insurer_id", "deductible_code"],
                columnMapping: {
                    "Voluntary Deductible": "deductible_code"
                }
            }
        ]
    },

    vehicle_master: {
        fileName: "Vehicle Master.xlsx",
        defaultValues: {
            is_active: 1
        },
        tables: [
            {
                tableName: "insurer_vehicle_master",
                uniqueKeys: ["insurer_id", "vehicle_code"],
                columnMapping: {
                    "Vehicle Code": "vehicle_code",
                    "Maincode": "vehicle_code",
                    "Make": "make_name",
                    "Make Name": "make_name",
                    "Model": "model_name",
                    "Model Name": "model_name",
                    "Variant": "variant_name",
                    "Variant Name": "variant_name",
                    "Body Type": "body_type",
                    "Seating Capacity": "seating_capacity",
                    "Power": "power_hp",
                    "Power HP": "power_hp",
                    "CC": "cubic_capacity_cc",
                    "Cubic Capacity": "cubic_capacity_cc",
                    "GVW": "gross_vehicle_weight_kg",
                    "Gross Vehicle Weight": "gross_vehicle_weight_kg",
                    "Fuel Type": "fuel_type",
                    "Wheel Count": "wheel_count",
                    "ABS": "abs_flag",
                    "Abs Flag": "abs_flag",
                    "Air Bag": "air_bag_count",
                    "Air Bag Count": "air_bag_count",
                    "Vehicle Length": "vehicle_length_m",
                    "Ex Showroom Price": "ex_showroom_price",
                    "Price Year": "price_year",
                    "Production Status": "production_status",
                    "Manufacturing Type": "manufacturing_type",
                    "Vehicle Type": "vehicle_type",
                    "RN": "rn",
                    "Status": "is_active"
                }
            }
        ]
    },

    state_rto_city_pincode_master: {
        fileName: "state RTO CITY Pin code Master.xlsx",
        defaultValues: {
            is_active: 1
        },
        tables: [
            {
                sheetName: "RTO to City",
                tableName: "geo_rto_city_map",
                uniqueKeys: ["rto_code"],
                columnMapping: {
                    "Rto code": "rto_code",
                    "City and State": "city_state_label"
                }
            },
            {
                sheetName: "City to Default Pincode",
                tableName: "geo_city_default_pincode",
                uniqueKeys: ["city_name"],
                columnMapping: {
                    "Pin code": "pincode",
                    "City": "city_name"
                }
            },
            {
                sheetName: "Pin code Values",
                tableName: "geo_pincode_locality_master",
                uniqueKeys: [],
                columnMapping: {
                    "City": "city_name",
                    "District": "district_name",
                    "Street": "street_name",
                    "Segment Opened": "segment_opened",
                    "Pin code": "pincode",
                    "State code": "state_code",
                    "Taluk": "taluk_name"
                }
            }
        ]
    },

    state_code_master: {
        fileName: "State Code Master.xlsx",
        defaultValues: {
            is_active: 1
        },
        tables: [
            {
                tableName: "geo_state_master",
                uniqueKeys: ["state_code"],
                columnMapping: {
                    "State Code": "state_code",
                    "State": "state_name",
                    "State Name": "state_name",
                    "Status": "is_active"
                }
            }
        ]
    },

    previous_policy_type_master: {
        fileName: "Previous_Policy_Type.xlsx",
        defaultValues: {
            is_active: 1
        },
        tables: [
            {
                sheetName: "Description",
                tableName: "insurer_previous_policy_type_master",
                uniqueKeys: ["previous_policy_type_code"],
                columnMapping: {
                    "DOMNAME": "previous_policy_type_code",
                    "DOMTEXT": "previous_policy_type_label"
                }
            },
            {
                sheetName: "Codes",
                tableName: "insurer_product_previous_policy_type_map",
                uniqueKeys: ["insurer_id", "product_code", "previous_policy_type_code"],
                defaultValues: {
                    is_allowed: 1,
                    is_active: 1
                },
                customReader: "previousPolicyCodeMatrix"
            }
        ]
    },

    pin_code_and_rto_master_2023: {
        fileName: "Pin Code and RTO Master_2023.xlsx",
        defaultValues: {
            is_active: 1
        },
        tables: [
            {
                sheetName: "PIN CODE",
                tableName: "geo_pincode_master_2023",
                uniqueKeys: [],
                columnMapping: {
                    "PIN CODE": "pincode",
                    "CITY": "city_name",
                    "DISTRICT": "district_name",
                    "STREET": "street_name",
                    "TALUK": "taluk_name",
                    "SEGMENT": "segment_name"
                }
            },
            {
                sheetName: "RTO MASTER",
                tableName: "geo_rto_master_2023",
                uniqueKeys: ["rto_code"],
                columnMapping: {
                    "RTO": "rto_code",
                    "CITY": "city_name"
                }
            }
        ]
    },

    motor_product_code_description: {
        fileName: "Motor Product Code Description.xlsx",
        defaultValues: {
            is_active: 1
        },
        tables: [
            {
                sheetName: "Product Codes and Addons(2W,4W)",
                tableName: "insurer_motor_product_master",
                uniqueKeys: ["insurer_id", "product_code"],
                customReader: "motorProductMatrix"
            },
            {
                sheetName: "Product Codes and Addons(2W,4W)",
                tableName: "insurer_motor_product_cover_map",
                uniqueKeys: ["insurer_id", "product_code", "cover_code"],
                customReader: "motorProductCoverMatrix"
            },
            {
                sheetName: "CV",
                tableName: "insurer_motor_product_cover_map",
                uniqueKeys: ["insurer_id", "product_code", "cover_code"],
                customReader: "cvProductCoverMatrix"
            },
            {
                sheetName: "SubinsuranceProductcode",
                tableName: "insurer_subinsurance_product_code",
                uniqueKeys: ["insurer_id", "subinsurance_product_code"],
                columnMapping: {
                    "Product": "product_name",
                    "Product Code": ["subinsurance_product_code", "sub_product_code"]
                }
            },
            {
                sheetName: "Addons age limit",
                tableName: "insurer_addon_age_limit_master",
                uniqueKeys: ["insurer_id", "addon_name"],
                customReader: "addonAgeLimit"
            }
        ]
    },

    ncb_master: {
        fileName: "NCB Master.xlsx",
        defaultValues: {
            is_active: 1
        },
        tables: [
            {
                sheetName: "Sheet1",
                tableName: "insurer_ncb_master",
                uniqueKeys: ["insurer_id", "ncb_code"],
                customReader: "ncbMaster"
            }
        ]
    },

    nominee_master: {
        fileName: "Nominee Master.xlsx",
        defaultValues: {
            is_active: 1
        },
        tables: [
            {
                sheetName: "Sheet1",
                tableName: "insurer_nominee_relation_master",
                uniqueKeys: ["insurer_id", "relation_code"],
                columnMapping: {
                    "Nominee Relation": ["relation_code", "relation_label"]
                }
            }
        ]
    },

    motor_previous_insurer_list: {
        fileName: "Motor Prevoius insurer List.xlsx",
        defaultValues: {
            is_active: 1
        },
        tables: [
            {
                sheetName: "Sheet1",
                tableName: "insurer_previous_insurer_master",
                uniqueKeys: ["insurer_id", "previous_insurer_code"],
                columnMapping: {
                    "No": "previous_insurer_code",
                    "Name": "previous_insurer_name"
                }
            }
        ]
    },

    cv_vehicle_type_master: {
        fileName: "CV_VehicleType_Master.txt",
        fileType: "txt",
        customReader: "cvVehicleTypeTxt",
        defaultValues: {
            is_active: 1
        },
        tables: [
            {
                tableName: "insurer_cv_vehicle_type_master",
                uniqueKeys: ["insurer_id", "vehicle_type_code"]
            },
            {
                tableName: "insurer_cv_usage_type_master",
                uniqueKeys: ["insurer_id", "usage_type_code"]
            },
            {
                tableName: "insurer_cv_permit_usage_type_master",
                uniqueKeys: ["insurer_id", "permit_usage_type_code"]
            }
        ]
    },

    error_mapping: {
        fileName: "Error Mapping.xlsx",
        defaultValues: {
            is_active: 1
        },
        tables: [
            {
                sheetName: "Sheet1",
                headerRow: 2,
                tableName: "insurer_error_mapping",
                uniqueKeys: ["insurer_id", "insurer_error_code"],
                columnMapping: {
                    "Digit error code": "insurer_error_code",
                    "Digit error message": "insurer_error_message",
                    "Digit error description": "internal_error_description"
                }
            }
        ]
    },
    //from here on dev
    faq_motor: {
        fileName: "FAQ MOTOR.xlsx",
        defaultValues: {
            is_active: 1
        },
        tables: [
            {
                sheetName: "Sheet1",
                tableName: "insurer_motor_faq_master",
                uniqueKeys: ["insurer_id", "question_text"],
                columnMapping: {
                    "Questions": "question_text",
                    "Explanations": "answer_text"
                }
            }
        ]
    },

    doc_type_master: {
        fileName: "Doc Type Master1.xlsx",
        defaultValues: {
            is_active: 1
        },
        tables: [
            {
                sheetName: "KYC doc Type",
                tableName: "insurer_kyc_document_type_master",
                uniqueKeys: ["insurer_id", "document_number_code"],
                columnMapping: {
                    "Document_number": "document_number_code",
                    "Document_Type": "document_type_name"
                }
            },
            {
                sheetName: "MismatchType",
                tableName: "insurer_mismatch_type_master",
                uniqueKeys: ["insurer_id", "mismatch_code"],
                customReader: "mismatchTypeTwoColumn"
            }
        ]
    },

    api_integration_all_master: {
        fileName: "API Integration - All Master.xlsx",
        defaultValues: {
            is_active: 1
        },
        tables: [
            {
                sheetName: "Insurance Company Master",
                tableName: "integration_insurance_company_master",
                uniqueKeys: ["insurance_company_code"],
                columnMapping: {
                    "Insurance Company Code": "insurance_company_code",
                    "Name of the Company": "insurance_company_name"
                }
            },
            {
                sheetName: "PinCode Master",
                tableName: "integration_pincode_master",
                uniqueKeys: [],
                columnMapping: {
                    "PIN CODE": "pincode",
                    "AREA NAME": "area_name",
                    "DISTRICT": "district_name",
                    "TALUK": "taluk_name",
                    "STATE CODE": "state_code"
                }
            },
            {
                sheetName: "RTO Master",
                tableName: "integration_rto_master",
                uniqueKeys: ["rto_code"],
                columnMapping: {
                    "RTO Code": "rto_code",
                    "Registered City Name": "registered_city_name",
                    "Registered State Name": "registered_state_name"
                }
            },
            {
                sheetName: "State Master",
                tableName: "integration_state_master",
                uniqueKeys: ["state_code"],
                columnMapping: {
                    "CODE": "state_code",
                    "STATE": "state_name"
                }
            }
        ]
    },

    api_fields_validation: {
        fileName: "API Fields Validation.xlsx",
        defaultValues: {
            is_active: 1
        },
        tables: [
            {
                sheetName: "All Motor Product",
                tableName: "insurer_api_field_master",
                uniqueKeys: ["insurer_id", "field_name"],
                customReader: "apiFieldMaster"
            },
            {
                sheetName: "All Motor Product",
                tableName: "insurer_api_field_validation_rule",
                uniqueKeys: ["insurer_id", "field_name", "validation_context_code"],
                customReader: "apiFieldValidationRules"
            }
        ]
    }
};


/**
 * @openapi
 * /master/master-file-import:
 *   post:
 *     tags:
 *       - Insurance Master Import
 *     summary: Import master data from XLSX or TXT file
 *     description: |
 *       Upload and import master data into multiple database tables based on the provided `masterType`.
 *       The system dynamically maps Excel sheets or TXT data into configured database tables.
 *
 *       Note:
 *       Swagger UI may not render dropdown for `masterType` in multipart requests.
 *       Please refer to allowed values below.
 *
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - masterType
 *               - file
 *               - insurer_id
 *             properties:
 *               masterType:
 *                 type: string
 *                 enum:
 *                   - vehicle_master
 *                   - voluntary_deductible_master
 *                   - state_rto_city_pincode_master
 *                   - state_code_master
 *                   - previous_policy_type_master
 *                   - pin_code_and_rto_master_2023
 *                   - motor_product_code_description
 *                   - ncb_master
 *                   - nominee_master
 *                   - motor_previous_insurer_list
 *                   - cv_vehicle_type_master
 *                   - error_mapping
 *                   - faq_motor
 *                   - doc_type_master
 *                   - api_integration_all_master
 *                   - api_fields_validation
 *                 example: vehicle_master
 *                 description: |
 *                   Allowed values:
 *                   - vehicle_master
 *                   - voluntary_deductible_master
 *                   - state_rto_city_pincode_master
 *                   - state_code_master
 *                   - previous_policy_type_master
 *                   - pin_code_and_rto_master_2023
 *                   - motor_product_code_description
 *                   - ncb_master
 *                   - nominee_master
 *                   - motor_previous_insurer_list
 *                   - cv_vehicle_type_master
 *                   - error_mapping
 *                   - faq_motor
 *                   - doc_type_master
 *                   - api_integration_all_master
 *                   - api_fields_validation
 *
 *               insurer_id:
 *                 type: integer
 *                 example: 1
 *                 description: Insurer ID for which master data is being uploaded
 *
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: XLSX or TXT file to be uploaded
 *
 *     responses:
 *       200:
 *         description: Master file imported successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: integer
 *                   example: 1
 *                 error:
 *                   type: integer
 *                   example: 0
 *                 message:
 *                   type: string
 *                   example: Master file imported successfully
 *                 masterType:
 *                   type: string
 *                   example: vehicle_master
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       tableName:
 *                         type: string
 *                         example: insurer_vehicle_master
 *                       totalRows:
 *                         type: integer
 *                         example: 1500
 *                       result:
 *                         type: object
 *
 *       400:
 *         description: Validation error (missing fields / invalid masterType)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: integer
 *                   example: 0
 *                 error:
 *                   type: integer
 *                   example: 1
 *                 message:
 *                   type: string
 *                   example: Invalid masterType
 *
 *       500:
 *         description: Internal server error
 */



async function importMasterXlsx_(req, res) {
    try {
        const { masterType, insurer_id } = req.body;

        if (!masterType) {
            return res.status(400).json({
                success: false,
                message: "masterType is required",
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "File is required",
            });
        }

        const config = MASTER_IMPORT_CONFIG[masterType];

        if (!config) {
            return res.status(400).json({
                success: false,
                message: "Invalid masterType",
            });
        }

        const requiresInsurerId = config.tables.some(table =>
            [
                ...(table.uniqueKeys || []),
                ...Object.values(table.columnMapping || {}).flat()
            ].includes("insurer_id")
        ) || config.defaultValues?.hasOwnProperty("insurer_id");

        if (requiresInsurerId && !insurer_id) {
            return res.status(400).json({
                success: false,
                message: "insurer_id is required for this master import",
            });
        }

        const dynamicDefaultValues = {
            ...(config.defaultValues || {}),
        };

        if (requiresInsurerId) {
            dynamicDefaultValues.insurer_id = Number(insurer_id);
        }

        const tableNames = config.tables.map(item => item.tableName);

        await clearMasterTables(tableNames, requiresInsurerId ? Number(insurer_id) : null);

        const importResults = [];

        for (const tableConfig of config.tables) {
            const tableDefaultValues = {
                ...dynamicDefaultValues,
                ...(tableConfig.defaultValues || {}),
            };

            if (requiresInsurerId) {
                tableDefaultValues.insurer_id = Number(insurer_id);
            }

            const rows = await readXlsxFile(
                req.file.path,
                tableConfig.columnMapping,
                tableDefaultValues,
                tableConfig.sheetName,
                tableConfig.customReader
            );

            const result = await bulkInsertMasterData({
                tableName: tableConfig.tableName,
                rows,
                uniqueKeys: tableConfig.uniqueKeys || [],
            });

            importResults.push({
                tableName: tableConfig.tableName,
                totalRows: rows.length,
                result,
            });
        }

        if (req.file?.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        return res.status(200).json({
            success: 1,
            error: 0,
            message: "Master file imported successfully",
            masterType,
            insurer_id: insurer_id || null,
            results: importResults,
        });

    } catch (error) {
        if (req.file?.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        return res.status(500).json({
            success: 0,
            error: 1,
            message: "Master import failed",
            dev_message: error.message,
        });
    }
}

async function importMasterXlsx(req, res) {
    let transaction;

    try {
        const { masterType, insurer_id } = req.body;

        if (!masterType) {
            return res.status(400).json({
                success: 0,
                error: 1,
                message: "masterType is required",
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: 0,
                error: 1,
                message: "File is required",
            });
        }

        const config = MASTER_IMPORT_CONFIG[masterType];

        if (!config) {
            return res.status(400).json({
                success: 0,
                error: 1,
                message: "Invalid masterType",
            });
        }

        const tableNeedsInsurerId = (tableConfig) => {
            return [
                ...(tableConfig.uniqueKeys || []),
                ...Object.values(tableConfig.columnMapping || {}).flat(),
            ].includes("insurer_id");
        };

        const masterNeedsInsurerId = config.tables.some(tableNeedsInsurerId);

        if (masterNeedsInsurerId && !insurer_id) {
            return res.status(400).json({
                success: 0,
                error: 1,
                message: "insurer_id is required for this master import",
            });
        }

        const insurerIdNumber = insurer_id ? Number(insurer_id) : null;

        if (masterNeedsInsurerId) {
            const [insurerRows] = await mysqldb.query(
                `SELECT id FROM insurers WHERE id = :insurerId LIMIT 1`,
                {
                    replacements: { insurerId: insurerIdNumber },
                }
            );

            if (!insurerRows || insurerRows.length === 0) {
                return res.status(400).json({
                    success: 0,
                    error: 1,
                    message: "Invalid insurer_id",
                    dev_message: `No insurer found with id ${insurerIdNumber}`,
                });
            }
        }

        transaction = await mysqldb.transaction();

        const importResults = [];

        for (const tableConfig of config.tables) {
            const currentTableNeedsInsurerId = tableNeedsInsurerId(tableConfig);

            const tableDefaultValues = {
                ...(config.defaultValues || {}),
                ...(tableConfig.defaultValues || {}),
            };

            if (currentTableNeedsInsurerId) {
                tableDefaultValues.insurer_id = insurerIdNumber;
            }

            let rows;

            if (config.fileType === "txt" && config.customReader === "cvVehicleTypeTxt") {
                const parsedData = parseCvVehicleTypeTxt(req.file.path, tableDefaultValues);
                rows = parsedData[tableConfig.tableName] || [];
            } else {
                rows = await readXlsxFile(
                    req.file.path,
                    tableConfig.columnMapping,
                    tableDefaultValues,
                    tableConfig.sheetName,
                    tableConfig.customReader,
                    tableConfig.headerRow
                );
            }

            await clearMasterTable({
                tableName: tableConfig.tableName,
                insurerId: currentTableNeedsInsurerId ? insurerIdNumber : null,
                transaction,
            });

            const result = await bulkInsertMasterData({
                tableName: tableConfig.tableName,
                rows,
                uniqueKeys: tableConfig.uniqueKeys || [],
                transaction,
                chunkSize: 500,
            });

            importResults.push({
                tableName: tableConfig.tableName,
                totalRows: rows.length,
                result,
            });
        }

        await transaction.commit();

        if (req.file?.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        return res.status(200).json({
            success: 1,
            error: 0,
            message: "Master file imported successfully",
            masterType,
            insurer_id: insurerIdNumber,
            results: importResults,
        });

    } catch (error) {
        if (transaction) {
            await transaction.rollback();
        }

        if (req.file?.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        console.error("Master import failed:", {
            message: error.message,
            sqlMessage: error.parent?.sqlMessage,
            sql: error.sql,
            fields: error.fields,
        });

        return res.status(500).json({
            success: 0,
            error: 1,
            message: "Master import failed",
            dev_message: error.parent?.sqlMessage || error.message,
        });
    }
}

module.exports = {
    importMasterXlsx,
};


