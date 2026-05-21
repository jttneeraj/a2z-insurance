const {
    MysqlGeoRtoMaster2023Model,
    mysqldb,
} = require(process.env.SHARED_LIBRARY_PATH + "/services/models");

class GeoRtoMaster2023Model extends MysqlGeoRtoMaster2023Model {
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
    MysqlGeoRtoMaster2023Model: new GeoRtoMaster2023Model(),
};