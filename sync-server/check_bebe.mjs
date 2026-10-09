import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL, 
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
    try {
        const { data, error } = await supabase
            .from('altas_administrativas')
            .select('id, numero_admision, paciente, fecha_ingreso, fecha_alta, estado, estado_fac, notas_internas, created_at, updated_at, facturada, responsable_fac, devolucion_id, traspaso_id')
            .ilike('paciente', '%CARRIZO%MAXIMO%')
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error Supabase:', error);
            process.exit(1);
        }

        console.log('Total encontrados:', data?.length);
        console.table(data);
        console.log(JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Fatal:', err);
    }
}

run();
