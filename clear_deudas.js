import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
   console.error("No se encontraron las variables de entorno");
   process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function clearDeudas() {
    try {
        console.log('Borrando tabla deudas_pacientes (con ON DELETE CASCADE a facturas)...');
        const { error } = await supabase
            .from('deudas_pacientes')
            .delete()
            .neq('nhc', 'BORRAR_TODO_FALSO'); // Borra todos los registros

        if (error) throw error;
        console.log('✅ Pacientes y Facturas borrados correctamente.');

        console.log('Borrando historial de importaciones...');
        const { error: errImp } = await supabase
            .from('deudas_importaciones')
            .delete()
            .neq('archivo_nombre', 'BORRAR_FALSO');

        if (errImp) throw errImp;
        console.log('✅ Historial de deudas_importaciones borrado correctamente.');

    } catch (err) {
        console.error('❌ Error al borrar:', err);
    }
}
clearDeudas();
