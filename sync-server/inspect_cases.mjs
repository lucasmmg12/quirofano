import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const p1List = [
    'UCI000813-P1',
    'UCI000792-P1',
    'N002609-P1',
    'TI000229-P1',
    'TI000230-P1',
    'UCI000878-P1',
    'I052850-P1'
];

async function inspectCases() {
    for (const p1Num of p1List) {
        const baseNum = p1Num.replace('-P1', '');
        const { data: rows, error } = await supabase
            .from('altas_administrativas')
            .select('id, numero_admision, paciente, fecha_ingreso, fecha_alta, facturada, estado, estado_fac, responsable_fac, traspaso_id, cantidad_facturas, notas_internas')
            .or(`numero_admision.eq.${p1Num},numero_admision.eq.${baseNum}`);
        
        console.log(`\n================== ${baseNum} / ${p1Num} ==================`);
        rows?.forEach(r => {
            console.log(`- ${r.numero_admision} | Pac: ${r.paciente} | Ingr: ${r.fecha_ingreso} | Alta: ${r.fecha_alta} | Facturada: ${r.facturada} (cant: ${r.cantidad_facturas}) | Estado: ${r.estado} | EstadoFac: ${r.estado_fac} | RespFac: ${r.responsable_fac} | Traspaso: ${r.traspaso_id ? 'SI' : 'NO'}`);
        });
    }
}
inspectCases();
