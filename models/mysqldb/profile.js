const { QueryTypes } = require("sequelize");

const { MysqlProfileModel, mysqldb } = require(process.env.SHARED_LIBRARY_PATH + '/services/models');

class Profile extends MysqlProfileModel{

    constructor(){
        super();
    }
    findParentAndRelationByUserId(user_id){

        return  mysqldb.query('select users.id as id,users.name as name,users.email as email, users.mobile as mobile, users.created_at as onboard_date, outlet_name, permanent_address, shop_address, role.role_title as role_title, role.title as user_prefix, p.name as parent_name, p.mobile as parent_mobile, r.name as manager_name, r.mobile as manager_mobile from users join  users as p on users.parent_id = p.id join users as r on users.relation_id = r.id join members as m on users.id = m.user_id join roles as role on users.role_id = role.id where users.id = :userId',{
            replacements: {
                userId: user_id 
            },
            type: QueryTypes.SELECT
          })

    }
    
    findOne(attributes, conditions) {
        return this.model.findOne({
            attributes,
            where: conditions
        });
    }
    findAll(attributes, conditions, order_by, offset, limit) {

        return this.model.findAll({
            attributes: attributes,
            where: conditions,
            order: order_by,
            offset: offset,
            limit: limit

        })

    }



    updateByUserId(data,user_id){

        return this.model.update(data,{
            where:{
                user_id: user_id
            }
        })
    }
    create(data){
        return this.model.create(data)
    }
    createWithTransactionMode(data,t){
        return this.model.create(data,t)
    }
    update(data,conditions){
      
        return this.model.update(data,{
            where:conditions
        })
    }
    updateWithTransactionMode(data,conditions,t){
      
        return this.model.update(data,{
            where:conditions
        },t)
    }
    updateById(data,id){
      
        return this.model.update(data,{
            where:{
                id: id
            }
        })
    }
    updateByIdTransactionMode(data,id,t){
      
        return this.model.update(data,{
            where:{
                id: id
            }
        }, t)
    }
}

module.exports = {
    mysqldb,
    MysqlProfileModel: new Profile()
}

