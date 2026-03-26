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
    console.log("=== HEADERS (con índice) ===");
    data[0].forEach((h, i) => console.log(`  [${i}] ${h}`));
    console.log("\n=== FIRST 3 ROWS (raw) ===");
    for (let i = 1; i <= Math.min(3, data.length - 1); i++) {
        console.log(`\nRow ${i}:`);
        data[0].forEach((h, idx) => console.log(`  [${idx}] ${h}: ${data[i][idx]}`));
    }
    console.log(`\nTotal rows: ${data.length - 1}`);
} else {
    console.log("El archivo está vacío.");
}
