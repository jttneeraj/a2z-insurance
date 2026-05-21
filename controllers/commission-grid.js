const ExcelJS = require("exceljs");
const { Sequelize, Op } = require("sequelize");
const { mysqldb, MysqlCommissionGridModel } = require("../models/mysqldb/commission-grid");
const CommonService = require("../services/common");
const CommissionEngineService = require("../services/commission-engine");
const fs = require("fs");


const { detectSheetType,
    worksheetToJson,
    extractPercentage,
    extractMin,
    detectDecline,
    normalizeAddon,
    detectGridMeta,
    extractFuelType,
    extractCcMin,
    extractCcMax,
    extractAgeMin,
    extractAgeMax,
    extractTwoWheelerFuelType,
    extractTwoWheelerMake,
    extractTwoWheelerCcMin,
    extractTwoWheelerCcMax,
    extractTaxiFuelType,
    extractTaxiCcMin,
    extractTaxiCcMax,
    extractTaxiSeatingMin,
    extractTaxiSeatingMax,
    normalizeTaxiAddon,
    normalizeCommissionFlexible,
    normalizePolicyType,
    normalizeCvValue } = require("../services/commission-grid")

const importCommissionGrid = async (req, res) => {
    // const transaction = await MysqlCommissionGridModel.sequelize.transaction();
    let transaction = await mysqldb.transaction();

    try {
        const { insurer_id, financial_year, effective_from, effective_to } = req.body;

        if (!insurer_id) {
            await transaction.rollback();
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "insurer_id is required",
            });
        }

        if (!req.file) {
            await transaction.rollback();
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "Excel file is required",
            });
        }

        await MysqlCommissionGridModel.deleteOldCommissionGridData(insurer_id, transaction);

        await MysqlCommissionGridModel.deleteOldRtoClusterData(insurer_id, transaction);

        // await MysqlCommissionGridModel.markOldUploadsInactive(insurer_id, transaction);

        const uploadCode = `COMM_${insurer_id}_${Date.now()}`;

        const uploadResult = await MysqlCommissionGridModel.createUploadRecord(
            {
                insurer_id,
                upload_code: uploadCode,
                file_name: req.file.filename,
                original_file_name: req.file.originalname,
                file_path: req.file.path,
                financial_year: financial_year || null,
                effective_from: effective_from || null,
                effective_to: effective_to || null,
            },
            transaction
        );

        const uploadId = Array.isArray(uploadResult) ? uploadResult[0] : uploadResult;

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(req.file.path);

        let totalRows = 0;
        let successRows = 0;
        let failedRows = 0;
        const sheetSummary = [];

        for (const worksheet of workbook.worksheets) {
            console.log("SHEET DEBUG:", {
                name: worksheet.name,
                rowCount: worksheet.rowCount,
                actualRowCount: worksheet.actualRowCount,
                columnCount: worksheet.columnCount,
                actualColumnCount: worksheet.actualColumnCount,
            });

            const sheetName = worksheet.name;
            const sheetType = detectSheetType(sheetName);

            let result;

            if (sheetType === "RTO_MAPPING") {
                /* result = await parseRtoMappingSheet({
                    worksheet,
                    sheetName,
                    insurer_id,
                    uploadId,
                    transaction,
                }); */
                result = await parseMappingSheet({
                    worksheet,
                    sheetName,
                    insurer_id,
                    uploadId,
                    transaction,
                    mappingType: "RTO_MAPPING",
                    subProductCode: null,
                });
            } else if (sheetType === "TAXI_MAPPING") {
                /*  result = await parseTaxiMappingSheet({
                     worksheet,
                     sheetName,
                     insurer_id,
                     uploadId,
                     transaction,
                 }); */
                result = await parseMappingSheet({
                    worksheet,
                    sheetName,
                    insurer_id,
                    uploadId,
                    transaction,
                    mappingType: "TAXI_MAPPING",
                    subProductCode: "TAXI",
                });
            } else {
                result = await parseCommissionGridSheet({
                    worksheet,
                    sheetName,
                    insurer_id,
                    uploadId,
                    effective_from,
                    effective_to,
                    transaction,
                });
            }

            totalRows += result.totalRows;
            successRows += result.successRows;
            failedRows += result.failedRows;
            sheetSummary.push(result);
        }

        await MysqlCommissionGridModel.updateUploadRecord(
            uploadId,
            {
                status: "PROCESSED",
                total_rows: totalRows,
                success_rows: successRows,
                failed_rows: failedRows,
                remarks: JSON.stringify(sheetSummary),
            },
            transaction
        );

        await transaction.commit();

        try {
            if (req.file && req.file.path && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
        } catch (fileError) {
            console.log("Commission uploaded temp file delete failed:", fileError.message);
        }

        return res.status(200).json({
            error: 0,
            status: 1,
            message: "Commission grid imported successfully",
            result: {
                upload_id: uploadId,
                totalRows,
                successRows,
                failedRows,
                sheets: sheetSummary,
            },
        });
    } catch (error) {
        await transaction.rollback();

        console.log(error);

        CommonService.errorHandler(error, {
            url: "/admin/commission-grid/import",
            operation: "IMPORT COMMISSION GRID",
            relative_detail: "Error occurred during commission grid import",
        });

        return res.status(500).json({
            error: 1,
            status: 0,
            message: "Something went wrong",
            dev_message: error.message,
        });
    }
};

const parseRtoMappingSheet = async ({ worksheet, sheetName, insurer_id, uploadId, transaction }) => {
    const rows = worksheetToJson(worksheet);

    let totalRows = 0;
    let successRows = 0;
    let failedRows = 0;

    for (const row of rows) {
        totalRows++;

        try {
            const rtoCode = row.column_1;
            const rtoName = row.column_2;
            const cityName = row.column_3;
            const stateName = row.column_4;
            const clusterName = row.column_5;

            if (!rtoCode || !clusterName) {
                failedRows++;
                continue;
            }

            await MysqlCommissionGridModel.insertRtoClusterMapping(
                {
                    insurer_id,
                    upload_id: uploadId,
                    product_code: "MOTOR",
                    sub_product_code: null,
                    policy_type_code: null,
                    rto_code: String(rtoCode).trim(),
                    rto_name: rtoName || null,
                    city_name: cityName || null,
                    state_name: stateName || null,
                    cluster_name: String(clusterName).trim(),
                    mapping_type: "RTO_MAPPING",
                },
                transaction
            );

            successRows++;
        } catch (error) {
            failedRows++;
            console.log("RTO mapping failed:", error.message);
        }
    }

    return {
        sheetName,
        type: "RTO_MAPPING",
        totalRows,
        successRows,
        failedRows,
    };
};

