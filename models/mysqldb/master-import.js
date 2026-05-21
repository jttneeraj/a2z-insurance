const { mysqldb } = require(process.env.SHARED_LIBRARY_PATH + "/services/models");
const fs = require("fs");

const DEFAULT_CHUNK_SIZE = 500;

const bulkInsertMasterData = async ({
    tableName,
    rows,
    uniqueKeys = [],
    transaction,
    chunkSize = DEFAULT_CHUNK_SIZE,
}) => {
    if (!rows || rows.length === 0) {
        return {
            totalRows: 0,
            affectedRows: 0,
            message: "No rows found for import",
        };
    }

    let affectedRows = 0;

    for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const columns = Object.keys(chunk[0]);

        const values = chunk.map(row =>
            columns.map(column => row[column] ?? null)
        );

        const insertColumns = columns.map(col => `\`${col}\``).join(", ");

        const placeholders = values
            .map(() => `(${columns.map(() => "?").join(", ")})`)
            .join(", ");

        let sql = `
            INSERT INTO \`${tableName}\`
            (${insertColumns})
            VALUES ${placeholders}
        `;

        if (uniqueKeys.length > 0) {
            const updateColumns = columns.filter(col => !uniqueKeys.includes(col));

            if (updateColumns.length > 0) {
                sql += `
                    ON DUPLICATE KEY UPDATE
                    ${updateColumns
                        .map(col => `\`${col}\` = VALUES(\`${col}\`)`)
                        .join(", ")}
                `;
            }
        }

        const flatValues = values.flat();

        const [result] = await mysqldb.query(sql, {
            replacements: flatValues,
            transaction,
        });

        affectedRows += result?.affectedRows || 0;
    }

    return {
        totalRows: rows.length,
        affectedRows,
        message: "Master data imported successfully",
    };
};

async function clearMasterTable({ tableName, insurerId = null, transaction }) {
    if (insurerId) {
        await mysqldb.query(
            `DELETE FROM \`${tableName}\` WHERE insurer_id = :insurerId`,
            {
                replacements: { insurerId },
                transaction,
            }
        );
    } else {
        await mysqldb.query(
            `DELETE FROM \`${tableName}\``,
            { transaction }
        );
    }
}

function parseCodeLabelPairs(sectionText) {
    const regex = /([A-Z0-9_]+)\("([^"]+)"\)/g;
    const result = [];
    let match;

    while ((match = regex.exec(sectionText)) !== null) {
        result.push({
            code: match[1].trim(),
            label: match[2].trim(),
        });
    }

    return result;
}

function getSection(content, startKey, endKey) {
    const start = content.indexOf(startKey);
    if (start === -1) return "";

    const end = endKey ? content.indexOf(endKey, start) : content.length;
    return content.substring(start, end === -1 ? content.length : end);
}

function parseCvVehicleTypeTxt(filePath, defaultValues = {}) {
    const content = fs.readFileSync(filePath, "utf8");

    const vehicleTypeSection = getSection(content, "vehicleType", "usageType");
    const usageTypeSection = getSection(content, "usageType", "permitUsageType");
    const permitUsageTypeSection = getSection(content, "permitUsageType", "motortype");

    const vehicleTypes = parseCodeLabelPairs(vehicleTypeSection).map(item => ({
        ...defaultValues,
        vehicle_type_code: item.code,
        vehicle_type_label: item.label,
    }));

    const usageTypes = parseCodeLabelPairs(usageTypeSection).map(item => ({
        ...defaultValues,
        usage_type_code: item.code,
        usage_type_label: item.label,
    }));

    const permitUsageTypes = parseCodeLabelPairs(permitUsageTypeSection).map(item => ({
        ...defaultValues,
        permit_usage_type_code: item.code,
        permit_usage_type_label: item.label,
    }));

    return {
        insurer_cv_vehicle_type_master: vehicleTypes,
        insurer_cv_usage_type_master: usageTypes,
        insurer_cv_permit_usage_type_master: permitUsageTypes,
    };
}

module.exports = {
    bulkInsertMasterData,
    clearMasterTable,
    parseCvVehicleTypeTxt,
};