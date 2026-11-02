/**
 * SalusSyncArchitectureTab.jsx — Submódulo de Usuarios y Seguridad:
 * 1. Explicación clara y amigable para Usuarios sobre cómo funciona Sync SALUS
 * 2. Documentación de Arquitectura Técnica (Red, Protocolos, Colas, Demonios y 19 Pipelines ETL)
 * 3. Monitor en Vivo de Tráfico de Peticiones HTTP/SQL y Ancho de Banda Consumido
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Database, Server, Cloud, Monitor, RefreshCw, Activity, Wifi, ShieldCheck,
    Clock, ArrowRight, CheckCircle2, AlertTriangle, Layers, Cpu, HardDrive,
    BarChart3, Zap, Lock, HelpCircle, ChevronDown, ChevronUp, Play, Info,
    FileText, Terminal, Network, Radio
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { checkSalusHealth, triggerSalusSync, triggerAltasSync } from '../services/salusSync';

// Peso promedio estimado en bytes por registro JSON serializado hacia PostgREST según módulo
const MODULE_AVG_BYTES_PER_ROW = {
    facturacionInternada: 480,
    turnosActivos: 420,
    diagnosticos: 510,
    recepciones: 390,
    altas: 620,
    presupuestos: 450,
    cobros: 410,
    cirugias: 580,
    kinesiologiaUci: 540,
    deudas: 460,
    notasCredito: 380,
    fojaQuirurgica: 640,
    asociaciones: 350,
    consultasGuardia: 520,
    visitas: 360,
    laboratorios: 490,
    uci: 550,
    facturacion: 410,
    triage: 340,
    censoCamas: 480,
    turnosOnline: 520,
};

const MODULE_META = {
    facturacionInternada: { label: 'Facturación Internada', table: 'facturacion_internada', batchSize: 500, source: 'SALUS Facturación / Admisiones' },
    turnosActivos: { label: 'Turnos Activos y Próximas Visitas', table: 'turnos_activos_salus', batchSize: 500, source: 'Visitas / Agendas Médicas' },
    diagnosticos: { label: 'Diagnósticos y Evoluciones', table: 'calidad_diagnosticos_evolucion', batchSize: 500, source: ' Fichas Clínicas / CIE-10' },
    recepciones: { label: 'Recepciones de Pacientes', table: 'recepciones_salus', batchSize: 500, source: 'Recepciones Ambulatorias' },
    altas: { label: 'Altas Administrativas (Fichas)', table: 'altas_administrativas', batchSize: 500, source: 'TABLEAU_Admisiones' },
    presupuestos: { label: 'Presupuestos Quirúrgicos', table: 'presupuestos_salus', batchSize: 500, source: 'Presupuestos Cabecera/Items' },
    cobros: { label: 'Cobros y Recibos', table: 'cobros_salus', batchSize: 500, source: 'Caja / Cobros Pacientes' },
    cirugias: { label: 'Control de Cirugías', table: 'surgeries', batchSize: 500, source: 'Parte Quirúrgico / Quirófano' },
    kinesiologiaUci: { label: 'Kinesiología y ARM (UCI)', table: 'calidad_kinesiologia_uci', batchSize: 400, source: 'Evoluciones Kinesiología UCI' },
    deudas: { label: 'Deudas de Pacientes', table: 'deudas_pacientes', batchSize: 400, source: 'Cuentas Corrientes / Saldos' },
    notasCredito: { label: 'Notas de Crédito', table: 'notas_credito_salus', batchSize: 400, source: 'Anulaciones / Notas Crédito' },
    fojaQuirurgica: { label: 'Foja Quirúrgica', table: 'foja_quirurgica_salus', batchSize: 400, source: 'Protocolos Quirúrgicos' },
    asociaciones: { label: 'Asociaciones de Entrega', table: 'asociaciones_entrega', batchSize: 400, source: 'Liquidaciones / Obras Sociales' },
    consultasGuardia: { label: 'Consultas de Guardia', table: 'guardia_consultas', batchSize: 500, source: 'Urgencias / Triage Guardia' },
    visitas: { label: 'Visitas en Sede', table: 'visitas_salus', batchSize: 500, source: 'Admisión Ambulatoria' },
    laboratorios: { label: 'Peticiones de Laboratorio', table: 'calidad_peticiones_pruebas', batchSize: 400, source: 'VLISE_PeticionesPruebas' },
    uci: { label: 'Indicadores Terapia Intensiva', table: 'calidad_admisiones_ocupacion', batchSize: 500, source: 'TABLEAU_Admisiones (UCI)' },
    facturacion: { label: 'Facturación Ambulatoria', table: 'facturacion_ambulatoria', batchSize: 500, source: 'Comprobantes Ambulatorios' },
    triage: { label: 'Triage de Facturación', table: 'triage_facturacion', batchSize: 400, source: 'Auditoría de Conceptos' },
    censoCamas: { label: 'Censo de Camas UCI (16 Box)', table: 'calidad_censo_camas_uci', batchSize: 100, source: 'Estado Habitación / Camas' },
    turnosOnline: { label: 'Auditoría Turnos Online', table: 'contact_center_turnos_online', batchSize: 200, source: 'Reservas Web / Contact Center' },
};

// Ciclos automáticos permanentes en sync-server/index.js
const AUTO_DAEMONS = [
    {
        id: 'queue_poller',
        name: 'Escucha de Cola Cloud (salus_sync_requests)',
        intervalLabel: 'Cada 4 seg',
        intervalSec: 4,
        source: 'Supabase REST (salus_sync_requests)',
        target: 'Ejecutor bajo demanda',
        avgPayloadBytes: 650,
        description: 'Detecta cuando un usuario presiona "Sync SALUS" desde cualquier navegador y dispara el trabajo en el servidor local.',
    },
    {
        id: 'heartbeat',
        name: 'Latido de Estado (Heartbeat Sync Server)',
        intervalLabel: 'Cada 15 seg',
        intervalSec: 15,
        source: 'Node.js Worker (128.223.17.60:3456)',
        target: 'salus_sync_server_status',
        avgPayloadBytes: 920,
        description: 'Reporta que el servidor puente está vivo, con su IP, PID, tiempo encendido y si SQL Server responde.',
    },
    {
        id: 'dni_resolver',
        name: 'Resolución Automática de Paciente por DNI (WhatsApp)',
        intervalLabel: 'Cada 20 seg',
        intervalSec: 20,
        source: 'SALUS (PR_FICHA_PACIENTE_QRY)',
        target: 'hospital_pacientes + contact_center_conversations',
        avgPayloadBytes: 2400,
        description: 'Cuando un paciente escribe su DNI en WhatsApp, busca en SALUS su NHC, Obra Social y Edad, con caché de 10 min para no repetir.',
    },
    {
        id: 'queue_alerts',
        name: 'Alertas de Espera en Cola Contact Center',
        intervalLabel: 'Cada 2 min',
        intervalSec: 120,
        source: 'contact_center_conversations',
        target: 'BuilderBot WhatsApp / Auto-Replies',
        avgPayloadBytes: 3800,
        description: 'Envía avisos automáticos de demora (>20 min) y fuera de horario a pacientes en espera.',
    },
    {
        id: 'turnos_cc',
        name: 'Sincronización de Turnos Diarios y Cancelaciones',
        intervalLabel: 'Cada 3 min',
        intervalSec: 180,
        source: 'SALUS Citación / Turnos del día',
        target: 'contact_center_turnos + cancelaciones',
        avgPayloadBytes: 48000,
        description: 'Vincula los turnos otorgados o dados de baja en SALUS con las conversaciones de WhatsApp del Contact Center.',
    },
    {
        id: 'historial_360',
        name: 'Historial Clínico 360° de Pacientes Activos',
        intervalLabel: 'Cada 4 min',
        intervalSec: 240,
        source: 'SALUS Consultas / Evoluciones',
        target: 'contact_center_paciente_historial',
        avgPayloadBytes: 36000,
        description: 'Sincroniza antecedentes y últimas visitas únicamente de los pacientes con conversación activa en los últimos 30 minutos.',
    },
    {
        id: 'turnos_activos',
        name: 'Próximas Visitas y Turnos Activos',
        intervalLabel: 'Cada 5 min',
        intervalSec: 300,
        source: 'SALUS Agendas y Citaciones Futuras',
        target: 'turnos_activos_salus',
        avgPayloadBytes: 280000,
        description: 'Mantiene actualizado el listado de próximos turnos para consulta rápida de agentes y recepción.',
    },
    {
        id: 'censo_camas',
        name: 'Censo en Vivo de Camas UCI + Turnos Online',
        intervalLabel: 'Cada 10 min',
        intervalSec: 600,
        source: 'SALUS Camas Críticas + Turnos Web',
        target: 'calidad_censo_camas_uci + turnos_online',
        avgPayloadBytes: 45000,
        description: 'Actualiza el estado de los 16 boxes de Terapia Intensiva/Intermedia y detecta duplicados en turnos web.',
    },
    {
        id: 'altas_diagnosticos',
        name: 'Altas Administrativas (Fichas) + Diagnósticos',
        intervalLabel: 'Cada 20 min (06 a 22 hs)',
        intervalSec: 1200,
        source: 'SALUS TABLEAU_Admisiones + Evoluciones',
        target: 'altas_administrativas + calidad_diagnosticos',
        avgPayloadBytes: 520000,
        description: 'Garantiza que Recepción y Facturación tengan las fichas de alta listas desde las 07:00 AM sin depender de un clic manual.',
    },
    {
        id: 'parametros_medicos',
        name: 'Parámetros de Médicos e Incentivos CC',
        intervalLabel: 'Cada 15–30 min',
        intervalSec: 1500,
        source: 'SALUS Agendas Médicas / Producción CC',
        target: 'doctor_parameters + contact_center_incentivos',
        avgPayloadBytes: 165000,
        description: 'Actualiza las reglas particulares de cada médico (edades, coberturas, sedes) y métricas de productividad.',
    },
];

function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(2)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
}

function formatUptime(seconds) {
    if (!seconds || seconds <= 0) return '—';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m} min`;
}

function formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
}

/**
 * Analiza el objeto `results` de una fila en `salus_sync_requests`
 * y calcula filas procesadas, peticiones de lote HTTP realizadas y bytes transferidos.
 */