const parseTaxiMappingSheet = async ({ worksheet, sheetName, insurer_id, uploadId, transaction }) => {
    const rows = worksheetToJson(worksheet);

    let totalRows = 0;
    let successRows = 0;
    let failedRows = 0;

    for (const row of rows) {
        totalRows++;

        try {
            const rtoCode = row.column_1;
            const rtoName = row.column_2;
            const cityName = row.column_3;
            const stateName = row.column_4;
            const clusterName = row.column_5;

            if (!rtoCode || !clusterName) {
                failedRows++;
                continue;
            }

            await MysqlCommissionGridModel.insertRtoClusterMapping(
                {
                    insurer_id,
                    upload_id: uploadId,
                    product_code: "MOTOR",
                    sub_product_code: "TAXI",
                    policy_type_code: null,
                    rto_code: String(rtoCode).trim(),
                    rto_name: rtoName || null,
                    city_name: cityName || null,
                    state_name: stateName || null,
                    cluster_name: String(clusterName).trim(),
                    mapping_type: "TAXI_MAPPING",
                },
                transaction
            );

            successRows++;
        } catch (error) {
            failedRows++;
            console.log("Taxi mapping failed:", error.message);
        }
    }

    return {
        sheetName,
        type: "TAXI_MAPPING",
        totalRows,
        successRows,
        failedRows,
    };
};

const parseCommissionGridSheet = async ({
    worksheet,
    sheetName,
    insurer_id,
    uploadId,
    effective_from,
    effective_to,
    transaction,
}) => {
    if (sheetName.trim() === "PVT Car Comp+SAOD") {

        return parsePvtCarCompSaodSheet({
            worksheet,
            sheetName,
            insurer_id,
            uploadId,
            effective_from,
            effective_to,
            transaction,
        });
    }
    if (sheetName.trim() === "PVT Car Comp+SAOD") {
        return parsePvtCarCompSaodSheet({
            worksheet,
            sheetName,
            insurer_id,
            uploadId,
            effective_from,
            effective_to,
            transaction,
        });
    }

    if (sheetName.trim() === "2W_1+1_SATP") {
        return parseTwoWheelerOnePlusOneSatpSheet({
            worksheet,
            sheetName,
            insurer_id,
            uploadId,
            effective_from,
            effective_to,
            transaction,
        });
    }

    if (sheetName.trim() === "2W 1+5") {
        return parseTwoWheelerOnePlusFiveSheet({
            worksheet,
            sheetName,
            insurer_id,
            uploadId,
            effective_from,
            effective_to,
            transaction,
        });
    }

    if (sheetName.trim() === "2W_SAOD") {
        return parseTwoWheelerSaodSheet({
            worksheet,
            sheetName,
            insurer_id,
            uploadId,
            effective_from,
            effective_to,
            transaction,
        });
    }

    if (sheetName.trim() === "Taxi Grid Diesel & Non Diesel") {
        return parseTaxiDieselNonDieselSheet({
            worksheet,
            sheetName,
            insurer_id,
            uploadId,
            effective_from,
            effective_to,
            transaction,
        });
    }

    if (sheetName.trim() === "Taxi Grid - Electric") {
        return parseTaxiDieselNonDieselSheet({
            worksheet,
            sheetName,
            insurer_id,
            uploadId,
            effective_from,
            effective_to,
            transaction,
        });
    }

    if (sheetName.trim() === "CV (excl. HCV)") {
        return parseWideCvGridSheet({
            worksheet,
            sheetName,
            insurer_id,
            uploadId,
            effective_from,
            effective_to,
            transaction,
            subProductCode: "COMMERCIAL_VEHICLE",
            gridSubCategory: "CV_EXCL_HCV",
            headerStartIndex: 0,
        });
    }

    if (sheetName.trim() === "HCV") {
        return parseWideCvGridSheet({
            worksheet,
            sheetName,
            insurer_id,
            uploadId,
            effective_from,
            effective_to,
            transaction,
            subProductCode: "HCV",
            gridSubCategory: "HCV",
            headerStartIndex: 1,
        });
    }

    if (sheetName.trim() === "PVT Car TP") {
        return parsePvtCarTpSheet({
            worksheet,
            sheetName,
            insurer_id,
            uploadId,
            effective_from,
            effective_to,
            transaction,
        });
    }

    const rows = worksheetToJson(worksheet);
    const gridMeta = detectGridMeta(sheetName);

    let totalRows = 0;
    let successRows = 0;
    let failedRows = 0;

    for (const row of rows) {
        totalRows++;

        try {
            const declineInfo = detectDecline(row);

            await MysqlCommissionGridModel.insertCommissionGrid(
                {
                    insurer_id,
                    upload_id: uploadId,

                    product_code: gridMeta.product_code,
                    sub_product_code: gridMeta.sub_product_code,
                    policy_type_code: gridMeta.policy_type_code,

                    grid_category: gridMeta.grid_category,
                    grid_sub_category: null,

                    cluster_name: null,
                    rto_code: null,

                    vehicle_segment: null,
                    vehicle_make: null,
                    vehicle_model: null,
                    fuel_type: null,

                    carrier_type: null,
                    vehicle_usage_type: null,

                    cc_min: null,
                    cc_max: null,

                    seating_capacity_min: null,
                    seating_capacity_max: null,

                    vehicle_age_min: null,
                    vehicle_age_max: null,

                    addon_applicable: "ANY",

                    cd1: null,
                    max_cd2: null,

                    commission_value: null,
                    commission_value_type: "PERCENTAGE",

                    formula_type: null,
                    formula_text: null,

                    is_declined: declineInfo.is_declined,
                    decline_reason: declineInfo.reason,

                    remarks: null,
                    raw_rule_text: JSON.stringify(row),

                    priority: 100,
                    effective_from: effective_from || null,
                    effective_to: effective_to || null,
                },
                transaction
            );

            successRows++;
        } catch (error) {
            failedRows++;
            console.log("Grid insert failed:", error.message);
        }
    }

    return {
        sheetName,
        type: "COMMISSION_GRID",
        rowCount: worksheet.rowCount,
        actualRowCount: worksheet.actualRowCount,
        columnCount: worksheet.columnCount,
        actualColumnCount: worksheet.actualColumnCount,
        totalRows,
        successRows,
        failedRows,
    };
};

