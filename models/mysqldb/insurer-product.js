const { QueryTypes } = require("sequelize"); 
const {
    MysqlInsurerProductsModel,
    mysqldb,
} = require(process.env.SHARED_LIBRARY_PATH + "/services/models");

class InsurerProductsModel extends MysqlInsurerProductsModel {
    constructor() {
        super();
    }

    add = (data) => {
        return this.model.create(data);
    };

    update = (id, data) => {
        return this.model.update(data, {
            where: {
                id: id,
            },
        });
    };

    findAllCount(conditions) {
        return this.model.count({
            where: conditions,
        });
    }

    find(attributes, conditions, order_by, start, limit) {
        return this.model.findAll({
            attributes: attributes,
            where: conditions,
            order: order_by,
            offset: start,
            limit: limit,
        });
    }

    findById(id) {
        return this.model.findByPk(id);
    }

    findByQuery(conditions) {
        return this.model.findOne({
            where: conditions,
        });
    }
}

module.exports = {
    mysqldb,
    MysqlInsurerProductsModel: new InsurerProductsModel(),
};