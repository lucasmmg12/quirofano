import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Using anon key or service role if needed. Let's try anon key first.
const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
    try {
        // Upsert Perez Navas sede
        await supabase.from('activos_sedes').upsert({ id: 'perez-navas', nombre: 'Pérez Navas', activo: true });

        const data = JSON.parse(fs.readFileSync('data_activos.json', 'utf8'));
        
        console.log(`Inserting ${data.length} equipment...`);
        
        for (const item of data) {
            const { error } = await supabase
                .from('activos_equipos')
                .insert([{
                    sede_id: item.sede_id,
                    nombre: item.nombre,
                    marca: item.marca,
                    modelo: item.modelo,
                    observaciones: item.observaciones,
                    estado_operativo: 'Operativo',
                    created_by: 'SISTEMA SEED'
                }]);
                
            if (error) {
                console.error(`Error inserting ${item.nombre}:`, error.message);
            } else {
                console.log(`✅ Inserted ${item.nombre}`);
            }
        }
        
        console.log('Seed finished successfully.');
    } catch (e) {
        console.error('Error in seed script:', e);
    }
}

seed();
