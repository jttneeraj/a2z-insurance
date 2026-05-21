const {
    MysqlInsurerPreviousPolicyTypeMasterModel,
    mysqldb,
} = require(process.env.SHARED_LIBRARY_PATH + "/services/models");

class InsurerPreviousPolicyTypeMasterModel extends MysqlInsurerPreviousPolicyTypeMasterModel {
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
    MysqlInsurerPreviousPolicyTypeMasterModel: new InsurerPreviousPolicyTypeMasterModel(),
};