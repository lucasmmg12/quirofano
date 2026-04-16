/**
 * Script: upload_coseguros.js
 * Lee coseguros.xlsx y actualiza la columna "coseguro" en hospital_pacientes
 * usando id_paciente como key. Solo hace UPDATE, no inserta nuevos registros.
 * Opera en batches de 200 para evitar timeouts.
 *
 * PRE-REQUISITO: Ejecutar en Supabase SQL Editor:
 *   ALTER TABLE hospital_pacientes ADD COLUMN coseguro TEXT;
 *
 * Uso: node scripts/upload_coseguros.js
 */

const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// --- Configuración ---
const SUPABASE_URL = 'https://hakysnqiryimxbwdslwe.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhha3lzbnFpcnlpbXhid2RzbHdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA0MjI3NCwiZXhwIjoyMDg1NjE4Mjc0fQ.v0Zw7yFjGKJX8xsMCZJPwRyhr2eNd1gjASsI7qSK0YM';

const BATCH_SIZE = 200;
const EXCEL_PATH = path.resolve(__dirname, '..', 'coseguros.xlsx');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
    console.log('=== Upload Coseguros → hospital_pacientes ===');
    console.log(`Leyendo Excel: ${EXCEL_PATH}`);

    // 1) Leer Excel
    const wb = XLSX.readFile(EXCEL_PATH);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);

    console.log(`Filas en Excel: ${rows.length}`);

    // 2) Mapear y limpiar datos - solo registros con coseguro real
    const records = rows
        .map(row => ({
            id_paciente: Number(row.idPaciente),
            coseguro: (row.coaseguro && String(row.coaseguro).trim() !== 'NULL')
                ? String(row.coaseguro).trim()
                : null
        }))
        .filter(r => !isNaN(r.id_paciente));

    // Separar los que tienen coseguro real vs los que son NULL
    const withCoseguro = records.filter(r => r.coseguro !== null);
    const withoutCoseguro = records.filter(r => r.coseguro === null);

    console.log(`Registros con coseguro válido: ${withCoseguro.length}`);
    console.log(`Registros con coseguro NULL: ${withoutCoseguro.length}`);
    console.log(`\nProcesando ${withCoseguro.length} registros con coseguro válido...`);

    // 3) Actualizar en batches - solo los que tienen coseguro real
    let updated = 0;
    let errors = 0;
    const totalBatches = Math.ceil(withCoseguro.length / BATCH_SIZE);
    const startTime = Date.now();

    for (let i = 0; i < withCoseguro.length; i += BATCH_SIZE) {
        const batch = withCoseguro.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;

        // Hacer updates individuales en paralelo dentro del batch
        const promises = batch.map(rec =>
            supabase
                .from('hospital_pacientes')
                .update({ coseguro: rec.coseguro })
                .eq('id_paciente', rec.id_paciente)
        );

        const results = await Promise.all(promises);
        const batchErrors = results.filter(r => r.error);

        if (batchErrors.length > 0) {
            errors += batchErrors.length;
            if (batchErrors.length > 5) {
                console.error(`  ✗ Batch ${batchNum}: ${batchErrors.length} errores de ${batch.length}`);
            }
        }

        updated += (batch.length - batchErrors.length);

        // Progreso cada 10 batches
        if (batchNum % 10 === 0 || batchNum === totalBatches) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const pct = ((batchNum / totalBatches) * 100).toFixed(1);
            console.log(`  ✓ Batch ${batchNum}/${totalBatches} (${pct}%) — ${updated} actualizados — ${elapsed}s`);
        }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n=== Resultado Final ===');
    console.log(`Actualizados exitosamente: ${updated}`);
    console.log(`Errores (pac. no encontrado): ${errors}`);
    console.log(`Tiempo total: ${totalTime}s`);
    console.log('Finalizado.');
}

main().catch(err => {
    console.error('Error fatal:', err);
    process.exit(1);
});