const parseMappingSheet = async ({
    worksheet,
    sheetName,
    insurer_id,
    uploadId,
    transaction,
    mappingType,
    subProductCode,
}) => {
    const rows = worksheetToJson(worksheet);

    console.log(`${sheetName} FIRST 5 ROWS:`, JSON.stringify(rows.slice(0, 5), null, 2));

    let totalRows = 0;
    let successRows = 0;
    let failedRows = 0;

    for (const row of rows) {
        totalRows++;

        try {
            const values = Object.values(row)
                .filter((v) => v !== null && v !== undefined && String(v).trim() !== "")
                .map((v) => String(v).trim());

            const rtoCode = values.find((v) => /^[A-Z]{2}[-\s]?\d{1,2}/i.test(v));
            const clusterName = values.find((v) =>
                /cluster|zone|mapping|metro|a|b|c|d|e|f|g/i.test(v)
            );

            if (!rtoCode || !clusterName || rtoCode === clusterName) {
                failedRows++;
                continue;
            }

            await MysqlCommissionGridModel.insertRtoClusterMapping(
                {
                    insurer_id,
                    upload_id: uploadId,
                    product_code: "MOTOR",
                    sub_product_code: subProductCode,
                    policy_type_code: null,
                    rto_code: rtoCode,
                    rto_name: values[1] || null,
                    city_name: values[2] || null,
                    state_name: values[3] || null,
                    cluster_name: clusterName,
                    mapping_type: mappingType,
                },
                transaction
            );

            successRows++;
        } catch (error) {
            failedRows++;
            console.log(`${sheetName} mapping failed:`, error.message);
        }
    }

    return {
        sheetName,
        type: mappingType,
        totalRows,
        successRows,
        failedRows,
    };
};


const normalizeCommissionPercent = (value) => {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const numberValue = Number(value);

    if (Number.isNaN(numberValue)) {
        return null;
    }

    return numberValue > 0 && numberValue <= 1
        ? numberValue * 100
        : numberValue;
};

const parsePvtCarCompSaodSheet = async ({
    worksheet,
    sheetName,
    insurer_id,
    uploadId,
    effective_from,
    effective_to,
    transaction,
}) => {

    const rows = worksheetToJson(worksheet);

    let totalRows = 0;
    let successRows = 0;
    let failedRows = 0;

    // slab headers
    const compSlabs = [
        "0-25K",
        "25K-1L",
        "1L-3L",
        "3L-5L",
        ">5L",
    ];

    const saodSlabs = [
        "0-25K",
        "25K-1L",
        "1L-3L",
        "3L-5L",
        ">5L",
    ];

    // actual data starts after header rows
    const dataRows = rows.slice(3);

    for (const row of dataRows) {

        try {

            // ----------------------------
            // NON HEV GRID
            // ----------------------------

            const nonHevZone = row.column_2;
            const nonHevCluster = row.column_3;

            // COMP columns 4-8
            for (let i = 0; i < 5; i++) {

                const value = normalizeCommissionPercent(
                    row[`column_${4 + i}`]
                );

                if (value !== null) {

                    await MysqlCommissionGridModel.insertCommissionGrid(
                        {
                            insurer_id,
                            upload_id: uploadId,

                            product_code: "MOTOR",
                            sub_product_code: "PRIVATE_CAR",
                            policy_type_code: "COMP",

                            grid_category: sheetName,
                            grid_sub_category: "NON_HEV",

                            cluster_name: nonHevCluster,
                            rto_code: null,

                            vehicle_segment: compSlabs[i],
                            vehicle_make: null,
                            vehicle_model: null,
                            fuel_type: "NON_HEV",

                            carrier_type: null,
                            vehicle_usage_type: null,

                            cc_min: null,
                            cc_max: null,

                            seating_capacity_min: null,
                            seating_capacity_max: null,

                            vehicle_age_min: null,
                            vehicle_age_max: null,

                            addon_applicable: "ANY",

                            cd1: value,
                            max_cd2: value,

                            commission_value: value,
                            commission_value_type: "PERCENTAGE",

                            formula_type: null,
                            formula_text: null,

                            is_declined: 0,
                            decline_reason: null,

                            remarks: nonHevZone,
                            raw_rule_text: JSON.stringify(row),

                            priority: 100,
                            effective_from: effective_from || null,
                            effective_to: effective_to || null,
                        },
                        transaction
                    );

                    successRows++;
                }

                totalRows++;
            }

            // SAOD columns 9-13
            for (let i = 0; i < 5; i++) {

                const value = normalizeCommissionPercent(
                    row[`column_${9 + i}`]
                );

                if (value !== null) {

                    await MysqlCommissionGridModel.insertCommissionGrid(
                        {
                            insurer_id,
                            upload_id: uploadId,

                            product_code: "MOTOR",
                            sub_product_code: "PRIVATE_CAR",
                            policy_type_code: "SAOD",

                            grid_category: sheetName,
                            grid_sub_category: "NON_HEV",

                            cluster_name: nonHevCluster,
                            rto_code: null,

                            vehicle_segment: saodSlabs[i],
                            vehicle_make: null,
                            vehicle_model: null,
                            fuel_type: "NON_HEV",

                            carrier_type: null,
                            vehicle_usage_type: null,

                            cc_min: null,
                            cc_max: null,

                            seating_capacity_min: null,
                            seating_capacity_max: null,

                            vehicle_age_min: null,
                            vehicle_age_max: null,

                            addon_applicable: "ANY",

                            cd1: value,
                            max_cd2: value,

                            commission_value: value,
                            commission_value_type: "PERCENTAGE",

                            formula_type: null,
                            formula_text: null,

                            is_declined: 0,
                            decline_reason: null,

                            remarks: nonHevZone,
                            raw_rule_text: JSON.stringify(row),

                            priority: 100,
                            effective_from: effective_from || null,
                            effective_to: effective_to || null,
                        },
                        transaction
                    );

                    successRows++;
                }

                totalRows++;
            }

            // ----------------------------
            // HEV GRID
            // ----------------------------

            const hevZone = row.column_17;
            const hevCluster = row.column_18;

            // COMP columns 19-23
            for (let i = 0; i < 5; i++) {

                const value = normalizeCommissionPercent(
                    row[`column_${19 + i}`]
                );

                if (value !== null) {

                    await MysqlCommissionGridModel.insertCommissionGrid(
                        {
                            insurer_id,
                            upload_id: uploadId,

                            product_code: "MOTOR",
                            sub_product_code: "PRIVATE_CAR",
                            policy_type_code: "COMP",

                            grid_category: sheetName,
                            grid_sub_category: "HEV",

                            cluster_name: hevCluster,
                            rto_code: null,

                            vehicle_segment: compSlabs[i],
                            vehicle_make: null,
                            vehicle_model: null,
                            fuel_type: "HEV",

                            carrier_type: null,
                            vehicle_usage_type: null,

                            cc_min: null,
                            cc_max: null,

                            seating_capacity_min: null,
                            seating_capacity_max: null,

                            vehicle_age_min: null,
                            vehicle_age_max: null,

                            addon_applicable: "ANY",

                            cd1: value,
                            max_cd2: value,

                            commission_value: value,
                            commission_value_type: "PERCENTAGE",

                            formula_type: null,
                            formula_text: null,

                            is_declined: 0,
                            decline_reason: null,

                            remarks: hevZone,
                            raw_rule_text: JSON.stringify(row),

                            priority: 100,
                            effective_from: effective_from || null,
                            effective_to: effective_to || null,
                        },
                        transaction
                    );

                    successRows++;
                }

                totalRows++;
            }

            // SAOD columns 24-28
            for (let i = 0; i < 5; i++) {

                const value = normalizeCommissionPercent(
                    row[`column_${24 + i}`]
                );

                if (value !== null) {

                    await MysqlCommissionGridModel.insertCommissionGrid(
                        {
                            insurer_id,
                            upload_id: uploadId,

                            product_code: "MOTOR",
                            sub_product_code: "PRIVATE_CAR",
                            policy_type_code: "SAOD",

                            grid_category: sheetName,
                            grid_sub_category: "HEV",

                            cluster_name: hevCluster,
                            rto_code: null,

                            vehicle_segment: saodSlabs[i],
                            vehicle_make: null,
                            vehicle_model: null,
                            fuel_type: "HEV",

                            carrier_type: null,
                            vehicle_usage_type: null,

                            cc_min: null,
                            cc_max: null,

                            seating_capacity_min: null,
                            seating_capacity_max: null,

                            vehicle_age_min: null,
                            vehicle_age_max: null,

                            addon_applicable: "ANY",

                            cd1: value,
                            max_cd2: value,

                            commission_value: value,
                            commission_value_type: "PERCENTAGE",

                            formula_type: null,
                            formula_text: null,

                            is_declined: 0,
                            decline_reason: null,

                            remarks: hevZone,
                            raw_rule_text: JSON.stringify(row),

                            priority: 100,
                            effective_from: effective_from || null,
                            effective_to: effective_to || null,
                        },
                        transaction
                    );

                    successRows++;
                }

                totalRows++;
            }

        } catch (error) {

            failedRows++;

            console.log(
                "PVT Car Comp+SAOD row failed:",
                error.message
            );
        }
    }

    return {
        sheetName,
        type: "COMMISSION_GRID_NORMALIZED",
        totalRows,
        successRows,
        failedRows,
    };
};

