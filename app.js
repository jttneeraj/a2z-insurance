console.log('app.js is running...insurance nik');


const createError = require("http-errors");
const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");

const cors = require("cors");
const multer = require("multer");

var i18n = require("i18n");
i18n.configure({
	locales: ["en", "fr"],
	// you may alter a site wide default locale
	defaultLocale: "en",
	directory: __dirname + "/locales",
	updateFiles: false,
	// hash to specify different aliases for i18n's internal methods to apply on the request/response objects (method -> alias).
	// note that this will *not* overwrite existing properties with the same name
	api: {
		__: "t", // now req.__ becomes req.t
		__n: "tn", // and req.__n can be called as req.tn
	},
	// cookie: 'expressLang',
	// autoReload: false,
	// syncFiles: false,
});

let environment = process.env.NODE_ENV;
console.log(" ~ environment:", environment)
if (!environment) {
    throw new Error("NODE_ENV is not defined");
}
if (environment == "test") {
	require("dotenv").config({ path: `.env.${environment}` });
} else {
	require("dotenv").config();
}
console.log("App: " + process.env.APP_NAME + ", Environment : " + environment + " is running on " + process.env.APP_PORT + " port", "ENABLE_RATE_LIMIT", process.env.ENABLE_RATE_LIMIT);
const originList = process.env.ALLOWED_HOST ? process.env.ALLOWED_HOST.split(",") : process.env.CLIENT_APP_URL;

// TO LOG ALL THE ERRORS AND CUSTOM INFO LOGS
const logger = require("./winston.js").logger;

// FOR DOCUMENTATION
const swaggerUi = require("swagger-ui-express");
const swaggerDocument = require("./swagger");

const app = express();

app.set("trust proxy", 1); // if you're behind a reverse proxy like Nginx or HAProxy

// register i18n locals in domain-resolver
app.use(i18n.init);

// view engine setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(__dirname, "tests")));

app.use(
	bodyParser.json({
		extended: false,
		limit: 1024 * 1024 * 50,
		type: "application/json",
	})
);
// app.use(bodyParser.urlencoded({ extended: false }));
// app.use(bodyParser.urlencoded({ extended: true, limit: 1024 * 1024 * 50, type: 'application/x-www-form-urlencoding' }));

app.use(
	cors({
		origin: originList,
		methods: "GET,HEAD,PUT,POST,DELETE",
		credentials: true,
		optionSuccessStatus: 200,
	})
);

// FOR THE MOMENT ENABLE DOC ON OUR DEV SERVER
// Use the generated swaggerDocument to set up Swagger UI:
if (process.env.NODE_ENV !== "production" || 
	process.env.CLIENT_APP_URL.indexOf("partners.atozsuvidhaa.com") >= 0) {
	app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
}

// IF TEST OR DEV ENVIRONMENT THEN ONLY ALLOW TO ACCESS THE API DOCS
if (process.env.NODE_ENV !== "test") {
	// WE DON'T NEED THIS IN ANY OTHER MICRO SERVICE THIS WILL BE TAKEN CARE IN OUR MAIN API-SERVER
	// // LOG THE ALL REQUESTS
	// const requestLogger = require('./middlewares/request-logger').requestLogger;
	// app.use(requestLogger);
}

// TO ALLOW ALL TYPE OF FORM DATA WITH AND WITHOUT FILES.
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// app.use(upload.any());

const {validateHeaders, decodeUserData} = require("./middlewares/headers.js");
const indexRouter = require("./routes/index");


const masterImportRoutes = require("./routes/master-import");
const insuranceProductRoutes = require("./routes/insurance-products");
const insuranceTypeRoutes = require("./routes/insurance-types");
const insurersRoutes = require("./routes/insurers");
const insurerProductRoutes = require("./routes/insurer-products");
const productConfigRoutes = require("./routes/product-configs");
const productDocReqRoutes = require("./routes/product-document-requirements");
const addonsRoutes = require("./routes/addons");
const productAddonsRoutes = require("./routes/product-addons");
const insurerApiCredRoutes = require("./routes/insurer-api-credentials");
const insurerApiFieldMasterRoutes = require("./routes/insurer-api-field-master");
const insurerApiFieldValidaRuleMasterRoutes = require("./routes/insurer-api-field-validation-rule");

//customer lead routes
const customerLeadRoutes = require("./routes/customer-lead");
const motorQuoteRequestRoutes = require("./routes/motor-quote-request");
const motorQuoteRoutes = require("./routes/motor-quotes");
const motorProposalRoutes = require("./routes/motor-proposal");

const motorKycRoutes = require("./routes/motor-kyc");
const motorPaymentRoutes = require("./routes/motor-payment");
const motorPolicyRoutes = require("./routes/motor-policy");
const commissionGridRoutes = require("./routes/commission-grid");





app.use("/ping", indexRouter);
app.use(validateHeaders);
app.use(decodeUserData);


app.use("/api/admin/master", masterImportRoutes);
app.use("/api/admin/insurance-products", insuranceProductRoutes);
app.use("/api/admin/insurance-types", insuranceTypeRoutes);
app.use("/api/admin/insurers", insurersRoutes);
app.use("/api/admin/insurer-products", insurerProductRoutes);

app.use("/api/admin/product-configs", productConfigRoutes);
app.use("/api/admin/product-document-requirements", productDocReqRoutes);
app.use("/api/admin/addons", addonsRoutes);
app.use("/api/admin/product-addons", productAddonsRoutes);
app.use("/api/admin/insurer-api-credentials", insurerApiCredRoutes);
app.use("/api/admin/insurer-api-field-master", insurerApiFieldMasterRoutes); 
app.use("/api/admin/insurer-api-field-validation-rule", insurerApiFieldValidaRuleMasterRoutes); 

app.use("/api/customer/leads", customerLeadRoutes); 
app.use("/api/customer/motor/quote-request", motorQuoteRequestRoutes);
app.use("/api/customer/motor/quotes", motorQuoteRoutes);

app.use("/api/customer/motor/proposal", motorProposalRoutes); 


app.use("/api/customer/motor/kyc", motorKycRoutes); 
app.use("/api/customer/motor/payment", motorPaymentRoutes); 
app.use("/api/customer/motor/policy", motorPolicyRoutes);  
app.use("/api/admin/commission-grid", commissionGridRoutes);  




// app.use("/api/customer/motor/proposal", require("./routes/motor-proposal"));
 
  
// catch 404 and forward to error handler
app.use(function (req, res, next) {
	logger.error(req.originalUrl + ": 404", {
		url: req.originalUrl,
		function: req.method,
		operation: "Error Handling",
		relativeDetail: "Error Handling",
		err: "",
		errorObj: {},
	});
	/* istanbul ignore next */
	next(createError(404));
});

// Handling Errors
app.use((err, req, res, next) => {
	// console.log(err);
	err.statusCode = err.statusCode || 500;
	err.message = err.message || "Internal Server Error";

	logger.error(err.message, {
		url: req.originalUrl,
		function: req.method,
		operation: "Error Handling",
		relativeDetail: "Error Handling",
		err: JSON.stringify(err) || err.toString(),
		errorObj: err,
	});

	res.status(err.statusCode).json({
		message: err.message,
		error: err,
	});
});

app.listen(process.env.APP_PORT, () => console.log(process.env.APP_NAME + " is runnning at port number : " + process.env.APP_PORT));

module.exports = app;
