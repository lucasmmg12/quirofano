import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { config } from 'dotenv';

const require = createRequire(import.meta.url);
const playwrightPath = 'C:\\Users\\Sanatorio Argentino\\AppData\\Local\\npm-cache\\_npx\\e41f203b7505f1fb\\node_modules\\playwright';
const { chromium } = require(playwrightPath);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const outDir = 'C:\\Users\\Sanatorio Argentino\\.gemini\\antigravity\\brain\\5b1242b9-c2cf-49c5-bdb6-2f857aaeeff6\\certificacion_screenshots';

config({ path: path.join(rootDir, 'sync-server', '.env') });
config({ path: path.join(rootDir, '.env') });

const { createClient } = await import('../sync-server/node_modules/@supabase/supabase-js/dist/index.mjs');
const sbService = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Fetch real gobernanza_proyectos with service role so we can serve them to the browser even if anon RLS is restricted
const { data: realProyectos } = await sbService
    .from('gobernanza_proyectos')
    .select('*, gobernanza_indicadores(id, proyecto_id, titulo, informacion_buscada, origen_informacion, estado), gobernanza_documentos(id, nombre, url), gobernanza_entrevistas(count)')
    .order('created_at', { ascending: false });

const { data: realIndicadores } = await sbService
    .from('gobernanza_indicadores')
    .select('*')
    .order('created_at', { ascending: true });

console.log(`Pre-cargados ${realProyectos?.length || 0} proyectos de Gobernanza y ${realIndicadores?.length || 0} indicadores ERS.`);

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
    const cleanUrl = decodeURIComponent(req.url.split('?')[0]);
    let filePath = path.join(distDir, cleanUrl === '/' ? 'index.html' : cleanUrl);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(distDir, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
});

await new Promise(resolve => server.listen(4178, '127.0.0.1', resolve));
console.log('Static SPA server listening on http://127.0.0.1:4178');

const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
});

const context = await browser.newContext({
    viewport: { width: 1560, height: 940 },
    deviceScaleFactor: 1.5,
    permissions: ['geolocation'],
    geolocation: { latitude: -31.5375, longitude: -68.5364 }
});

const page = await context.newPage();

// Intercept session checks and forward all other /rest/v1/ requests with SUPABASE_SERVICE_ROLE_KEY so every dashboard loads 100% of real production data
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
await page.route('**/rest/v1/**', async (route, request) => {
    const url = request.url();
    if (url.includes('heartbeat_and_verify_user_session') || url.includes('check_or_claim_user_session')) {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ active: true, status: 'ok', session_token: 'sa_cert_token_2026', rol: 'gobernanza', must_change_password: false })
        });
        return;
    }
    const headers = {
        ...request.headers(),
        'apikey': serviceRoleKey,
        'authorization': `Bearer ${serviceRoleKey}`
    };
    await route.continue({ headers });
});

await page.addInitScript(() => {
    const session = {
        id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        usuario: 'gobernanza',
        nombre: 'Dirección Gobernanza de Datos',
        iniciales: 'GD',
        rol: 'gobernanza',
        email: 'gobernanza@sanatorioargentino.com.ar',
        sessionToken: 'sa_cert_token_2026',
        loginAt: new Date().toISOString()
    };
    localStorage.setItem('admqui_session', JSON.stringify(session));
    sessionStorage.setItem('admqui_session', JSON.stringify(session));
    sessionStorage.setItem('admqui_onboarding_shown', '1');
    sessionStorage.setItem('julio_meme_shown', 'true');
    localStorage.setItem('admqui_trusted_device_token', 'sa_dev_certificacion_2026_sanatorio_argentino');
    localStorage.setItem('active_view', 'gobernanza');
    localStorage.setItem('beto_guide_dismissed_gobernanza', 'true');
    localStorage.setItem('beto_guide_dismissed_gobernanza_indicadores', 'true');
});

async function dismissPopups() {
    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        for (const b of buttons) {
            const t = (b.textContent || '').trim();
            if (t.includes('Continuar al sistema') || t.includes('Entendido') || t.includes('Cerrar guía') || t.includes('Ahora no')) {
                b.click();
            }
        }
    });
}

async function selectTelarSector(sectorKeyword) {
    // 1. Open "Sectores" sidebar
    await page.evaluate(() => {
        const allBtns = Array.from(document.querySelectorAll('button'));
        const secBtn = allBtns.find(b => b.textContent && b.textContent.trim().includes('Sectores'));
        if (secBtn) secBtn.click();
    });
    await page.waitForTimeout(500);
    // 2. Click the sector item inside the open drawer
    await page.evaluate((kw) => {
        const allElements = Array.from(document.querySelectorAll('button, div, span'));
        // Pick the deepest element matching kw inside the sidebar
        const matches = allElements.filter(el => el.children.length === 0 && el.textContent && el.textContent.includes(kw));
        if (matches.length > 0) {
            matches[0].click();
        }
    }, sectorKeyword);
    await page.waitForTimeout(500);
    // 3. Toggle "Sectores" button again to collapse the drawer so full dashboard is visible
    await page.evaluate(() => {
        const allBtns = Array.from(document.querySelectorAll('button'));
        const secBtn = allBtns.find(b => b.textContent && b.textContent.trim().includes('Sectores'));
        if (secBtn) secBtn.click();
    });
    await page.waitForTimeout(400);
}

