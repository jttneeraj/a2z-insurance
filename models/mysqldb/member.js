const { QueryTypes } = require("sequelize");

const { MysqlMemberModel, mysqldb } = require(process.env.SHARED_LIBRARY_PATH + '/services/models');

class Member extends MysqlMemberModel{

    constructor(){
        super();
    }
    findOneByQuery(attributes, conditions) {
        return this.model.findOne({
            attributes,
            where: conditions
        });
    }
    isPanExistWithRole(pan_number,role_id){
        let query = "select u.id as id, u.name as name from users as u join members as m on u.id = m.user_id join roles as r on u.role_id = r.id where pan_number = :pan_number and u.role_id = :role_id";
        
        return  mysqldb.query(query,{
            replacements:{
                pan_number: pan_number,
                role_id: role_id,
            },
            type: QueryTypes.SELECT
        })
    }
    isPanExistWithRoleExceptThisUser(pan_number,role_id, user_id){

        let query = "select u.id from users as u join members as m on u.id = m.user_id join roles as r on u.role_id = r.id where pan_number = :pan_number and u.role_id = :role_id and u.id != :user_id";
        
        return  mysqldb.query(query,{
            replacements:{
                pan_number: pan_number,
                role_id: role_id,
                user_id: user_id,
            },
            type: QueryTypes.SELECT
        })
    }
    isAadhaarExistWithRoleExceptThisUser(aadhaar_number,role_id, user_id){

        let query = "select u.id from users as u join members as m on u.id = m.user_id join roles as r on u.role_id = r.id where aadhaar_number = :aadhaar_number and u.role_id = :role_id and u.id != :user_id";
        
        return  mysqldb.query(query,{
            replacements:{
                aadhaar_number: aadhaar_number,
                role_id: role_id,
                user_id: user_id,
            },
            type: QueryTypes.SELECT
        })
    }
    create(data) {

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
    MysqlMemberModel: new Member()
}

