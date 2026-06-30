import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY; // Using anon or service_role
const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);

const usersToCreate = [
    { nombre: 'Victoria Giménez', usuario: 'vgimenez' },
    { nombre: 'Ines Dona', usuario: 'idona' },
    { nombre: 'Florencia Paredes', usuario: 'fparedes' },
    { nombre: 'Paola Illanes', usuario: 'pgillanes' },
    { nombre: 'Romina Carrizo', usuario: 'rcarrizo' },
    { nombre: 'Patricia Palma', usuario: 'ppalma' },
    { nombre: 'Federico Leoz', usuario: 'fleoz' },
    { nombre: 'Lorena Castilla', usuario: 'lcastilla' },
];

function getIniciales(nombre) {
    return nombre.split(' ').map(n => n[0]).join('').toUpperCase();
}

async function run() {
    for (const u of usersToCreate) {
        console.log(`\nCreando ${u.usuario}...`);
        
        // 1. Create User via RPC
        const { data: userId, error: rpcError } = await supabase.rpc('create_user', {
            p_usuario: u.usuario,
            p_nombre: u.nombre,
            p_password: '123456',
            p_iniciales: getIniciales(u.nombre)
        });

        if (rpcError) {
            console.log(`❌ Error creando ${u.usuario}:`, rpcError.message);
            // It might already exist, so we fetch the ID
            const { data: existing } = await supabase.from('admqui_usuarios').select('id').eq('usuario', u.usuario).single();
            if (existing) {
                console.log(`   Ya existe con ID: ${existing.id}`);
                u.id = existing.id;
            } else {
                continue;
            }
        } else {
            console.log(`✅ Creado con ID: ${userId}`);
            u.id = userId;
        }

        // 2. Set module preferences
        const { error: modError } = await supabase.from('user_module_preferences').upsert({
            user_id: u.id,
            usuario: u.usuario,
            selected_modules: ['altas', 'facturacion'],
            completed_onboarding: true
        });

        if (modError) {
            console.log(`❌ Error Mod Prefs para ${u.usuario}:`, modError.message);
        } else {
            console.log(`✅ Módulos configurados para ${u.usuario}`);
        }
    }
}
run();
