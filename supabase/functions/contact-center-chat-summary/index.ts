// Supabase Edge Function: contact-center-chat-summary
// Sanatorio Argentino - Contact Center AI Assistant & Provider Matcher
// Genera resumen ejecutivo de la solicitud del paciente, datos detectados y parámetros automáticos del prestador

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';

Deno.serve(async (req) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    try {
        const body = await req.json();
        const { phone } = body;

        if (!phone) {
            return new Response(JSON.stringify({ error: 'phone is required' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        if (!OPENAI_API_KEY) {
            return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not configured' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // 1. Obtener conversación actual
        const { data: conv } = await supabase
            .from('contact_center_conversations')
            .select('*')
            .eq('phone', phone)
            .maybeSingle();

        // 1.1 Consultar si el paciente tiene turnos online agendados por DNI
        let turnosOnlineInfo = 'Sin turnos online agendados.';
        if (conv?.dni) {
            try {
                const { data: tOnline } = await supabase
                    .from('contact_center_turnos_online')
                    .select('*')
                    .eq('dni', conv.dni)
                    .limit(2);
                if (tOnline && tOnline.length > 0) {
                    turnosOnlineInfo = tOnline.map((t: any) => {
                        const first = Array.isArray(t.turnos) && t.turnos.length > 0 ? t.turnos[0] : null;
                        return `• Profesional: ${t.prestador_nombre || 'Asignado'} | Fecha: ${first?.fechaTurno || t.fechas_resumen} ${first?.horaInicio || ''} hs | Agenda: ${t.agenda_nombre || first?.agenda || ''}`;
                    }).join('\n');
                }
            } catch (tErr) {
                console.warn('[chat-summary] Error consultando turnos online:', tErr);
            }
        }

        // 2. Obtener los mensajes más RECIENTES del chat (orden descendente para tomar los últimos)
        const { data: rawMessages } = await supabase
            .from('whatsapp_messages')
            .select('*')
            .eq('phone', phone)
            .order('created_at', { ascending: false })
            .limit(50);

        // Delimitar la sesión activa actual:
        // No incluir mensajes de conversaciones o consultas finalizadas semanas o meses atrás.
        const sessionMsgs: any[] = [];
        for (const msg of (rawMessages || [])) {
            const content = (msg.content || '').toLowerCase();
            // Si ya recolectamos mensajes de la sesión actual y topamos con un mensaje de cierre previo del sanatorio, cortamos
            if (sessionMsgs.length > 0 && (
                content.includes('damos por finalizada esta conversación') ||
                content.includes('nos sumarías un montón dejándonos 5 estrellas') ||
                content.includes('finalizar atención') ||
                content.includes('cualquier otra consulta estamos a tu disposición') ||
                content.includes('encuesta de satisfacción')
            )) {
                break;
            }
            // Si hay un salto temporal mayor a 4 días con respecto al mensaje más reciente recolectado, es una sesión anterior
            if (sessionMsgs.length > 0) {
                const newestDate = new Date(sessionMsgs[0].created_at).getTime();
                const msgDate = new Date(msg.created_at).getTime();
                if (!isNaN(newestDate) && !isNaN(msgDate) && (newestDate - msgDate) > 4 * 24 * 60 * 60 * 1000) {
                    break;
                }
            }
            sessionMsgs.push(msg);
        }

        // Invertir para presentar la conversación en orden cronológico real a OpenAI
        const messages = sessionMsgs.reverse();

        if (messages.length === 0 && !conv) {
            return new Response(JSON.stringify({ error: 'No messages or conversation found for this phone' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Formatear transcripción para OpenAI
        const chatTranscript = messages.map(m => {
            const role = m.direction === 'incoming' ? 'Paciente' : (m.direction === 'note' ? 'Nota Interna' : (m.sender_name || 'Agente'));
            let text = m.content || `[${m.media_type || 'archivo'}]`;
            const analysis = m.raw_payload?.order_analysis || m.order_analysis;
            if (analysis) {
                text += `\n[FOTO DE ORDEN MÉDICA ANALIZADA:\nEstudio: ${analysis.estudio || ''}\nSolicitante: ${analysis.solicitante || ''}\nMatrícula: ${analysis.matricula || ''}\nDiagnóstico: ${analysis.diagnostico || ''}\nFecha: ${analysis.fecha_solicitud || ''}]`;
            }
            return `${role}: ${text}`;
        }).join('\n\n');

        // 3. Ejecutar análisis con OpenAI GPT-4o
        console.log(`[chat-summary] Analizando conversación para ${phone} con los ${messages.length} mensajes de la sesión activa...`);

        const prompt = `Eres el Asistente Clínico y Administrativo de Inteligencia Artificial del Contact Center de Sanatorio Argentino en San Juan, Argentina.
Tu misión es asistir al OPERADOR humano (las agentes de atención) resumiendo de forma EXACTA y FIEL qué necesita el paciente en su consulta ACTUAL, qué datos aportó y qué médico o estudio solicita.

IMPORTANTE: El paciente NO verá este texto; es exclusivamente para la pantalla de la operadora.
Prioriza ESTRICTAMENTE los mensajes de la consulta actual. NUNCA inventes necesidades ni asumas trámites que el paciente no solicitó en esta conversación.

Analiza el siguiente historial de conversación y los datos del paciente:

DATOS ACTUALES REGISTRADOS EN FICHA:
- Nombre: ${conv?.nombre_completo || 'No informado'}
- DNI: ${conv?.dni || 'No informado'}
- Obra Social: ${conv?.obra_social || 'No informada'}
- Motivo Registrado: ${conv?.motivo_consulta || 'No especificado'}
- Médico/Especialidad en Ficha: ${conv?.medico_o_especialidad || 'No especificado'}
- Teléfono: ${phone}
- TURNOS ONLINE AGENDADOS EN EL SISTEMA:
${turnosOnlineInfo}

HISTORIAL DE LA CONSULTA ACTUAL (Cronológico):
${chatTranscript || 'Sin mensajes de texto todavía.'}

REGLAS CRÍTICAS DE EXTRACCIÓN:
1. NUNCA interpretes verbos, pronombres ni palabras comunes como doctores (ej: 'hacerme', 'hacer', 'sacarme', 'sacar', 'pedirme', 'pedir', 'verme', 'ver', 'atenderme').
2. NUNCA fuerces "Chequeo Preventivo de Salud" a menos que el paciente lo pida con esas palabras exactas ("chequeo preventivo", "circuito preventivo", "chequeo de salud"). Si el paciente solicita un turno médico para una especialidad o profesional, o si solo saluda y aporta datos para un turno sin nombrar el circuito de chequeo, clasifícalo como "Turno nuevo".
3. Si el paciente pide un turno pero aún no especificó especialidad ni médico, descríbelo con fidelidad: ej. "El paciente solicita un turno médico pero aún no especificó especialidad o profesional."
4. Si el paciente menciona explícitamente "chequeo preventivo" o "circuito preventivo":
   - "tipo_tramite": "Chequeo Preventivo de Salud"
   - "doctor_detectado.nombre_aproximado": null
   - "doctor_detectado.estudio_solicitado": "Chequeo Preventivo de Salud"
   - "resumen_solicitud": "El paciente solicita coordinar turno para el Circuito de Chequeo Preventivo de Salud."
5. Si el paciente menciona "prevenir", "programa prevenir", "turno para prevenir":
   - "tipo_tramite": "Programa Prevenir (OSP)"
   - "doctor_detectado.nombre_aproximado": null
   - "doctor_detectado.estudio_solicitado": "Programa Prevenir (Ginecología + Mamografía OSP)"
   - "resumen_solicitud": "El paciente solicita coordinar turno para el Programa Prevenir de Obra Social Provincia (OSP)."

Debes responder ÚNICAMENTE un objeto JSON válido con la siguiente estructura exacta:
{
  "resumen_solicitud": "Resumen conciso, fiel y directo en 1 o 2 oraciones de qué necesita el paciente en esta consulta actual y qué trámite está solicitando",
  "tipo_tramite": "Turno nuevo | Reprogramación de turno | Autorización de estudio | Chequeo Preventivo de Salud | Programa Prevenir (OSP) | Consulta por guardia | Información general | Otro",
  "datos_paciente": {
    "nombre_completo": "Nombre y apellido del paciente detectado o null",
    "dni": "DNI del paciente (solo números) o null",
    "obra_social": "Obra Social o Prepaga (ej: OSP, DAMSUP, OSDE, Particular) o null",
    "fecha_nacimiento": "DD/MM/AAAA o null",
    "telefono": "${phone}",
    "departamento": "Departamento de San Juan (ej: Capital, Rawson, Rivadavia, etc.) o null",
    "es_paciente_existente": true/false/null
  },
  "doctor_detectado": {
    "nombre_aproximado": "Nombre o apellido del médico mencionado por el paciente (ej: 'Correa', 'Correa Gustavo', 'Mariana Godoy', 'Orlando Gomez') o null si no se menciona ningún doctor",
    "especialidad_mencionada": "Especialidad médica mencionada (ej: Medicina Familiar, Cardiología, Ecografía, Pediatría) o null",
    "estudio_solicitado": "Nombre de la práctica o estudio solicitada (ej: Programa Prevenir, Chequeo Preventivo de Salud, Consulta médica, Ecodoppler, etc.) o null"
  }
} `;

        const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o',
                temperature: 0.1,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'user', content: prompt }
                ]
            }),
        });

        if (!aiRes.ok) {
            const errText = await aiRes.text();
            throw new Error(`OpenAI error: HTTP ${aiRes.status} - ${errText}`);
        }

        const aiJson = await aiRes.json();
        const rawContent = aiJson.choices?.[0]?.message?.content || '{}';
        const parsed = JSON.parse(rawContent);

        // 4. Búsqueda automática de parámetros del prestador si se detectó médico
        let matchedDoctor = null;
        let detectedDoctorName = parsed.doctor_detectado?.nombre_aproximado;
        if (!detectedDoctorName && conv?.medico_o_especialidad && !conv.medico_o_especialidad.includes('Circuito') && !conv.medico_o_especialidad.includes('Programa')) {
            detectedDoctorName = conv.medico_o_especialidad;
        }

        const BLOCKED_NAMES = ['hacerme', 'hacer', 'sacar', 'sacarme', 'pedir', 'pedirme', 'ver', 'verme', 'chequeo', 'preventivo', 'prevenir'];
        if (detectedDoctorName && BLOCKED_NAMES.some(b => detectedDoctorName.toLowerCase().includes(b))) {
            detectedDoctorName = null;
            if (parsed.doctor_detectado) parsed.doctor_detectado.nombre_aproximado = null;
        }

        if (detectedDoctorName && detectedDoctorName.length >= 3) {
            const isDoctorFemale = /\b(doctora|dra\.?)\b/i.test(detectedDoctorName) || /\b(doctora|dra\.?)\b/i.test(chatTranscript);
            const isDoctorMale = (/\b(doctor|dr\.?)\b/i.test(detectedDoctorName) || /\b(doctor|dr\.?)\b/i.test(chatTranscript)) && !isDoctorFemale;

            // Limpiar palabras comunes ("dr", "dra", "doctor", "doctora")
            const cleanDocSearch = detectedDoctorName
                .replace(/\b(dr|dra|doctor|doctora)\b\.?/gi, '')
                .replace(/^\([^)]+\)\s*/, '')
                .replace(/\s*\([^)]+\)$/, '')
                .trim();

            const words = cleanDocSearch.split(/\s+/).filter((w: string) => w.length >= 3 && !['ssln', 'sanatorio'].includes(w.toLowerCase()));

            // 1. Prioridad: Búsqueda compuesta con todos los tokens (ej: "Correa" AND "Gustavo")
            if (words.length >= 2) {
                try {
                    let compQuery = supabase
                        .from('contact_center_doctor_parameters')
                        .select('id, profesional_nombre, especialidad, consultorio_actual, condiciones_consulta');

                    for (const w of words) {
                        compQuery = compQuery.ilike('profesional_nombre', `%${w}%`);
                    }

                    const { data: compDocs } = await compQuery.limit(5);
                    if (compDocs && compDocs.length > 0) {
                        const best = compDocs.find((d: any) => d.condiciones_consulta) || compDocs[0];
                        matchedDoctor = {
                            id: best.id,
                            profesional_nombre: best.profesional_nombre,
                            especialidad: best.especialidad,
                            consultorio_actual: best.consultorio_actual,
                            condiciones_consulta: best.condiciones_consulta,
                            coincidencia: words.join(' ')
                        };
                    }
                } catch (compErr) {
                    console.warn('[chat-summary] Error en búsqueda compuesta de doctor:', compErr);
                }
            }

            // 2. Fallback: búsqueda palabra por palabra respetando género
            if (!matchedDoctor) {
                for (const word of words) {
                    const { data: docs } = await supabase
                        .from('contact_center_doctor_parameters')
                        .select('id, profesional_nombre, especialidad, consultorio_actual, condiciones_consulta')
                        .ilike('profesional_nombre', `%${word}%`)
                        .limit(10);

                    if (docs && docs.length > 0) {
                        let best = docs[0];
                        if (isDoctorMale) {
                            best = docs.find((d: any) => !d.profesional_nombre.toUpperCase().includes('DRA.') && d.condiciones_consulta) || 
                                   docs.find((d: any) => !d.profesional_nombre.toUpperCase().includes('DRA.')) || docs[0];
                        } else if (isDoctorFemale) {
                            best = docs.find((d: any) => d.profesional_nombre.toUpperCase().includes('DRA.') && d.condiciones_consulta) || 
                                   docs.find((d: any) => d.profesional_nombre.toUpperCase().includes('DRA.')) || docs[0];
                        } else {
                            best = docs.find((d: any) => d.condiciones_consulta) || docs[0];
                        }

                        matchedDoctor = {
                            id: best.id,
                            profesional_nombre: best.profesional_nombre,
                            especialidad: best.especialidad,
                            consultorio_actual: best.consultorio_actual,
                            condiciones_consulta: best.condiciones_consulta,
                            coincidencia: word
                        };
                        break;
                    }
                }
            }
        }

        // Si no se encontró por médico pero sí por especialidad
        if (!matchedDoctor && parsed.doctor_detectado?.especialidad_mencionada) {
            const spec = parsed.doctor_detectado.especialidad_mencionada.trim();
            if (spec.length >= 4) {
                const { data: docsBySpec } = await supabase
                    .from('contact_center_doctor_parameters')
                    .select('id, profesional_nombre, especialidad, consultorio_actual, condiciones_consulta')
                    .ilike('especialidad', `%${spec}%`)
                    .not('condiciones_consulta', 'is', null)
                    .limit(1);

                if (docsBySpec && docsBySpec.length > 0) {
                    matchedDoctor = {
                        id: docsBySpec[0].id,
                        profesional_nombre: docsBySpec[0].profesional_nombre,
                        especialidad: docsBySpec[0].especialidad,
                        consultorio_actual: docsBySpec[0].consultorio_actual,
                        condiciones_consulta: docsBySpec[0].condiciones_consulta,
                        coincidencia: `Especialidad: ${spec}`
                    };
                }
            }
        }

        const finalSummary = {
            ...parsed,
            prestador_matched: matchedDoctor,
            generated_at: new Date().toISOString(),
        };

        // 5. Persistir en contact_center_conversations
        const updates: Record<string, any> = {
            ai_summary: finalSummary,
            updated_at: new Date().toISOString(),
        };

        // Actualizar campos que la IA detectó y estaban vacíos
        if (parsed.datos_paciente?.nombre_completo && (!conv?.nombre_completo || conv?.nombre_completo.includes('@') || conv?.nombre_completo.startsWith('Paciente'))) {
            updates.nombre_completo = parsed.datos_paciente.nombre_completo;
        }
        if (parsed.datos_paciente?.dni && (!conv?.dni || conv?.dni === 'A verificar')) {
            updates.dni = parsed.datos_paciente.dni;
        }
        if (parsed.datos_paciente?.obra_social && (!conv?.obra_social || conv?.obra_social === 'A consultar')) {
            updates.obra_social = parsed.datos_paciente.obra_social;
        }
        if (parsed.datos_paciente?.fecha_nacimiento && (!conv?.fecha_nacimiento || conv?.fecha_nacimiento === 'No informada')) {
            updates.fecha_nacimiento = parsed.datos_paciente.fecha_nacimiento;
        }
        if (parsed.datos_paciente?.departamento && !conv?.departamento) {
            updates.departamento = parsed.datos_paciente.departamento;
        }
        if (parsed.resumen_solicitud && (!conv?.motivo_consulta || conv?.motivo_consulta === 'Consulta general')) {
            updates.motivo_consulta = parsed.resumen_solicitud.substring(0, 150);
        }
        if (matchedDoctor?.profesional_nombre && !conv?.medico_o_especialidad) {
            updates.medico_o_especialidad = matchedDoctor.profesional_nombre;
        }

        await supabase
            .from('contact_center_conversations')
            .update(updates)
            .eq('phone', phone);

        console.log(`[chat-summary] ✅ Resumen generado y guardado para ${phone}:`, parsed.resumen_solicitud);

        return new Response(
            JSON.stringify({
                ok: true,
                summary: finalSummary,
            }),
            {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    } catch (error: any) {
        console.error('[chat-summary] Error fatal:', error);
        return new Response(
            JSON.stringify({ ok: false, error: error.message || 'Error generando resumen' }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    }
});
