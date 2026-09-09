import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const ids = [
    { num: 'UCI000813-P1', id: '7ae1f3b2-c8c7-4c90-8b76-3bc0b11b8526' },
    { num: 'UCI000792-P1', id: '86326f8d-faac-42a7-a000-394a7eb11d33' },
    { num: 'N002609-P1', id: '1c8ced13-6e13-4b4f-b49d-cca5c24d45f8' },
    { num: 'TI000229-P1', id: '30476a6a-cd03-4656-866d-f6d615f10a1d' },
    { num: 'TI000230-P1', id: '8ec3ec74-f66b-4700-818b-5512652c9a52' },
    { num: 'UCI000878-P1', id: '7e78f6c1-0409-44ee-98c4-e8bf783e5023' },
    { num: 'I052850-P1', id: '7ab2dbdb-68d9-4c43-b90b-613d81259c69' }
];

async function checkRelations() {
    for (const item of ids) {
        const { data: conceptos } = await supabase.from('facturacion_conceptos').select('id').eq('alta_id', item.id);
        const { data: traspasos } = await supabase.from('altas_traspasos_items').select('id').eq('alta_id', item.id);
        console.log(`${item.num} (${item.id}) -> conceptos: ${conceptos?.length || 0}, traspaso_items: ${traspasos?.length || 0}`);
    }
}
checkRelations();
