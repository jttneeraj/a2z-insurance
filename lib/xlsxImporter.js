const XLSX = require("xlsx");

 

function normalizeCellValue(value) {
    if (value === undefined || value === null) return "";

    if (typeof value === "string") {
        return value.trim();
    }

    return value;
} 

function normalizeHeader(value) {
    return String(value || "")
        .trim()
        .replace(/\s+/g, " ")
        .toUpperCase();
}

function buildNormalizedMapping(columnMapping = {}) {
    const normalizedMapping = {};

    Object.keys(columnMapping).forEach((key) => {
        normalizedMapping[normalizeHeader(key)] = columnMapping[key];
    });

    return normalizedMapping;
} 

 
function parsePreviousPolicyMatrix(worksheet, defaultValues) {
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    const headers = rows[0]; // first row

    const result = [];

    for (let colIndex = 1; colIndex < headers.length; colIndex++) {
        const header = headers[colIndex];

        if (!header) continue;

        // Example: "Pvt Car Comprehensive (20101)"
        const match = header.match(/\((\d+)\)/);

        if (!match) continue;

        const product_code = match[1];
        const product_name = header.replace(/\(\d+\)/, "").trim();

        for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
            const cellValue = rows[rowIndex][colIndex];

            if (!cellValue) continue;

            result.push({
                ...defaultValues,
                product_code,
                product_name,
                previous_policy_type_code: String(cellValue).trim()
            });
        }
    }

    return result;
}

async function readXlsxFile(filePath, columnMapping = {}, defaultValues = {}, sheetName = null, customReader = null) {
    const workbook = XLSX.readFile(filePath, {
        cellDates: true,
        raw: false
    });

    const sheetNames = workbook.SheetNames;

    console.log("Sheet names:", sheetNames);

    if (!sheetNames || sheetNames.length === 0) {
        throw new Error("No worksheet found in uploaded file");
    }

    const selectedSheetName = sheetName || sheetNames[0];

    if (!workbook.Sheets[selectedSheetName]) {
        throw new Error(`Sheet not found: ${selectedSheetName}`);
    }

    const worksheet = workbook.Sheets[selectedSheetName];

    if (customReader === "previousPolicyCodeMatrix") {
        return parsePreviousPolicyMatrix(worksheet, defaultValues);
    }
    if (customReader === "motorProductMatrix") {
        return parseMotorProductMatrix(worksheet, defaultValues);
    }

    if (customReader === "motorProductCoverMatrix") {
        return parseMotorProductCoverMatrix(worksheet, defaultValues);
    }

    if (customReader === "cvProductCoverMatrix") {
        return parseCvProductCoverMatrix(worksheet, defaultValues);
    }

    if (customReader === "addonAgeLimit") {
        return parseAddonAgeLimit(worksheet, defaultValues);
    }

    if (customReader === "ncbMaster") {
        return parseNcbMaster(worksheet, defaultValues);
    }

    if (customReader === "docTypeMasterKyc") {
        return parseDocTypeKyc(worksheet, defaultValues);
    }

    if (customReader === "docTypeMasterMismatch") {
        return parseDocTypeMismatch(worksheet, defaultValues);
    }
    if (customReader === "mismatchTypeTwoColumn") {
        return parseMismatchTypeTwoColumn(worksheet, defaultValues);
    }

    if (customReader === "apiFieldMaster") {
        return parseApiFieldMaster(worksheet, defaultValues);
    }

    if (customReader === "apiFieldValidationRules") {
        return parseApiFieldValidationRules(worksheet, defaultValues);
    }

    const rawRows = XLSX.utils.sheet_to_json(worksheet, {
        defval: null
    });

    console.log("Selected sheet:", selectedSheetName);
    console.log("Excel headers:", rawRows[0] ? Object.keys(rawRows[0]) : []);

    if (!rawRows.length) {
        throw new Error(`Excel sheet has no data rows: ${selectedSheetName}`);
    }
    const normalizedMapping = buildNormalizedMapping(columnMapping);

    const rows = rawRows.map((row) => {
        const finalRow = { ...defaultValues };

        Object.keys(row).forEach((excelHeader) => {
            const cleanHeader = normalizeHeader(excelHeader);
            const dbColumn = normalizedMapping[cleanHeader];

            /*  if (dbColumn) {
                 finalRow[dbColumn] = normalizeCellValue(row[excelHeader]);
             } */
            if (dbColumn) {
                const value = normalizeCellValue(row[excelHeader]);

                if (Array.isArray(dbColumn)) {
                    dbColumn.forEach((columnName) => {
                        finalRow[columnName] = value;
                    });
                } else {
                    finalRow[dbColumn] = value;
                }
            }
        });

        return finalRow;
    });

    return rows;
}


function parseMotorProductMatrix(worksheet, defaultValues) {
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

    const productCodes = rows[0];
    const productNames = rows[1];

    const result = [];

    for (let col = 1; col < productCodes.length; col++) {
        if (!productCodes[col]) continue;

        result.push({
            ...defaultValues,
            product_code: String(productCodes[col]).trim(),
            product_name: String(productNames[col] || "").trim(),
            product_description: String(productNames[col] || "").trim(),
            product_type: String(productNames[col] || "").trim()
        });
    }

    return result;
}

