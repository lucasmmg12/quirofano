import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import {
    Sparkles, Search, FileText, MessageSquare, ShieldCheck, Clock,
    Activity, Pill, Bug, Scissors, Stethoscope, Copy, Printer,
    CheckCircle2, AlertTriangle, UserCheck, Building2, Calendar,
    ChevronRight, RefreshCw, Send, Layers, HeartPulse, ArrowRight
} from 'lucide-react';

/**
 * Construye el texto estructurado de la Epicrisis según el modo/enfoque elegido por el médico.
 */
function buildEpicrisisDocument(dossier, enfoque = 'completa') {
    if (!dossier) return '';
    const adm = dossier.admision_actual || {};
    const p557 = dossier.admision_557 || {};
    const inf = dossier.resumen_infectologico || { antibioticos: [], germenes: [] };
    const cirugias = dossier.cirugias || [];
    const estudios = dossier.estudios_complementarios || [];
    const evs = dossier.evoluciones_cronologicas || [];

    const circuitoStr = (dossier.sectores_recorridos || []).join(' → ') || adm.servicio || 'INTERNADO';
    const medicosStr = (dossier.equipo_medico || []).slice(0, 6).join(' · ') || adm.medico_cabecera || 'Staff Clínica Médica';

    const atbLines = inf.antibioticos?.length > 0
        ? inf.antibioticos.map(a => `  • ${a.antibiotico}: ${a.dias_estimados} día(s) (${a.fecha_inicio} al ${a.fecha_fin}) — [${a.dias_evolucionados} reg. evolutivos]`).join('\n')
        : '  • Sin esquemas antibióticos prolongados documentados en evoluciones.';

    const germenesLines = inf.germenes?.length > 0
        ? inf.germenes.map(g => `  • ${g.germen} (Detectado: ${g.primera_deteccion}) — ${g.extracto || ''}`).join('\n')
        : '  • Sin aislamientos microbiológicos multirresistentes reportados en texto evolutivo.';

    const cirugiasLines = cirugias.length > 0
        ? cirugias.map(c => `  • [${c.fecha_cirugia}] ${c.nombre_cirugia} — Cirujano: ${c.cirujano || 'No esp.'} (${c.especialidad || 'Cirugía'})`).join('\n')
        : '  • Tratamiento médico conservador (sin intervenciones en bloque quirúrgico registradas en el episodio).';

    const estudiosLines = estudios.length > 0
        ? estudios.map(e => `  • ${e.tipo_estudio}: ${e.cantidad} determinación(es) (${e.primera_fecha} al ${e.ultima_fecha})`).join('\n')
        : '  • Laboratorio e imágenes basales de ingreso.';

    // Selección de hitos cronológicos (ingreso, intermedio y últimos registros)
    const hitos = [];
    if (evs.length > 0) {
        const step = Math.max(1, Math.floor(evs.length / 8));
        for (let i = 0; i < evs.length; i += step) {
            hitos.push(evs[i]);
        }
        if (hitos[hitos.length - 1]?.id_visita !== evs[evs.length - 1]?.id_visita) {
            hitos.push(evs[evs.length - 1]);
        }
    }
    const cronologiaLines = hitos.length > 0
        ? hitos.map(h => `  • [${h.fecha} ${h.hora || ''}] ${h.tipo_visita} (${h.profesional || 'Staff'}): ${(h.texto_clinico || '').slice(0, 260)}${(h.texto_clinico || '').length > 260 ? '...' : ''}`).join('\n')
        : '  • Sin evoluciones longitudinales adicionales.';

    if (enfoque === 'infectologico') {
        return [
            `====================================================================`,
            `RESUMEN INFECTOLÓGICO Y ANTIBIOTICOTERAPIA — SANATORIO ARGENTINO`,
            `====================================================================`,
            `PACIENTE: ${dossier.paciente} | NHC: ${dossier.nhc} | DNI: ${dossier.dni || 'S/D'}`,
            `INGRESO: ${adm.fecha_ingreso || 'S/D'} | EGRESO/ACTUAL: ${adm.fecha_alta || 'Internado Activo'} (${dossier.dias_estadia_episodio} días)`,
            `CIRCUITO ASISTENCIAL: ${circuitoStr}`,
            ``,
            `1. DIAGNÓSTICO Y FOCO DE INGRESO (PROTOCOLO 557):`,
            `   • Motivo de Consulta: ${p557.motivo_consulta || 'Evaluación de urgencia'}`,
            `   • Diagnóstico Presuntivo: ${p557.diagnostico_presuntivo || p557.otros_diagnostico || adm.especialidad || 'Clínico'}`,
            `   • Alergias Medicamentosas: ${p557.alergias || 'No'} ${p557.detalle_alergia ? `(${p557.detalle_alergia})` : ''}`,
            ``,
            `2. ESQUEMAS ANTIBIÓTICOS Y DÍAS CUMPLIDOS:`,
            atbLines,
            ``,
            `3. MICROBIOLOGÍA Y CULTIVOS DETECTADOS:`,
            germenesLines,
            ``,
            `4. PROCEDIMIENTOS QUIRÚRGICOS / TOILETTES ASOCIADOS:`,
            cirugiasLines,
            ``,
            `5. EVOLUCIÓN INFECTOLÓGICA RECIENTE:`,
            cronologiaLines
        ].join('\n');
    }

    if (enfoque === 'cronologico') {
        return [
            `====================================================================`,
            `PASE DE SALA CRONOLÓGICO DÍA A DÍA — STAFF CLÍNICA MÉDICA / UCI`,
            `====================================================================`,
            `PACIENTE: ${dossier.paciente} (NHC: ${dossier.nhc}) · Estadía: ${dossier.dias_estadia_episodio} días`,
            `RECORRIDO DE CAMAS: ${circuitoStr} · Cama Actual/Última: ${adm.habitacion || 'S/D'}`,
            `MEDICACIÓN HABITUAL PREVIA: ${dossier.medicacion_previa_conciliada}`,
            ``,
            `INGRESO POR GUARDIA / SHOCK ROOM (PROTOCOLO 557):`,
            `  • Fecha: ${p557.fecha_visita || adm.fecha_ingreso} · Profesional: ${p557.medico_admision || adm.medico_cabecera}`,
            `  • Cuadro de Ingreso: ${p557.enfermedad_actual || p557.motivo_consulta || 'Ver evolución inicial'}`,
            `  • Plan Inicial: ${p557.plan_terapeutico || 'Internación y monitoreo'}`,
            ``,
            `LÍNEA DE TIEMPO DE EVOLUCIONES (${ dossier.total_evoluciones } registros auditados):`,
            evs.slice(-15).map(h => `  • [${h.fecha} ${h.hora || ''}] (${h.profesional}): ${(h.texto_clinico || '').slice(0, 320)}`).join('\n\n')
        ].join('\n');
    }

    // Default: Epicrisis Completa Estructurada (Estándar Médico-Legal & Derivación)
    return [
        `====================================================================`,
        `EPICRISIS MÉDICA ESTRUCTURADA — SANATORIO ARGENTINO (CALIDAD QOAG)`,
        `====================================================================`,
        `1. DATOS FILIATORIOS Y TRAZABILIDAD DE INTERNACIÓN`,
        `   • Paciente: ${dossier.paciente}`,
        `   • NHC: ${dossier.nhc} | DNI: ${dossier.dni || 'S/D'} | Cobertura: ${dossier.obra_social}`,
        `   • Admisión Nº: ${adm.numero_admision || adm.id_admision} | Estado: ${adm.fecha_alta ? `Alta (${adm.fecha_alta})` : 'Internado Activo'}`,
        `   • Fecha de Ingreso: ${adm.fecha_ingreso || 'S/D'} ${adm.hora_ingreso || ''} | Fecha de Egreso: ${adm.fecha_alta || 'En curso'} (${dossier.dias_estadia_episodio} días de estadía)`,
        `   • Circuito de Unidades: ${circuitoStr} (Última Habitación: ${adm.habitacion || 'S/D'})`,
        `   • Equipo Médico Tratante: ${medicosStr}`,
        ``,
        `2. MOTIVO DE INGRESO Y ENFERMEDAD ACTUAL (PROTOCOLO SALUS 557)`,
        `   • Motivo de Ingreso: ${p557.motivo_consulta || 'Ingreso por Guardia Clínica / Shock Room'}`,
        `   • Enfermedad Actual al Ingreso: ${p557.enfermedad_actual || 'Paciente valorado en admisión clínica con requerimiento de internación.'}`,
        `   • Signos Vitales al Ingreso: TA ${p557.signos_vitales_ta || 'S/D'} | FC ${p557.fc || 'S/D'} lpm | FR ${p557.fr || 'S/D'} rpm | SatO2 ${p557.sato2 || 'S/D'}% | Tº ${p557.temperatura || 'S/D'}°C`,
        `   • Diagnóstico de Ingreso: ${p557.diagnostico_presuntivo || p557.otros_diagnostico || adm.especialidad || 'Clínica Médica'}`,
        ``,
        `3. ANTECEDENTES PATOLÓGICOS Y CONCILIACIÓN DE MEDICACIÓN HABITUAL`,
        `   • Patologías Crónicas (APP): ${p557.patologias || 'Sin patologías crónicas adicionales declaradas'}`,
        `   • Medicación Habitual Previa: ${dossier.medicacion_previa_conciliada}`,
        `   • Alergias: ${p557.alergias || 'No refiere'} ${p557.detalle_alergia ? `(${p557.detalle_alergia})` : ''} | Cirugías Previas: ${p557.cirugias_previas || 'No'} ${p557.detalle_cirugias ? `(${p557.detalle_cirugias})` : ''}`,
        `   • Internación en últimos 3 meses: ${p557.internacion_ult_3m || 'No'}`,
        ``,
        `4. RESUMEN EVOLUTIVO POR SISTEMAS E INFECTOLOGÍA (ESTILO HOSPITAL ITALIANO)`,
        `   A) Evolución Clínica y Quirúrgica:`,
        cronologiaLines,
        ``,
        `   B) Infectología, Cultivos y Días de Antibiótico:`,
        atbLines,
        germenesLines,
        ``,
        `   C) Procedimientos Quirúrgicos Realizados:`,
        cirugiasLines,
        ``,
        `5. ESTUDIOS COMPLEMENTARIOS REALIZADOS DURANTE LA INTERNACIÓN`,
        estudiosLines,
        ``,
        `6. CONDICIÓN AL EGRESO E INDICACIONES MÉDICAS CLARAS (RESGUARDO MÉDICO-LEGAL)`,
        `   • Condición al Alta / Motivo: ${adm.motivo_alta || (adm.fecha_alta ? 'Mejoría clínica / Alta hospitalaria' : 'Paciente continúa en seguimiento hospitalario')}`,
        `   • Plan Terapéutico / Indicaciones Registradas: ${p557.plan_terapeutico || (evs[evs.length - 1]?.texto_clinico || '').slice(0, 350)}`,
        `   • Pautas de Alarma y Control Ambulatorio: Control por Consultorio Externo de Clínica Médica en 7 días con resultados pendientes. Concurrir por Guardia Central ante fiebre (>38°C), disnea, dolor agudo o intolerancia oral.`
    ].join('\n');
}

