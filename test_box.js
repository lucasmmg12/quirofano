import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testBalanceo() {
    const { data: boxes } = await supabase.from('turnos_boxes').select('*');
    const { data: horarios } = await supabase.from('turnos_boxes_horarios').select('*');

    console.log("Boxes:", boxes);
    console.log("Horarios:", horarios);

    const now = new Date();
    const diaSemana = now.getDay();
    const horaActual = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    console.log("Hora actual para comparar:", horaActual, "Dia:", diaSemana);

    const isBoxBloqueado = (boxId) => {
        return horarios
            .filter(h => h.box_id === boxId)
            .some(h => {
                if (h.dia_semana !== null && h.dia_semana !== diaSemana) return false;
                return horaActual >= h.hora_inicio && horaActual < h.hora_fin;
            });
    };

    const disponibles = boxes.filter(box =>
        box.activo && !isBoxBloqueado(box.id) && box.numero !== 99
    );

    console.log("Disponibles:", disponibles.map(b => b.numero));

    if (disponibles.length === 0) {
        console.log("No hay disponibles. Caerá a Box 1.");
        return;
    }

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const { data: turnosEspera } = await supabase
        .from('turnos_cola')
        .select('box_asignado')
        .in('estado', ['esperando', 'llamando'])
        .gte('created_at', hoy.toISOString());

    const conteo = {};
    disponibles.forEach(b => { conteo[b.numero] = 0; });
    (turnosEspera || []).forEach(t => {
        if (conteo[t.box_asignado] !== undefined) {
            conteo[t.box_asignado]++;
        }
    });

    console.log("Turnos esperando:", turnosEspera);
    console.log("Conteo:", conteo);

    let minCount = Infinity;
    for (const box of disponibles) {
        const c = conteo[box.numero] ?? 0;
        if (c < minCount) {
            minCount = c;
        }
    }

    const candidates = disponibles.filter(box => (conteo[box.numero] ?? 0) === minCount);
    console.log("Candidatos para asignar (mínimo " + minCount + "):", candidates.map(b => b.numero));
}

testBalanceo();
