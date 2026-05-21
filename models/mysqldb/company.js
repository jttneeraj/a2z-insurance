const { QueryTypes } = require("sequelize");



const { MysqlCompanyModel, mysqldb } = require(process.env.SHARED_LIBRARY_PATH + '/services/models');

class Company extends MysqlCompanyModel {

    constructor() {
        super();
    }
    countRecordBkp(conditions) {
        let query = "select count(u.id) as total_records  from companies as c join users as u on c.user_id = u.id "
        let replacements = {}

        if (conditions?.query != '' && conditions?.query !== undefined) {
            query += ' and ( company_name LIKE :name';
            query += ' or company_mobile LIKE :company_mobile';
            query += ' or company_email LIKE :company_email )';
            replacements.name = "%" + `${conditions.query}` + "%"
            replacements.company_mobile = "%" + `${conditions.query}` + "%"
            replacements.company_email = "%" + `${conditions.query}` + "%"
        }
        if (conditions?.status != '' && conditions?.status !== undefined) {
            query += ' and c.status = :status';
            replacements.status = `${conditions.status}`;
        }
        return mysqldb.query(query, {
            replacements: replacements,
            //order: order_by,
            type: QueryTypes.SELECT
        });
    }

    countRecord(query, replacements) {
        let mainquery = "select count(u.id) as total_records "
        mainquery = mainquery + query;

        return mysqldb.query(mainquery, {
            replacements: replacements,
            //order: order_by,
            type: QueryTypes.SELECT
        });
    }


    findAll(attributes, conditions, order_by, offset, limit) {

        return this.model.findAll({
            attributes: attributes,
            where: conditions,
            order: order_by,
            offset: offset,
            limit: limit

        })

    }
    findByRawQueryBkp(conditions, order_by, offset, limit) {

        let query = "select u.id as user_id, u.name as user_name, c.id as id, company_name,company_email,company_address,company_mobile, c.status ,company_logo, seal_image, c.created_at from companies as c join users as u on c.user_id = u.id "
        let replacements = {}

        if (conditions?.query != '' && conditions?.query !== undefined) {
            query += ' and ( company_name LIKE :name';
            query += ' or company_mobile LIKE :company_mobile';
            query += ' or company_email LIKE :company_email )';
            replacements.name = "%" + `${conditions.query}` + "%"
            replacements.company_mobile = "%" + `${conditions.query}` + "%"
            replacements.company_email = "%" + `${conditions.query}` + "%"
        }
        if (conditions?.status != '' && conditions?.status !== undefined) {
            query += ' and c.status = :status';
            replacements.status = `${conditions.status}`;
        }


        if (order_by)
            query += " ORDER BY " + order_by;
        if (offset === 0 || offset)
            query += " LIMIT " + offset;
        if (limit)
            query += ", " + limit;
        return mysqldb.query(query, {
            replacements: replacements,
            type: QueryTypes.SELECT
        });


    }
    findByRawQuery(query, replacements, order_by, offset, limit) {

        let mainQuery = "select u.id as user_id, u.name as user_name, c.id as id, company_name,company_email,company_address,company_mobile,c.status,company_logo, seal_image, c.created_at "
        mainQuery = mainQuery + query;
        if (order_by)
            mainQuery += " ORDER BY " + order_by;
        if (offset === 0 || offset)
            mainQuery += " LIMIT " + offset;
        if (limit)
            mainQuery += ", " + limit;

        return mysqldb.query(mainQuery, {
            replacements: replacements,
            type: QueryTypes.SELECT
        });


    }
    findByRawQueryForDownload(query, replacements, order_by, offset, limit) {

        let mainQuery = "select u.id as user_id, u.name as user_name, c.id as id, company_name,company_email,company_address,company_mobile,c.status,company_logo, seal_image, c.created_at "

        mainQuery = mainQuery + query;
        if (order_by)
            mainQuery += " ORDER BY " + order_by;
        if (offset === 0 || offset)
            mainQuery += " LIMIT " + offset;
        if (limit)
            mainQuery += ", " + limit;

        return mysqldb.query(mainQuery, {
            replacements: replacements,
            //order: order_by,
            type: QueryTypes.SELECT
        });


    }
    findByCondition(attributes, conditions) {
        return this.model.findAll({
            attributes: attributes,
            where: conditions,
        })

    }
    create(data) {

        return this.model.create(data)
    }

    findById(id, attributes) {
        return this.model.findByPk(id, {
            attributes: attributes,
        })
    }
    updateById(data, id) {
        return this.model.update(data, {
            where: {
                id: id
            },
        })
    }
}
module.exports = {
    mysqldb,
    MysqlCompanyModel: new Company()
}