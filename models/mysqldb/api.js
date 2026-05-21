
const { MysqlApiModel, mysqldb} = require(process.env.SHARED_LIBRARY_PATH+'/services/models');

class Api extends MysqlApiModel {

    constructor(){
        super();
    }
    findById(id,attributes){

        return this.model.findByPk(id,{
            attributes: attributes
        })
    }
    findByCondition(attributes,condition){

        return this.model.findAll({
            attributes:attributes,
            where:condition
        });
    }
    add(data){
        return this.model.create(data)
    }
    updateById(data,id){

        return this.model.update(data,{
            where:{
                id: id
            }
        })
    }
}
module.exports = {
    mysqldb,
    MysqlApiModel: new Api()
}