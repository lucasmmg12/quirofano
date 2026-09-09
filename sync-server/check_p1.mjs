import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const nums = [
    'UCI000813', 'UCI000792', 'N002689', 'T1000229', 'T1000230', 'UCI000878', 'I052850'
];

async function checkAll() {
    for (const num of nums) {
        const { data, error } = await supabase
            .from('altas_administrativas')
            .select('id, numero_admision, paciente, fecha_ingreso, fecha_alta, facturada, estado, estado_fac, responsable_fac, traspaso_id')
            .or(`numero_admision.eq.${num},numero_admision.eq.${num}-P1`);
        console.log('--- ' + num + ' ---');
        console.table(data);
    }
}
checkAll();
