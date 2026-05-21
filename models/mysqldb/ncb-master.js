const {
    MysqlNcbMasterModel,
    mysqldb,
} = require(process.env.SHARED_LIBRARY_PATH + "/services/models");

class NcbMasterModel extends MysqlNcbMasterModel {
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
    MysqlNcbMasterModel: new NcbMasterModel(),
};