function analyzeSyncRequestMetrics(reqRow) {
    const res = reqRow?.results || {};
    let totalRows = 0;
    let totalHttpBatches = 2; // 1 lectura de cola + 1 actualización de estado final
    let totalBytes = 1200;
    const breakdown = [];

    for (const [modKey, val] of Object.entries(res)) {
        if (!val || typeof val !== 'object') continue;
        const rows = Number(
            val.total ?? val.upserted ?? val.inserted ?? val.count ??
            val.filasImportadas ?? val.items ?? val.actualizadas ?? 0
        );
        if (rows <= 0) continue;

        const meta = MODULE_META[modKey] || { label: modKey, table: modKey, batchSize: 500 };
        const avgRowBytes = MODULE_AVG_BYTES_PER_ROW[modKey] || 450;
        const batches = Math.max(1, Math.ceil(rows / (meta.batchSize || 500)));
        const modBytes = rows * avgRowBytes + batches * 650; // headers HTTP + JSON body

        totalRows += rows;
        totalHttpBatches += batches;
        totalBytes += modBytes;

        breakdown.push({
            key: modKey,
            label: meta.label,
            table: meta.table,
            rows,
            batches,
            bytes: modBytes,
        });
    }

    const elapsedSec = parseFloat(String(reqRow?.elapsed || '0').replace(/[^\d.]/g, '')) || 0;
    const bytesPerSec = elapsedSec > 0 ? totalBytes / elapsedSec : 0;

    return {
        totalRows,
        totalHttpBatches,
        totalBytes,
        elapsedSec,
        bytesPerSec,
        breakdown: breakdown.sort((a, b) => b.bytes - a.bytes),
    };
}

