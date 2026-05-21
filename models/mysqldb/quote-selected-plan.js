const { Op, QueryTypes } = require("sequelize");
 
const {
    MysqlQuoteSelectedPlanModel,
    mysqldb,
} = require(process.env.SHARED_LIBRARY_PATH + "/services/models");

class QuoteSelectedPlanModel extends MysqlQuoteSelectedPlanModel {
    constructor() {
        super();
    }

    add = (data, transaction = null) => {
        return this.model.create(data, {
            transaction,
        });
    };

    findByQuery(conditions) {
        return this.model.findOne({
            where: conditions,
        });
    }
}

module.exports = {
    mysqldb,
    MysqlQuoteSelectedPlanModel: new QuoteSelectedPlanModel(),
};