const parsePvtCarTpSheet = async ({
    worksheet,
    sheetName,
    insurer_id,
    uploadId,
    effective_from,
    effective_to,
    transaction,
}) => {
    const rows = worksheetToJson(worksheet);

    let totalRows = 0;
    let successRows = 0;
    let failedRows = 0;

    // skip header row
    const dataRows = rows.slice(1);

    for (const row of dataRows) {
        totalRows++;

        try {
            const clusterName = row.column_2;
            const segment = row.column_3;
            const ageText = row.column_4;
            const maxCd2 = normalizeCommissionPercent(row.column_5);

            if (!clusterName || !segment) {
                failedRows++;
                continue;
            }

            const isDeclined =
                String(clusterName).toLowerCase().includes("decline") ||
                maxCd2 === 0;

            await MysqlCommissionGridModel.insertCommissionGrid(
                {
                    insurer_id,
                    upload_id: uploadId,

                    product_code: "MOTOR",
                    sub_product_code: "PRIVATE_CAR",
                    policy_type_code: "TP",

                    grid_category: sheetName.trim(),
                    grid_sub_category: null,

                    cluster_name: clusterName,
                    rto_code: null,

                    vehicle_segment: segment,
                    vehicle_make: null,
                    vehicle_model: null,
                    fuel_type: extractFuelType(segment),

                    carrier_type: null,
                    vehicle_usage_type: null,

                    cc_min: extractCcMin(segment),
                    cc_max: extractCcMax(segment),

                    seating_capacity_min: null,
                    seating_capacity_max: null,

                    vehicle_age_min: extractAgeMin(ageText),
                    vehicle_age_max: extractAgeMax(ageText),

                    addon_applicable: "ANY",

                    cd1: maxCd2,
                    max_cd2: maxCd2,

                    commission_value: maxCd2,
                    commission_value_type: "PERCENTAGE",

                    formula_type: null,
                    formula_text: null,

                    is_declined: isDeclined ? 1 : 0,
                    decline_reason: isDeclined ? "Declined / zero commission as per insurer grid" : null,

                    remarks: ageText,
                    raw_rule_text: JSON.stringify(row),

                    priority: 100,
                    effective_from: effective_from || null,
                    effective_to: effective_to || null,
                },
                transaction
            );

            successRows++;
        } catch (error) {
            failedRows++;
            console.log("PVT Car TP row failed:", error.message);
        }
    }

    return {
        sheetName,
        type: "COMMISSION_GRID_NORMALIZED",
        totalRows,
        successRows,
        failedRows,
    };
};


const parseTwoWheelerOnePlusOneSatpSheet = async ({
    worksheet,
    sheetName,
    insurer_id,
    uploadId,
    effective_from,
    effective_to,
    transaction,
}) => {
    const rows = worksheetToJson(worksheet);

    let totalRows = 0;
    let successRows = 0;
    let failedRows = 0;

    // skip first 2 header rows
    const dataRows = rows.slice(2);

    for (const row of dataRows) {
        try {
            const clusterName = row.column_2;
            const segment = row.column_3;

            if (!clusterName || !segment) {
                failedRows++;
                continue;
            }

            const onePlusOneCd1 = normalizeCommissionPercent(row.column_4);
            const onePlusOneMaxCd2 = normalizeCommissionPercent(row.column_5);
            const satpMaxCd2 = normalizeCommissionPercent(row.column_6);

            // 1+1 row
            totalRows++;

            await MysqlCommissionGridModel.insertCommissionGrid(
                {
                    insurer_id,
                    upload_id: uploadId,

                    product_code: "MOTOR",
                    sub_product_code: "TWO_WHEELER",
                    policy_type_code: "1_PLUS_1",

                    grid_category: sheetName,
                    grid_sub_category: null,

                    cluster_name: clusterName,
                    rto_code: null,

                    vehicle_segment: segment,
                    vehicle_make: extractTwoWheelerMake(segment),
                    vehicle_model: null,
                    fuel_type: extractTwoWheelerFuelType(segment),

                    carrier_type: null,
                    vehicle_usage_type: null,

                    cc_min: extractTwoWheelerCcMin(segment),
                    cc_max: extractTwoWheelerCcMax(segment),

                    seating_capacity_min: null,
                    seating_capacity_max: null,

                    vehicle_age_min: null,
                    vehicle_age_max: null,

                    addon_applicable: "ANY",

                    cd1: onePlusOneCd1,
                    max_cd2: onePlusOneMaxCd2,

                    commission_value: onePlusOneMaxCd2,
                    commission_value_type: "PERCENTAGE",

                    formula_type: null,
                    formula_text: null,

                    is_declined: onePlusOneMaxCd2 === 0 ? 1 : 0,
                    decline_reason: onePlusOneMaxCd2 === 0 ? "Zero commission as per insurer grid" : null,

                    remarks: null,
                    raw_rule_text: JSON.stringify(row),

                    priority: 100,
                    effective_from: effective_from || null,
                    effective_to: effective_to || null,
                },
                transaction
            );

            successRows++;

            // SATP row
            totalRows++;

            await MysqlCommissionGridModel.insertCommissionGrid(
                {
                    insurer_id,
                    upload_id: uploadId,

                    product_code: "MOTOR",
                    sub_product_code: "TWO_WHEELER",
                    policy_type_code: "SATP",

                    grid_category: sheetName,
                    grid_sub_category: null,

                    cluster_name: clusterName,
                    rto_code: null,

                    vehicle_segment: segment,
                    vehicle_make: extractTwoWheelerMake(segment),
                    vehicle_model: null,
                    fuel_type: extractTwoWheelerFuelType(segment),

                    carrier_type: null,
                    vehicle_usage_type: null,

                    cc_min: extractTwoWheelerCcMin(segment),
                    cc_max: extractTwoWheelerCcMax(segment),

                    seating_capacity_min: null,
                    seating_capacity_max: null,

                    vehicle_age_min: null,
                    vehicle_age_max: null,

                    addon_applicable: "ANY",

                    cd1: null,
                    max_cd2: satpMaxCd2,

                    commission_value: satpMaxCd2,
                    commission_value_type: "PERCENTAGE",

                    formula_type: null,
                    formula_text: null,

                    is_declined: satpMaxCd2 === 0 ? 1 : 0,
                    decline_reason: satpMaxCd2 === 0 ? "Zero commission as per insurer grid" : null,

                    remarks: null,
                    raw_rule_text: JSON.stringify(row),

                    priority: 100,
                    effective_from: effective_from || null,
                    effective_to: effective_to || null,
                },
                transaction
            );

            successRows++;
        } catch (error) {
            failedRows++;
            console.log("2W_1+1_SATP row failed:", error.message);
        }
    }

    return {
        sheetName,
        type: "COMMISSION_GRID_NORMALIZED",
        totalRows,
        successRows,
        failedRows,
    };
};