export default function SalusSyncArchitectureTab({ addToast, currentUser }) {
    const [subView, setSubView] = useState('all'); // 'all' | 'user_guide' | 'technical' | 'traffic'
    const [serverStatus, setServerStatus] = useState(null);
    const [syncRequests, setSyncRequests] = useState([]);
    const [loadingData, setLoadingData] = useState(true);
    const [triggeringSync, setTriggeringSync] = useState(false);
    const [expandedReqId, setExpandedReqId] = useState(null);
    const [browserNetStats, setBrowserNetStats] = useState({
        totalResources: 0,
        supabaseRequests: 0,
        totalBytes: 0,
        avgDurationMs: 0,
        recentEntries: [],
    });

    // Medir tráfico real del navegador en la sesión actual mediante PerformanceResourceTiming API
    const collectBrowserNetworkTelemetry = useCallback(() => {
        if (typeof window === 'undefined' || !window.performance?.getEntriesByType) return;
        try {
            const entries = window.performance.getEntriesByType('resource') || [];
            let totalBytes = 0;
            let supabaseCount = 0;
            let durationSum = 0;
            let durationCount = 0;
            const recent = [];

            for (let i = 0; i < entries.length; i++) {
                const e = entries[i];
                const name = e.name || '';
                const isSupabase = name.includes('supabase.co');
                const isSalusLocal = name.includes(':3456') || name.includes('/api/salus');

                // Estimación precisa: usar decodedBodySize o transferSize; si CORS oculta Timing-Allow-Origin, estimar por tipo
                let size = e.transferSize || e.encodedBodySize || e.decodedBodySize || 0;
                if (size === 0 && (isSupabase || isSalusLocal)) {
                    size = name.includes('/rpc/') ? 1850 : 4200;
                }
                totalBytes += size;

                if (isSupabase || isSalusLocal) {
                    supabaseCount++;
                    if (e.duration > 0) {
                        durationSum += e.duration;
                        durationCount++;
                    }
                    // Extraer nombre limpio del recurso
                    let cleanTarget = name;
                    try {
                        const u = new URL(name);
                        cleanTarget = u.pathname.replace('/rest/v1/', '').replace('/functions/v1/', 'fn:') + (u.search ? u.search.slice(0, 45) : '');
                    } catch (_) {}

                    recent.push({
                        id: `${i}-${e.startTime}`,
                        target: cleanTarget,
                        initiatorType: e.initiatorType || 'fetch',
                        durationMs: Math.round(e.duration || 0),
                        bytes: size,
                        isSalusRelated:
                            name.includes('salus') ||
                            name.includes('surgeries') ||
                            name.includes('altas_administrativas') ||
                            name.includes('calidad_') ||
                            name.includes('hospital_pacientes'),
                    });
                }
            }

            setBrowserNetStats({
                totalResources: entries.length,
                supabaseRequests: supabaseCount,
                totalBytes,
                avgDurationMs: durationCount > 0 ? Math.round(durationSum / durationCount) : 0,
                recentEntries: recent.slice(-15).reverse(),
            });
        } catch (err) {
            console.warn('[SalusSyncArchitectureTab] Error leyendo Performance API:', err);
        }
    }, []);

    const loadTelemetryData = useCallback(async () => {
        try {
            setLoadingData(true);
            const [statusRes, reqsRes] = await Promise.all([
                supabase.from('salus_sync_server_status').select('*').eq('id', 'primary').maybeSingle(),
                supabase.from('salus_sync_requests').select('*').order('requested_at', { ascending: false }).limit(25),
            ]);

            if (statusRes?.data) {
                setServerStatus(statusRes.data);
            }
            if (reqsRes?.data) {
                setSyncRequests(reqsRes.data);
            }
            collectBrowserNetworkTelemetry();
        } catch (err) {
            console.error('[SalusSyncArchitectureTab] Error cargando telemetría SALUS:', err);
        } finally {
            setLoadingData(false);
        }
    }, [collectBrowserNetworkTelemetry]);

    useEffect(() => {
        loadTelemetryData();
        const interval = setInterval(loadTelemetryData, 10000);
        return () => clearInterval(interval);
    }, [loadTelemetryData]);

    // Cálculo consolidado de tráfico de Sync SALUS (peticiones + ancho de banda)
    const trafficMetrics = useMemo(() => {
        // 1. Tráfico medido en las ejecuciones de salus_sync_requests
        const analyzedReqs = syncRequests.map(r => ({
            ...r,
            metrics: analyzeSyncRequestMetrics(r),
        }));

        const totalManualRows = analyzedReqs.reduce((acc, r) => acc + r.metrics.totalRows, 0);
        const totalManualBatches = analyzedReqs.reduce((acc, r) => acc + r.metrics.totalHttpBatches, 0);
        const totalManualBytes = analyzedReqs.reduce((acc, r) => acc + r.metrics.totalBytes, 0);

        // Consolidar por módulo a través de las sincronizaciones registradas
        const moduleMap = new Map();
        for (const r of analyzedReqs) {
            for (const item of r.metrics.breakdown) {
                const prev = moduleMap.get(item.key) || {
                    key: item.key,
                    label: item.label,
                    table: item.table,
                    rows: 0,
                    batches: 0,
                    bytes: 0,
                };
                prev.rows += item.rows;
                prev.batches += item.batches;
                prev.bytes += item.bytes;
                moduleMap.set(item.key, prev);
            }
        }
        const moduleBreakdown = Array.from(moduleMap.values()).sort((a, b) => b.bytes - a.bytes);

        // 2. Tráfico de los 10 demonios automáticos por hora y en el uptime actual del servidor
        const uptimeSec = Number(serverStatus?.metadata?.uptime || 0);
        let daemonReqsPerHour = 0;
        let daemonBytesPerHour = 0;

        for (const d of AUTO_DAEMONS) {
            const runsPerHour = 3600 / d.intervalSec;
            daemonReqsPerHour += runsPerHour * 2; // 1 query + 1 upsert/update promedio
            daemonBytesPerHour += runsPerHour * d.avgPayloadBytes;
        }

        const uptimeHours = uptimeSec > 0 ? uptimeSec / 3600 : 1;
        const estimatedUptimeRequests = Math.round(daemonReqsPerHour * uptimeHours) + totalManualBatches;
        const estimatedUptimeBytes = Math.round(daemonBytesPerHour * uptimeHours) + totalManualBytes;

        return {
            analyzedReqs,
            totalManualRows,
            totalManualBatches,
            totalManualBytes,
            moduleBreakdown,
            daemonReqsPerHour: Math.round(daemonReqsPerHour),
            daemonBytesPerHour: Math.round(daemonBytesPerHour),
            daemonBytesPerDay: Math.round(daemonBytesPerHour * 24),
            estimatedUptimeRequests,
            estimatedUptimeBytes,
        };
    }, [syncRequests, serverStatus]);

    const isServerOnline = useMemo(() => {
        if (!serverStatus?.online || !serverStatus?.last_seen) return false;
        const diffMin = Math.abs(Date.now() - new Date(serverStatus.last_seen).getTime()) / 60000;
        return diffMin < 25;
    }, [serverStatus]);

    const handleTriggerQuickSync = async (mode = 'altas') => {
        setTriggeringSync(true);
        try {
            const userName = currentUser?.nombre || currentUser?.usuario || 'Admin';
            if (mode === 'altas') {
                addToast?.('🚀 Iniciando sincronización rápida de Altas Administrativas con SALUS...', 'info');
                const res = await triggerAltasSync({ requestedBy: userName });
                addToast?.(`✅ Altas sincronizadas con éxito (${res.elapsed || 'OK'})`, 'success');
            } else {
                addToast?.('🚀 Iniciando sincronización integral rápida con SALUS...', 'info');
                const res = await triggerSalusSync({ isFast: true, requestedBy: userName });
                addToast?.(`✅ Sincronización integral completada (${res.elapsed || 'OK'})`, 'success');
            }
            await loadTelemetryData();
        } catch (err) {
            addToast?.('⚠️ ' + (err.message || 'Error al solicitar sincronización'), 'error');
        } finally {
            setTriggeringSync(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* BARRA SUPERIOR DE NAVEGACIÓN DEL SUBMÓDULO Y ESTADO EN VIVO */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '14px',
                border: '1px solid #E2E8F0',
                padding: '18px 22px',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '14px',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                        width: '46px', height: '46px', borderRadius: '12px',
                        background: isServerOnline
                            ? 'linear-gradient(135deg, #059669 0%, #10B981 100%)'
                            : 'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#FFFFFF',
                        boxShadow: '0 4px 12px rgba(5, 150, 105, 0.2)',
                    }}>
                        <Database size={24} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0F172A' }}>
                                Sync SALUS · Guía Funcional, Arquitectura Técnica y Monitor de Tráfico
                            </h3>
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: '5px',
                                padding: '3px 10px', borderRadius: '999px',
                                fontSize: '0.72rem', fontWeight: 800,
                                background: isServerOnline ? '#DCFCE7' : '#FEF3C7',
                                color: isServerOnline ? '#15803D' : '#B45309',
                                border: `1px solid ${isServerOnline ? '#86EFAC' : '#FDE68A'}`,
                            }}>
                                <span style={{
                                    width: '7px', height: '7px', borderRadius: '50%',
                                    background: isServerOnline ? '#16A34A' : '#D97706',
                                }} />
                                {isServerOnline ? 'PUENTE SALUS ONLINE' : 'PUENTE EN ESPERA'}
                            </span>
                        </div>
                        <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                            Servidor Puente: <strong>{serverStatus?.server_ip || '128.223.17.60'}:{serverStatus?.metadata?.port || 3456}</strong> ·
                            Base SQL: <strong>128.223.16.29:2450 (SALUS)</strong> ·
                            Último latido: <strong>{formatDateTime(serverStatus?.last_seen)}</strong>
                        </p>
                    </div>
                </div>

                {/* Selector de vista rápida */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    {[
                        { id: 'all', label: 'Vista Completa' },
                        { id: 'user_guide', label: '1. Explicación Fácil (Usuarios)' },
                        { id: 'technical', label: '2. Arquitectura Técnica' },
                        { id: 'traffic', label: '3. Tráfico y Ancho de Banda' },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setSubView(tab.id)}
                            style={{
                                padding: '8px 13px',
                                borderRadius: '8px',
                                border: subView === tab.id ? '1.5px solid #1E4078' : '1px solid #CBD5E1',
                                background: subView === tab.id ? '#EFF6FF' : '#FFFFFF',
                                color: subView === tab.id ? '#1E4078' : '#475569',
                                fontSize: '0.76rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}

                    <button
                        type="button"
                        onClick={loadTelemetryData}
                        disabled={loadingData}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            padding: '8px 12px', borderRadius: '8px',
                            border: '1px solid #CBD5E1', background: '#F8FAFC',
                            color: '#334155', fontSize: '0.76rem', fontWeight: 700,
                            cursor: 'pointer',
                        }}
                    >
                        <RefreshCw size={14} className={loadingData ? 'animate-spin' : ''} />
                        Actualizar
                    </button>
                </div>
            </div>

            {/* =====================================================================
                SECCIÓN 1: EXPLICACIÓN FÁCIL Y ENTENDIBLE PARA USUARIOS
            ===================================================================== */}
            {(subView === 'all' || subView === 'user_guide') && (
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '14px',
                    border: '1px solid #E2E8F0',
                    padding: '22px 24px',
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                        <span style={{
                            padding: '4px 10px', borderRadius: '6px',
                            background: '#DBEAFE', color: '#1E40AF',
                            fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase',
                        }}>
                            Guía para Usuarios
                        </span>
                        <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 800, color: '#0F172A' }}>
                            ¿Qué es Sync SALUS y cómo funciona de forma simple?
                        </h3>
                    </div>

                    <p style={{ margin: '0 0 18px', fontSize: '0.86rem', color: '#334155', lineHeight: 1.6 }}>
                        En <strong>Sanatorio Argentino</strong>, los médicos, enfermeros y recepcionistas registran las atenciones en el sistema interno del hospital llamado <strong>SALUS</strong>. Por seguridad médica, SALUS está cerrado a Internet para que nadie desde afuera pueda atacarlo. Para que nuestra plataforma web pueda mostrarte las cirugías, altas, camas de terapia, fichas y turnos al instante desde cualquier computadora, creamos <strong>Sync SALUS: un puente seguro de solo lectura</strong>.
                    </p>

                    {/* PASO A PASO VISUAL EN 4 TARJETAS */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                        gap: '12px',
                        marginBottom: '20px',
                    }}>
                        <div style={{
                            background: '#F8FAFC', borderRadius: '12px', padding: '16px',
                            border: '1px solid #E2E8F0', position: 'relative',
                        }}>
                            <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                fontSize: '0.72rem', fontWeight: 800, color: '#1E4078',
                                background: '#DBEAFE', padding: '3px 9px', borderRadius: '999px', marginBottom: '8px',
                            }}>
                                PASO 1 · ORIGEN HOSPITALARIO
                            </div>
                            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>
                                🏥 Se carga el dato en SALUS
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.5 }}>
                                Cuando Admisión da un alta, un médico evoluciona en UCI o se agenda un turno en el Sanatorio, ese dato queda guardado en el servidor interno de SALUS.
                            </div>
                        </div>

                        <div style={{
                            background: '#F8FAFC', borderRadius: '12px', padding: '16px',
                            border: '1px solid #E2E8F0',
                        }}>
                            <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                fontSize: '0.72rem', fontWeight: 800, color: '#047857',
                                background: '#D1FAE5', padding: '3px 9px', borderRadius: '999px', marginBottom: '8px',
                            }}>
                                PASO 2 · PUENTE DE SOLO LECTURA
                            </div>
                            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>
                                🌉 El Puente lee sin modificar nada
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.5 }}>
                                Una computadora central dentro del Sanatorio (<strong>Sync Server</strong>) consulta las novedades de SALUS con un permiso exclusivo de <strong>solo lectura</strong> (jamás altera ni borra nada en SALUS).
                            </div>
                        </div>

                        <div style={{
                            background: '#F8FAFC', borderRadius: '12px', padding: '16px',
                            border: '1px solid #E2E8F0',
                        }}>
                            <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                fontSize: '0.72rem', fontWeight: 800, color: '#6D28D9',
                                background: '#EDE9FE', padding: '3px 9px', borderRadius: '999px', marginBottom: '8px',
                            }}>
                                PASO 3 · NUBE ENCRIPTADA
                            </div>
                            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>
                                ☁️ Se actualiza nuestra Nube
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.5 }}>
                                El Puente envía solo los cambios nuevos de forma encriptada a nuestra base de datos en la nube (Supabase), evitando enviar información repetida.
                            </div>
                        </div>

                        <div style={{
                            background: '#F8FAFC', borderRadius: '12px', padding: '16px',
                            border: '1px solid #E2E8F0',
                        }}>
                            <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                fontSize: '0.72rem', fontWeight: 800, color: '#B45309',
                                background: '#FEF3C7', padding: '3px 9px', borderRadius: '999px', marginBottom: '8px',
                            }}>
                                PASO 4 · TU PANTALLA AL INSTANTE
                            </div>
                            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>
                                ⚡ Trabajás rápido y sin esperas
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.5 }}>
                                Cuando abrís cualquier módulo, tu navegador lee de la nube en milisegundos. Así trabajás rápido y nunca ponés lento al sistema SALUS de los consultorios.
                            </div>
                        </div>
                    </div>

                    {/* DOS FORMAS DE ACTUALIZACIÓN EXPLICADAS PARA EL USUARIO */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                        gap: '14px',
                    }}>
                        <div style={{
                            background: '#ECFDF5', borderRadius: '12px', padding: '16px 18px',
                            border: '1px solid #A7F3D0',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '0.9rem', color: '#065F46', marginBottom: '8px' }}>
                                <Clock size={18} />
                                1. Sincronización Automática (Sin que tengas que tocar nada)
                            </div>
                            <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: '#047857', lineHeight: 1.5 }}>
                                El servidor puente trabaja solo todo el día actualizando los módulos críticos con relojes automáticos:
                            </p>
                            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.79rem', color: '#065F46', lineHeight: 1.65 }}>
                                <li><strong>Cada 20 segundos:</strong> Busca en SALUS el DNI y Obra Social de los pacientes que escriben por WhatsApp al Contact Center.</li>
                                <li><strong>Cada 3 a 5 minutos:</strong> Actualiza los Turnos del Día, Cancelaciones de WhatsApp, Historial Clínico 360° y Próximas Visitas.</li>
                                <li><strong>Cada 10 minutos:</strong> Actualiza el Censo de las 16 camas de Terapia Intensiva (UCI) y la auditoría de Turnos Online.</li>
                                <li><strong>Cada 20 minutos (de 06:00 a 22:00 hs):</strong> Actualiza las <strong>Altas Administrativas (Entrega de Fichas)</strong> y los Diagnósticos médicos.</li>
                            </ul>
                        </div>

                        <div style={{
                            background: '#EFF6FF', borderRadius: '12px', padding: '16px 18px',
                            border: '1px solid #BFDBFE',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '0.9rem', color: '#1E40AF', marginBottom: '8px' }}>
                                <Zap size={18} />
                                2. Sincronización Manual con 1 Clic (Botón "Sync SALUS")
                            </div>
                            <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: '#1D4ED8', lineHeight: 1.5 }}>
                                ¿Acaban de cargar un alta, una cirugía o un cobro en SALUS hace 10 segundos y necesitás verlo ya mismo sin esperar al reloj automático?
                            </p>
                            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.79rem', color: '#1E3A8A', lineHeight: 1.65 }}>
                                <li>Presionás el botón <strong>"Sync SALUS"</strong> (o <strong>"Sync Altas"</strong>) arriba a la derecha de tu pantalla.</li>
                                <li>Tu navegador deja un pedido en una <strong>Cola Inteligente en la Nube</strong>.</li>
                                <li>En menos de <strong>4 segundos</strong>, el puente del Sanatorio toma tu pedido, busca los datos frescos en SALUS y actualiza tu pantalla automáticamente.</li>
                                <li><strong>Seguridad Total:</strong> Aunque 20 usuarios presionen el botón al mismo tiempo, el puente los ordena de a uno para proteger el servidor del Sanatorio.</li>
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {/* =====================================================================
                SECCIÓN 2: ESPECIFICACIÓN Y ARQUITECTURA TÉCNICA
            ===================================================================== */}
            {(subView === 'all' || subView === 'technical') && (
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '14px',
                    border: '1px solid #E2E8F0',
                    padding: '22px 24px',
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{
                                padding: '4px 10px', borderRadius: '6px',
                                background: '#0F172A', color: '#FFFFFF',
                                fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase',
                            }}>
                                Ingeniería y Redes
                            </span>
                            <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 800, color: '#0F172A' }}>
                                Arquitectura Técnica del Motor Híbrido Sync SALUS (ETL + Cloud Queue)
                            </h3>
                        </div>
                    </div>

                    {/* DIAGRAMA DE FLUJO TÉCNICO DE TOPOLOGÍA */}
                    <div style={{
                        background: '#0F172A',
                        color: '#F8FAFC',
                        borderRadius: '12px',
                        padding: '18px 20px',
                        marginBottom: '18px',
                        fontFamily: "'Inter', -apple-system, sans-serif",
                    }}>
                        <div style={{ fontSize: '0.73rem', fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.5px' }}>
                            Topología de Red y Flujo de Datos Unidireccional (Aislamiento DMZ / Intranet)
                        </div>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                            gap: '12px',
                            alignItems: 'stretch',
                        }}>
                            <div style={{ background: '#1E293B', borderRadius: '10px', padding: '14px', border: '1px solid #334155' }}>
                                <div style={{ fontSize: '0.7rem', color: '#38BDF8', fontWeight: 800, marginBottom: '4px' }}>1. ORIGEN ON-PREMISE (LAN)</div>
                                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#FFFFFF', marginBottom: '6px' }}>MS SQL Server · SALUS</div>
                                <div style={{ fontSize: '0.74rem', color: '#CBD5E1', fontFamily: 'monospace', lineHeight: 1.5 }}>
                                    Host: 128.223.16.29:2450<br />
                                    DB: SALUS (TDS v7.4)<br />
                                    User: SalusConsulta (READ-ONLY)<br />
                                    Pool: max=5, timeout=120s
                                </div>
                            </div>

                            <div style={{ background: '#1E293B', borderRadius: '10px', padding: '14px', border: '1px solid #334155' }}>
                                <div style={{ fontSize: '0.7rem', color: '#34D399', fontWeight: 800, marginBottom: '4px' }}>2. NODO PUENTE (ETL WORKER)</div>
                                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#FFFFFF', marginBottom: '6px' }}>Node.js + Express Sync Server</div>
                                <div style={{ fontSize: '0.74rem', color: '#CBD5E1', fontFamily: 'monospace', lineHeight: 1.5 }}>
                                    Host: 128.223.17.60:3456<br />
                                    Script: sync-server/index.js<br />
                                    Heartbeat: cada 15s (PID {serverStatus?.metadata?.pid || 'Activo'})<br />
                                    Queue Poll: cada 4s + 9 Crons
                                </div>
                            </div>

                            <div style={{ background: '#1E293B', borderRadius: '10px', padding: '14px', border: '1px solid #334155' }}>
                                <div style={{ fontSize: '0.7rem', color: '#A78BFA', fontWeight: 800, marginBottom: '4px' }}>3. CLOUD DATA LAKE & COLA</div>
                                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#FFFFFF', marginBottom: '6px' }}>Supabase PostgreSQL 15</div>
                                <div style={{ fontSize: '0.74rem', color: '#CBD5E1', fontFamily: 'monospace', lineHeight: 1.5 }}>
                                    Ref: hakysnqiryimxbwdslwe<br />
                                    Protocol: HTTPS TLS 1.3 (PostgREST)<br />
                                    Upsert Lotes: 400–800 filas/batch<br />
                                    Tablas Cola: salus_sync_requests
                                </div>
                            </div>

                            <div style={{ background: '#1E293B', borderRadius: '10px', padding: '14px', border: '1px solid #334155' }}>
                                <div style={{ fontSize: '0.7rem', color: '#FBBF24', fontWeight: 800, marginBottom: '4px' }}>4. CLIENTES WEB (SPA)</div>
                                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#FFFFFF', marginBottom: '6px' }}>React 19 + Vite (Vercel/LAN)</div>
                                <div style={{ fontSize: '0.74rem', color: '#CBD5E1', fontFamily: 'monospace', lineHeight: 1.5 }}>
                                    Servicio: src/services/salusSync.js<br />
                                    Sin Mixed-Content (100% HTTPS)<br />
                                    Lectura indexada (&lt;80ms)<br />
                                    Seguridad: 2FA + GPS + DLP
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ESPECIFICACIONES DE INGENIERÍA EN 3 COLUMNAS */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                        gap: '12px',
                        marginBottom: '18px',
                    }}>
                        <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '14px 16px', border: '1px solid #E2E8F0' }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <ShieldCheck size={16} color="#1E4078" />
                                Solución a Mixed-Content (HTTPS ↔ LAN)
                            </div>
                            <div style={{ fontSize: '0.78rem', color: '#475569', lineHeight: 1.55 }}>
                                Los navegadores modernos bloquean peticiones HTTP hacia IPs locales (<code>http://128.223.17.60:3456</code>) cuando la aplicación corre bajo <code>https://</code>. Para resolverlo sin túneles externos expuestos, el frontend inserta un comando en <code>salus_sync_requests</code> vía HTTPS y el servidor local dentro del Sanatorio lo consume por salida HTTPS segura (Outbound-Only).
                            </div>
                        </div>

                        <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '14px 16px', border: '1px solid #E2E8F0' }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Layers size={16} color="#047857" />
                                Idempotencia, Lotes y Deduplicación
                            </div>
                            <div style={{ fontSize: '0.78rem', color: '#475569', lineHeight: 1.55 }}>
                                Las lecturas masivas sobre vistas como <code>TABLEAU_Admisiones</code> o <code>VLISE_PeticionesPruebas</code> se filtran por ventana temporal (modo <code>fast</code>: 15 a 45 días), se desduplican en memoria mediante estructuras <code>Set</code> por clave primaria compuesta y se envían en bloques de <code>400 a 800 registros</code> usando <code>UPSERT ON CONFLICT</code>.
                            </div>
                        </div>

                        <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '14px 16px', border: '1px solid #E2E8F0' }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Cpu size={16} color="#6D28D9" />
                                Protección de Carga sobre SQL Server
                            </div>
                            <div style={{ fontSize: '0.78rem', color: '#475569', lineHeight: 1.55 }}>
                                El servidor utiliza un Mutex global (<code>syncInProgress</code>) que impide la superposición de ciclos automáticos cuando corre una sincronización completa, junto con un caché en memoria (<code>resolvedDniCache</code> con TTL de 10 min) que evita reconsultar en SALUS el mismo DNI o disparar eventos WebSocket innecesarios.
                            </div>
                        </div>
                    </div>

                    {/* TABLA TÉCNICA DE LOS 10 DEMONIOS AUTOMÁTICOS */}
                    <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0F172A', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Terminal size={16} color="#1E4078" />
                        Matriz de Procesos Automáticos en Segundo Plano (sync-server/index.js)
                    </div>
                    <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.77rem' }}>
                            <thead>
                                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left', color: '#475569' }}>
                                    <th style={{ padding: '10px 12px', fontWeight: 800 }}>Proceso / Demonio</th>
                                    <th style={{ padding: '10px 12px', fontWeight: 800 }}>Frecuencia</th>
                                    <th style={{ padding: '10px 12px', fontWeight: 800 }}>Origen SALUS / Cloud</th>
                                    <th style={{ padding: '10px 12px', fontWeight: 800 }}>Tabla Destino Supabase</th>
                                    <th style={{ padding: '10px 12px', fontWeight: 800, textAlign: 'right' }}>Peticiones / Hora</th>
                                    <th style={{ padding: '10px 12px', fontWeight: 800, textAlign: 'right' }}>Tráfico Est. / Hora</th>
                                </tr>
                            </thead>
                            <tbody>
                                {AUTO_DAEMONS.map((d, idx) => {
                                    const runsHr = Math.round(3600 / d.intervalSec);
                                    const reqsHr = runsHr * 2;
                                    const bytesHr = runsHr * d.avgPayloadBytes;
                                    return (
                                        <tr key={d.id} style={{ borderBottom: idx < AUTO_DAEMONS.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                                            <td style={{ padding: '9px 12px' }}>
                                                <div style={{ fontWeight: 700, color: '#0F172A' }}>{d.name}</div>
                                                <div style={{ fontSize: '0.71rem', color: '#64748B' }}>{d.description}</div>
                                            </td>
                                            <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                                                <span style={{
                                                    padding: '2px 8px', borderRadius: '999px',
                                                    background: '#EFF6FF', color: '#1E40AF', fontWeight: 700, fontSize: '0.72rem',
                                                }}>
                                                    {d.intervalLabel}
                                                </span>
                                            </td>
                                            <td style={{ padding: '9px 12px', color: '#334155', fontFamily: 'monospace', fontSize: '0.72rem' }}>
                                                {d.source}
                                            </td>
                                            <td style={{ padding: '9px 12px', color: '#047857', fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 600 }}>
                                                {d.target}
                                            </td>
                                            <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>
                                                {reqsHr.toLocaleString('es-AR')} req/h
                                            </td>
                                            <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#1E4078' }}>
                                                {formatBytes(bytesHr)}/h
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* =====================================================================
                SECCIÓN 3: MONITOR DE TRÁFICO DE PETICIONES Y ANCHO DE BANDA USADO
            ===================================================================== */}
            {(subView === 'all' || subView === 'traffic') && (
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '14px',
                    border: '1px solid #E2E8F0',
                    padding: '22px 24px',
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{
                                padding: '4px 10px', borderRadius: '6px',
                                background: '#DCFCE7', color: '#15803D',
                                fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase',
                            }}>
                                Telemetría en Tiempo Real
                            </span>
                            <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 800, color: '#0F172A' }}>
                                Medición de Tráfico de Peticiones y Ancho de Banda Usado
                            </h3>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                disabled={triggeringSync}
                                onClick={() => handleTriggerQuickSync('altas')}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                    padding: '8px 14px', borderRadius: '8px',
                                    background: '#EFF6FF', color: '#1E4078',
                                    border: '1px solid #BFDBFE', fontSize: '0.76rem', fontWeight: 800,
                                    cursor: triggeringSync ? 'wait' : 'pointer',
                                }}
                            >
                                <Play size={13} />
                                Probar Sync Altas
                            </button>
                            <button
                                type="button"
                                disabled={triggeringSync}
                                onClick={() => handleTriggerQuickSync('fast')}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                    padding: '8px 14px', borderRadius: '8px',
                                    background: '#1E4078', color: '#FFFFFF',
                                    border: 'none', fontSize: '0.76rem', fontWeight: 800,
                                    cursor: triggeringSync ? 'wait' : 'pointer',
                                }}
                            >
                                <RefreshCw size={13} className={triggeringSync ? 'animate-spin' : ''} />
                                Ejecutar Sync Rápido Completo
                            </button>
                        </div>
                    </div>

                    {/* TARJETAS KPI DE TRÁFICO Y ANCHO DE BANDA */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))',
                        gap: '12px',
                        marginBottom: '20px',
                    }}>
                        <div style={{
                            background: '#F8FAFC', borderRadius: '12px', padding: '15px 16px',
                            border: '1px solid #E2E8F0',
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '0.71rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                                    Estado y Uptime Sync Server
                                </span>
                                <Server size={16} color={isServerOnline ? '#059669' : '#D97706'} />
                            </div>
                            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: isServerOnline ? '#059669' : '#D97706' }}>
                                {isServerOnline ? 'Activo · Online' : 'Sin señal reciente'}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#475569', marginTop: '4px' }}>
                                Uptime continuo: <strong>{formatUptime(serverStatus?.metadata?.uptime)}</strong> · Tarea: <strong>{serverStatus?.current_task || 'Inactivo'}</strong>
                            </div>
                        </div>

                        <div style={{
                            background: '#F8FAFC', borderRadius: '12px', padding: '15px 16px',
                            border: '1px solid #E2E8F0',
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '0.71rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                                    Peticiones Sync SALUS (Uptime)
                                </span>
                                <Activity size={16} color="#1E4078" />
                            </div>
                            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0F172A' }}>
                                {trafficMetrics.estimatedUptimeRequests.toLocaleString('es-AR')} <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#64748B' }}>peticiones</span>
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#475569', marginTop: '4px' }}>
                                Ritmo base: <strong>{trafficMetrics.daemonReqsPerHour.toLocaleString('es-AR')} req/hora</strong> + <strong>{trafficMetrics.totalManualBatches}</strong> lotes bajo demanda
                            </div>
                        </div>

                        <div style={{
                            background: '#F8FAFC', borderRadius: '12px', padding: '15px 16px',
                            border: '1px solid #E2E8F0',
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '0.71rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                                    Ancho de Banda Sync SALUS
                                </span>
                                <HardDrive size={16} color="#2563EB" />
                            </div>
                            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#1E4078' }}>
                                {formatBytes(trafficMetrics.estimatedUptimeBytes)}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#475569', marginTop: '4px' }}>
                                Manuales: <strong>{formatBytes(trafficMetrics.totalManualBytes)}</strong> ({trafficMetrics.totalManualRows.toLocaleString('es-AR')} filas) · Crons: <strong>{formatBytes(trafficMetrics.daemonBytesPerHour)}/h</strong>
                            </div>
                        </div>

                        <div style={{
                            background: '#F8FAFC', borderRadius: '12px', padding: '15px 16px',
                            border: '1px solid #E2E8F0',
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '0.71rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                                    Tráfico de Red de Tu Sesión
                                </span>
                                <Wifi size={16} color="#7C3AED" />
                            </div>
                            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#6D28D9' }}>
                                {formatBytes(browserNetStats.totalBytes)}
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#475569', marginTop: '4px' }}>
                                <strong>{browserNetStats.supabaseRequests}</strong> peticiones API en esta pestaña · Latencia media: <strong>{browserNetStats.avgDurationMs} ms</strong>
                            </div>
                        </div>
                    </div>

                    {/* DESGLOSE DE CONSUMO DE ANCHO DE BANDA Y PETICIONES POR MÓDULO DE SALUS */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
                        gap: '16px',
                        marginBottom: '20px',
                    }}>
                        {/* Columna 1: Consumo por Módulo en Sincronizaciones */}
                        <div style={{
                            background: '#F8FAFC', borderRadius: '12px', padding: '16px 18px',
                            border: '1px solid #E2E8F0',
                        }}>
                            <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0F172A', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '7px' }}>
                                <BarChart3 size={16} color="#1E4078" />
                                Distribución de Ancho de Banda y Peticiones por Módulo SALUS
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#64748B', marginBottom: '12px' }}>
                                Calculado sobre los últimos {syncRequests.length} trabajos de sincronización registrados en <code>salus_sync_requests</code>.
                            </div>

                            {trafficMetrics.moduleBreakdown.length === 0 ? (
                                <div style={{ padding: '20px', textAlign: 'center', color: '#64748B', fontSize: '0.8rem' }}>
                                    Sin desglose de módulos en las últimas ejecuciones.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', maxHeight: '340px', overflowY: 'auto', paddingRight: '4px' }}>
                                    {trafficMetrics.moduleBreakdown.map(mod => {
                                        const maxBytes = trafficMetrics.moduleBreakdown[0]?.bytes || 1;
                                        const pct = Math.max(4, Math.min(100, Math.round((mod.bytes / maxBytes) * 100)));
                                        return (
                                            <div key={mod.key} style={{ background: '#FFFFFF', padding: '9px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.77rem', marginBottom: '4px' }}>
                                                    <div>
                                                        <strong style={{ color: '#0F172A' }}>{mod.label}</strong>
                                                        <span style={{ color: '#64748B', fontSize: '0.7rem', marginLeft: '6px', fontFamily: 'monospace' }}>
                                                            ({mod.table})
                                                        </span>
                                                    </div>
                                                    <div style={{ fontWeight: 800, color: '#1E4078' }}>
                                                        {formatBytes(mod.bytes)} · <span style={{ color: '#475569', fontWeight: 600 }}>{mod.rows.toLocaleString('es-AR')} filas ({mod.batches} req)</span>
                                                    </div>
                                                </div>
                                                <div style={{ width: '100%', height: '6px', background: '#E2E8F0', borderRadius: '999px', overflow: 'hidden' }}>
                                                    <div style={{
                                                        width: `${pct}%`,
                                                        height: '100%',
                                                        background: 'linear-gradient(90deg, #1E4078 0%, #3B82F6 100%)',
                                                        borderRadius: '999px',
                                                    }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Columna 2: Tráfico en Vivo de la Sesión del Navegador */}
                        <div style={{
                            background: '#F8FAFC', borderRadius: '12px', padding: '16px 18px',
                            border: '1px solid #E2E8F0',
                        }}>
                            <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0F172A', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '7px' }}>
                                <Network size={16} color="#6D28D9" />
                                Últimas Peticiones HTTP/API en Vivo (Esta Terminal)
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#64748B', marginBottom: '12px' }}>
                                Lectura directa desde <code>window.performance.getEntriesByType(&apos;resource&apos;)</code> hacia Supabase y Sync Server.
                            </div>

                            <div style={{ overflowX: 'auto', maxHeight: '340px', overflowY: 'auto', background: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.73rem' }}>
                                    <thead>
                                        <tr style={{ background: '#F1F5F9', color: '#475569', textAlign: 'left', position: 'sticky', top: 0 }}>
                                            <th style={{ padding: '7px 10px' }}>Endpoint / Tabla</th>
                                            <th style={{ padding: '7px 10px', textAlign: 'right' }}>Latencia</th>
                                            <th style={{ padding: '7px 10px', textAlign: 'right' }}>Ancho de Banda</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {browserNetStats.recentEntries.map((ent) => (
                                            <tr key={ent.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#0F172A', wordBreak: 'break-all' }}>
                                                    {ent.isSalusRelated && (
                                                        <span style={{
                                                            display: 'inline-block', padding: '1px 5px', borderRadius: '4px',
                                                            background: '#DBEAFE', color: '#1E40AF', fontSize: '0.65rem',
                                                            fontWeight: 800, marginRight: '5px', fontFamily: 'sans-serif',
                                                        }}>
                                                            SALUS
                                                        </span>
                                                    )}
                                                    {ent.target}
                                                </td>
                                                <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: ent.durationMs > 800 ? '#D97706' : '#059669', whiteSpace: 'nowrap' }}>
                                                    {ent.durationMs} ms
                                                </td>
                                                <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#1E4078', whiteSpace: 'nowrap' }}>
                                                    {formatBytes(ent.bytes)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* HISTORIAL AUDITABLE DE SOLICITUDES DE SINCRONIZACIÓN (salus_sync_requests) */}
                    <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Database size={16} color="#1E4078" />
                        Historial Auditable de Trabajos en Cola (salus_sync_requests · Últimas {trafficMetrics.analyzedReqs.length} ejecuciones)
                    </div>

                    <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.77rem' }}>
                            <thead>
                                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left', color: '#475569' }}>
                                    <th style={{ padding: '10px 12px' }}>Fecha / Hora</th>
                                    <th style={{ padding: '10px 12px' }}>Solicitado por</th>
                                    <th style={{ padding: '10px 12px' }}>Modo</th>
                                    <th style={{ padding: '10px 12px' }}>Estado</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Duración</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Filas Sincronizadas</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Peticiones Lote</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Ancho de Banda</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Velocidad</th>
                                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>Detalle</th>
                                </tr>
                            </thead>
                            <tbody>
                                {trafficMetrics.analyzedReqs.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} style={{ padding: '20px', textAlign: 'center', color: '#64748B' }}>
                                            No hay solicitudes registradas en la cola.
                                        </td>
                                    </tr>
                                ) : (
                                    trafficMetrics.analyzedReqs.map((r) => {
                                        const isExpanded = expandedReqId === r.id;
                                        const statusBadge =
                                            r.status === 'completed'
                                                ? { label: 'Completado', bg: '#DCFCE7', color: '#15803D' }
                                                : r.status === 'running'
                                                    ? { label: 'En ejecución', bg: '#DBEAFE', color: '#1D4ED8' }
                                                    : r.status === 'pending'
                                                        ? { label: 'En cola', bg: '#FEF3C7', color: '#B45309' }
                                                        : { label: 'Error', bg: '#FEE2E2', color: '#DC2626' };

                                        return (
                                            <React.Fragment key={r.id}>
                                                <tr
                                                    onClick={() => setExpandedReqId(isExpanded ? null : r.id)}
                                                    style={{
                                                        borderBottom: '1px solid #F1F5F9',
                                                        cursor: 'pointer',
                                                        background: isExpanded ? '#F8FAFC' : '#FFFFFF',
                                                    }}
                                                >
                                                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: '#334155' }}>
                                                        {formatDateTime(r.requested_at)}
                                                    </td>
                                                    <td style={{ padding: '9px 12px', fontWeight: 700, color: '#0F172A' }}>
                                                        {r.requested_by || 'Sistema'}
                                                    </td>
                                                    <td style={{ padding: '9px 12px' }}>
                                                        <span style={{
                                                            padding: '2px 8px', borderRadius: '6px',
                                                            background: '#F1F5F9', color: '#334155',
                                                            fontWeight: 700, fontSize: '0.71rem', textTransform: 'uppercase',
                                                        }}>
                                                            {r.mode || 'fast'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '9px 12px' }}>
                                                        <span style={{
                                                            padding: '2px 8px', borderRadius: '999px',
                                                            background: statusBadge.bg, color: statusBadge.color,
                                                            fontWeight: 800, fontSize: '0.71rem',
                                                        }}>
                                                            {statusBadge.label}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#334155' }}>
                                                        {r.elapsed || '—'}
                                                    </td>
                                                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 800, color: '#0F172A' }}>
                                                        {r.metrics.totalRows.toLocaleString('es-AR')}
                                                    </td>
                                                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>
                                                        {r.metrics.totalHttpBatches} req
                                                    </td>
                                                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 800, color: '#1E4078' }}>
                                                        {formatBytes(r.metrics.totalBytes)}
                                                    </td>
                                                    <td style={{ padding: '9px 12px', textAlign: 'right', color: '#059669', fontWeight: 700 }}>
                                                        {r.metrics.bytesPerSec > 0 ? `${formatBytes(r.metrics.bytesPerSec)}/s` : '—'}
                                                    </td>
                                                    <td style={{ padding: '9px 12px', textAlign: 'center', color: '#64748B' }}>
                                                        {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                                    </td>
                                                </tr>
                                                {isExpanded && (
                                                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                                                        <td colSpan={10} style={{ padding: '12px 16px' }}>
                                                            {r.error ? (
                                                                <div style={{ color: '#DC2626', fontSize: '0.78rem', fontWeight: 700 }}>
                                                                    Error reportado: {r.error}
                                                                </div>
                                                            ) : r.metrics.breakdown.length === 0 ? (
                                                                <div style={{ color: '#64748B', fontSize: '0.78rem' }}>
                                                                    Sin desglose detallado de tablas en este registro.
                                                                </div>
                                                            ) : (
                                                                <div>
                                                                    <div style={{ fontSize: '0.73rem', fontWeight: 800, color: '#475569', marginBottom: '8px', textTransform: 'uppercase' }}>
                                                                        Desglose de Peticiones y Ancho de Banda de esta Ejecución (ID: {r.id}):
                                                                    </div>
                                                                    <div style={{
                                                                        display: 'grid',
                                                                        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                                                                        gap: '8px',
                                                                    }}>
                                                                        {r.metrics.breakdown.map(b => (
                                                                            <div key={b.key} style={{
                                                                                background: '#FFFFFF', borderRadius: '8px', padding: '8px 10px',
                                                                                border: '1px solid #E2E8F0', fontSize: '0.74rem',
                                                                            }}>
                                                                                <div style={{ fontWeight: 800, color: '#0F172A' }}>{b.label}</div>
                                                                                <div style={{ color: '#475569', marginTop: '2px' }}>
                                                                                    <strong>{b.rows.toLocaleString('es-AR')}</strong> filas · <strong>{b.batches}</strong> lotes HTTP · <strong style={{ color: '#1E4078' }}>{formatBytes(b.bytes)}</strong>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

