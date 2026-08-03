import sql from 'mssql';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

const c = { server: '128.223.16.29', port: 2450, user: 'SalusConsulta', password: 'ConsultaSALUS1234', database: 'SALUS', options: { encrypt: false, trustServerCertificate: true, requestTimeout: 120000 } };
const p = await sql.connect(c);

// 1. IDs en SALUS para pediatría junio
console.log('Obteniendo IDs de SALUS...');
const salusResult = await p.request().query(`
    SELECT DISTINCT idVisita 
    FROM [SALUS].[dbo].[VLISE_Visitas con categoria] 
    WHERE [Fecha Visita]>='20260601' AND [Fecha Visita]<'20260701' 
    AND [Agenda]=N'GUARDIAS PEDIATRÍA' 
    AND LOWER(LTRIM(RTRIM([Asistencia])))='presente'
`);
const salusIds = new Set(salusResult.recordset.map(r => r.idVisita));
console.log(`SALUS: ${salusIds.size} IDs únicos`);

// 2. IDs en Supabase para pediatría junio
console.log('Obteniendo IDs de Supabase...');
const { data: supaData, error } = await supabase
    .from('consultas_guardia')
    .select('id_visita')
    .eq('mes_periodo', '2026-06')
    .eq('agenda', 'GUARDIAS PEDIATRÍA');

if (error) { console.error('Error Supabase:', error.message); process.exit(1); }
const supaIds = new Set(supaData.map(r => r.id_visita));
console.log(`Supabase: ${supaIds.size} registros`);

// 3. Diferencia
const enSalusNoEnSupa = [...salusIds].filter(id => !supaIds.has(id));
const enSupaNoEnSalus = [...supaIds].filter(id => !salusIds.has(id));

console.log(`\n═══ DIFERENCIA ═══`);
console.log(`En SALUS pero NO en Supabase: ${enSalusNoEnSupa.length}`);
console.log(`En Supabase pero NO en SALUS: ${enSupaNoEnSalus.length}`);

if (enSalusNoEnSupa.length > 0) {
    console.log('\nIDs faltantes en Supabase (primeros 30):');
    const missingIds = enSalusNoEnSupa.slice(0, 30);
    console.log(missingIds.join(', '));
    
    // Ver detalles de los faltantes
    const placeholders = missingIds.map((_, i) => `@p${i}`).join(',');
    const req = p.request();
    missingIds.forEach((id, i) => req.input(`p${i}`, id));
    const details = await req.query(`
        SELECT idVisita, Paciente, [Fecha Visita], Asistencia, Cliente, [Tipo Visita]
        FROM [SALUS].[dbo].[VLISE_Visitas con categoria]
        WHERE idVisita IN (${placeholders})
        AND [Agenda] = N'GUARDIAS PEDIATRÍA'
    `);
    console.table(details.recordset);
}

await p.close();
