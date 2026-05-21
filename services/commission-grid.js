
const detectSheetType = (sheetName) => {
  const name = String(sheetName || "").toLowerCase();

  if (name.includes("rto")) return "RTO_MAPPING";
  if (name.includes("taxi") && name.includes("mapping")) return "TAXI_MAPPING";

  return "COMMISSION_GRID";
};

const normalizeHeader = (value) => {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\n/g, " ")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
};

const getCellValue = (cell) => {
  try {
    if (!cell) return null;

    let value = cell.value;

    // Handle merged cell safely
    if (cell.type === ExcelJS.ValueType.Merge) {
      value = cell.master ? cell.master.value : null;
    }

    if (value === null || value === undefined) return null;

    if (typeof value === "object") {
      if (value.result !== undefined && value.result !== null) {
        return String(value.result).trim();
      }

      if (value.text !== undefined && value.text !== null) {
        return String(value.text).trim();
      }

      if (value.richText && Array.isArray(value.richText)) {
        return value.richText
          .map((item) => item.text || "")
          .join("")
          .trim();
      }

      if (value.hyperlink && value.text) {
        return String(value.text).trim();
      }

      return JSON.stringify(value);
    }

    return String(value).trim();
  } catch (error) {
    return null;
  }
};

const findHeaderRow = (worksheet) => {
  let bestRowNumber = 1;
  let bestScore = 0;

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    let score = 0;

    row.eachCell({ includeEmpty: false }, (cell) => {
      const value = normalizeHeader(getCellValue(cell));

      if (
        value.includes("rto") ||
        value.includes("cluster") ||
        value.includes("cd") ||
        value.includes("segment") ||
        value.includes("make") ||
        value.includes("fuel") ||
        value.includes("age")
      ) {
        score++;
      }
    });

    if (score > bestScore) {
      bestScore = score;
      bestRowNumber = rowNumber;
    }
  });

  return bestRowNumber;
};

const worksheetToJson = (worksheet) => {
  const rowCount = worksheet.rowCount || 0;
  const columnCount = worksheet.columnCount || 0;

  const rows = [];

  for (let rowNumber = 1; rowNumber <= rowCount; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    const obj = {};
    let hasValue = false;

    for (let colNumber = 1; colNumber <= columnCount; colNumber++) {
      const cell = row.getCell(colNumber);

      let value = null;

      try {
        if (cell && cell.value !== null && cell.value !== undefined) {
          if (typeof cell.value === "object") {
            if (cell.value.result !== undefined) {
              value = cell.value.result;
            } else if (cell.value.text !== undefined) {
              value = cell.value.text;
            } else if (cell.value.richText) {
              value = cell.value.richText.map((x) => x.text).join("");
            } else {
              value = JSON.stringify(cell.value);
            }
          } else {
            value = cell.value;
          }
        }
      } catch (e) {
        value = null;
      }

      if (value !== null && value !== "") {
        hasValue = true;
      }

      obj[`column_${colNumber}`] =
        value !== null && value !== undefined ? String(value).trim() : null;
    }

    if (hasValue) {
      rows.push(obj);
    }
  }

  console.log("RAW ROWS DEBUG:", {
    sheetName: worksheet.name,
    rowCount,
    columnCount,
    parsedRows: rows.length,
    firstRow: rows[0],
    secondRow: rows[1],
  });

  return rows;
};



const extractPercentage = (value) => {
  if (value === null || value === undefined || value === "") return null;

  const text = String(value).trim();

  if (["D", "MISP", "NA", "N/A"].includes(text.toUpperCase())) return null;

  const match = text.match(/-?\d+(\.\d+)?/);
  if (!match) return null;

  return Number(match[0]);
};

const extractMin = (value) => {
  if (!value) return null;

  const numbers = String(value).match(/\d+(\.\d+)?/g);
  if (!numbers || !numbers.length) return null;

  return Number(numbers[0]);
};

const extractMax = (value) => {
  if (!value) return null;

  const numbers = String(value).match(/\d+(\.\d+)?/g);
  if (!numbers || !numbers.length) return null;

  return Number(numbers[numbers.length - 1]);
};

const detectDecline = (row) => {
  const values = Object.values(row)
    .filter(Boolean)
    .map((value) => String(value).trim().toUpperCase());

  if (values.includes("D") || values.includes("DECLINE") || values.includes("DECLINED")) {
    return {
      is_declined: 1,
      reason: "Declined as per insurer grid",
    };
  }

  return {
    is_declined: 0,
    reason: null,
  };
};

