const ExcelJS = require("exceljs");
const { commonConstants } = require("../constants");
const path = "./public/storage/exports";
const downloadPath = process.env.APP_URL + "/storage/exports";

module.exports.generateXLS = async (columns, data, workSheetName = "Worksheet", filename = "filename") => {
	try {
		const workbook = new ExcelJS.Workbook();
		const worksheet = workbook.addWorksheet(workSheetName, {
			pageSetup: { paperSize: 9, orientation: "landscape" },
		});

		// Initialize the row index
		let rowIndex = 2;

		let row = worksheet.getRow(rowIndex);
		row.values = columns;
		row.font = { bold: true };

		const columnWidths = [20, 20, 20];

		row.eachCell((cell, colNumber) => {
			const columnIndex = colNumber - 1;
			const columnWidth = 20; // columnWidths[columnIndex];
			worksheet.getColumn(colNumber).width = columnWidth;
		});

		// Loop over the grouped data
		data.forEach((task, index) => {
			const row = worksheet.getRow(rowIndex + index + 1);
			let cellIndex = 1;
			for (t in task.dataValues) {
				row.getCell(cellIndex).value = task.dataValues[t]; // no compiler error
				row.getCell(cellIndex).alignment = { wrapText: true };
				cellIndex++;
			}
		});
		// Increment the row index
		rowIndex += data.length;

		// Merge cells for the logo
		worksheet.mergeCells(`A1:${String.fromCharCode(65 + worksheet.columns.length - 1)}1`);

		const image = workbook.addImage({
			base64: commonConstants.LOGO_64, //replace it your image (base 64 in this case)
			extension: "png",
		});

		worksheet.addImage(image, {
			tl: { col: 0, row: 0 },
			ext: { width: 60, height: 40 },
		});

		worksheet.getRow(1).height = 40;

		// Define the border style
		const borderStyle = {
			style: "thin", // You can use 'thin', 'medium', 'thick', or other valid styles
			color: { argb: "00000000" },
		};

		// Loop through all cells and apply the border style
		worksheet.eachRow((row, rowNumber) => {
			row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
				cell.border = {
					top: borderStyle,
					bottom: borderStyle,
				};
			});
		});

		// Generate the XLS file
		return workbook.xlsx.writeBuffer(); //For Header download
		// URL OF FILE
		const fileNameOnly = `${filename}-${new Date().getTime()}.xlsx`;
		const fileName = `${path}/${fileNameOnly}`;
		const downloadUrl = `${downloadPath}/${fileNameOnly}`;

		const excldata = await workbook.xlsx.writeFile(fileName).then(() => {
			console.log(" ::: File Generated :::: ");
		});
		return downloadUrl;
	} catch (err) {
		console.log(err);
	}
};
