const { Op, QueryTypes } = require("sequelize");
const {
    MysqlQuoteRequestPolicyDetailsModel,
    mysqldb,
} = require(process.env.SHARED_LIBRARY_PATH + "/services/models");

class QuoteRequestPolicyDetailsModel extends MysqlQuoteRequestPolicyDetailsModel {
    constructor() {
        super();
    }

    add = (data, transaction = null) => {
        return this.model.create(data, {
            transaction,
        });
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
}

module.exports = {
    mysqldb,
    MysqlQuoteRequestPolicyDetailsModel: new QuoteRequestPolicyDetailsModel(),
};