const normalizeAddon = (value) => {
  if (!value) return "ANY";

  const text = String(value).trim().toLowerCase();

  if (text.includes("with")) return "YES";
  if (text.includes("without")) return "NO";

  return "ANY";
};

const detectGridMeta = (sheetName) => {
  const name = String(sheetName || "").toLowerCase();

  const meta = {
    product_code: "MOTOR",
    sub_product_code: null,
    policy_type_code: null,
    grid_category: sheetName,
  };

  if (name.includes("private") || name.includes("pc")) {
    meta.sub_product_code = "PRIVATE_CAR";
  } else if (name.includes("two") || name.includes("tw")) {
    meta.sub_product_code = "TWO_WHEELER";
  } else if (name.includes("taxi")) {
    meta.sub_product_code = "TAXI";
  } else if (name.includes("hcv")) {
    meta.sub_product_code = "HCV";
  } else if (name.includes("cv")) {
    meta.sub_product_code = "COMMERCIAL_VEHICLE";
  }

  if (name.includes("saod")) {
    meta.policy_type_code = "SAOD";
  } else if (name.includes("satp")) {
    meta.policy_type_code = "SATP";
  } else if (name.includes("tp")) {
    meta.policy_type_code = "TP";
  } else if (name.includes("comp")) {
    meta.policy_type_code = "COMP";
  } else if (name.includes("1+1")) {
    meta.policy_type_code = "1_PLUS_1";
  } else if (name.includes("1+5")) {
    meta.policy_type_code = "1_PLUS_5";
  }

  return meta;
};


const extractFuelType = (segment) => {
  const text = String(segment || "").toUpperCase();

  if (text.includes("CNG")) return "CNG";
  if (text.includes("DIESEL")) return "DIESEL";
  if (text.includes("PETROL")) return "PETROL";
  if (text.includes("EV") || text.includes("ELECTRIC")) return "ELECTRIC";

  return null;
};

const extractCcMin = (segment) => {
  const text = String(segment || "");

  if (text.includes("<")) return null;
  if (text.includes(">")) {
    const match = text.match(/>(\d+)/);
    return match ? Number(match[1]) + 1 : null;
  }

  return null;
};

const extractCcMax = (segment) => {
  const text = String(segment || "");

  if (text.includes("<")) {
    const match = text.match(/<(\d+)/);
    return match ? Number(match[1]) - 1 : null;
  }

  if (text.includes(">")) return null;

  return null;
};

const extractAgeMin = (ageText) => {
  const text = String(ageText || "").toLowerCase();

  if (!ageText || text === "all") return null;

  const nums = text.match(/\d+(\.\d+)?/g);
  if (!nums) return null;

  if (text.includes(">")) return Number(nums[0]) + 1;

  return Number(nums[0]);
};

const extractAgeMax = (ageText) => {
  const text = String(ageText || "").toLowerCase();

  if (!ageText || text === "all") return null;

  const nums = text.match(/\d+(\.\d+)?/g);
  if (!nums) return null;

  if (text.includes(">")) return null;

  return Number(nums[nums.length - 1]);
};

const extractTwoWheelerFuelType = (segment) => {
  const text = String(segment || "").toUpperCase();

  if (text.includes("EV")) return "ELECTRIC";

  return "PETROL";
};

const extractTwoWheelerMake = (segment) => {
  const text = String(segment || "").toUpperCase();

  if (text.includes("HERO") && text.includes("HONDA")) return "HERO/HONDA";
  if (text.includes("HONDA")) return "HONDA";
  if (text.includes("JAWA")) return "JAWA";
  if (text.includes("AVENGER")) return "AVENGER";
  if (text.includes("RE")) return "RE";
  if (text.includes("OTHERS")) return "OTHERS";

  return null;
};

const extractTwoWheelerCcMin = (segment) => {
  const text = String(segment || "").toUpperCase();

  if (text.includes("SC") || text.includes("EV")) return null;

  if (text.includes("<=")) {
    return null;
  }

  const rangeMatch = text.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    return Number(rangeMatch[1]);
  }

  const greaterMatch = text.match(/>\s*(\d+)/);
  if (greaterMatch) {
    return Number(greaterMatch[1]) + 1;
  }

  return null;
};

const extractTwoWheelerCcMax = (segment) => {
  const text = String(segment || "").toUpperCase();

  if (text.includes("SC") || text.includes("EV")) return null;

  const lessEqualMatch = text.match(/<=\s*(\d+)/);
  if (lessEqualMatch) {
    return Number(lessEqualMatch[1]);
  }

  const rangeMatch = text.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    return Number(rangeMatch[2]);
  }

  if (text.includes(">")) return null;

  return null;
};


