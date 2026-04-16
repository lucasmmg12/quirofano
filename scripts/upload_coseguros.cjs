/**
 * Script: upload_coseguros.cjs (v3 - PRODUCTION)
 * 
 * Lee coseguros.xlsx y actualiza SOLO el campo coseguro en hospital_pacientes.
 * Usa RPC-style update en bloques para evitar violaciones NOT NULL.
 *
 * Uso: node scripts/upload_coseguros.cjs
 */

const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const SUPABASE_URL = 'https://hakysnqiryimxbwdslwe.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhha3lzbnFpcnlpbXhid2RzbHdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA0MjI3NCwiZXhwIjoyMDg1NjE4Mjc0fQ.v0Zw7yFjGKJX8xsMCZJPwRyhr2eNd1gjASsI7qSK0YM';

const BATCH_SIZE = 50; // 50 updates paralelos por ciclo
const EXCEL_PATH = path.resolve(__dirname, '..', 'coseguros.xlsx');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
    console.log('=== Upload Coseguros v3 → hospital_pacientes ===');
    const startTime = Date.now();

    // 1) Leer Excel
    console.log('Leyendo Excel...');
    const wb = XLSX.readFile(EXCEL_PATH);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);
    console.log(`Filas: ${rows.length}`);

    // 2) Filtrar solo los que tienen coseguro real
    const updates = [];
    rows.forEach(row => {
        const id = Number(row.idPaciente);
        const val = row.coaseguro;
        if (!isNaN(id) && val && String(val).trim() !== 'NULL') {
            updates.push({ id: id, coseguro: String(val).trim() });
        }
    });
    console.log(`Con coseguro válido: ${updates.length}`);

    // 3) Hacer UPDATE (no upsert) en paralelo de 50
    let updated = 0;
    let skipped = 0;
    const total = updates.length;

    for (let i = 0; i < total; i += BATCH_SIZE) {
        const batch = updates.slice(i, i + BATCH_SIZE);

        const results = await Promise.all(
            batch.map(rec =>
                supabase
                    .from('hospital_pacientes')
                    .update({ coseguro: rec.coseguro })
                    .eq('id_paciente', rec.id)
                    .select('id_paciente')
            )
        );

        results.forEach(r => {
            if (r.error) {
                skipped++;
            } else if (r.data && r.data.length > 0) {
                updated++;
            } else {
                skipped++; // no match
            }
        });

        const processed = Math.min(i + BATCH_SIZE, total);
        if (processed % 500 === 0 || processed === total) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const pct = ((processed / total) * 100).toFixed(1);
            console.log(`  ${pct}% — ${updated} actualizados, ${skipped} sin match — ${elapsed}s`);
        }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n=== Resultado Final ===');
    console.log(`Actualizados: ${updated}`);
    console.log(`Sin match en tabla: ${skipped}`);
    console.log(`Tiempo: ${totalTime}s`);
}

main().catch(err => {
    console.error('Error fatal:', err);
    process.exit(1);
});
