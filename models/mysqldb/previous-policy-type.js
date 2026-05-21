const {
    MysqlPreviousPolicyTypeModel,
    mysqldb,
} = require(process.env.SHARED_LIBRARY_PATH + "/services/models");

class PreviousPolicyTypeModel extends MysqlPreviousPolicyTypeModel {
    constructor() {
        super();
    }

    findByQuery(conditions) {
        return this.model.findOne({
            where: conditions,
        });
    }
}

module.exports = {
    mysqldb,
    MysqlPreviousPolicyTypeModel: new PreviousPolicyTypeModel(),
};