const extractTaxiFuelType = (segment) => {
  const text = String(segment || "").toUpperCase();

  if (text.includes("NON-DIESEL") || text.includes("NON DIESEL")) {
    return "NON_DIESEL";
  }

  if (text.includes("DIESEL")) {
    return "DIESEL";
  }

  if (text.includes("ELECTRIC") || text.includes("EV")) {
    return "ELECTRIC";
  }

  return null;
};

const extractTaxiCcMin = (segment) => {
  const text = String(segment || "").toUpperCase();

  const greaterMatch = text.match(/>\s*(\d+)/);
  if (greaterMatch) {
    return Number(greaterMatch[1]) + 1;
  }

  return null;
};

const extractTaxiCcMax = (segment) => {
  const text = String(segment || "").toUpperCase();

  const lessMatch = text.match(/<\s*(\d+)/);
  if (lessMatch) {
    return Number(lessMatch[1]) - 1;
  }

  return null;
};

const extractTaxiSeatingMin = (segment) => {
  const text = String(segment || "").toLowerCase();

  if (text.includes("upto")) {
    return null;
  }

  return null;
};

const extractTaxiSeatingMax = (segment) => {
  const text = String(segment || "").toLowerCase();

  const match = text.match(/upto\s*(\d+)\s*seater/);

  if (match) {
    return Number(match[1]);
  }

  return null;
};

const normalizeTaxiAddon = (value) => {
  const text = String(value || "").toLowerCase();

  if (text.includes("with") && !text.includes("without")) {
    return "YES";
  }

  if (text.includes("without")) {
    return "NO";
  }

  return "ANY";
};

const normalizePolicyType = (value) => {
  const text = String(value || "").trim().toUpperCase();

  if (text === "COMP") return "COMP";
  if (text === "TP") return "TP";
  if (text === "SAOD") return "SAOD";
  if (text === "SATP") return "SATP";

  return null;
};


const normalizeCommissionFlexible = (value) => {
  if (value === null || value === undefined || value === "") {
    return {
      amount: null,
      text: null,
      isDeclined: 0,
    };
  }

  const text = String(value).trim();

  if (!text) {
    return {
      amount: null,
      text: null,
      isDeclined: 0,
    };
  }

  if (text.toUpperCase() === "D") {
    return {
      amount: null,
      text,
      isDeclined: 1,
    };
  }

  // pure number like 0.6, 0.275, 60, 27.5
  if (/^-?\d+(\.\d+)?$/.test(text)) {
    return {
      amount: normalizeCommissionPercent(Number(text)),
      text: null,
      isDeclined: 0,
    };
  }

  // percentage like 60%
  if (/^-?\d+(\.\d+)?%$/.test(text)) {
    return {
      amount: Number(text.replace("%", "")),
      text: null,
      isDeclined: 0,
    };
  }

  // complex text rule: Age, With Addon, Tata, Refer, 60%/85%
  return {
    amount: null,
    text,
    isDeclined: text.toUpperCase() === "D",
  };
};

const normalizeCvValue = (value) => {
  if (value === null || value === undefined || value === "") {
    return { amount: null, text: null, isDeclined: 0 };
  }

  const text = String(value).trim();

  if (text.toUpperCase() === "D") {
    return { amount: null, text: "D", isDeclined: 1 };
  }

  const num = parseFloat(text);

  if (!Number.isNaN(num) && /^-?\d+(\.\d+)?$/.test(text)) {
    return {
      amount: num > 0 && num <= 1 ? num * 100 : num,
      text: null,
      isDeclined: 0,
    };
  }

  return {
    amount: null,
    text,
    isDeclined: text.toUpperCase().includes("D"),
  };
};

module.exports = {
  detectSheetType,
  normalizeHeader,
  getCellValue,
  findHeaderRow,
  worksheetToJson,
  extractPercentage,
  extractMin,
  detectDecline,
  normalizeAddon,
  detectGridMeta,

  extractFuelType,
  extractCcMin,
  extractCcMax,
  extractAgeMin,
  extractAgeMax,

  extractTwoWheelerFuelType,
  extractTwoWheelerMake,
  extractTwoWheelerCcMin,
  extractTwoWheelerCcMax,

  extractTaxiFuelType,
  extractTaxiCcMin,
  extractTaxiCcMax,
  extractTaxiSeatingMin,
  extractTaxiSeatingMax,
  normalizeTaxiAddon,
  normalizeCommissionFlexible,
  normalizePolicyType,

  normalizeCvValue

}