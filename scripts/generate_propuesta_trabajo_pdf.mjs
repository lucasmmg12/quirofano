import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildGobernanzaPropuestaTrabajoPdfDoc } from '../src/utils/gobernanzaPropuestaTrabajoPdf.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const logoPath = path.join(rootDir, 'public', 'logo_sanatorio.png');
let logoDataUrl = null;
if (fs.existsSync(logoPath)) {
    const base64 = fs.readFileSync(logoPath).toString('base64');
    logoDataUrl = `data:image/png;base64,${base64}`;
}

const { doc, fileName } = buildGobernanzaPropuestaTrabajoPdfDoc(logoDataUrl);
const arrayBuffer = doc.output('arraybuffer');
const buffer = Buffer.from(arrayBuffer);

const publicDocsDir = path.join(rootDir, 'public', 'docs');
if (!fs.existsSync(publicDocsDir)) {
    fs.mkdirSync(publicDocsDir, { recursive: true });
}

const outPublicPath = path.join(publicDocsDir, fileName);
fs.writeFileSync(outPublicPath, buffer);
console.log(`Saved PDF to: ${outPublicPath} (${buffer.length} bytes, ${doc.internal.getNumberOfPages()} pages)`);

const desktopPath = path.join('C:\\Users\\Sanatorio Argentino\\Desktop', fileName);
fs.writeFileSync(desktopPath, buffer);
console.log(`Saved PDF copy to Desktop: ${desktopPath}`);
