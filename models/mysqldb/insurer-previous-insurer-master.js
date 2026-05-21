const {
    MysqlInsurerPreviousInsurerMasterModel,
    mysqldb,
} = require(process.env.SHARED_LIBRARY_PATH + "/services/models");

class InsurerPreviousInsurerMasterModel extends MysqlInsurerPreviousInsurerMasterModel {
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
    MysqlInsurerPreviousInsurerMasterModel: new InsurerPreviousInsurerMasterModel(),
};