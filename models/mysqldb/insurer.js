const { QueryTypes, Op } = require("sequelize");
const {
    MysqlInsurersModel,
    mysqldb,
} = require(process.env.SHARED_LIBRARY_PATH + "/services/models");

class InsurersModel extends MysqlInsurersModel {
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

    findByCodeExceptId(code, id) {
        return this.model.findOne({
            where: {
                code: code,
                id: {
                    [Op.ne]: id,
                },
            },
        });
    }

}

module.exports = {
    mysqldb,
    MysqlInsurersModel: new InsurersModel(),
};