/**
 * Motor determinístico de respuesta clínica anclado estrictamente al NHC seleccionado (Cero mezcla de pacientes).
 */
function answerClinicalQuestion(question, dossier) {
    if (!dossier) return 'Seleccione primero un paciente por NHC.';
    const q = question.toLowerCase();
    const adm = dossier.admision_actual || {};
    const p557 = dossier.admision_557 || {};
    const inf = dossier.resumen_infectologico || { antibioticos: [], germenes: [] };
    const cirugias = dossier.cirugias || [];
    const evs = dossier.evoluciones_cronologicas || [];

    if (q.includes('medicac') || q.includes('tomaba') || q.includes('habitual') || q.includes('antecedente')) {
        return `💊 **Conciliación de Medicación Habitual y Antecedentes — ${dossier.paciente} (NHC ${dossier.nhc})**:\n\n` +
            `• **Medicación Habitual Registrada (Prot. 557):** ${dossier.medicacion_previa_conciliada}\n` +
            `• **Patologías Crónicas (APP):** ${p557.patologias || 'No especificadas'}\n` +
            `• **Alergias:** ${p557.alergias || 'No'} ${p557.detalle_alergia ? `(${p557.detalle_alergia})` : ''}\n` +
            `• **Cirugías Previas:** ${p557.cirugias_previas || 'No'} ${p557.detalle_cirugias ? `(${p557.detalle_cirugias})` : ''}\n` +
            `• **Internación en últimos 3 meses:** ${p557.internacion_ult_3m || 'No'}`;
    }

    if (q.includes('antibi') || q.includes('atb') || q.includes('infecto') || q.includes('germen') || q.includes('bicho') || q.includes('cultivo')) {
        const atbList = inf.antibioticos?.length > 0
            ? inf.antibioticos.map(a => `- **${a.antibiotico}**: **${a.dias_estimados} día(s)** (${a.fecha_inicio} al ${a.fecha_fin}) · *Contexto: "${a.contexto}"*`).join('\n')
            : '- No se detectaron antibióticos sistémicos en el texto de las evoluciones.';
        const germList = inf.germenes?.length > 0
            ? inf.germenes.map(g => `- **${g.germen}** (1ª mención: ${g.primera_deteccion}): *"${g.extracto}"*`).join('\n')
            : '- Sin gérmenes específicos nominalizados en las evoluciones.';
        return `🦠 **Resumen Infectológico y Días de Antibiótico — ${dossier.paciente} (NHC ${dossier.nhc})**:\n\n` +
            `**Antibióticos detectados:**\n${atbList}\n\n**Microbiología / Cultivos:**\n${germList}`;
    }

    if (q.includes('cirug') || q.includes('oper') || q.includes('quirof')) {
        if (cirugias.length === 0) {
            return `✂️ **Intervenciones Quirúrgicas — ${dossier.paciente} (NHC ${dossier.nhc})**:\nNo registra fojas quirúrgicas en \`TABLEAU_Cirugias\` durante este episodio. Antecedentes quirúrgicos previos en Prot. 557: ${p557.cirugias_previas || 'No'} ${p557.detalle_cirugias || ''}.`;
        }
        return `✂️ **Intervenciones Quirúrgicas Registradas (${cirugias.length}) — ${dossier.paciente} (NHC ${dossier.nhc})**:\n\n` +
            cirugias.map(c => `• **${c.fecha_cirugia}** (${c.hora_cirugia || 'S/H'}): **${c.nombre_cirugia}** — Cirujano: *${c.cirujano}* (${c.especialidad}) · Estado: ${c.estado}`).join('\n');
    }

    if (q.includes('indicac') || q.includes('alta') || q.includes('egreso')) {
        const ultimaEv = evs[evs.length - 1];
        return `📋 **Condición de Egreso e Indicaciones — ${dossier.paciente} (NHC ${dossier.nhc})**:\n\n` +
            `• **Estado de Admisión:** ${adm.fecha_alta ? `Alta otorgada el ${adm.fecha_alta} (${adm.motivo_alta || 'Alta médica'})` : `Internado activo en habitación ${adm.habitacion || 'S/D'}`}\n` +
            `• **Plan Terapéutico de Ingreso (Prot. 557):** ${p557.plan_terapeutico || 'No especificado'}\n` +
            `• **Última Evolución Registrada (${ultimaEv?.fecha || 'S/F'} - ${ultimaEv?.profesional || 'Staff'}):**\n"${(ultimaEv?.texto_clinico || 'Sin texto').slice(0, 500)}"`;
    }

    // Default: Resumen cronológico integral
    const ultimas3 = evs.slice(-3).map(e => `• **[${e.fecha}] ${e.profesional}** (*${e.tipo_visita}*): ${(e.texto_clinico || '').slice(0, 250)}...`).join('\n');
    return `🩺 **Síntesis Longitudinal del Paciente — ${dossier.paciente} (NHC ${dossier.nhc})**:\n\n` +
        `• **Estadía:** ${dossier.dias_estadia_episodio} días (${adm.fecha_ingreso} → ${adm.fecha_alta || 'Activo'}) · Circuito: **${(dossier.sectores_recorridos || []).join(' → ')}**\n` +
        `• **Motivo e Ingreso (Prot. 557):** ${p557.motivo_consulta || 'S/D'} — ${p557.diagnostico_presuntivo || adm.especialidad || ''}\n` +
        `• **Medicación Previa:** ${dossier.medicacion_previa_conciliada}\n` +
        `• **Últimas 3 Evoluciones de ${dossier.total_evoluciones} totales:**\n${ultimas3 || 'Sin evoluciones adicionales.'}`;
}

