import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase
        .from('laboratorios_anatomia_patologica')
        .select('*')
        .ilike('paciente', '%GODOY, SANDRA%');
        
    if (error) {
        console.error(error.message);
    } else {
        console.log('Records in Supabase for GODOY, SANDRA:');
        console.table(data);
    }
}
check();
