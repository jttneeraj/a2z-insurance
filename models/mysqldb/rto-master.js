const {
    MysqlRtoMasterModel,
    mysqldb,
} = require(process.env.SHARED_LIBRARY_PATH + "/services/models");

class RtoMasterModel extends MysqlRtoMasterModel {
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
    MysqlRtoMasterModel: new RtoMasterModel(),
};