const parseTwoWheelerOnePlusFiveSheet = async ({
    worksheet,
    sheetName,
    insurer_id,
    uploadId,
    effective_from,
    effective_to,
    transaction,
}) => {
    const rows = worksheetToJson(worksheet);

    let totalRows = 0;
    let successRows = 0;
    let failedRows = 0;

    const dataRows = rows.slice(1);

    for (const row of dataRows) {
        totalRows++;

        try {
            const clusterName = row.column_2;
            const make = row.column_3;
            const segment = row.column_4;
            const cd1 = normalizeCommissionPercent(row.column_5);
            const maxCd2 = normalizeCommissionPercent(row.column_6);
            const formulaType = row.column_7 || null;

            if (!clusterName || !make || !segment) {
                failedRows++;
                continue;
            }

            const maxCd2Text = String(row.column_6 || "").toUpperCase();

            const isDeclined =
                maxCd2Text === "D" ||
                maxCd2Text === "MISP" ||
                maxCd2 === 0;

            await MysqlCommissionGridModel.insertCommissionGrid(
                {
                    insurer_id,
                    upload_id: uploadId,

                    product_code: "MOTOR",
                    sub_product_code: "TWO_WHEELER",
                    policy_type_code: "1_PLUS_5",

                    grid_category: sheetName,
                    grid_sub_category: null,

                    cluster_name: clusterName,
                    rto_code: null,

                    vehicle_segment: segment,
                    vehicle_make: make,
                    vehicle_model: null,
                    fuel_type: extractTwoWheelerFuelType(segment),

                    carrier_type: null,
                    vehicle_usage_type: null,

                    cc_min: extractTwoWheelerCcMin(segment),
                    cc_max: extractTwoWheelerCcMax(segment),

                    seating_capacity_min: null,
                    seating_capacity_max: null,

                    vehicle_age_min: null,
                    vehicle_age_max: null,

                    addon_applicable: "ANY",

                    cd1,
                    max_cd2: maxCd2,

                    commission_value: maxCd2,
                    commission_value_type: "PERCENTAGE",

                    formula_type: formulaType,
                    formula_text: null,

                    is_declined: isDeclined ? 1 : 0,
                    decline_reason: isDeclined
                        ? `Declined / ${maxCd2Text} as per insurer grid`
                        : null,

                    remarks: maxCd2Text === "MISP" ? "MISP" : null,
                    raw_rule_text: JSON.stringify(row),

                    priority: 100,
                    effective_from: effective_from || null,
                    effective_to: effective_to || null,
                },
                transaction
            );

            successRows++;
        } catch (error) {
            failedRows++;
            console.log("2W 1+5 row failed:", error.message);
        }
    }

    return {
        sheetName,
        type: "COMMISSION_GRID_NORMALIZED",
        totalRows,
        successRows,
        failedRows,
    };
};


const parseTwoWheelerSaodSheet = async ({
    worksheet,
    sheetName,
    insurer_id,
    uploadId,
    effective_from,
    effective_to,
    transaction,
}) => {
    const rows = worksheetToJson(worksheet);

    let totalRows = 0;
    let successRows = 0;
    let failedRows = 0;

    const dataRows = rows.slice(1);

    for (const row of dataRows) {
        totalRows++;

        try {
            const clusterName = row.column_2;
            const segment = row.column_3;

            if (!clusterName || !segment) {
                failedRows++;
                continue;
            }

            const minCd1 = normalizeCommissionPercent(row.column_4);
            const maxCd1NoBreakIn = normalizeCommissionPercent(row.column_5);
            const maxCd1BreakIn = normalizeCommissionPercent(row.column_6);

            const max1YearCd2 = normalizeCommissionPercent(row.column_7);
            const max2YearCd2 = normalizeCommissionPercent(row.column_8);
            const max3YearCd2 = normalizeCommissionPercent(row.column_9);
            const max4YearCd2 = normalizeCommissionPercent(row.column_10);

            await MysqlCommissionGridModel.insertCommissionGrid(
                {
                    insurer_id,
                    upload_id: uploadId,

                    product_code: "MOTOR",
                    sub_product_code: "TWO_WHEELER",
                    policy_type_code: "SAOD",

                    grid_category: sheetName,
                    grid_sub_category: null,

                    cluster_name: clusterName,
                    rto_code: null,

                    vehicle_segment: segment,
                    vehicle_make: extractTwoWheelerMake(segment),
                    vehicle_model: null,
                    fuel_type: extractTwoWheelerFuelType(segment),

                    carrier_type: null,
                    vehicle_usage_type: null,

                    cc_min: extractTwoWheelerCcMin(segment),
                    cc_max: extractTwoWheelerCcMax(segment),

                    seating_capacity_min: null,
                    seating_capacity_max: null,

                    vehicle_age_min: null,
                    vehicle_age_max: null,

                    addon_applicable: "ANY",

                    cd1: minCd1,
                    max_cd2: max1YearCd2,

                    commission_value: max1YearCd2,
                    commission_value_type: "PERCENTAGE",

                    formula_type: "SAOD_MULTI_YEAR_CD",
                    formula_text: JSON.stringify({
                        min_cd1: minCd1,
                        max_cd1_no_breakin: maxCd1NoBreakIn,
                        max_cd1_breakin: maxCd1BreakIn,
                        max_1_year_cd2: max1YearCd2,
                        max_2_year_cd2: max2YearCd2,
                        max_3_year_cd2: max3YearCd2,
                        max_4_year_cd2: max4YearCd2,
                    }),

                    is_declined: max1YearCd2 === 0 ? 1 : 0,
                    decline_reason: max1YearCd2 === 0 ? "Zero commission as per insurer grid" : null,

                    remarks: null,
                    raw_rule_text: JSON.stringify(row),

                    priority: 100,
                    effective_from: effective_from || null,
                    effective_to: effective_to || null,
                },
                transaction
            );

            successRows++;
        } catch (error) {
            failedRows++;
            console.log("2W_SAOD row failed:", error.message);
        }
    }

    return {
        sheetName,
        type: "COMMISSION_GRID_NORMALIZED",
        totalRows,
        successRows,
        failedRows,
    };
};

