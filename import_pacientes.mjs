/**
 * import_pacientes.mjs
 * ────────────────────
 * Script para importar el CSV de pacientes a Supabase en batches.
 * 
 * Uso:
 *   node import_pacientes.mjs
 * 
 * Requiere:
 *   - VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el archivo .env
 *   - listadopacientes.csv en la raíz del proyecto
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

// Load env vars
config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Faltan variables VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY en .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const BATCH_SIZE = 1000;
const CSV_PATH = 'listadopacientes.csv';

async function main() {
    console.log('📂 Leyendo CSV...');
    const raw = readFileSync(CSV_PATH, 'utf-8');
    const lines = raw.split('\n').filter(l => l.trim());

    // Skip header
    const header = lines[0];
    console.log(`📋 Header: ${header}`);
    const dataLines = lines.slice(1);
    console.log(`📊 Total filas: ${dataLines.length}`);

    // Parse CSV (separator: ;)
    const rows = [];
    let skipped = 0;
    for (const line of dataLines) {
        const parts = line.split(';');
        if (parts.length < 2) { skipped++; continue; }

        const idPaciente = parseInt(parts[0], 10);
        if (isNaN(idPaciente)) { skipped++; continue; }

        rows.push({
            id_paciente: idPaciente,
            nombre: (parts[1] || '').trim().replace(/\r/g, ''),
            dni: (parts[2] || '').trim().replace(/\r/g, '') || null,
            edad: (parts[3] || '').trim().replace(/\r/g, '') || null,
            sexo: (parts[4] || '').trim().replace(/\r/g, '') || null,
            email: (parts[5] || '').trim().replace(/\r/g, '') || null,
            centro: (parts[6] || '').trim().replace(/\r/g, '') || null,
        });
    }

    console.log(`✅ Filas parseadas: ${rows.length} (${skipped} omitidas)`);

    // Upload in batches
    let uploaded = 0;
    let errors = 0;
    const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;

        const { error } = await supabase
            .from('pacientes')
            .upsert(batch, { onConflict: 'id_paciente', ignoreDuplicates: false });

        if (error) {
            console.error(`❌ Batch ${batchNum}/${totalBatches} falló:`, error.message);
            errors++;
        } else {
            uploaded += batch.length;
            // Progress every 10 batches
            if (batchNum % 10 === 0 || batchNum === totalBatches) {
                const pct = ((uploaded / rows.length) * 100).toFixed(1);
                console.log(`📤 Batch ${batchNum}/${totalBatches} — ${uploaded}/${rows.length} (${pct}%)`);
            }
        }
    }

    console.log(`\n🏁 Importación completada:`);
    console.log(`   ✅ Subidos: ${uploaded}`);
    console.log(`   ❌ Errores: ${errors}`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
