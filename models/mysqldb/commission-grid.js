const { QueryTypes } = require("sequelize");
const {
    mysqldb,
} = require(process.env.SHARED_LIBRARY_PATH + "/services/models");

class CommissionGridModel {
    constructor() {
        this.sequelize = mysqldb.sequelize;
    }

    add = (data) => {
        return this.model.create(data);
    };

    update = (id, data) => {
        return this.model.update(data, {
            where: {
                id: id,
            },
        });
    };

    findAllCount(conditions) {
        return this.model.count({
            where: conditions,
        });
    }

    find(attributes, conditions, order_by, start, limit) {
        return this.model.findAll({
            attributes: attributes,
            where: conditions,
            order: order_by,
            offset: start,
            limit: limit,
        });
    }

    findById(id) {
        return this.model.findByPk(id);
    }

    findByQuery(conditions) {
        return this.model.findOne({
            where: conditions,
        });
    }

    createUploadRecord(data, transaction) {
        return mysqldb.query(
            `
            INSERT INTO insurer_commission_grid_uploads
            (
                insurer_id,
                upload_code,
                file_name,
                original_file_name,
                file_path,
                financial_year,
                effective_from,
                effective_to,
                status
            )
            VALUES
            (
                :insurer_id,
                :upload_code,
                :file_name,
                :original_file_name,
                :file_path,
                :financial_year,
                :effective_from,
                :effective_to,
                'PROCESSING'
            )
            `,
            {
                replacements: data,
                type: QueryTypes.INSERT,
                transaction,
            }
        );
    }

    updateUploadRecord(uploadId, data, transaction) {
        return mysqldb.query(
            `
            UPDATE insurer_commission_grid_uploads
            SET
                status = :status,
                total_rows = :total_rows,
                success_rows = :success_rows,
                failed_rows = :failed_rows,
                remarks = :remarks
            WHERE id = :upload_id
            `,
            {
                replacements: {
                    upload_id: uploadId,
                    ...data,
                },
                type: QueryTypes.UPDATE,
                transaction,
            }
        );
    }

    insertRtoClusterMapping(data, transaction) {
        return mysqldb.query(
            `
            INSERT INTO insurer_rto_cluster_mapping
            (
                insurer_id,
                upload_id,
                product_code,
                sub_product_code,
                policy_type_code,
                rto_code,
                rto_name,
                city_name,
                state_name,
                cluster_name,
                mapping_type,
                is_active
            )
            VALUES
            (
                :insurer_id,
                :upload_id,
                :product_code,
                :sub_product_code,
                :policy_type_code,
                :rto_code,
                :rto_name,
                :city_name,
                :state_name,
                :cluster_name,
                :mapping_type,
                1
            )
            ON DUPLICATE KEY UPDATE
                cluster_name = VALUES(cluster_name),
                rto_name = VALUES(rto_name),
                city_name = VALUES(city_name),
                state_name = VALUES(state_name),
                updated_at = CURRENT_TIMESTAMP
            `,
            {
                replacements: data,
                type: QueryTypes.INSERT,
                transaction,
            }
        );
    }

    insertCommissionGrid(data, transaction) {
        return mysqldb.query(
            `
            INSERT INTO insurer_commission_grid
            (
                insurer_id,
                upload_id,
                product_code,
                sub_product_code,
                policy_type_code,
                grid_category,
                grid_sub_category,
                cluster_name,
                rto_code,
                vehicle_segment,
                vehicle_make,
                vehicle_model,
                fuel_type,
                carrier_type,
                vehicle_usage_type,
                cc_min,
                cc_max,
                seating_capacity_min,
                seating_capacity_max,
                vehicle_age_min,
                vehicle_age_max,
                addon_applicable,
                cd1,
                max_cd2,
                commission_value,
                commission_value_type,
                formula_type,
                formula_text,
                is_declined,
                decline_reason,
                remarks,
                raw_rule_text,
                priority,
                effective_from,
                effective_to,
                is_active
            )
            VALUES
            (
                :insurer_id,
                :upload_id,
                :product_code,
                :sub_product_code,
                :policy_type_code,
                :grid_category,
                :grid_sub_category,
                :cluster_name,
                :rto_code,
                :vehicle_segment,
                :vehicle_make,
                :vehicle_model,
                :fuel_type,
                :carrier_type,
                :vehicle_usage_type,
                :cc_min,
                :cc_max,
                :seating_capacity_min,
                :seating_capacity_max,
                :vehicle_age_min,
                :vehicle_age_max,
                :addon_applicable,
                :cd1,
                :max_cd2,
                :commission_value,
                :commission_value_type,
                :formula_type,
                :formula_text,
                :is_declined,
                :decline_reason,
                :remarks,
                :raw_rule_text,
                :priority,
                :effective_from,
                :effective_to,
                1
            )
            `,
            {
                replacements: data,
                type: QueryTypes.INSERT,
                transaction,
            }
        );
    }

    deleteOldCommissionGridData(insurerId, transaction) {
        return mysqldb.query(
            `
        DELETE FROM insurer_commission_grid
        WHERE insurer_id = :insurer_id
        `,
            {
                replacements: {
                    insurer_id: insurerId,
                },
                transaction,
            }
        );
    }

