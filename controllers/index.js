const moment = require('moment-timezone')
const logger = require("../winston.js").logger

// FOR TESTING ONLY
// const { MongoUserModel } = require('../models/mongodb/user');
// const { MysqlUserModel, mysqldb } = require('../models/mysqldb/user');


/**
 * @openapi
 * /:
 *    get:
 *      tags:
 *      - Default
 *      summary: To test server status
 *      operationId: Index
 *      description: To test server status
 *      responses:
 *        200:
 *          description: Returns a JSON object with error and message
 */
const index = async (req, res, next) => {
    console.log(`${process.env.APP_NAME} /ping`)
    return res.status(200).json({ error: 0, status:1, message: process.env.APP_NAME + " App is up and running properly.", result: {} })
}

/**
 * @openapi
 * /:
 *    post:
 *      tags:
 *      - Default
 *      summary: To test server status and post request with file upload
 *      operationId: Index
 *      description: To test server status and post request with file upload
 *      responses:
 *        200:
 *          description: Returns a JSON object with error and message
 */
const test_file_upload = async (req, res, next) => {
    console.log(`${process.env.APP_NAME} /test_file_upload \nreq.body: `, req.body)
    if (!req.file) {
        return res.status(200).json({ message: 'No file uploaded' });
    }
    console.log('File uploaded successfully:', req.file);
    return res.json({ message: 'File uploaded successfully' });
}

/**
 * @openapi
 * /:
 *    post:
 *      tags:
 *      - Default
 *      summary: To test server status and post request without file upload
 *      operationId: Index
 *      description: To test server status and post request without file upload
 *      responses:
 *        200:
 *          description: Returns a JSON object with error and message
 */
const test_post = async (req, res, next) => {
    console.log(`${process.env.APP_NAME} /test_post \nreq.body: `, req.body)
    if (!req.file) {
        return res.status(200).json({ message: 'No file uploaded only post reqeust' });
    }
    console.log('File uploaded successfully:', req.file);
    return res.json({ message: 'File uploaded successfully' });
}

/**
 * @openapi
 * /ping:
 *    get:
 *      tags:
 *      - Default
 *      summary: To test server status
 *      operationId: Ping
 *      description: To test server status
 *      responses:
 *        200:
 *          description: Returns a JSON object with error and message
 */
const ping = async (req, res, next) => {
    // SAMPLE LOGGER CODE AND FOR TESTING ONLY
    //  logger.info({
    //      ...info_error_data,
    //      message: 'Ping',
    //      url: "/ping",
    //      function: "ping",
    //      operation: "ping",
    //      relativeDetail: "Ping",
    //      otherInfo: {},
    //  })
    // logger.error({
    //     ...info_error_data,
    //     message: "Sample error message",
    //     url: "/ping",
    //     function_api: "ping api",
    //     operation: "ping error",
    //     relativeDetail: "Error in ping api for testing only.",
    //     error: "Sample error message",
    //     error_obj: {},
    // })


    // // MONGODB MODEL TESTING
    // try {
    //     let data = await MongoUserModel.findUserByEmail("adal.singh@talentnook.com");
    //     // let data2 = await MongoUserModel.findById("6256a452ec5d715c4740876d");
    //     console.log("\ndata mongo:", data);
    // } catch (error) {
    //     info_error_data = {
    //         ...info_error_data,
    //         message: (JSON.stringify(error) || error.toString()),
    //         url: "/ping",
    //         function_api: "ping",
    //         operation: "Testing mongodb model",
    //         relativeDetail: "Error in find query with mongodb model",
    //         error: (JSON.stringify(error) || error.toString()),
    //         error_obj: error,
    //     }
    //     logger.error(info_error_data);
    // }


    // // MYSQL MODEL TESTING
    // try {
    //     // let data = await MysqlUserModel.findUserByEmail("r1@gmail.com");
    //     // if (data && data.length > 0) {
    //     //     for (let i = 0; i < data.length; i++) {
    //     //         let element = data[i];
    //     //         console.log("\ndata element", element.dataValues);
    //     //         console.log("\ndata element", element.toJSON() );
    //     //         console.log("\ndata element", element.get('email') );
    //     //         console.log("\ndata element", element.get() );
    //     //     }
    //     // }
    //     // let data2 = await MysqlUserModel.findById(4);
    //     // console.log("\ndata2", data2.dataValues);

    //     let userId = 4;
    //     // RAW QUERY
    //     const results = await MysqlUserModel.findUserByIdRQ(userId);
    //     console.log("\nresults", results);

    //     // TRANSACTIONAL QUERY
    //     // const results2 = await MysqlUserModel.testTransactionalQuery(userId);
    //     // console.log("\nresults2", results2);

    // } catch (error) {
    //     info_error_data = {
    //         ...info_error_data,
    //         message: (JSON.stringify(error) || error.toString()),
    //         url: "/ping",
    //         function_api: "ping",
    //         operation: "To ping user",
    //         relative_detail: "Got error while tried to perform ping",
    //         error: (JSON.stringify(error) || error.toString()),
    //         error_obj: error,
    //     }
    //     logger.error(info_error_data);
    // }

    console.log("/ping")
    return res.status(200).json({ error: 0, message: process.env.APP_NAME + " App is up and running properly.", result: {} })
}



module.exports = {
    index,
    ping,
    test_file_upload,
    test_post
}