import * as fs from 'fs';
import { read, utils } from 'xlsx';
import path from 'path';

const filePath = process.argv[2] || "C:\\Users\\Sanatorio Argentino\\Desktop\\Proyectos\\Sistema ADM-QUI\\Deuda Francisco.xlsx";
const buffer = fs.readFileSync(filePath);
const workbook = read(buffer, { type: 'buffer' });
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

const data = utils.sheet_to_json(worksheet, { header: 1 });
if (data.length > 0) {
    console.log("=== HEADERS ===");
    console.log(data[0]);
    console.log("\n=== FIRST 5 ROWS ===");
    for (let i = 1; i <= Math.min(5, data.length - 1); i++) {
        console.log(data[i]);
    }
} else {
    console.log("El archivo está vacío.");
}
