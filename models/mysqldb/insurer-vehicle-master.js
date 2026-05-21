const {
    MysqlInsurerVehicleMasterModel,
    mysqldb,
} = require(process.env.SHARED_LIBRARY_PATH + "/services/models");

class InsurerVehicleMasterModel extends MysqlInsurerVehicleMasterModel {
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
    MysqlInsurerVehicleMasterModel: new InsurerVehicleMasterModel(),
};