function parseMotorProductCoverMatrix(worksheet, defaultValues) {
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

    const productCodes = rows[0];
    const result = [];

    for (let row = 4; row < rows.length; row++) {
        const coverCode = rows[row][0];
        if (!coverCode) continue;

        for (let col = 1; col < productCodes.length; col++) {
            const status = rows[row][col];
            if (!productCodes[col] || !status) continue;

            result.push({
                ...defaultValues,
                product_code: String(productCodes[col]).trim(),
                cover_code: String(coverCode).trim(),
                cover_name: String(coverCode).trim(),
                cover_type: String(status).trim()
            });
        }
    }

    return result;
}

function parseCvProductCoverMatrix(worksheet, defaultValues) {
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

    const productCodes = rows[1];
    const result = [];

    for (let row = 4; row < rows.length; row++) {
        const coverCode = rows[row][0];
        if (!coverCode) continue;

        for (let col = 1; col < productCodes.length; col++) {
            const status = rows[row][col];
            if (!productCodes[col] || !status) continue;

            result.push({
                ...defaultValues,
                product_code: String(productCodes[col]).trim(),
                cover_code: String(coverCode).trim(),
                cover_name: String(coverCode).trim(),
                cover_type: String(status).trim()
            });
        }
    }

    return result;
}

function parseAddonAgeLimit(worksheet, defaultValues) {
    const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: ""
    });

    const result = [];

    for (let row = 3; row < rows.length; row++) {
        const addonName = rows[row][0];
        if (!addonName) continue;

        result.push({
            ...defaultValues,
            addon_name: String(addonName).trim(),
            age_limit_4w: rows[row][1] ? String(rows[row][1]).trim() : "",
            age_limit_2w: rows[row][2] ? String(rows[row][2]).trim() : ""
        });
    }

    return result;
}

function parseNcbMaster(worksheet, defaultValues) {
    const rows = XLSX.utils.sheet_to_json(worksheet, {
        defval: ""
    });

    return rows
        .map((row, index) => {
            const value = String(row["NCB"] || row["NCB Code"] || "").trim();

            return {
                ...defaultValues,
                ncb_code: value,
                ncb_percent: mapNcbPercent(value),
                sort_order: index + 1
            };
        })
        .filter(row => row.ncb_code);
}

function mapNcbPercent(value) {
    const map = {
        ZERO: 0,
        TWENTY: 20,
        TWENTY_FIVE: 25,
        THIRTY_FIVE: 35,
        FORTY_FIVE: 45,
        FIFTY: 50
    };

    const cleanValue = String(value || "").trim().toUpperCase();

    if (map[cleanValue] !== undefined) {
        return map[cleanValue];
    }

    const number = Number(cleanValue.replace("%", ""));

    return Number.isNaN(number) ? null : number;
}


///
function parseDocTypeKyc(worksheet, defaultValues) {
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

    const result = [];
    let start = false;

    for (let i = 0; i < rows.length; i++) {

        if (rows[i][0]?.toString().trim() === "Document Code") {
            start = true;
            continue;
        }

        if (start) {
            const code = rows[i][0];
            const name = rows[i][1];

            if (!code) continue;

            result.push({
                ...defaultValues,
                document_number_code: String(code).trim(),
                document_type_name: String(name || "").trim()
            });
        }
    }

    console.log("KYC rows:", result.length);

    return result;
}
function parseDocTypeMismatch(worksheet, defaultValues) {
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

    const result = [];
    let start = false;

    for (let i = 0; i < rows.length; i++) {

        if (rows[i][0]?.toString().trim() === "Mismatch Code") {
            start = true;
            continue;
        }

        if (start) {
            const code = rows[i][0];
            const name = rows[i][1];

            if (!code) continue;

            result.push({
                ...defaultValues,
                mismatch_code: String(code).trim(),
                mismatch_label: String(name || "").trim()
            });
        }
    }

    console.log("Mismatch rows:", result.length);

    return result;
}

function parseMismatchTypeTwoColumn(worksheet, defaultValues) {
    const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: ""
    });

    return rows
        .map(row => ({
            ...defaultValues,
            mismatch_code: String(row[0] || "").trim(),
            mismatch_label: String(row[1] || "").trim()
        }))
        .filter(row => row.mismatch_code);
}
/////

function parseApiFieldMaster(worksheet, defaultValues) {
    const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: ""
    });

    const result = [];

    // data starts from row 3, index 2
    for (let i = 2; i < rows.length; i++) {
        const row = rows[i];

        const fieldName = String(row[0] || "").trim();
        if (!fieldName) continue;

        result.push({
            ...defaultValues,
            field_name: fieldName,
            field_description: String(row[5] || "").trim(),
            character_length: String(row[6] || "").trim(),
            field_type: String(row[7] || "").trim()
        });
    }

    return result;
}

function parseApiFieldValidationRules(worksheet, defaultValues) {
    const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: ""
    });

    const validationColumns = [
        {
            index: 1,
            code: "QUICK_QUOTE_NEW"
        },
        {
            index: 2,
            code: "QUICK_QUOTE_ROLLOVER_RENEWAL"
        },
        {
            index: 3,
            code: "CREATE_QUOTE_NEW"
        },
        {
            index: 4,
            code: "CREATE_QUOTE_ROLLOVER_RENEWAL"
        }
    ];

    const result = [];

    for (let i = 2; i < rows.length; i++) {
        const row = rows[i];

        const fieldName = String(row[0] || "").trim();
        if (!fieldName) continue;

        validationColumns.forEach((item) => {
            const ruleText = String(row[item.index] || "").trim();

            if (!ruleText) return;

            result.push({
                ...defaultValues,
                field_name: fieldName,
                validation_context_code: item.code,
                validation_rule_text: ruleText
            });
        });
    }

    return result;
}
module.exports = {
    readXlsxFile
};