import sql from 'mssql';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Cargar .env del proyecto padre
config({ path: resolve(__dirname, '..', '.env') });

// Supabase Client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// SQL Server Config
const SQL_CONFIG = {
    server: '128.223.16.29',
    port: 2450,
    user: 'SalusConsulta',
    password: 'ConsultaSALUS1234',
    database: 'SALUS',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        requestTimeout: 120000,
        connectionTimeout: 15000,
        tdsVersion: '7_4',
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
};

function formatDate(val) {
    if (!val) return null;
    if (val instanceof Date) {
        return val.toISOString(); // Supabase acepta ISO String para TIMESTAMPTZ
    }
    return String(val);
}

async function syncUCI() {
    console.log('🚀 Iniciando Sincronización Exclusiva de Indicadores UCI...');
    console.log(`🔌 Conectando a SALUS SQL Server...`);

    let pool;
    try {
        pool = await sql.connect(SQL_CONFIG);
        console.log('✅ Conectado a SALUS');
    } catch (err) {
        console.error('❌ Error conectando a SALUS:', err.message);
        process.exit(1);
    }

    try {
        console.log('📋 Extrayendo datos de Terapia Intensiva (2022-2026)...');
        // Usar la query proveída por el usuario
        const result = await pool.request().query(`
            SELECT 
                [Número admisión],
                [Fecha ingreso],
                [Fecha alta],
                Especialidad,
                Procedencia,
                NHC,
                Paciente,
                [Motivo de alta],
                Cliente,
                idAdmision,
                [Estado Conceptos],
                Servicio,
                Proceso,
                Edad,
                [Motivo Alta],
                [Control ADM finalizado]
            FROM TABLEAU_Admisiones
            WHERE Especialidad = 'TERAPIA INTENSIVA'
              AND YEAR([Fecha ingreso]) IN (2022, 2023, 2024, 2025, 2026)
            ORDER BY [Fecha ingreso] DESC
        `);

        const records = result.recordset;
        console.log(`📥 Se extrajeron ${records.length} registros de SALUS.`);

        if (records.length === 0) {
            console.log('No hay datos para sincronizar. Finalizando.');
            process.exit(0);
        }

        // Mapear los datos para el formato de Supabase
        const dataToUpsert = records.map(r => ({
            id_admision: r.idAdmision,
            numero_admision: r['Número admisión'] ? String(r['Número admisión']).trim() : null,
            fecha_ingreso: formatDate(r['Fecha ingreso']),
            fecha_alta: formatDate(r['Fecha alta']),
            especialidad: r.Especialidad ? String(r.Especialidad).trim() : null,
            procedencia: r.Procedencia ? String(r.Procedencia).trim() : null,
            nhc: r.NHC ? String(r.NHC).trim() : null,
            paciente: r.Paciente ? String(r.Paciente).trim() : null,
            motivo_de_alta: r['Motivo de alta'] ? String(r['Motivo de alta']).trim() : null,
            cliente: r.Cliente ? String(r.Cliente).trim() : null,
            estado_conceptos: r['Estado Conceptos'] ? String(r['Estado Conceptos']).trim() : null,
            servicio: r.Servicio ? String(r.Servicio).trim() : null,
            proceso: r.Proceso ? String(r.Proceso).trim() : null,
            edad: typeof r.Edad === 'number' ? r.Edad : parseInt(r.Edad, 10) || null,
            motivo_alta_2: r['Motivo Alta'] ? String(r['Motivo Alta']).trim() : null,
            control_adm_finalizado: r['Control ADM finalizado'] ? String(r['Control ADM finalizado']).trim() : null,
            updated_at: new Date().toISOString()
        }));

        console.log(`📦 Empujando datos a Supabase (tabla: calidad_uci_admisiones)...`);

        // Lotes de 500 para evitar timeout en la API
        const BATCH_SIZE = 500;
        let inserted = 0;
        let updated = 0;
        let errores = 0;

        for (let i = 0; i < dataToUpsert.length; i += BATCH_SIZE) {
            const batch = dataToUpsert.slice(i, i + BATCH_SIZE);
            const { data, error } = await supabase
                .from('calidad_uci_admisiones')
                .upsert(batch, { onConflict: 'id_admision', ignoreDuplicates: false })
                .select('id_admision, created_at, updated_at');
            
            if (error) {
                console.error(`❌ Error en el lote ${i/BATCH_SIZE + 1}:`, error.message);
                errores += batch.length;
            } else if (data) {
                data.forEach(d => {
                    // Si created_at es casi igual a updated_at, es insert.
                    const isNew = Math.abs(new Date(d.created_at) - new Date(d.updated_at)) < 2000;
                    if (isNew) {
                        inserted++;
                    } else {
                        updated++;
                    }
                });
            }
        }

        console.log('✅ Sincronización finalizada correctamente.');
        console.log(`   📊 Resultados: Nuevos: ${inserted} | Actualizados: ${updated} | Errores: ${errores}`);
        
    } catch (err) {
        console.error('❌ Error durante la extracción de datos:', err.message);
    } finally {
        await pool.close();
        process.exit(0);
    }
}

syncUCI();
