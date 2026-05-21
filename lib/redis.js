const redis = require('redis');
const client = redis.createClient({ url: process.env.REDIS_URI });

client.connect((status, err)=>{
    /* istanbul ignore next */
    console.log("Redis Connected: ", status, err);
});

client.on('error', (err) => console.log('Redis Client Error', err));
client.on('ready', () => console.log('Redis Client Ready'));
client.on('connect', () => console.log('Redis Client Connected'));


const redisClient = module.exports = client;
module.exports.redisClient = redisClient;

module.exports.cleanSets = async (setKey) => /* istanbul ignore next */ {
    // # Delete members from the set in batches of 100
    let cur = 0
    let maxLen = 100000, count=0;
    while (true) /* istanbul ignore next */ {
        let {cursor, members} = await redisClient.sScan(setKey, cur, "COUNT", 1000)
        if (members.length > 0){
            let rm = await redisClient.sRem(setKey, members)
        }
        if (cursor == 0 || count >= maxLen){
            console.log("cleanSets done : count >= maxLen", count >= maxLen, "cursor", cursor);
            break;
        }
        cur = cursor;
        count++
    }
    return true;
}