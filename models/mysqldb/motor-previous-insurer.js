const {
    MysqlMotorPreviousInsurerModel,
    mysqldb,
} = require(process.env.SHARED_LIBRARY_PATH + "/services/models");

class MotorPreviousInsurerModel extends MysqlMotorPreviousInsurerModel {
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
    MysqlMotorPreviousInsurerModel: new MotorPreviousInsurerModel(),
};