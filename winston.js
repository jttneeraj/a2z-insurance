const winston  = require('winston');
const moment = require("moment");
const { transports, format, createLogger } = winston
const { combine, printf } = format

const currentEnv = (process.env.NODE_ENV == 'production') ? 'production' : (process.env.NODE_ENV == 'test') ? 'test' : 'development';


// Create a timeStamp 
// const logTime = new Date().toLocaleDateString()
// const logTime = moment().format('YYYY-MM-DDTHH:mm:ssZ')
const logTime = moment();

// Crate a custom log
// const customLog = printf((info) => {
//     const logObj = {
//         level: info.level,
//         timestamp: info.timestamp,
//         message: info.message,
//         // meta: (info && info.meta)? info.meta : {},
//         // url: (info && info.meta && info.meta.url) ? info.meta.url : '',
//         // function: (info && info.meta && info.meta.function) ? info.meta.function : '',
//         // operation: (info && info.meta && info.meta.operation) ? info.meta.operation : '',
//         // relativeDetail: (info && info.meta && info.meta.relativeDetail) ? info.meta.relativeDetail : '',
//         // errorObj: (info && info.meta && info.meta.errorObj) ? info.meta.errorObj : {},
//         // error: (info && info.meta && info.meta.error) ? info.meta.error : ''
//     };
//     return JSON.stringify(logObj);
// }
const customLog = printf(({ level, message, meta }) => {
    // console.log("info", info, Object.keys(info))
    // return `Level:[${level}] LogTime: [${logTime}] Message:-[${message}]`

    return `{label: 'AUTH-APP', level: "${level}", logTime: ${logTime}, message: "${message}", meta: ${meta}}`
})


const date = new Date()
const newdate = `${date.getDate()}-${date.getMonth()}-${date.getFullYear()}`

const options = {
    info: {
        level: 'info',
        dirname: 'logs/combined',
        json: true,
        handleExceptions: true,
        filename: `combined-${newdate}.log`,
        datePattern: 'YYYY-MM-DD-HH',
        maxsize: 5242880, // 5MB
        maxFiles: 10,
    },
    error: {
        level: 'error',
        dirname: 'logs/error',
        json: true,
        handleExceptions: true,
        filename: `error-${newdate}.log`,
        maxsize: 5242880, // 5MB
        maxFiles: 10,
    },
    httpError: {
        level: 'error',
        host: process.env.LOG_HOST,
        port: process.env.LOG_PORT, // the port where your server listens
        path: process.env.LOG_PATH, // the API endpoint to post log data
        ssl: process.env.LOG_SSL // set to true if you're using https
    },
    console: {
        level: 'debug',
        json: false,
        handleExceptions: true,
        colorize: true,
    },
}

let transportsList = [
    new transports.Console(options.console),
    new transports.File(options.info),
    new transports.File(options.error),
]

if (currentEnv == 'production') {
    new transports.Http(options.httpError)
}

module.exports.logger = new createLogger({
    // format: combine(customLog), 
    format: combine(
        format.errors({ stack: true }), // log the full stack
        // timestamp(), // get the time stamp part of the full log message
        customLog,
        format.metadata(), // >>>> ADD THIS LINE TO STORE the ERR OBJECT IN META field
    ),
    transports: transportsList, 
    exitOnError: false
})