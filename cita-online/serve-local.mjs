import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, 'cita-online');
const PORT = 4300;
const SANATORIO_HOME_PATH = '/citanueva/home/7F7FD8D85A5A545447475C5C6D0C768B0D9B2C2CD9E54BBA61A05831/es';

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
};

const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url || '/', `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(parsedUrl.pathname);

    if (pathname === '/' || pathname === '/citanueva' || pathname === '/citanueva/') {
        res.writeHead(302, { Location: SANATORIO_HOME_PATH });
        res.end();
        return;
    }

    // Quitar prefijo /citanueva/ para buscar archivo estático
    let relPath = pathname.startsWith('/citanueva/')
        ? pathname.slice('/citanueva/'.length)
        : pathname.replace(/^\/+/, '');

    let filePath = path.join(ROOT_DIR, relPath);

    // Si el archivo existe y es archivo regular, servirlo
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
            'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
            'Cache-Control': 'no-store'
        });
        fs.createReadStream(filePath).pipe(res);
        return;
    }

    // Fallback SPA de Angular: devolver index.html
    const indexPath = path.join(ROOT_DIR, 'index.html');
    res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    fs.createReadStream(indexPath).pipe(res);
});

server.listen(PORT, () => {
    console.log(`✅ CitaOnline Local activo en: http://localhost:${PORT}${SANATORIO_HOME_PATH}`);
});

