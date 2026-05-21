const { QueryTypes } = require("sequelize");
const { mysqldb } = require(process.env.SHARED_LIBRARY_PATH + "/services/models");
const fs = require("fs");

const bulkInsertMasterData = async ({ tableName, rows, uniqueKeys = [] }) => {
    console.log("🚀 ~ bulkInsertMasterData ~ uniqueKeys:", uniqueKeys)
    // console.log("🚀 ~ bulkInsertMasterData ~ rows:", rows)
    console.log("🚀 ~ bulkInsertMasterData ~ tableName:", tableName)


    if (!rows || rows.length === 0) {
        return {
            totalRows: 0,
            affectedRows: 0,
            message: "No rows found for import"
        };
    }

    const columns = Object.keys(rows[0]);

    const values = rows.map(row =>
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

    const transaction = await mysqldb.transaction();

    try {
        const [result] = await mysqldb.query(sql, {
            replacements: flatValues,
            transaction
        });

        await transaction.commit();

        return {
            totalRows: rows.length,
            affectedRows: result?.affectedRows || 0,
            message: "Master data imported successfully"
        };
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};


async function clearMasterTables_(tableNames = []) {
    const transaction = await mysqldb.transaction();

    try {
        await mysqldb.query("SET FOREIGN_KEY_CHECKS = 0", { transaction });

        for (const tableName of tableNames) {
            await mysqldb.query(`DELETE FROM \`${tableName}\``, { transaction });
            await mysqldb.query(`ALTER TABLE \`${tableName}\` AUTO_INCREMENT = 1`, { transaction });
        }

        await mysqldb.query("SET FOREIGN_KEY_CHECKS = 1", { transaction });

        await transaction.commit();

        return true;
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
}


async function clearMasterTables(tableNames, insurerId = null) {
    for (const tableName of tableNames) {
        if (insurerId) {
            await mysqldb.query(
                `DELETE FROM ${tableName} WHERE insurer_id = :insurerId`,
                {
                    replacements: { insurerId },
                    type: mysqldb.QueryTypes.DELETE
                }
            );
        } else {
            await mysqldb.query(
                `DELETE FROM ${tableName}`,
                {
                    type: mysqldb.QueryTypes.DELETE
                }
            );
        }
    }
}


////////////////////////////////
function parseCodeLabelPairs(sectionText) {
    const regex = /([A-Z0-9_]+)\("([^"]+)"\)/g;
    const result = [];
    let match;

    while ((match = regex.exec(sectionText)) !== null) {
        result.push({
            code: match[1].trim(),
            label: match[2].trim()
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
        vehicle_type_label: item.label
    }));

    const usageTypes = parseCodeLabelPairs(usageTypeSection).map(item => ({
        ...defaultValues,
        usage_type_code: item.code,
        usage_type_label: item.label
    }));

    const permitUsageTypes = parseCodeLabelPairs(permitUsageTypeSection).map(item => ({
        ...defaultValues,
        permit_usage_type_code: item.code,
        permit_usage_type_label: item.label
    }));

    return {
        insurer_cv_vehicle_type_master: vehicleTypes,
        insurer_cv_usage_type_master: usageTypes,
        insurer_cv_permit_usage_type_master: permitUsageTypes
    };
}

module.exports = {
    bulkInsertMasterData,
    clearMasterTables,
    parseCvVehicleTypeTxt
};
