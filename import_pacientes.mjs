import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { config } from 'dotenv';

config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Faltan variables de entorno');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const BATCH_SIZE = 1000;
const CSV_PATH = 'listadomejorado.csv';

async function main() {
    // Step 1: Delete all old data
    console.log('🗑️  Borrando datos anteriores...');
    const { error: delError } = await supabase
        .from('pacientes')
        .delete()
        .neq('id_paciente', -1); // delete all rows

    if (delError) {
        console.error('❌ Error borrando:', delError.message);
        process.exit(1);
    }
    console.log('✅ Datos anteriores borrados');

    // Step 2: Read and parse new CSV
    console.log('📂 Leyendo CSV...');
    const raw = readFileSync(CSV_PATH, 'utf-8');
    const lines = raw.split('\n').filter(l => l.trim());

    const header = lines[0];
    console.log(`📋 Header: ${header}`);
    // Header: IdPaciente;Paciente;Edad;Sexo;DNI;E-mail;Centro creación
    //         0          1        2    3    4   5      6

    const dataLines = lines.slice(1);
    console.log(`📊 Total filas: ${dataLines.length}`);

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
            edad: (parts[2] || '').trim().replace(/\r/g, '') || null,
            sexo: (parts[3] || '').trim().replace(/\r/g, '') || null,
            dni: (parts[4] || '').trim().replace(/\r/g, '') || null,
            email: (parts[5] || '').trim().replace(/\r/g, '') || null,
            centro: (parts[6] || '').trim().replace(/\r/g, '') || null,
        });
    }

    console.log(`✅ Filas parseadas: ${rows.length} (${skipped} omitidas)`);

    // Step 3: Upload in batches
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
            console.error(`❌ Batch ${batchNum}/${totalBatches}:`, error.message);
            errors++;
        } else {
            uploaded += batch.length;
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
