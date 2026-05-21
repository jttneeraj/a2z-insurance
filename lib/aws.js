const aws = require("aws-sdk");
const csv = require("csv-parser");
const xlsx = require("xlsx");
const stream = require("stream");

const s3 = new aws.S3({
	accessKeyId: process.env.AWS_ACCESS_KEY,
	secretAccessKey: process.env.AWS_SECRET_KEY,
	region: process.env.AWS_REGION,
});

// const upload = 'upload/';
const deleteFileFromAws = (sourceFile) => {
	sourceFile = process.env.DOCUMENT_FOLDER_PATH + sourceFile;
	const myBucket = process.env.AWS_BUCKET_NAME;
	try {
		s3.deleteObject({
			Bucket: myBucket,
			Key: sourceFile,
		})
			.promise()
			.then(() => {
				console.log("deleted successFully");
			})
			.catch((e) => {
				console.log("Error while deleting s3 file", e.stack);
				return "error";
			});
	} catch (error) {
		console.log(error.message);
	}
};

const getObjectFromS3 = async (bucketName, key) => {
	const params = {
		Bucket: bucketName,
		Key: key,
	};
	const data = await s3.getObject(params).promise();
	return data.Body;
};

const parseCsv = (buffer) => {
	return new Promise((resolve, reject) => {
		const results = [];
		const readable = new stream.PassThrough();
		readable.end(buffer);

		readable
			.pipe(csv())
			.on("data", (data) => results.push(data))
			.on("end", () => resolve(results))
			.on("error", (error) => reject(error));
	});
};

const parseExcel = (buffer) => {
	const workbook = xlsx.read(buffer, { type: "buffer" });
	const sheetName = workbook.SheetNames[0];
	const worksheet = workbook.Sheets[sheetName];
	return xlsx.utils.sheet_to_json(worksheet);
};

const downloadAndParseFile = async (bucketName, key) => {
	try {
		const fileBuffer = await getObjectFromS3(bucketName, key);
		const extension = key.split(".").pop().toLowerCase();

		if (extension === "csv") {
			return await parseCsv(fileBuffer);
		} else if (extension === "xlsx" || extension === "xls") {
			return parseExcel(fileBuffer);
		} else {
			throw new Error("Unsupported file type");
		}
	} catch (error) {
		console.error("Error processing file:", error);
		throw error;
	}
};

const deleteMultipleObjects = async (folderPath) => {
	try {
		const myBucket = process.env.AWS_BUCKET_NAME;

		const object = await s3.listObjectsV2({ Bucket: myBucket, Prefix: `upload/${folderPath}` }).promise();
		if (object) {
			const objectKeys = object.Contents.map((obj) => ({ Key: obj.Key }));

			const deletedObj = await s3
				.deleteObjects({
					Bucket: myBucket,
					Delete: { Objects: objectKeys },
				})
				.promise();
			return deletedObj;
		}
		return false;
	} catch (error) {
		console.log(error);
	}
};
// eslint-disable-next-line no-unused-vars
// const moveFile = async (sourceFile, newFileName, secretKey = "") => {
//   try {
//     const myBucket = process.env.AWS_BUCKET_NAME;

//     const copyObjectOptions = {
//       Bucket: myBucket,
//       CopySource: `${myBucket}/${sourceFile}`,
//       Key: newFileName,
//       // ACL: "public-read",
//     };
//     const result = await s3
//       .copyObject(copyObjectOptions)
//       .promise()
//       .then((res) => {
//         console.log(res, "moved image");
//         // Delete the old object
//         s3.deleteObject({
//           Bucket: myBucket,
//           Key: sourceFile,
//         })
//           .promise()
//           .then((ress) => {
//             console.log(ress, "image deleted");
//             return ress;
//           })
//           .catch((e) => {
//             console.log("Error while deleting s3 file", e.stack);
//             return e;
//           });
//       })
//       // Error handling is left up to reader
//       .catch((e) => {
//         console.log("Error while rename s3 file", e.stack);
//         return e;
//       });

//     return result;
//   } catch (e) {
//     console.error("Error from rename s3 file method", e.stack);
//     return "error";
//   }
// };

const moveFile = async (sourceFile, newFileName, secretKey = "") => {
	const myBucket = process.env.AWS_BUCKET_NAME;

	const copyObjectOptions = {
		Bucket: myBucket,
		CopySource: `${myBucket}/${sourceFile}`,
		Key: newFileName,
		// ACL: "public-read",
	};

	try {
		const copyResult = await s3.copyObject(copyObjectOptions).promise();
		console.log(copyResult, "moved image");

		try {
			const deleteResult = await s3
				.deleteObject({
					Bucket: myBucket,
					Key: sourceFile,
				})
				.promise();
			console.log(deleteResult, "image deleted");
			return deleteResult;
		} catch (deleteError) {
			console.error("Error while deleting s3 file", deleteError.stack);
			throw deleteError;
		}
	} catch (copyError) {
		console.error("Error while renaming s3 file", copyError.stack);
		throw copyError;
	}
};

const getDownloadUrl = (file) => {
	file = process.env.DOCUMENT_FOLDER_PATH + "/" + file;
	const myBucket = process.env.AWS_BUCKET_NAME;
	const options = {
		Bucket: myBucket,
		Key: file,
		Expires: Number(process.env.DOWNLOAD_URL_EXPIRY),
	};

	const url = s3.getSignedUrl("getObject", options);
	return url;
};

const getDataObject = async (file, name) => {
	const fileName = process.env.DOCUMENT_FOLDER_PATH + "/" + name + "/" + file;
	const bucketName = process.env.AWS_BUCKET_NAME;

	const params = {
		Bucket: bucketName,
		Key: fileName,
	};
	const data = await s3.getObject(params).promise();
	return data;
};

const uploadFileFromTempToUploadFolder = async (signature, path) => {
	if (Array.isArray(signature)) {
		await Promise.all(
			signature.map(async (docUrl) => {
				const tempPath = `${process.env.TEMP_FOLDER_PATH}/${docUrl}`;
				let documentPath;
				if (path) {
					documentPath = `${process.env.DOCUMENT_FOLDER_PATH}/${path}/${docUrl}`;
				} else {
					documentPath = `${process.env.DOCUMENT_FOLDER_PATH}/${docUrl}`;
				}
				try {
					const result = await moveFile(tempPath, documentPath);
					console.log(`File moved from ${tempPath} to ${documentPath}`, result);
					return { error: false, result, signature: signature };
				} catch (error) {
					console.error(`Error moving file from ${tempPath} to ${documentPath}:`, error);
					throw new Error(error);
				}
			})
		);
	} else if (typeof signature === "string") {
		const tempPath = `${process.env.TEMP_FOLDER_PATH}/${signature}`;
		let documentPath;

		if (path) {
			documentPath = `${process.env.DOCUMENT_FOLDER_PATH}/${path}/${signature}`;
		} else {
			documentPath = `${process.env.DOCUMENT_FOLDER_PATH}/${signature}`;
		}
		try {
			const result = await moveFile(tempPath, documentPath);
			console.log(`File moved from ${tempPath} to ${documentPath}`, result);
			return { error: false, result, signature: signature };
		} catch (error) {
			console.error(`Error moving file from ${tempPath} to ${documentPath}:`, error);
			throw new Error(error);
		}
	} else {
		throw new Error("Invalid signature format");
	}
};

module.exports = {
	moveFile,
	getDownloadUrl,
	deleteFileFromAws,
	uploadFileFromTempToUploadFolder,
	deleteMultipleObjects,
	getDataObject,
	downloadAndParseFile,
};