export default function AgenteEpicrisisPanel({ addToast, initialNhc = null }) {
    const [loading, setLoading] = useState(true);
    const [dossiers, setDossiers] = useState([]);
    const [ultimaActualizacion, setUltimaActualizacion] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedNhc, setSelectedNhc] = useState(initialNhc || '109014');
    const [activeMode, setActiveMode] = useState('epicrisis'); // 'epicrisis' | 'copiloto' | 'cronologia'
    const [enfoqueEpicrisis, setEnfoqueEpicrisis] = useState('completa'); // 'completa' | 'infectologico' | 'cronologico'
    const [editableEpicrisis, setEditableEpicrisis] = useState('');
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');

    useEffect(() => {
        fetchDossiers();
    }, []);

    useEffect(() => {
        if (initialNhc) {
            setSelectedNhc(String(initialNhc));
        }
    }, [initialNhc]);

    async function fetchDossiers() {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('app_config')
                .select('value, updated_at')
                .eq('key', 'epicrisis_agente_cache')
                .maybeSingle();

            if (!error && data?.value) {
                const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
                if (parsed?.dossiers && Array.isArray(parsed.dossiers)) {
                    setDossiers(parsed.dossiers);
                    setUltimaActualizacion(parsed.ultima_actualizacion || data.updated_at);
                    if (!initialNhc && parsed.dossiers.length > 0) {
                        const hasRomano = parsed.dossiers.find(d => String(d.nhc) === '109014');
                        setSelectedNhc(hasRomano ? '109014' : String(parsed.dossiers[0].nhc));
                    }
                }
            }
        } catch (err) {
            console.error('Error cargando epicrisis_agente_cache:', err);
        } finally {
            setLoading(false);
        }
    }

    const filteredDossiers = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return dossiers;
        return dossiers.filter(d =>
            String(d.nhc || '').toLowerCase().includes(q) ||
            String(d.dni || '').toLowerCase().includes(q) ||
            (d.paciente || '').toLowerCase().includes(q) ||
            (d.admision_557?.diagnostico_presuntivo || '').toLowerCase().includes(q) ||
            (d.admision_557?.motivo_consulta || '').toLowerCase().includes(q)
        );
    }, [dossiers, searchQuery]);

    const currentDossier = useMemo(() => {
        if (searchQuery.trim()) {
            return filteredDossiers.find(d => String(d.nhc) === String(selectedNhc)) || filteredDossiers[0] || null;
        }
        return dossiers.find(d => String(d.nhc) === String(selectedNhc)) || filteredDossiers[0] || null;
    }, [dossiers, selectedNhc, filteredDossiers, searchQuery]);

    useEffect(() => {
        if (currentDossier) {
            setEditableEpicrisis(buildEpicrisisDocument(currentDossier, enfoqueEpicrisis));
            setChatMessages([
                {
                    role: 'assistant',
                    text: `👋 **Copiloto Clínico activado para ${currentDossier.paciente} (NHC \`${currentDossier.nhc}\`)**.\n` +
                        `Estoy conectado únicamente a los **${currentDossier.total_evoluciones} registros evolutivos**, el **Protocolo 557** y las **${currentDossier.circuito_admisiones?.length || 1} admisiones** de este NHC (sin cruzar datos con otros pacientes).\n\n` +
                        `¿Qué necesitas consultar o resumir de su historia clínica?`
                }
            ]);
        }
    }, [currentDossier, enfoqueEpicrisis]);

    const handleSendQuestion = (customQuestion) => {
        const qText = (customQuestion || chatInput).trim();
        if (!qText || !currentDossier) return;
        const reply = answerClinicalQuestion(qText, currentDossier);
        setChatMessages(prev => [
            ...prev,
            { role: 'user', text: qText },
            { role: 'assistant', text: reply }
        ]);
        if (!customQuestion) setChatInput('');
    };

    const handleCopyEpicrisis = () => {
        navigator.clipboard.writeText(editableEpicrisis);
        if (addToast) addToast('Epicrisis copiada al portapapeles lista para pegar en SALUS', 'success');
    };

    const handlePrintEpicrisis = () => {
        if (!currentDossier) return;
        const win = window.open('', '_blank', 'width=900,height=800');
        if (!win) return;
        win.document.write(`
            <html>
                <head>
                    <title>Epicrisis Oficial - ${currentDossier.paciente} (NHC ${currentDossier.nhc})</title>
                    <style>
                        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 32px; color: #0F172A; line-height: 1.5; }
                        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1E40AF; padding-bottom: 12px; margin-bottom: 20px; }
                        .title { font-size: 18px; font-weight: 800; color: #0D3B66; }
                        .subtitle { font-size: 12px; color: #475569; }
                        pre { white-space: pre-wrap; word-wrap: break-word; font-family: 'Segoe UI', Arial, sans-serif; font-size: 12.5px; background: #F8FAFC; padding: 18px; border: 1px solid #CBD5E1; border-radius: 8px; }
                        .footer { margin-top: 28px; display: flex; justify-content: space-between; font-size: 11px; color: #64748B; border-top: 1px solid #E2E8F0; padding-top: 12px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div>
                            <div class="title">SANATORIO ARGENTINO · SERVICIO DE CLÍNICA MÉDICA & CUIDADOS CRÍTICOS</div>
                            <div class="subtitle">Epicrisis Médica Longitudinal Auditada · ID Único NHC: ${currentDossier.nhc}</div>
                        </div>
                        <div class="subtitle">Fecha de Emisión: ${new Date().toLocaleDateString('es-AR')}</div>
                    </div>
                    <pre>${editableEpicrisis.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
                    <div class="footer">
                        <span>Documento generado por Agente IA de Epicrisis (SALUS Protocolo 557 + Evoluciones)</span>
                        <span>Firma y Sello Médico Tratante: _______________________________</span>
                    </div>
                </body>
            </html>
        `);
        win.document.close();
        win.print();
    };

    if (loading) {
        return (
            <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '40px', textAlign: 'center' }}>
                <RefreshCw size={28} color="#2563EB" style={{ animation: 'spin 1s linear infinite' }} />
                <div style={{ marginTop: '10px', fontWeight: 700, color: '#1E293B' }}>
                    Cargando Dossiers Longitudinales SALUS y Motor IA de Epicrisis...
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* ─── LAYOUT DE 2 COLUMNAS: SELECTOR DE PACIENTES + ÁREA DE TRABAJO IA ─── */}
            <div style={{ display: 'grid', gridTemplateColumns: '330px 1fr', gap: '16px', alignItems: 'start' }}>
                
                {/* COLUMNA IZQUIERDA: BUSCADOR POR NHC Y CASOS EMBLEMÁTICOS */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>🔎 Seleccionar Paciente (NHC)</span>
                        <span style={{ fontSize: '0.7rem', color: '#1E40AF', background: '#EFF6FF', padding: '2px 8px', borderRadius: '6px' }}>
                            {filteredDossiers.length} pac.
                        </span>
                    </div>

                    <div style={{ position: 'relative' }}>
                        <Search size={15} color="#64748B" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Buscar NHC, apellido (ej. Romano, Pintor)..."
                            style={{
                                width: '100%',
                                padding: '8px 10px 8px 32px',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.78rem',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>

                    {/* Lista de Pacientes */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '640px', overflowY: 'auto', paddingRight: '4px' }}>
                        {filteredDossiers.map(d => {
                            const isSelected = String(d.nhc) === String(currentDossier?.nhc);
                            const hasAtb = (d.resumen_infectologico?.antibioticos?.length || 0) > 0;
                            return (
                                <div
                                    key={d.nhc}
                                    onClick={() => setSelectedNhc(d.nhc)}
                                    style={{
                                        padding: '10px 12px',
                                        borderRadius: '10px',
                                        border: isSelected ? '2px solid #2563EB' : '1px solid #E2E8F0',
                                        background: isSelected ? '#EFF6FF' : d.es_caso_emblematico ? '#FFFBEB' : '#F8FAFC',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0F172A' }}>
                                            {d.paciente}
                                        </span>
                                        <span style={{
                                            fontSize: '0.66rem',
                                            fontWeight: 800,
                                            padding: '2px 6px',
                                            borderRadius: '6px',
                                            background: isSelected ? '#1E40AF' : '#E2E8F0',
                                            color: isSelected ? '#FFFFFF' : '#334155',
                                            whiteSpace: 'nowrap'
                                        }}>
                                            NHC {d.nhc}
                                        </span>
                                    </div>

                                    {d.es_caso_emblematico && (
                                        <div style={{
                                            marginTop: '4px',
                                            fontSize: '0.66rem',
                                            fontWeight: 800,
                                            color: '#B45309',
                                            background: '#FEF3C7',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            display: 'inline-block'
                                        }}>
                                            ⭐ {d.etiqueta_caso}
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', fontSize: '0.7rem', color: '#475569', flexWrap: 'wrap' }}>
                                        <span>🛏️ <strong>{d.dias_estadia_episodio}d</strong> estadía</span>
                                        <span>📝 <strong>{d.total_evoluciones}</strong> ev.</span>
                                        {hasAtb && (
                                            <span style={{ color: '#047857', fontWeight: 700 }}>
                                                🦠 {d.resumen_infectologico.antibioticos.length} ATB
                                            </span>
                                        )}
                                        {d.cirugias?.length > 0 && (
                                            <span style={{ color: '#BE185D', fontWeight: 700 }}>
                                                ✂️ {d.cirugias.length} Qx
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* COLUMNA DERECHA: DOSSIER DEL PACIENTE, EPICRISIS IA & COPILOTO */}
                {currentDossier ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        
                        {/* 1. CABECERA DEL PACIENTE + CIRCUITO DE ADMISIONES + ALERTA DE MEDICACIÓN HABITUAL */}
                        <div style={{
                            background: '#FFFFFF',
                            borderRadius: '12px',
                            border: '1px solid #E2E8F0',
                            padding: '16px 20px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: '#0F172A' }}>
                                            {currentDossier.paciente}
                                        </h3>
                                        <span style={{ background: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE', padding: '3px 10px', borderRadius: '8px', fontSize: '0.76rem', fontWeight: 800 }}>
                                            NHC: {currentDossier.nhc}
                                        </span>
                                        <span style={{ background: '#F1F5F9', color: '#334155', padding: '3px 10px', borderRadius: '8px', fontSize: '0.74rem', fontWeight: 700 }}>
                                            DNI: {currentDossier.dni || 'S/D'} · {currentDossier.obra_social}
                                        </span>
                                        <span style={{
                                            background: currentDossier.admision_actual?.fecha_alta ? '#F0FDF4' : '#FEF3C7',
                                            color: currentDossier.admision_actual?.fecha_alta ? '#15803D' : '#B45309',
                                            border: `1px solid ${currentDossier.admision_actual?.fecha_alta ? '#BBF7D0' : '#FDE68A'}`,
                                            padding: '3px 10px',
                                            borderRadius: '8px',
                                            fontSize: '0.74rem',
                                            fontWeight: 800
                                        }}>
                                            {currentDossier.admision_actual?.fecha_alta
                                                ? `Alta: ${currentDossier.admision_actual.fecha_alta}`
                                                : `Internado Activo (Hab. ${currentDossier.admision_actual?.habitacion || 'S/D'})`}
                                        </span>
                                    </div>

                                    {/* Circuito de Sectores Recorridos */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>Circuito Trazado:</span>
                                        {(currentDossier.sectores_recorridos || []).map((sec, idx, arr) => (
                                            <React.Fragment key={sec + idx}>
                                                <span style={{
                                                    fontSize: '0.7rem',
                                                    fontWeight: 800,
                                                    padding: '2px 8px',
                                                    borderRadius: '6px',
                                                    background: sec.includes('UCI') ? '#FEE2E2' : sec.includes('QUIR') ? '#FCE7F3' : sec.includes('SHOCK') ? '#FEF3C7' : '#DBEAFE',
                                                    color: sec.includes('UCI') ? '#991B1B' : sec.includes('QUIR') ? '#9D174D' : sec.includes('SHOCK') ? '#92400E' : '#1E40AF'
                                                }}>
                                                    {sec}
                                                </span>
                                                {idx < arr.length - 1 && <ArrowRight size={12} color="#94A3B8" />}
                                            </React.Fragment>
                                        ))}
                                        <span style={{ fontSize: '0.72rem', color: '#475569', marginLeft: '6px' }}>
                                            · <strong>{currentDossier.dias_estadia_episodio} días</strong> en episodio principal ({currentDossier.total_evoluciones} evoluciones registradas)
                                        </span>
                                    </div>
                                </div>

                                {/* Selector de Modo: Epicrisis vs Copiloto Chat vs Línea de Tiempo */}
                                <div style={{ display: 'flex', gap: '6px', background: '#F1F5F9', padding: '4px', borderRadius: '10px' }}>
                                    {[
                                        { id: 'epicrisis', label: '📄 Epicrisis IA', icon: <FileText size={14} /> },
                                        { id: 'copiloto', label: '💬 Copiloto HC (Chat)', icon: <MessageSquare size={14} /> },
                                        { id: 'cronologia', label: `⏱️ Evoluciones (${currentDossier.total_evoluciones})`, icon: <Clock size={14} /> }
                                    ].map(tab => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveMode(tab.id)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                padding: '7px 12px',
                                                borderRadius: '8px',
                                                border: 'none',
                                                background: activeMode === tab.id ? '#1E40AF' : 'transparent',
                                                color: activeMode === tab.id ? '#FFFFFF' : '#475569',
                                                fontSize: '0.76rem',
                                                fontWeight: 800,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {tab.icon} {tab.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* ALERTA DE CONCILIACIÓN DE MEDICACIÓN HABITUAL Y ANTECEDENTES (ANTI-OMISIÓN) */}
                            <div style={{
                                background: '#FFFBEB',
                                border: '1px solid #FDE68A',
                                borderLeft: '4px solid #D97706',
                                borderRadius: '8px',
                                padding: '10px 14px',
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                                gap: '10px'
                            }}>
                                <div>
                                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#92400E', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <Pill size={13} /> Medicación Habitual Conciliada (Prot. 557)
                                    </div>
                                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#78350F', marginTop: '2px' }}>
                                        {currentDossier.medicacion_previa_conciliada}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#92400E', textTransform: 'uppercase' }}>
                                        🩺 Patologías de Base y Alergias
                                    </div>
                                    <div style={{ fontSize: '0.76rem', color: '#78350F', marginTop: '2px' }}>
                                        <strong>APP:</strong> {currentDossier.admision_557?.patologias || 'S/D'} · <strong>Alergias:</strong> {currentDossier.admision_557?.alergias || 'No'} {currentDossier.admision_557?.detalle_alergia ? `(${currentDossier.admision_557.detalle_alergia})` : ''}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#92400E', textTransform: 'uppercase' }}>
                                        👨‍⚕️ Equipo Médico Tratante (Depurado)
                                    </div>
                                    <div style={{ fontSize: '0.74rem', color: '#78350F', marginTop: '2px' }}>
                                        {(currentDossier.equipo_medico || []).slice(0, 4).join(' · ') || 'Staff Clínica Médica'}
                                    </div>
                                </div>
                            </div>

                            {/* RESUMEN INFECTOLÓGICO Y QUIRÚRGICO RÁPIDO (ESTILO HOSPITAL ITALIANO) */}
                            {((currentDossier.resumen_infectologico?.antibioticos?.length || 0) > 0 || (currentDossier.cirugias?.length || 0) > 0) && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
                                    {/* Antibióticos y días */}
                                    <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '10px 12px' }}>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#166534', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                            <Bug size={14} /> Resumen Infectológico: Antibióticos y Días Cumplidos
                                        </div>
                                        {currentDossier.resumen_infectologico?.antibioticos?.length > 0 ? (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                {currentDossier.resumen_infectologico.antibioticos.map((atb, i) => (
                                                    <span key={i} style={{ background: '#FFFFFF', border: '1px solid #86EFAC', color: '#14532D', padding: '3px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700 }}>
                                                        💊 {atb.antibiotico}: <strong>{atb.dias_estimados}d</strong> ({atb.fecha_inicio.slice(5)} → {atb.fecha_fin.slice(5)})
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <span style={{ fontSize: '0.72rem', color: '#15803D' }}>Sin antibioticoterapia prolongada detectada.</span>
                                        )}
                                        {currentDossier.resumen_infectologico?.germenes?.length > 0 && (
                                            <div style={{ marginTop: '6px', fontSize: '0.7rem', color: '#166534' }}>
                                                <strong>Cultivos / Gérmenes:</strong> {currentDossier.resumen_infectologico.germenes.map(g => g.germen).join(' · ')}
                                            </div>
                                        )}
                                    </div>

                                    {/* Cirugías */}
                                    {currentDossier.cirugias?.length > 0 && (
                                        <div style={{ background: '#FDF2F8', border: '1px solid #FBCFE8', borderRadius: '8px', padding: '10px 12px' }}>
                                            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#9D174D', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                                <Scissors size={14} /> Intervenciones en Quirófano ({currentDossier.cirugias.length})
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                {currentDossier.cirugias.map((c, i) => (
                                                    <div key={i} style={{ fontSize: '0.72rem', color: '#831843' }}>
                                                        • <strong>[{c.fecha_cirugia}]</strong> {c.nombre_cirugia} ({c.cirujano})
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* 2. CONTENIDO SEGÚN MODO ACTIVO */}
                        {activeMode === 'epicrisis' && (
                            <div style={{
                                background: '#FFFFFF',
                                borderRadius: '12px',
                                border: '1px solid #E2E8F0',
                                padding: '16px 20px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '12px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F172A' }}>Enfoque del Resumen IA:</span>
                                        {[
                                            { id: 'completa', label: '🏥 Epicrisis Completa (Alta / Derivación)' },
                                            { id: 'infectologico', label: '🦠 Resumen Infectológico & Días ATB' },
                                            { id: 'cronologico', label: '⏱️ Pase de Sala Cronológico' }
                                        ].map(enf => (
                                            <button
                                                key={enf.id}
                                                onClick={() => setEnfoqueEpicrisis(enf.id)}
                                                style={{
                                                    padding: '6px 12px',
                                                    borderRadius: '8px',
                                                    border: enfoqueEpicrisis === enf.id ? '1.5px solid #1E40AF' : '1px solid #CBD5E1',
                                                    background: enfoqueEpicrisis === enf.id ? '#EFF6FF' : '#FFFFFF',
                                                    color: enfoqueEpicrisis === enf.id ? '#1E40AF' : '#475569',
                                                    fontSize: '0.74rem',
                                                    fontWeight: 700,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {enf.label}
                                            </button>
                                        ))}
                                    </div>

                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            onClick={handleCopyEpicrisis}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                padding: '7px 14px',
                                                borderRadius: '8px',
                                                border: '1px solid #1E40AF',
                                                background: '#1E40AF',
                                                color: '#FFFFFF',
                                                fontSize: '0.76rem',
                                                fontWeight: 800,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <Copy size={14} /> Copiar para SALUS
                                        </button>
                                        <button
                                            onClick={handlePrintEpicrisis}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                padding: '7px 14px',
                                                borderRadius: '8px',
                                                border: '1px solid #059669',
                                                background: '#059669',
                                                color: '#FFFFFF',
                                                fontSize: '0.76rem',
                                                fontWeight: 800,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <Printer size={14} /> Imprimir / PDF Oficial
                                        </button>
                                    </div>
                                </div>

                                <textarea
                                    value={editableEpicrisis}
                                    onChange={(e) => setEditableEpicrisis(e.target.value)}
                                    rows={24}
                                    style={{
                                        width: '100%',
                                        fontFamily: "'JetBrains Mono', 'Consolas', monospace",
                                        fontSize: '0.78rem',
                                        lineHeight: 1.55,
                                        padding: '16px',
                                        borderRadius: '10px',
                                        border: '1px solid #CBD5E1',
                                        background: '#F8FAFC',
                                        color: '#0F172A',
                                        boxSizing: 'border-box',
                                        resize: 'vertical'
                                    }}
                                />
                            </div>
                        )}

                        {activeMode === 'copiloto' && (
                            <div style={{
                                background: '#FFFFFF',
                                borderRadius: '12px',
                                border: '1px solid #E2E8F0',
                                padding: '16px 20px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '12px'
                            }}>
                                {/* Botones de Preguntas Rápidas */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                    {[
                                        '¿Qué medicación habitual tomaba antes de internarse?',
                                        '¿Qué antibióticos recibió, por cuántos días y qué gérmenes tuvo?',
                                        '¿Qué cirugías o procedimientos tuvo en esta internación?',
                                        '¿Cuáles son las indicaciones y condición de alta?',
                                        'Dame la síntesis cronológica de su internación'
                                    ].map((q, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => handleSendQuestion(q)}
                                            style={{
                                                padding: '5px 10px',
                                                borderRadius: '16px',
                                                border: '1px solid #BFDBFE',
                                                background: '#EFF6FF',
                                                color: '#1E40AF',
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            ✨ {q}
                                        </button>
                                    ))}
                                </div>

                                {/* Historial de Chat */}
                                <div style={{
                                    background: '#F8FAFC',
                                    borderRadius: '10px',
                                    border: '1px solid #E2E8F0',
                                    padding: '14px',
                                    maxHeight: '420px',
                                    overflowY: 'auto',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '10px'
                                }}>
                                    {chatMessages.map((m, idx) => (
                                        <div
                                            key={idx}
                                            style={{
                                                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                                                maxWidth: '85%',
                                                background: m.role === 'user' ? '#1E40AF' : '#FFFFFF',
                                                color: m.role === 'user' ? '#FFFFFF' : '#0F172A',
                                                border: m.role === 'user' ? 'none' : '1px solid #CBD5E1',
                                                borderRadius: '10px',
                                                padding: '10px 14px',
                                                fontSize: '0.8rem',
                                                lineHeight: 1.5,
                                                whiteSpace: 'pre-wrap'
                                            }}
                                        >
                                            {m.text}
                                        </div>
                                    ))}
                                </div>

                                {/* Input de pregunta */}
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input
                                        type="text"
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSendQuestion()}
                                        placeholder={`Preguntar sobre NHC ${currentDossier.nhc} (${currentDossier.paciente})...`}
                                        style={{
                                            flex: 1,
                                            padding: '10px 14px',
                                            borderRadius: '8px',
                                            border: '1px solid #CBD5E1',
                                            fontSize: '0.82rem'
                                        }}
                                    />
                                    <button
                                        onClick={() => handleSendQuestion()}
                                        style={{
                                            padding: '10px 18px',
                                            borderRadius: '8px',
                                            border: 'none',
                                            background: '#1E40AF',
                                            color: '#FFFFFF',
                                            fontWeight: 800,
                                            fontSize: '0.8rem',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}
                                    >
                                        <Send size={14} /> Consultar HC
                                    </button>
                                </div>
                            </div>
                        )}

                        {activeMode === 'cronologia' && (
                            <div style={{
                                background: '#FFFFFF',
                                borderRadius: '12px',
                                border: '1px solid #E2E8F0',
                                padding: '16px 20px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px',
                                maxHeight: '600px',
                                overflowY: 'auto'
                            }}>
                                <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#0F172A' }}>
                                    ⏱️ Línea de Tiempo de Evoluciones e Interconsultas en SALUS ({currentDossier.evoluciones_cronologicas?.length || 0} mostradas de {currentDossier.total_evoluciones})
                                </h4>
                                {(currentDossier.evoluciones_cronologicas || []).slice().reverse().map((ev, idx) => (
                                    <div key={ev.id_visita || idx} style={{
                                        background: '#F8FAFC',
                                        borderRadius: '8px',
                                        border: '1px solid #E2E8F0',
                                        borderLeft: ev.tipo_visita?.includes('UCI') ? '4px solid #DC2626' : ev.tipo_visita?.includes('ADMISION') ? '4px solid #2563EB' : '4px solid #10B981',
                                        padding: '10px 14px'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', marginBottom: '4px' }}>
                                            <span style={{ fontWeight: 800, color: '#0F172A' }}>
                                                📅 {ev.fecha} {ev.hora || ''} · <span style={{ color: '#1E40AF' }}>{ev.tipo_visita}</span>
                                            </span>
                                            <span style={{ fontWeight: 700, color: '#475569' }}>
                                                👨‍⚕️ {ev.profesional} ({ev.especialidad || 'Clínica'})
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.78rem', color: '#334155', lineHeight: 1.45 }}>
                                            {ev.texto_clinico}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

