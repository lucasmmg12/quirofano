import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function deleteTurn() {
    const turnId = '85049918-1e50-43d5-bc52-a097d0b8f5f3';
    console.log(`Borrando el turno con ID: ${turnId} (S024)...`);

    // Delete from turnos_atencion first
    const { error: errorAtencion, count: countAtencion } = await supabase
        .from('turnos_atencion')
        .delete({ count: 'exact' })
        .eq('turno_id', turnId);

    if (errorAtencion) {
        console.error("Error borrando de turnos_atencion:", errorAtencion);
    } else {
        console.log(`Borrados ${countAtencion || 0} registros de turnos_atencion.`);
    }

    // Delete from turnos_cola
    const { error: errorCola, count: countCola } = await supabase
        .from('turnos_cola')
        .delete({ count: 'exact' })
        .eq('id', turnId);

    if (errorCola) {
        console.error("Error borrando de turnos_cola:", errorCola);
    } else {
        console.log(`Borrados ${countCola || 0} registros de turnos_cola.`);
        console.log("Turno eliminado exitosamente del sistema.");
    }
}

deleteTurn();
