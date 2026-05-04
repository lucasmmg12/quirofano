import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: 'c:\\Users\\Sanatorio Argentino\\Desktop\\Proyectos\\Sistema ADM-QUI\\.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

async function check() {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/check_constraint`, {
        method: 'POST',
        headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
        }
    });
    
    // If we don't have RPC, let's try just doing an upsert that would fail with the old constraint but pass with new.
    // Actually, I can just use supabase query!
    console.log("Checking if DNI null duplicates work...");
    
    // Create a mock client with a very random patient name and DNI null
    const mock = {
        fecha_realizacion: '2026-01-01',
        nombre_paciente: 'ZZZ CONSTRAINT TESTER',
        nombre_cirugia: 'PRUEBA_1',
        especialidad: 'CIRUGIA',
        estado: 'URGENCIA',
        asociacion: 'Asociación de Cirujanos',
        dni: null
    };
    
    const mock2 = { ...mock, nombre_cirugia: 'PRUEBA_2' };
    
    // First, insert both
    const { data: d1, error: e1 } = await fetch(`${supabaseUrl}/rest/v1/asociaciones_cirugias?on_conflict=fecha_realizacion,nombre_paciente,nombre_cirugia`, {
        method: 'POST',
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify([mock, mock2])
    }).then(r => r.json());
    
    console.log("Insert result:", d1, e1);
    
    // Now try to trigger the constraint
}
check();
