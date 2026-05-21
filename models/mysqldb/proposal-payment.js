const { MysqlProposalPaymentsModel, mysqldb } = require(process.env.SHARED_LIBRARY_PATH + "/services/models");

class ProposalPaymentsModel extends MysqlProposalPaymentsModel {
    constructor() { super(); }
    add = (data, transaction = null) => this.model.create(data, { transaction });
    update = (id, data, transaction = null) => this.model.update(data, { where: { id }, transaction });
    findById(id) { return this.model.findByPk(id); }
    findByQuery(conditions) { return this.model.findOne({ where: conditions }); }
}

module.exports = { mysqldb, MysqlProposalPaymentsModel: new ProposalPaymentsModel() };
