import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Faltan credenciales de Supabase en .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log('--- INICIANDO REGULARIZACIÓN DE CHATS SIN ASIGNAR ---');

    // 1. Obtener chats en 'sin_asignar'
    const { data: chats, error } = await supabase
        .from('contact_center_conversations')
        .select('*')
        .eq('status', 'sin_asignar');

    if (error) {
        console.error('Error al cargar conversaciones:', error);
        return;
    }

    console.log(`Total chats en sin_asignar: ${chats.length}`);

    let autoResueltos = 0;
    let optimizadosSinAsignar = 0;
    let sinCambios = 0;

    for (const chat of chats) {
        // Cargar últimos 10 mensajes
        const { data: messages } = await supabase
            .from('contact_center_messages')
            .select('sender_type, content, created_at')
            .eq('conversation_id', chat.id)
            .order('created_at', { ascending: false })
            .limit(10);

        const msgs = messages || [];
        const lastMsg = msgs[0];
        const lastBotMsg = msgs.find(m => m.sender_type === 'bot' || m.sender_type === 'ai');
        const lastUserMsg = msgs.find(m => m.sender_type === 'user');

        const motivo = (chat.motivo_consulta || '').toLowerCase();
        const stage = chat.bot_stage || '';
        const userText = (lastUserMsg?.content || '').toLowerCase().trim();
        const botText = (lastBotMsg?.content || '').toLowerCase();

        // Criterio 1: Paciente solo consultó su turno
        // Indicadores: bot mostró turnos ("turnos registrados", "turno programado", "para el día"),
        // y el paciente respondió "gracias", "ok", "muchas gracias", "joya", "perfecto", "bueno", "dale", "1"
        // o no hubo reclamo posterior de operador.
        const botDioInfoTurno = botText.includes('turnos registrados') || 
                                botText.includes('turno programado') || 
                                botText.includes('asistencia confirmada') ||
                                botText.includes('para el día') ||
                                stage === 'turno_consultado' ||
                                motivo.includes('consulta de turno');

        const userAgradecioOConfirmo = /^(gracias|muchas gracias|ok|joya|perfecto|bueno|dale|genial|mil gracias|listo|graciass|muchas gracias!|1|asistencia confirmada)/i.test(userText);

        const botDioInfoGeneral = botText.includes('guardia') ||
                                  botText.includes('horario') ||
                                  botText.includes('sede') ||
                                  botText.includes('laboratorio') ||
                                  botText.includes('informes') ||
                                  botText.includes('vacunatorio') ||
                                  stage === 'informacion_respondida';

        const pidioOperador = /humano|operador|agente|asesor|persona|hablar con|2/i.test(userText) ||
                              motivo.includes('humano') ||
                              motivo.includes('operador');

        const quiereNuevoTurno = /sacar turno|nuevo turno|solicitar turno|quiero un turno|pedir turno|3/i.test(userText) ||
                                 motivo.includes('solicitud') ||
                                 motivo.includes('agendar');

        const esReprogOCancel = /reprogramar|cancelar|cambiar turno|anular/i.test(userText) ||
                                motivo.includes('reprogramar') ||
                                motivo.includes('cancelar');

        // Evaluación de Auto-resolución
        const deberiaAutoResolver = !pidioOperador && !quiereNuevoTurno && !esReprogOCancel && (
            (botDioInfoTurno && (userAgradecioOConfirmo || msgs.length <= 4)) ||
            (botDioInfoGeneral && userAgradecioOConfirmo) ||
            motivo.includes('agradecimiento') ||
            motivo.includes('cierre')
        );

        if (deberiaAutoResolver) {
            await supabase
                .from('contact_center_conversations')
                .update({
                    status: 'resuelto',
                    bot_active: false,
                    bot_stage: 'resuelto_bot',
                    resolution_reason: 'Consulta de Turno / Información respondida por Asistente',
                    closed_at: new Date().toISOString()
                })
                .eq('id', chat.id);

            autoResueltos++;
            console.log(`[RESUELTO] Chat ${chat.id} (${chat.contact_name || chat.phone}) -> Auto-resuelto (Consulta atendida)`);
            continue;
        }

        // Si se queda en sin_asignar, optimicemos su motivo y tags para Salus
        let nuevoMotivo = chat.motivo_consulta || 'Atención General';
        let tags = Array.isArray(chat.tags) ? [...chat.tags] : [];

        // Prefijos estandarizados
        if (quiereNuevoTurno || stage.includes('turno') || motivo.includes('turno')) {
            if (!nuevoMotivo.startsWith('[')) {
                nuevoMotivo = `[TURNO] ${nuevoMotivo.replace(/^turno:?\s*/i, '')}`;
            }
        } else if (esReprogOCancel) {
            if (motivo.includes('cancel') || userText.includes('cancel')) {
                if (!nuevoMotivo.startsWith('[')) nuevoMotivo = `[CANCELACIÓN] ${nuevoMotivo}`;
            } else {
                if (!nuevoMotivo.startsWith('[')) nuevoMotivo = `[REPROGRAMACIÓN] ${nuevoMotivo}`;
            }
        } else if (motivo.includes('autoriz') || userText.includes('autoriz') || stage.includes('autoriz')) {
            if (!nuevoMotivo.startsWith('[')) nuevoMotivo = `[AUTORIZACIÓN] ${nuevoMotivo}`;
        } else if (pidioOperador) {
            if (!nuevoMotivo.startsWith('[')) nuevoMotivo = `[OPERADOR] ${nuevoMotivo}`;
        }

        // Triage Completo tag
        const cf = chat.custom_fields || {};
        const hasDni = Boolean(cf.dni && cf.dni.toString().replace(/\D/g, '').length >= 7);
        const hasOs = Boolean(cf.obraSocial && cf.obraSocial.toLowerCase() !== 'a consultar' && cf.obraSocial.trim() !== '');
        const hasProf = Boolean(cf.medico || cf.especialidad);

        if (hasDni && hasOs && hasProf && !tags.some(t => t.toLowerCase() === 'triage completo')) {
            tags.push('Triage Completo');
        }

        const changes = {};
        if (nuevoMotivo !== chat.motivo_consulta) changes.motivo_consulta = nuevoMotivo;
        if (JSON.stringify(tags) !== JSON.stringify(chat.tags)) changes.tags = tags;

        if (Object.keys(changes).length > 0) {
            await supabase
                .from('contact_center_conversations')
                .update(changes)
                .eq('id', chat.id);

            optimizadosSinAsignar++;
            console.log(`[OPTIMIZADO] Chat ${chat.id} (${chat.contact_name || chat.phone}) -> Motivo: ${nuevoMotivo} | Tags: ${tags.join(', ')}`);
        } else {
            sinCambios++;
        }
    }

    console.log('\n--- RESUMEN DE REGULARIZACIÓN ---');
    console.log(`Total analizados: ${chats.length}`);
    console.log(`Auto-resueltos (evitados en sin_asignar): ${autoResueltos}`);
    console.log(`Optimizados en sin_asignar (Salus ready / prefijados): ${optimizadosSinAsignar}`);
    console.log(`Sin cambios requeridos: ${sinCambios}`);
}

run().catch(console.error);
