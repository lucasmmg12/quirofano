import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function findCandidatesToDelete() {
    const { data: pRows } = await supabase
        .from('altas_administrativas')
        .select('*')
        .ilike('numero_admision', '%-P%');

    console.log(`Total registros con sufijo -P: ${pRows.length}`);
    const toDelete = [];

    for (const p of pRows) {
        const baseNum = p.numero_admision.replace(/-P\d+$/i, '');
        const { data: baseRows } = await supabase
            .from('altas_administrativas')
            .select('*')
            .eq('numero_admision', baseNum);
        
        const base = baseRows?.[0];
        if (base) {
            console.log(`\nBase: ${base.numero_admision} (Facturada: ${base.facturada}, Cant: ${base.cantidad_facturas}, EstadoFac: ${base.estado_fac}, Alta: ${base.fecha_alta})`);
            console.log(`P-Row: ${p.numero_admision} (Facturada: ${p.facturada}, Cant: ${p.cantidad_facturas}, EstadoFac: ${p.estado_fac}, Alta: ${p.fecha_alta})`);
            
            // Si la base está facturada y la P-Row no está facturada
            if (base.facturada && !p.facturada) {
                toDelete.push({
                    pId: p.id,
                    pNum: p.numero_admision,
                    paciente: p.paciente,
                    baseNum: base.numero_admision,
                    baseFacturada: base.facturada,
                    baseCant: base.cantidad_facturas
                });
            }
        } else {
            console.log(`\nSin base para: ${p.numero_admision}`);
        }
    }

    console.log('\n================ CANDIDATOS A ELIMINAR ================');
    console.table(toDelete);
    return toDelete;
}
findCandidatesToDelete();
