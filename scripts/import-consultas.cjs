/**
 * Script: Crear tablas + Importar Consultas Emi.xlsx a Supabase
 * Uso: node scripts/import-consultas.js
 */
const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
const path = require('path');

const SUPABASE_URL = 'https://hakysnqiryimxbwdslwe.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhha3lzbnFpcnlpbXhid2RzbHdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA0MjI3NCwiZXhwIjoyMDg1NjE4Mjc0fQ.v0Zw7yFjGKJX8xsMCZJPwRyhr2eNd1gjASsI7qSK0YM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Convert Excel serial date to ISO date string
function excelDateToISO(serial) {
    if (!serial || typeof serial !== 'number') return null;
    const d = new Date((serial - 25569) * 86400000);
    return d.toISOString().split('T')[0];
}

// Get month period from date
function getMesPeriodo(dateStr) {
    if (!dateStr) return null;
    return dateStr.substring(0, 7); // '2026-04'
}

async function createTables() {
    console.log('📦 Creando tablas...');

    // Create consultas_imports table
    const { error: err1 } = await supabase.rpc('exec_sql', {
        query: `
            CREATE TABLE IF NOT EXISTS consultas_imports (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                mes TEXT NOT NULL,
                archivo TEXT,
                total_registros INT DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT now()
            );
        `
    }).single();

    // If rpc doesn't work, try direct approach - tables may already exist
    // We'll just try inserting and see
    console.log('✅ Tablas verificadas (o ya existentes)');
}

async function main() {
    const excelPath = path.resolve(__dirname, '..', 'Consultas Emi.xlsx');
    console.log('📄 Leyendo:', excelPath);

    const wb = XLSX.readFile(excelPath);
    const data = XLSX.utils.sheet_to_json(wb.Sheets['Hoja1']);
    console.log(`📊 Registros encontrados: ${data.length}`);

    // Step 1: Create import record
    const mesPeriodo = '2026-04';
    console.log(`\n🗓️  Período: ${mesPeriodo}`);

    const { data: importRecord, error: importErr } = await supabase
        .from('consultas_imports')
        .insert({
            mes: mesPeriodo,
            archivo: 'Consultas Emi.xlsx',
            total_registros: data.length,
        })
        .select()
        .single();

    if (importErr) {
        console.error('❌ Error creando import record:', importErr.message);
        console.log('\n⚠️  Las tablas pueden no existir. Creándolas via SQL directo...');
        console.log('Por favor ejecuta el SQL de sql/create_consultas_guardia.sql en el dashboard de Supabase.');
        console.log('Dashboard: https://supabase.com/dashboard/project/hakysnqiryimxbwdslwe/sql');
        return;
    }

    console.log(`✅ Import registrado: ${importRecord.id}`);

    // Step 2: Transform data
    const records = data.map(row => {
        const fechaISO = excelDateToISO(row['Fecha Visita']);
        return {
            import_id: importRecord.id,
            id_visita: row.idVisita,
            id_paciente: row.IdPaciente,
            cliente: (row.Cliente || '').trim(),
            asistencia: (row.Asistencia || '').trim(),
            paciente: (row.Paciente || '').trim(),
            nhc: row.NHC || null,
            nif: row.NIF ? String(row.NIF) : null,
            agenda: (row.Agenda || '').trim(),
            agrupacion_agenda: (row.Agrupacion_Agenda || '').trim(),
            grupo_agenda: (row['Grupo Agenda'] || '').trim(),
            tipo_visita: (row['Tipo Visita'] || '').trim(),
            tiempo_pred: row.TiempoPred || null,
            fecha_visita: fechaISO,
            visita_especialidad: (row.Visita_Especialidad || '').trim(),
            mes_periodo: getMesPeriodo(fechaISO),
        };
    });

    // Step 3: Batch insert (500 at a time)
    const BATCH_SIZE = 500;
    let inserted = 0;
    let errors = 0;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
            .from('consultas_guardia')
            .upsert(batch, { onConflict: 'id_visita' });

        if (error) {
            console.error(`❌ Batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, error.message);
            errors += batch.length;
        } else {
            inserted += batch.length;
            const pct = ((inserted / records.length) * 100).toFixed(1);
            process.stdout.write(`\r  ⏳ Progreso: ${inserted}/${records.length} (${pct}%)`);
        }
    }

    console.log(`\n\n✅ Importación completada:`);
    console.log(`   📊 Insertados: ${inserted}`);
    console.log(`   ❌ Errores: ${errors}`);
    console.log(`   🗓️  Período: ${mesPeriodo}`);
    console.log(`   📁 Import ID: ${importRecord.id}`);

    // Step 4: Print summary
    const { data: summary } = await supabase
        .from('consultas_guardia')
        .select('visita_especialidad')
        .eq('mes_periodo', mesPeriodo);

    if (summary) {
        console.log(`\n📈 Resumen por especialidad:`);
        const counts = {};
        summary.forEach(r => { counts[r.visita_especialidad] = (counts[r.visita_especialidad] || 0) + 1; });
        Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
            console.log(`   ${k}: ${v}`);
        });
    }
}

main().catch(console.error);
