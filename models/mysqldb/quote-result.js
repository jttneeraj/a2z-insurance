const { Op, QueryTypes } = require("sequelize");

const {
    MysqlQuoteResultsModel,
    mysqldb,
} = require(process.env.SHARED_LIBRARY_PATH + "/services/models");

class QuoteResultsModel extends MysqlQuoteResultsModel {
    constructor() {
        super();
    }

    add = (data, transaction = null) => {
        return this.model.create(data, {
            transaction,
        });
    };

    update = (id, data, transaction = null) => {
        return this.model.update(data, {
            where: {
                id: id,
            },
            transaction,
        });
    };

    findAllCount(conditions) {
        return this.model.count({
            where: conditions,
        });
    }

    findById(id) {
        return this.model.findByPk(id);
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
}

module.exports = {
    mysqldb,
    MysqlQuoteResultsModel: new QuoteResultsModel(),
};