const parseTaxiDieselNonDieselSheet = async ({
    worksheet,
    sheetName,
    insurer_id,
    uploadId,
    effective_from,
    effective_to,
    transaction,
}) => {
    const rows = worksheetToJson(worksheet);

    let totalRows = 0;
    let successRows = 0;
    let failedRows = 0;

    // skip 2 header rows
    const dataRows = rows.slice(2);

    for (const row of dataRows) {
        try {
            const clusterName = row.column_2;
            const segment = row.column_3;
            const make = row.column_4;
            const addonText = row.column_5;
            const note = row.column_9 || null;

            if (!clusterName || !segment) {
                failedRows++;
                continue;
            }

            const compCd1 = normalizeCommissionPercent(row.column_6);
            const compMaxCd2 = normalizeCommissionPercent(row.column_7);
            const satpMaxCd2 = normalizeCommissionPercent(row.column_8);

            // COMP row
            totalRows++;

            await MysqlCommissionGridModel.insertCommissionGrid(
                {
                    insurer_id,
                    upload_id: uploadId,

                    product_code: "MOTOR",
                    sub_product_code: "TAXI",
                    policy_type_code: "COMP",

                    grid_category: sheetName,
                    // grid_sub_category: "DIESEL_NON_DIESEL",
                    grid_sub_category: sheetName.trim() === "Taxi Grid - Electric"
                        ? "ELECTRIC"
                        : "DIESEL_NON_DIESEL",

                    cluster_name: clusterName,
                    rto_code: null,

                    vehicle_segment: segment,
                    vehicle_make: make || null,
                    vehicle_model: null,
                    // fuel_type: extractTaxiFuelType(segment),
                    fuel_type: sheetName.trim() === "Taxi Grid - Electric"
                        ? "ELECTRIC"
                        : extractTaxiFuelType(segment),

                    carrier_type: "TAXI",
                    vehicle_usage_type: "COMMERCIAL",

                    cc_min: extractTaxiCcMin(segment),
                    cc_max: extractTaxiCcMax(segment),

                    seating_capacity_min: extractTaxiSeatingMin(segment),
                    seating_capacity_max: extractTaxiSeatingMax(segment),

                    vehicle_age_min: null,
                    vehicle_age_max: null,

                    addon_applicable: normalizeTaxiAddon(addonText),

                    cd1: compCd1,
                    max_cd2: compMaxCd2,

                    commission_value: compMaxCd2,
                    commission_value_type: "PERCENTAGE",

                    formula_type: null,
                    formula_text: null,

                    is_declined: compMaxCd2 === 0 ? 1 : 0,
                    decline_reason: compMaxCd2 === 0 ? "Zero commission as per insurer grid" : null,

                    remarks: note,
                    raw_rule_text: JSON.stringify(row),

                    priority: 100,
                    effective_from: effective_from || null,
                    effective_to: effective_to || null,
                },
                transaction
            );

            successRows++;

            // SATP row
            totalRows++;

            await MysqlCommissionGridModel.insertCommissionGrid(
                {
                    insurer_id,
                    upload_id: uploadId,

                    product_code: "MOTOR",
                    sub_product_code: "TAXI",
                    policy_type_code: "SATP",

                    grid_category: sheetName,
                    // grid_sub_category: "DIESEL_NON_DIESEL",
                    grid_sub_category: sheetName.trim() === "Taxi Grid - Electric"
                        ? "ELECTRIC"
                        : "DIESEL_NON_DIESEL",

                    cluster_name: clusterName,
                    rto_code: null,

                    vehicle_segment: segment,
                    vehicle_make: make || null,
                    vehicle_model: null,
                    // fuel_type: extractTaxiFuelType(segment),
                    fuel_type: sheetName.trim() === "Taxi Grid - Electric"
                        ? "ELECTRIC"
                        : extractTaxiFuelType(segment),

                    carrier_type: "TAXI",
                    vehicle_usage_type: "COMMERCIAL",

                    cc_min: extractTaxiCcMin(segment),
                    cc_max: extractTaxiCcMax(segment),

                    seating_capacity_min: extractTaxiSeatingMin(segment),
                    seating_capacity_max: extractTaxiSeatingMax(segment),

                    vehicle_age_min: null,
                    vehicle_age_max: null,

                    addon_applicable: normalizeTaxiAddon(addonText),

                    cd1: null,
                    max_cd2: satpMaxCd2,

                    commission_value: satpMaxCd2,
                    commission_value_type: "PERCENTAGE",

                    formula_type: null,
                    formula_text: null,

                    is_declined: satpMaxCd2 === 0 ? 1 : 0,
                    decline_reason: satpMaxCd2 === 0 ? "Zero commission as per insurer grid" : null,

                    remarks: note,
                    raw_rule_text: JSON.stringify(row),

                    priority: 100,
                    effective_from: effective_from || null,
                    effective_to: effective_to || null,
                },
                transaction
            );

            successRows++;
        } catch (error) {
            failedRows++;
            console.log("Taxi Diesel/Non Diesel row failed:", error.message);
        }
    }

    return {
        sheetName,
        type: "COMMISSION_GRID_NORMALIZED",
        totalRows,
        successRows,
        failedRows,
    };
};

