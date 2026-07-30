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

async function cleanDeudas() {
    console.log('--- INICIANDO LIMPIEZA DE DEUDAS ---');
    console.log('Opción A seleccionada: Borrar TODO excepto "deuda_cancelada"');

    // 1. Obtener conteo previo
    const { count: countTotal, error: countErr1 } = await supabase
        .from('deudas_pacientes')
        .select('*', { count: 'exact', head: true });

    if (countErr1) {
        console.error('Error fetching total:', countErr1);
        return;
    }

    const { count: countCancelada, error: countErr2 } = await supabase
        .from('deudas_pacientes')
        .select('*', { count: 'exact', head: true })
        .eq('categoria', 'deuda_cancelada');

    console.log(`Pacientes totales antes del borrado: ${countTotal}`);
    console.log(`Pacientes con 'deuda_cancelada' (se preservarán): ${countCancelada}`);
    console.log(`Pacientes a borrar: ${countTotal - countCancelada}`);

    // 2. Ejecutar borrado
    const { error } = await supabase
        .from('deudas_pacientes')
        .delete()
        .neq('categoria', 'deuda_cancelada');

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

cleanDeudas();
