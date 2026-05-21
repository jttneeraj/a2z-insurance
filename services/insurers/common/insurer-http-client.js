const https = require("https");

function postJson(url, payload, headers = {}) {

console.log("🚀 ~insurer-http-client postJson ~ headers:", headers)
console.log("🚀 ~insurer-http-client postJson ~ payload:", payload)
console.log("🚀 ~insurer-http-client postJson ~ url:", url)

    
    return new Promise((resolve) => {
        try {
            const parsedUrl = new URL(url);
            const data = JSON.stringify(payload || {});
            const options = {
                hostname: parsedUrl.hostname,
                path: parsedUrl.pathname + parsedUrl.search,
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "content-length": Buffer.byteLength(data),
                    ...headers,
                },
            };
            const req = https.request(options, (res) => {
                let responseData = "";
                res.on("data", (chunk) => responseData += chunk);
                res.on("end", () => {
                    let parsedBody = responseData;
                    try { parsedBody = JSON.parse(responseData); } catch (e) {}
                    resolve({
                        success: res.statusCode >= 200 && res.statusCode < 300,
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: parsedBody,
                    });
                });
            });
            req.on("error", (error) => resolve({ success: false, statusCode: 0, headers: {}, body: error.message }));
            req.write(data);
            req.end();
        } catch (error) {

            console.log('---- insurer-http-client error ==>', error); 

            resolve({ success: false, statusCode: 0, headers: {}, body: error.message });
        }
    });
}
module.exports = { postJson };
