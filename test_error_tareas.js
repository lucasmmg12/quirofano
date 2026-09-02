import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function testInsert() {
    console.log("Testeando inserción en gobernanza_tareas...");
    const { data, error } = await supabase.from('gobernanza_tareas').insert({
        proyecto_id: '15533f6c-df44-42ae-a6f7-e3376d3b58fc', // El nuevo de Guardia Clínica
        titulo: "Test de error",
        estado: 'Pendiente',
        created_by: null // El anon key no tiene ID de usuario a menos que simulemos uno, probaré así.
    }).select().single();

    if (error) {
        console.error("ERROR DEVUELTO POR SUPABASE:", JSON.stringify(error, null, 2));
    } else {
        console.log("ÉXITO:", data);
        // Limpiamos
        await supabase.from('gobernanza_tareas').delete().eq('id', data.id);
    }
}
testInsert();