const parseCvExcludingHcvSheet = async ({
    worksheet,
    sheetName,
    insurer_id,
    uploadId,
    effective_from,
    effective_to,
    transaction,
}) => {
    const rows = worksheetToJson(worksheet);

    let totalRows = 0;
    let successRows = 0;
    let failedRows = 0;

    if (rows.length < 4) {
        return {
            sheetName,
            type: "COMMISSION_GRID_NORMALIZED",
            totalRows,
            successRows,
            failedRows,
        };
    }

    const clusterRow = rows[0];
    const policyRow = rows[1];
    const fieldRow = rows[2];

    const dataRows = rows.slice(3);

    for (const row of dataRows) {
        const segment = row.column_2;
        const make = row.column_3;
        const carrierType = row.column_4;

        if (!segment) {
            continue;
        }

        for (let col = 5; col <= 169; col += 3) {
            try {
                const clusterName = clusterRow[`column_${col}`];

                if (!clusterName) {
                    continue;
                }

                const compPolicy = normalizePolicyType(policyRow[`column_${col}`]);
                const compCd1Field = fieldRow[`column_${col}`];
                const compMaxCd2Field = fieldRow[`column_${col + 1}`];

                const tpPolicy = normalizePolicyType(policyRow[`column_${col + 2}`]);
                const tpMaxCd2Field = fieldRow[`column_${col + 2}`];

                // const compCd1 = normalizeCommissionFlexible(row[`column_${col}`]);
                // const compMaxCd2 = normalizeCommissionFlexible(row[`column_${col + 1}`]);
                // const tpMaxCd2 = normalizeCommissionFlexible(row[`column_${col + 2}`]);

                const compCd1 = normalizeCvValue(row[`column_${col}`]);
                if (sheetName.trim() === "CV (excl. HCV)" && segment === "GCV3" && col === 5) {
                    console.log("CV DEBUG:", {
                        rawValue: row[`column_${col}`],
                        parsedValue: compCd1,
                        clusterName,
                        segment,
                    });
                }
                const compMaxCd2 = normalizeCvValue(row[`column_${col + 1}`]);
                const tpMaxCd2 = normalizeCvValue(row[`column_${col + 2}`]);

                // COMP row
                totalRows++;

                await MysqlCommissionGridModel.insertCommissionGrid(
                    {
                        insurer_id,
                        upload_id: uploadId,

                        product_code: "MOTOR",
                        sub_product_code: "COMMERCIAL_VEHICLE",
                        policy_type_code: compPolicy || "COMP",

                        grid_category: sheetName,
                        grid_sub_category: "CV_EXCL_HCV",

                        cluster_name: clusterName,
                        rto_code: null,

                        vehicle_segment: segment,
                        vehicle_make: make || null,
                        vehicle_model: null,
                        fuel_type: null,

                        carrier_type: carrierType || null,
                        vehicle_usage_type: "COMMERCIAL",

                        cc_min: null,
                        cc_max: null,

                        seating_capacity_min: null,
                        seating_capacity_max: null,

                        vehicle_age_min: null,
                        vehicle_age_max: null,

                        addon_applicable: "ANY",

                        cd1: compCd1.amount,
                        max_cd2: compMaxCd2.amount,

                        commission_value: compMaxCd2.amount,
                        // commission_value_type: compMaxCd2.text ? "FORMULA" : "PERCENTAGE",
                        commission_value_type: compMaxCd2.amount !== null ? "PERCENTAGE" : "FORMULA",
                        formula_type: compMaxCd2.amount !== null && compCd1.amount !== null ? null : "TEXT_RULE",

                        // formula_type: compMaxCd2.text ? "TEXT_RULE" : null,
                        formula_text: JSON.stringify({
                            cd1_field: compCd1Field,
                            max_cd2_field: compMaxCd2Field,
                            cd1_rule: compCd1.text,
                            max_cd2_rule: compMaxCd2.text,
                        }),

                        is_declined: compCd1.isDeclined || compMaxCd2.isDeclined ? 1 : 0,
                        decline_reason:
                            compCd1.isDeclined || compMaxCd2.isDeclined
                                ? "Declined as per insurer grid"
                                : null,

                        remarks: null,
                        raw_rule_text: JSON.stringify(row),

                        priority: 100,
                        effective_from: effective_from || null,
                        effective_to: effective_to || null,
                    },
                    transaction
                );

                successRows++;

                // TP row
                totalRows++;

                await MysqlCommissionGridModel.insertCommissionGrid(
                    {
                        insurer_id,
                        upload_id: uploadId,

                        product_code: "MOTOR",
                        sub_product_code: "COMMERCIAL_VEHICLE",
                        policy_type_code: tpPolicy || "TP",

                        grid_category: sheetName,
                        grid_sub_category: "CV_EXCL_HCV",

                        cluster_name: clusterName,
                        rto_code: null,

                        vehicle_segment: segment,
                        vehicle_make: make || null,
                        vehicle_model: null,
                        fuel_type: null,

                        carrier_type: carrierType || null,
                        vehicle_usage_type: "COMMERCIAL",

                        cc_min: null,
                        cc_max: null,

                        seating_capacity_min: null,
                        seating_capacity_max: null,

                        vehicle_age_min: null,
                        vehicle_age_max: null,

                        addon_applicable: "ANY",

                        cd1: null,
                        max_cd2: tpMaxCd2.amount,

                        commission_value: tpMaxCd2.amount,
                        // commission_value_type: tpMaxCd2.text ? "FORMULA" : "PERCENTAGE",
                        commission_value_type: tpMaxCd2.amount !== null ? "PERCENTAGE" : "FORMULA",
                        formula_type: tpMaxCd2.amount !== null ? null : "TEXT_RULE",

                        // formula_type: tpMaxCd2.text ? "TEXT_RULE" : null,
                        formula_text: JSON.stringify({
                            max_cd2_field: tpMaxCd2Field,
                            max_cd2_rule: tpMaxCd2.text,
                        }),

                        is_declined: tpMaxCd2.isDeclined ? 1 : 0,
                        decline_reason: tpMaxCd2.isDeclined
                            ? "Declined as per insurer grid"
                            : null,

                        remarks: null,
                        raw_rule_text: JSON.stringify(row),

                        priority: 100,
                        effective_from: effective_from || null,
                        effective_to: effective_to || null,
                    },
                    transaction
                );

                successRows++;
            } catch (error) {
                failedRows++;
                console.log("CV excl HCV row failed:", error.message);
            }
        }
    }

    return {
        sheetName,
        type: "COMMISSION_GRID_NORMALIZED",
        totalRows,
        successRows,
        failedRows,
    };
};