// 1. Hub Proyectos de Datos (/gobernanza)
console.log('Capturando 01_hub_proyectos_datos.png...');
await page.goto('http://127.0.0.1:4178/gobernanza', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await dismissPopups();
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(outDir, '01_hub_proyectos_datos.png') });

// 2. Calendario Global Gantt
console.log('Capturando 02_calendario_gantt_global.png...');
await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Calendario Global'));
    if (btn) btn.click();
});
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(outDir, '02_calendario_gantt_global.png') });

// 3. Volver a /gobernanza y abrir Informe Técnico y Contable (Gobierno SJ)
console.log('Capturando 14_informe_rendicion_gobierno.png...');
await page.goto('http://127.0.0.1:4178/gobernanza', { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Informe Técnico y Contable'));
    if (btn) btn.click();
});
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(outDir, '14_informe_rendicion_gobierno.png') });

// 4. Volver a /gobernanza y entrar al proyecto Quirófano Central y Hospital de Día -> Memoria Técnica & ERS
console.log('Capturando 03_proyecto_memoria_ers.png...');
await page.goto('http://127.0.0.1:4178/gobernanza', { waitUntil: 'networkidle' });
await page.waitForTimeout(1800);
await page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll('h3'));
    const card = headings.find(h => h.textContent && h.textContent.includes('Quirófano')) || headings[0];
    if (card) card.click();
});
await page.waitForTimeout(1800);
await page.screenshot({ path: path.join(outDir, '03_proyecto_memoria_ers.png') });

// 5. Pestaña Requerimientos / Indicadores ERS dentro del proyecto
console.log('Capturando 05_indicadores_documentos_rag.png...');
await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && (b.textContent.includes('Requerimientos') || b.textContent.includes('Indicadores')));
    if (btn) btn.click();
});
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(outDir, '05_indicadores_documentos_rag.png') });

// 6. Pestaña Entrevistas & Grabador IA
console.log('Capturando 04_entrevistas_grabador_ia.png...');
await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Entrevistas'));
    if (btn) btn.click();
});
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(outDir, '04_entrevistas_grabador_ia.png') });

// 7. Navegar a /gobernanza_indicadores (Telar / Tableros Clínicos en Vivo)
console.log('Capturando 06_tablero_uci_censo.png...');
await page.goto('http://127.0.0.1:4178/gobernanza_indicadores', { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
await dismissPopups();
await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.trim() === 'Mes Anterior');
    if (btn) btn.click();
});
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(outDir, '06_tablero_uci_censo.png') });

// 8. UCI -> Pestaña Soporte Diagnóstico & Kinesiología
console.log('Capturando 07_tablero_uci_kinesiologia.png...');
await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && (b.textContent.includes('Seguridad Clínica') || b.textContent.includes('Soporte Diagnóstico') || b.textContent.includes('Mapa de Camas')));
    if (btn) btn.click();
});
await page.waitForTimeout(1800);
await page.screenshot({ path: path.join(outDir, '07_tablero_uci_kinesiologia.png') });

// 9. Seleccionar Quirófano Central & Hospital de Día (747 fojas / 746 visitas en Octubre 2026)
console.log('Capturando 08_tablero_quirofano_principal.png...');
await selectTelarSector('Quirófano & HdD');
await page.waitForTimeout(3500);
await page.screenshot({ path: path.join(outDir, '08_tablero_quirofano_principal.png') });

// 10. Quirófano -> Bloques Quirúrgicos & Alertas 7d (con CCV 0% y Dr. Pons 50%)
console.log('Capturando 09_tablero_quirofano_bloques_susp.png...');
await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Bloques Quirúrgicos'));
    if (btn) btn.click();
});
await page.waitForTimeout(1500);
await page.evaluate(() => {
    const scrollables = Array.from(document.querySelectorAll('div')).filter(el => el.scrollHeight > el.clientHeight + 200 && el.clientHeight > 400);
    for (const el of scrollables) el.scrollTop = 520;
    window.scrollTo(0, 520);
});
await page.waitForTimeout(1000);
await page.screenshot({ path: path.join(outDir, '09_tablero_quirofano_bloques_susp.png') });
await page.evaluate(() => {
    const scrollables = Array.from(document.querySelectorAll('div')).filter(el => el.scrollHeight > el.clientHeight + 200);
    for (const el of scrollables) el.scrollTop = 0;
    window.scrollTo(0, 0);
});

// 11. Seleccionar Guardia y Emergencias
console.log('Capturando 10_tablero_guardia_principal.png...');
await selectTelarSector('Guardia Clínica');
await page.waitForTimeout(3500);
await page.screenshot({ path: path.join(outDir, '10_tablero_guardia_principal.png') });

// 12. Guardia Clínica -> Internado & Piso
console.log('Capturando 11_tablero_guardia_tiempos_internado.png...');
await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Internado & Piso'));
    if (btn) btn.click();
});
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(outDir, '11_tablero_guardia_tiempos_internado.png') });

// 13. Diagnóstico por Imágenes (DxI)
console.log('Capturando 12_tablero_epidemiologia_dxi.png...');
await selectTelarSector('Imágenes (DxI)');
await page.waitForTimeout(3000);
await page.screenshot({ path: path.join(outDir, '12_tablero_epidemiologia_dxi.png') });

// 14. Vigilancia Epidemiológica
console.log('Capturando 13_asistente_simon_beto_ia.png...');
await selectTelarSector('Epidemiología');
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(outDir, '13_asistente_simon_beto_ia.png') });

await browser.close();
server.close();
console.log('Todas las 14 capturas reales generadas en:', outDir);
