const { MysqlCommissionGridModel } = require("../models/mysqldb/commission-grid");

class CommissionEngineService {
    async resolveCommission(input) {
        const {
            insurer_id,
            product_code = "MOTOR",
            sub_product_code,
            policy_type_code,
            rto_code,

            cluster_name = null,
            fuel_type = null,
            vehicle_make = null,
            vehicle_segment = null,
            cc = null,
            vehicle_age = null,
            addon_applicable = null,
        } = input;

        const normalizedCc =
            cc !== null && cc !== undefined && cc !== "" ? Number(cc) : null;

        const normalizedVehicleAge =
            vehicle_age !== null && vehicle_age !== undefined && vehicle_age !== ""
                ? Number(vehicle_age)
                : null;

        const rtoClusterRows = await MysqlCommissionGridModel.getRtoCluster({
            insurer_id,
            rto_code,
            sub_product_code,
        });

        if ((!rtoClusterRows || !rtoClusterRows.length) && !cluster_name) {
            return {
                found: false,
                reason: "RTO cluster mapping not found",
                rto_cluster: null,
                cluster_name: null,
                commission: null,
                commission_rows: [],
                available_clusters: [],
            };
        }

        const resolvedClusterName =
            cluster_name || rtoClusterRows[0].cluster_name;

        const commissionRows = await MysqlCommissionGridModel.lookupCommissionGrid({
            insurer_id,
            product_code,
            sub_product_code,
            policy_type_code,
            cluster_name: resolvedClusterName,

            fuel_type,
            vehicle_make,
            vehicle_segment,
            cc: normalizedCc,
            vehicle_age: normalizedVehicleAge,
            addon_applicable,
        });

        const bestMatch =
            commissionRows && commissionRows.length ? commissionRows[0] : null;

        if (!bestMatch) {
            const availableClusters =
                await MysqlCommissionGridModel.getAvailableClusters({
                    insurer_id,
                    product_code,
                    sub_product_code,
                    policy_type_code,
                });

            return {
                found: false,
                reason: "No matching commission grid found",
                rto_cluster:
                    rtoClusterRows && rtoClusterRows.length ? rtoClusterRows[0] : null,
                cluster_name: resolvedClusterName,
                commission: null,
                commission_rows: [],
                available_clusters: availableClusters || [],
            };
        }

        return {
            found: true,
            reason: null,
            rto_cluster:
                rtoClusterRows && rtoClusterRows.length ? rtoClusterRows[0] : null,
            cluster_name: resolvedClusterName,
            commission: {
                commission_grid_id: bestMatch.id,
                cd1: bestMatch.cd1,
                max_cd2: bestMatch.max_cd2,
                commission_value: bestMatch.commission_value,
                commission_value_type: bestMatch.commission_value_type,
                formula_type: bestMatch.formula_type,
                formula_text: bestMatch.formula_text,
                is_declined: bestMatch.is_declined,
                decline_reason: bestMatch.decline_reason,
                remarks: bestMatch.remarks,
            },
            commission_rows: commissionRows,
            available_clusters: [],
        };
    }
}

module.exports = new CommissionEngineService();