const parseWideCvGridSheet = async ({
    worksheet,
    sheetName,
    insurer_id,
    uploadId,
    effective_from,
    effective_to,
    transaction,
    subProductCode,
    gridSubCategory,
    headerStartIndex,
}) => {
    const rows = worksheetToJson(worksheet);

    let totalRows = 0;
    let successRows = 0;
    let failedRows = 0;

    const clusterRow = rows[headerStartIndex];
    const policyRow = rows[headerStartIndex + 1];
    const fieldRow = rows[headerStartIndex + 2];
    const dataRows = rows.slice(headerStartIndex + 3);

    for (const row of dataRows) {
        const segment = row.column_2;
        const make = row.column_3;
        const carrierType = row.column_4;

        if (!segment) continue;

        for (let col = 5; col <= 169; col += 3) {
            try {
                const clusterName = clusterRow[`column_${col}`];

                if (!clusterName) continue;

                // const compCd1 = normalizeCommissionFlexible(row[`column_${col}`]);
                // const compMaxCd2 = normalizeCommissionFlexible(row[`column_${col + 1}`]);
                // const tpMaxCd2 = normalizeCommissionFlexible(row[`column_${col + 2}`]);

                const compCd1 = normalizeCvValue(row[`column_${col}`]);
                const compMaxCd2 = normalizeCvValue(row[`column_${col + 1}`]);
                const tpMaxCd2 = normalizeCvValue(row[`column_${col + 2}`]);

                // COMP row
                totalRows++;

                await MysqlCommissionGridModel.insertCommissionGrid(
                    {
                        insurer_id,
                        upload_id: uploadId,

                        product_code: "MOTOR",
                        sub_product_code: subProductCode,
                        policy_type_code: "COMP",

                        grid_category: sheetName,
                        grid_sub_category: gridSubCategory,

                        cluster_name: clusterName,
                        rto_code: null,

                        vehicle_segment: segment,
                        vehicle_make: make || null,
                        vehicle_model: null,
                        fuel_type: null,

                        carrier_type: carrierType || null,
                        vehicle_usage_type: "COMMERCIAL",

                        cc_min: null,
                        cc_max: null,

                        seating_capacity_min: null,
                        seating_capacity_max: null,

                        vehicle_age_min: null,
                        vehicle_age_max: null,

                        addon_applicable: "ANY",

                        cd1: compCd1.amount,
                        max_cd2: compMaxCd2.amount,

                        commission_value: compMaxCd2.amount,
                        // commission_value_type: compMaxCd2.text ? "FORMULA" : "PERCENTAGE",
                        commission_value_type: compMaxCd2.amount !== null ? "PERCENTAGE" : "FORMULA",
                        formula_type: compMaxCd2.amount !== null && compCd1.amount !== null ? null : "TEXT_RULE",

                        // formula_type: compMaxCd2.text || compCd1.text ? "TEXT_RULE" : null,
                        formula_text: JSON.stringify({
                            cd1_field: fieldRow[`column_${col}`],
                            max_cd2_field: fieldRow[`column_${col + 1}`],
                            cd1_rule: compCd1.text,
                            max_cd2_rule: compMaxCd2.text,
                        }),

                        is_declined: compCd1.isDeclined || compMaxCd2.isDeclined ? 1 : 0,
                        decline_reason:
                            compCd1.isDeclined || compMaxCd2.isDeclined
                                ? "Declined as per insurer grid"
                                : null,

                        remarks: null,
                        raw_rule_text: JSON.stringify(row),

                        priority: 100,
                        effective_from: effective_from || null,
                        effective_to: effective_to || null,
                    },
                    transaction
                );

                successRows++;

                // TP row
                totalRows++;

                await MysqlCommissionGridModel.insertCommissionGrid(
                    {
                        insurer_id,
                        upload_id: uploadId,

                        product_code: "MOTOR",
                        sub_product_code: subProductCode,
                        policy_type_code: "TP",

                        grid_category: sheetName,
                        grid_sub_category: gridSubCategory,

                        cluster_name: clusterName,
                        rto_code: null,

                        vehicle_segment: segment,
                        vehicle_make: make || null,
                        vehicle_model: null,
                        fuel_type: null,

                        carrier_type: carrierType || null,
                        vehicle_usage_type: "COMMERCIAL",

                        cc_min: null,
                        cc_max: null,

                        seating_capacity_min: null,
                        seating_capacity_max: null,

                        vehicle_age_min: null,
                        vehicle_age_max: null,

                        addon_applicable: "ANY",

                        cd1: null,
                        max_cd2: tpMaxCd2.amount,

                        commission_value: tpMaxCd2.amount,
                        // commission_value_type: tpMaxCd2.text ? "FORMULA" : "PERCENTAGE",
                        commission_value_type: tpMaxCd2.amount !== null ? "PERCENTAGE" : "FORMULA",
                        formula_type: tpMaxCd2.amount !== null ? null : "TEXT_RULE",

                        // formula_type: tpMaxCd2.text ? "TEXT_RULE" : null,
                        formula_text: JSON.stringify({
                            max_cd2_field: fieldRow[`column_${col + 2}`],
                            max_cd2_rule: tpMaxCd2.text,
                        }),

                        is_declined: tpMaxCd2.isDeclined ? 1 : 0,
                        decline_reason: tpMaxCd2.isDeclined
                            ? "Declined as per insurer grid"
                            : null,

                        remarks: null,
                        raw_rule_text: JSON.stringify(row),

                        priority: 100,
                        effective_from: effective_from || null,
                        effective_to: effective_to || null,
                    },
                    transaction
                );

                successRows++;
            } catch (error) {
                failedRows++;
                console.log(`${sheetName} row failed:`, error.message);
            }
        }
    }

    return {
        sheetName,
        type: "COMMISSION_GRID_NORMALIZED",
        totalRows,
        successRows,
        failedRows,
    };
};


///////// view commission grid /////////////

const lookupCommissionGrid = async (req, res) => {
    try {
        const {
            insurer_id,
            sub_product_code,
            policy_type_code,
            rto_code,
        } = req.body;

        if (!insurer_id || !sub_product_code || !policy_type_code || !rto_code) {
            return res.status(400).json({
                error: 1,
                status: 0,
                message: "insurer_id, sub_product_code, policy_type_code and rto_code are required",
            });
        }

        const payload = {
            ...req.body,
            cc:
                req.body.cc !== null && req.body.cc !== undefined && req.body.cc !== ""
                    ? Number(req.body.cc)
                    : null,
            vehicle_age:
                req.body.vehicle_age !== null &&
                req.body.vehicle_age !== undefined &&
                req.body.vehicle_age !== ""
                    ? Number(req.body.vehicle_age)
                    : null,
        };

        const result = await CommissionEngineService.resolveCommission(payload);

        return res.status(200).json({
            error: 0,
            status: result.found ? 1 : 0,
            message: result.found
                ? "Commission grid fetched successfully"
                : result.reason,
            result: {
                input: payload,
                rto_cluster: result.rto_cluster,
                cluster_name: result.cluster_name,
                commission: result.commission,
                total_matches: result.commission_rows.length,
                commission_rows: result.commission_rows,
                available_clusters: result.available_clusters || [],
            },
        });
    } catch (error) {
        console.log("Commission lookup error:", error);

        return res.status(500).json({
            error: 1,
            status: 0,
            message: "Something went wrong",
            dev_message: error.message,
        });
    }
};


module.exports = {
    importCommissionGrid,
    lookupCommissionGrid
};