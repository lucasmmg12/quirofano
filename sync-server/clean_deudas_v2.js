import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });
config({ path: resolve(__dirname, '.env') }); // Fallback

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRole || supabaseKey);

async function cleanDeudasV2() {
    console.log('--- INICIANDO LIMPIEZA DE DEUDAS (OPCIÓN B) ---');
    console.log('Borrando únicamente las "viejas" o sin gestionar.');
    console.log('Se borrarán: "sin_gestionar" y "sin_deuda_salus"');
    console.log('Se preservarán todos los pacientes con otros cambios de estado.');

    // 1. Obtener conteo previo
    const { count: countTotal, error: countErr1 } = await supabase
        .from('deudas_pacientes')
        .select('*', { count: 'exact', head: true });

    if (countErr1) {
        console.error('Error fetching total:', countErr1);
        return;
    }

    const { count: countToKeep, error: countErr2 } = await supabase
        .from('deudas_pacientes')
        .select('*', { count: 'exact', head: true })
        .not('categoria', 'in', '("sin_gestionar", "sin_deuda_salus")');

    const { count: countToDelete, error: countErr3 } = await supabase
        .from('deudas_pacientes')
        .select('*', { count: 'exact', head: true })
        .in('categoria', ['sin_gestionar', 'sin_deuda_salus']);

    console.log(`Pacientes totales antes del borrado: ${countTotal}`);
    console.log(`Pacientes a preservar (con gestión iniciada): ${countToKeep}`);
    console.log(`Pacientes a borrar (basura/sin tocar): ${countToDelete}`);

    // 2. Ejecutar borrado
    const { error } = await supabase
        .from('deudas_pacientes')
        .delete()
        .in('categoria', ['sin_gestionar', 'sin_deuda_salus']);

    if (error) {
        console.error('❌ Error al borrar:', error);
        return;
    }

    // 3. Obtener conteo posterior
    const { count: countDespues } = await supabase
        .from('deudas_pacientes')
        .select('*', { count: 'exact', head: true });

    console.log('✅ Borrado exitoso.');
    console.log(`Pacientes totales después del borrado: ${countDespues} (Debería ser igual a los preservados)`);
    console.log('--- LIMPIEZA FINALIZADA ---');
}

cleanDeudasV2();
