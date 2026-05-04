import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: 'c:\\Users\\Sanatorio Argentino\\Desktop\\Proyectos\\Sistema ADM-QUI\\.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
    const records = [
        { fecha_realizacion: '2026-04-20', nombre_paciente: 'TEST DUP', nombre_cirugia: 'CX', especialidad: 'CIRUGIA', estado: 'URGENCIA', asociacion: 'Asociación de Cirujanos' },
        { fecha_realizacion: '2026-04-20', nombre_paciente: 'TEST DUP', nombre_cirugia: 'CX', especialidad: 'CIRUGIA', estado: 'URGENCIA', asociacion: 'Asociación de Cirujanos' }
    ];
    
    console.log("Upserting duplicate records in same batch...");
    const { data, error } = await supabase.from('asociaciones_cirugias').upsert(records, {
        onConflict: 'fecha_realizacion,nombre_paciente,nombre_cirugia',
        ignoreDuplicates: false
    });
    console.log("Result:", error ? error.message : "Success");
}
test();
