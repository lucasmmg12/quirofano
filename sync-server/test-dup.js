import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: 'c:\\Users\\Sanatorio Argentino\\Desktop\\Proyectos\\Sistema ADM-QUI\\.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
    console.log("Checking duplicates...");
    const { data, error } = await supabase.from('asociaciones_cirugias').select('id, nombre_paciente').like('nombre_paciente', 'TEST URGENCIA%');
    console.log("Current records:", data);
}
test();
