const validateHeaders = (req, res, next) => {
    // Check if the required headers exist in the request
    // Skip validation for /ping and /common-api/acl routes
    // console.log("validateHeaders: req.path", req.path)
   // console.log("Header display at common api service at line no 5")
    req.headers["ip_address"] = req.headers["ip-address"]
    req.headers["request_mode"] = req.headers["request-mode"]
    if (req.path.startsWith("/ping") || req.path.includes("/common-api/acl")) {
        console.log(req.headers)

        // Nothing to validate the header for all ping api's
        console.log(`${process.env.APP_NAME}: validateHeaders: no autherization needed ${req.path}`)
    } else {
        console.log("NODE_ENV"+process.env.NODE_ENV)  
        console.log("CLIENT_APP_URL"+process.env.CLIENT_APP_URL)
        if (!req.headers['userdata']) {
            return res.status(401).json({ error: 1, message: 'userData field is required' });
        }

    }
    next();
};

/**
 * Decode Base64 encoded userData header
 * Attaches decoded object to req.userData
 */
const decodeUserData = (req, res, next) => {
    try {
        const userDataHeader = req.headers['userdata'];
       // console.log("[decodeUserData] path:", req.path, "| userdata header (raw):", userDataHeader);

        if (!userDataHeader) {
            //console.log("[decodeUserData] no userdata header, skipping");
            req.userData = null;
            return next();
        }

        // Optional: size protection
        if (userDataHeader.length > 20000) {
           // console.warn("[decodeUserData] userdata header too large, length:", userDataHeader.length);
            return res.status(413).json({
                success: false,
                message: 'userData header too large'
            });
        }

        // Decode Base64
        const decoded = Buffer.from(userDataHeader, 'base64').toString('utf8');
        //console.log("[decodeUserData] decoded string:", decoded);

        // Validate JSON is parseable, but keep as string so controllers can JSON.parse() it themselves
        const parsed = JSON.parse(decoded); // throws if invalid
       // console.log("[decodeUserData] parsed user id:", parsed?.id, "| role_id:", parsed?.role_id);
        req.headers['userdata'] = parsed;

        next();
    } catch (error) {
       console.error('[decodeUserData] failed to decode userdata header:', error.message);

        return res.status(400).json({
            success: false,
            message: 'Invalid userData header format'
        });
    }
};

module.exports = {
    validateHeaders,
    decodeUserData
};