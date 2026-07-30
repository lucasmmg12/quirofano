import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Faltan variables de entorno");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const COMPROMISO_WORDS = [
    'pago', 'pagar', 'pagué', 'pague', 'transferencia', 'transferir', 
    'depósito', 'deposito', 'abonar', 'abono', 'listo', 'envié', 'envie',
    'comprobante', 'mañana', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes',
    'cuotas', 'cuota'
];

function isCompromiso(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    return COMPROMISO_WORDS.some(word => lower.includes(word));
}

async function run() {
    console.log("Iniciando recuperación de estados a partir de WhatsApp...");

    // Obtener todos los pacientes que están sin gestionar, en gestion o comprometidos
    const { data: pacientes, error: errPacientes } = await supabase
        .from('deudas_pacientes')
        .select('id, telefono, nombre, categoria')
        .in('categoria', ['sin_gestionar', 'en_gestion', 'comprometido'])
        .not('telefono', 'is', null)
        .neq('telefono', '');

    if (errPacientes) {
        console.error("Error buscando pacientes:", errPacientes);
        return;
    }

    console.log(`Analizando ${pacientes.length} pacientes con teléfono...`);

    let recuperadosEnGestion = 0;
    let recuperadosCancelada = 0;

    for (const p of pacientes) {
        // Buscar mensajes de WhatsApp de este teléfono
        const { data: mensajes } = await supabase
            .from('whatsapp_messages')
            .select('content, direction, created_at')
            .eq('phone', p.telefono)
            .order('created_at', { ascending: false });

        if (!mensajes || mensajes.length === 0) {
            continue; // No hay historial
        }

        let esComprometido = false;
        let ultimoMensajePaciente = "";

        for (const msg of mensajes) {
            if (msg.direction === 'incoming') {
                if (!ultimoMensajePaciente) {
                    ultimoMensajePaciente = msg.content;
                }
                if (isCompromiso(msg.content)) {
                    esComprometido = true;
                    break;
                }
            }
        }

        const nuevaCategoria = esComprometido ? 'deuda_cancelada' : 'en_gestion';
        
        // Si no cambió la categoría, no hacemos spam en el historial (a menos que pase a cancelada)
        if (p.categoria === nuevaCategoria && nuevaCategoria === 'en_gestion') {
            continue; 
        }

        // Actualizamos el paciente
        await supabase
            .from('deudas_pacientes')
            .update({ categoria: nuevaCategoria, updated_at: new Date().toISOString() })
            .eq('id', p.id);

        // Insertamos un registro
        const notaRecuperacion = esComprometido
            ? `🤖 [IA Recuperación]: Se detectaron palabras de pago/cuotas en el historial de WhatsApp. El estado pasó a "Deuda Cancelada". (Último mensaje del paciente: "${ultimoMensajePaciente || 'Audio/Imagen'}")`
            : `🤖 [IA Recuperación]: Se detectaron conversaciones previas por WhatsApp. El estado pasó a "En Gestión".`;

        await supabase
            .from('deudas_seguimiento')
            .insert({
                paciente_id: p.id,
                usuario: 'Sistema IA',
                descripcion: notaRecuperacion,
                tipo: 'whatsapp',
                importante: esComprometido
            });

        if (esComprometido) recuperadosComprometido++;
        else recuperadosEnGestion++;

        console.log(`[${p.nombre}] -> ${nuevaCategoria.toUpperCase()}`);
    }

    console.log("\n=== RESUMEN DE RECUPERACIÓN ===");
    console.log(`Pacientes pasados a EN GESTION: ${recuperadosEnGestion}`);
    console.log(`Pacientes pasados a COMPROMETIDO: ${recuperadosComprometido}`);
    console.log("===============================");
}

run();
