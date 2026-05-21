const { Op, QueryTypes } = require("sequelize");

const {
    MysqlQuoteProposalsModel,
    mysqldb,
} = require(process.env.SHARED_LIBRARY_PATH + "/services/models");

class QuoteProposalsModel extends MysqlQuoteProposalsModel {
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

    findByQuery(conditions) {
        return this.model.findOne({
            where: conditions,
        });
    }

    findById(id) {
        return this.model.findByPk(id);
    }
}

module.exports = {
    mysqldb,
    MysqlQuoteProposalsModel: new QuoteProposalsModel(),
};
