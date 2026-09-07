import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: procedencia } = await supabase.from('calidad_uci_admisiones').select('procedencia');
    const { data: motivos } = await supabase.from('calidad_uci_admisiones').select('motivo_de_alta');
    
    const procedenciasUnicas = [...new Set(procedencia.map(p => p.procedencia))];
    const motivosUnicos = [...new Set(motivos.map(m => m.motivo_de_alta))];
    
    console.log("Procedencias:", procedenciasUnicas);
    console.log("Motivos de Alta:", motivosUnicos);
}
run();
