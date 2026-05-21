const {HTTP_STATUS} = require('../constants/common')
const i18n = require("i18n");

class ResponseHandler {
    constructor(res) {
        this.res = res;
    }

    successList({status=1, message,results, page,total_records}) {
        return this.res.status(HTTP_STATUS.OK).json({
                error: 0,
                status,
                total_records: total_records,
                message:i18n.__(message),
                page,
                results,
            });
    }
    success({status = 1, message = "SUCCESS",result={}}) {
        return this.res.status(HTTP_STATUS.OK).json({
            error: 0,
            status,
            message:i18n.__(message),
            result
        });
    }
   

    failure({status = 0, error=1, message = "FAILED",result = {}}) {
        return this.res.status(HTTP_STATUS.OK).json({
            error,
            status,
            message:i18n.__(message),
            result
        });
    }
    validationError({message = "Invalid Input",errors}) {
        return this.res.status(HTTP_STATUS.BAD_REQUEST).json({
            error: 1,
            message:i18n.__(message),
            errors: errors
        });
    }

    error({message = "SOMETHING_WENT_WRONG"}) {
        return this.res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            error: 0,
            message:i18n.__(message),
        });
    }
     downloadExcel({status = 1, message = "SUCCESS",xlsFile}) {
        return this.res.status(HTTP_STATUS.OK).json({
            error: 0,
            status,
            message:i18n.__(message),
            xlsFile
        });
    }
}
module.exports = {
    ResponseHandler
}