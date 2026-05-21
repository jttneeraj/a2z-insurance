const { QueryTypes } = require("sequelize"); 
const {
    MysqlCustomerLeadsModel,
    mysqldb,
} = require(process.env.SHARED_LIBRARY_PATH + "/services/models");

class CustomerLeadsModel extends MysqlCustomerLeadsModel {
    constructor() {
        super();
    }

    add = (data) => {
        return this.model.create(data);
    };

    findAllCount(conditions) {
        return this.model.count({
            where: conditions,
        });
    }

    findById(id) {
        return this.model.findByPk(id);
    }
}

module.exports = {
    mysqldb,
    MysqlCustomerLeadsModel: new CustomerLeadsModel(),
}; 