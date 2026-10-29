import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { buildGobernanzaRendicionGobiernoPdfDoc } from '../src/utils/gobernanzaRendicionGobiernoPdf.js';

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
);

async function main() {
    console.log('1. Cargando logo de Sanatorio Argentino...');
    const logoPath = path.resolve('public/logosanatorio.png');
    let logoDataUrl = null;
    if (fs.existsSync(logoPath)) {
        const buf = fs.readFileSync(logoPath);
        logoDataUrl = `data:image/png;base64,${buf.toString('base64')}`;
    }

    console.log('2. Generando Informe Técnico y Contable PDF (Gobierno de San Juan — Economía del Conocimiento)...');
    const { doc, fileName } = buildGobernanzaRendicionGobiernoPdfDoc(logoDataUrl);
    const buffer = Buffer.from(doc.output('arraybuffer'));

    const docsDir = path.resolve('public/docs');
    if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true });
    }
    const outPath = path.join(docsDir, fileName);
    fs.writeFileSync(outPath, buffer);
    console.log(`   [OK] PDF guardado en ${outPath} (${buffer.length} bytes)`);

    // Guardar copia directa en el Escritorio para acceso inmediato del usuario
    try {
        const desktopPath = path.resolve('C:/Users/Sanatorio Argentino/Desktop', fileName);
        fs.writeFileSync(desktopPath, buffer);
        console.log(`   [OK] Copia directa guardada en Escritorio: ${desktopPath}`);
    } catch (e) {
        console.warn('   Aviso copiando a Escritorio:', e.message);
    }

    // 3. Registrar en gobernanza_documentos para todos los proyectos activos
    const { data: proyectos } = await supabase.from('gobernanza_proyectos').select('id, nombre');
    const docUrl = `/docs/${fileName}`;
    const docNombre = 'Informe_Tecnico_Contable_Economia_Conocimiento_Gobierno_SJ_2026.pdf';

    for (const p of (proyectos || [])) {
        const { data: existing } = await supabase
            .from('gobernanza_documentos')
            .select('id')
            .eq('proyecto_id', p.id)
            .eq('nombre', docNombre);

        if (existing && existing.length > 0) {
            await supabase
                .from('gobernanza_documentos')
                .update({ url: docUrl, tipo_archivo: 'application/pdf' })
                .eq('id', existing[0].id);
        } else {
            await supabase
                .from('gobernanza_documentos')
                .insert([{
                    proyecto_id: p.id,
                    nombre: docNombre,
                    url: docUrl,
                    tipo_archivo: 'application/pdf'
                }]);
        }
        console.log(`   Vinculado a proyecto: ${p.nombre}`);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});