    deleteOldRtoClusterData(insurerId, transaction) {
        return mysqldb.query(
            `
        DELETE FROM insurer_rto_cluster_mapping
        WHERE insurer_id = :insurer_id
        `,
            {
                replacements: {
                    insurer_id: insurerId,
                },
                transaction,
            }
        );
    }

    markOldUploadsInactive(insurerId, transaction) {
        return mysqldb.query(
            `
        UPDATE insurer_commission_grid_uploads
        SET 
            status = 'INACTIVE',
            is_active = 0
        WHERE insurer_id = :insurer_id
          AND is_active = 1
        `,
            {
                replacements: {
                    insurer_id: insurerId,
                },
                transaction,
            }
        );
    }


    getRtoCluster(data) {
        return mysqldb.query(
            `
        SELECT *
        FROM insurer_rto_cluster_mapping
        WHERE insurer_id = :insurer_id
          AND rto_code = :rto_code
          AND is_active = 1
        ORDER BY 
          CASE 
            WHEN sub_product_code = :sub_product_code THEN 1
            WHEN sub_product_code IS NULL THEN 2
            ELSE 3
          END
        LIMIT 1
        `,
            {
                replacements: data,
                type: QueryTypes.SELECT,
            }
        );
    }



    lookupCommissionGrid(data) {
        return mysqldb.query(
            `
        SELECT *
        FROM insurer_commission_grid
        WHERE insurer_id = :insurer_id
          AND product_code = :product_code
          AND sub_product_code = :sub_product_code
          AND policy_type_code = :policy_type_code
          AND LOWER(TRIM(cluster_name)) = LOWER(TRIM(:cluster_name))
          AND is_active = 1

          AND (
              :fuel_type IS NULL
              OR fuel_type IS NULL
              OR fuel_type = ''
              OR LOWER(fuel_type) = LOWER(:fuel_type)
          )

          AND (
              :vehicle_make IS NULL
              OR vehicle_make IS NULL
              OR vehicle_make = ''
              OR LOWER(vehicle_make) = 'all'
              OR LOWER(vehicle_make) = LOWER(:vehicle_make)
              OR LOWER(vehicle_make) LIKE CONCAT('%', LOWER(:vehicle_make), '%')
          )

          AND (
              :addon_applicable IS NULL
              OR addon_applicable = 'ANY'
              OR addon_applicable = :addon_applicable
          )

          AND (
              :cc IS NULL
              OR (
                  (cc_min IS NULL OR cc_min <= :cc)
                  AND (cc_max IS NULL OR cc_max >= :cc)
              )
          )

          AND (
              :vehicle_age IS NULL
              OR (
                  (vehicle_age_min IS NULL OR vehicle_age_min <= :vehicle_age)
                  AND (vehicle_age_max IS NULL OR vehicle_age_max >= :vehicle_age)
              )
          )

          AND (
              :vehicle_segment IS NULL
              OR vehicle_segment IS NULL
              OR LOWER(vehicle_segment) = LOWER(:vehicle_segment)
              OR LOWER(vehicle_segment) LIKE CONCAT('%', LOWER(:vehicle_segment), '%')
          )

        ORDER BY
            CASE WHEN is_declined = 0 THEN 0 ELSE 1 END,

            CASE 
                WHEN :vehicle_make IS NOT NULL
                 AND vehicle_make IS NOT NULL
                 AND LOWER(vehicle_make) = LOWER(:vehicle_make)
                THEN 0 ELSE 1
            END,

            CASE 
                WHEN :vehicle_segment IS NOT NULL
                 AND vehicle_segment IS NOT NULL
                 AND LOWER(vehicle_segment) = LOWER(:vehicle_segment)
                THEN 0 ELSE 1
            END,

            CASE 
                WHEN :addon_applicable IS NOT NULL
                 AND addon_applicable = :addon_applicable
                THEN 0 ELSE 1
            END,

            CASE 
                WHEN cc_min IS NOT NULL OR cc_max IS NOT NULL
                THEN 0 ELSE 1
            END,

            CASE 
                WHEN vehicle_age_min IS NOT NULL OR vehicle_age_max IS NOT NULL
                THEN 0 ELSE 1
            END,

            priority ASC,
            id ASC

        LIMIT 20
        `,
            {
                replacements: data,
                type: QueryTypes.SELECT,
            }
        );
    }

    getAvailableClusters(data) {
        return mysqldb.query(
            `
        SELECT DISTINCT cluster_name
        FROM insurer_commission_grid
        WHERE insurer_id = :insurer_id
          AND product_code = :product_code
          AND sub_product_code = :sub_product_code
          AND policy_type_code = :policy_type_code
          AND is_active = 1
        ORDER BY cluster_name
        LIMIT 100
        `,
            {
                replacements: data,
                type: QueryTypes.SELECT,
            }
        );
    }

}

module.exports = {
    mysqldb,
    MysqlCommissionGridModel: new CommissionGridModel(),
};