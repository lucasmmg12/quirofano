/**
 * doraCalidadService.js
 * Cliente ESTRICTAMENTE DE SOLO LECTURA (SELECT únicamente) contra la base de datos
 * de Dora (Sistema de Gestión de Calidad — Sanatorio Argentino).
 * NUNCA ejecuta insert, update, upsert ni delete sobre Dora.
 */

import { createClient } from '@supabase/supabase-js';

const DORA_SUPABASE_URL = import.meta.env.VITE_DORA_SUPABASE_URL || 'https://tqvmqdydoiukszmymuef.supabase.co';
const DORA_SUPABASE_ANON_KEY = import.meta.env.VITE_DORA_SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxdm1xZHlkb2l1a3N6bXltdWVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODg0NzUsImV4cCI6MjA4Mjc2NDQ3NX0.D-4W6bVhG7-2-mzm_KC6AGdGbzqhT9tcbhfG3qHNIHY';

// Cliente aislado sin persistencia de sesión para no interferir con la sesión principal
const doraReadOnlyClient = createClient(DORA_SUPABASE_URL, DORA_SUPABASE_ANON_KEY, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
    },
});

/**
 * Mapeo oficial de sectores de Gobernanza -> sectores destino en Dora (Calidad)
 */
export const GOBERNANZA_TO_DORA_SECTORS = {
    DXI: [
        'DXI-S1-Diagnostico-Imagenes-Sede-1',
        'DXI-SF-Diagnostico-Imagenes-Sede-Santa-Fe',
        'TC-Tomografia-Computada',
    ],
    UCI: [
        'UCI-Unidad-Cuidados-Intensivos',
        'UTIN-Cuidados-Intensivos-Neonatales',
    ],
    GUARDIA: [
        'GCM-Guardia-Clinica-Medica',
        'GPE-Guardia-Pediatrica',
        'GCA-Guardia-Cardiologica',
        'SR-Shock-Room',
    ],
    QUIROFANO: [
        'QUI-Quirofano',
        'HDD-Hospital-de-Dia',
        'INST-Instrumentadoras',
        'ANST-Anestesia',
    ],
    EPIDEMIOLOGIA: [
        'CDI-Control-de-Infecciones',
    ],
    GUARDIA_GGO: [
        'GGO-Guardia-Gineco-Obstetrica',
    ],
    INTERNACION: [
        'INT-Internado-Adultos',
        'IPE-Internacion-Pediatrica',
    ],
    COMPRAS_STOCK: [
        'CYS-Compras-y-Suministro',
        'FAR-Farmacia',
        'INSUMED-Insumed',
    ],
    CHEQUEO: [
        'CHQ-Chequeo-Medico-Preventivo',
    ],
};

export const DORA_SECTOR_LABELS = {
    'DXI-S1-Diagnostico-Imagenes-Sede-1': 'DXI S1 – Diagnóstico por Imágenes Sede 1',
    'DXI-SF-Diagnostico-Imagenes-Sede-Santa-Fe': 'DXI SF – Diagnóstico por Imágenes Sede Santa Fe',
    'TC-Tomografia-Computada': 'TC – Tomografía Computada',
    'UCI-Unidad-Cuidados-Intensivos': 'UCI – Unidad de Cuidados Intensivos',
    'UTIN-Cuidados-Intensivos-Neonatales': 'UTIN – Cuidados Intensivos Neonatales',
    'GCM-Guardia-Clinica-Medica': 'GCM – Guardia Clínica Médica',
    'GPE-Guardia-Pediatrica': 'GPE – Guardia Pediátrica',
    'GCA-Guardia-Cardiologica': 'GCA – Guardia Cardiológica',
    'SR-Shock-Room': 'SR – Shock Room',
    'QUI-Quirofano': 'QUI – Quirófano',
    'HDD-Hospital-de-Dia': 'HDD – Hospital de Día',
    'INST-Instrumentadoras': 'INST – Instrumentadoras',
    'ANST-Anestesia': 'ANST – Anestesia',
    'CDI-Control-de-Infecciones': 'CDI – Control de Infecciones',
    'GGO-Guardia-Gineco-Obstetrica': 'GGO – Guardia Gineco-Obstétrica',
    'INT-Internado-Adultos': 'INT – Internado Adultos',
    'IPE-Internacion-Pediatrica': 'IPE – Internación Pediátrica',
    'CYS-Compras-y-Suministro': 'CYS – Compras y Suministro',
    'FAR-Farmacia': 'FAR – Farmacia',
    'INSUMED-Insumed': 'INSUMED – Insumos Médicos',
    'CHQ-Chequeo-Medico-Preventivo': 'CHQ – Chequeo Médico Preventivo',
};

export function formatDoraSectorLabel(raw) {
    return DORA_SECTOR_LABELS[raw] || String(raw || 'Sin sector').replace(/-/g, ' ');
}

export function formatDoraStatus(status) {
    const map = {
        resolved: { label: 'Resuelto', tone: 'success' },
        quality_validation: { label: 'Validación Calidad', tone: 'info' },
        pending_resolution: { label: 'Pendiente Resolución', tone: 'warning' },
        pending: { label: 'Pendiente', tone: 'warning' },
        analyzed: { label: 'Analizado', tone: 'info' },
        assignment_rejected: { label: 'Reasignación', tone: 'danger' },
        discarded: { label: 'Descartado', tone: 'muted' },
    };
    return map[status] || { label: status || 'En gestión', tone: 'muted' };
}

const REPORT_SELECT_COLS =
    'id, tracking_id, content, sector, origin_sector, reporter_sector, ai_summary, ai_category, ai_urgency, status, created_at, resolved_at, root_cause, immediate_action, corrective_plan, corrective_action_plan, resolution_notes, quality_observations, finding_type, is_adverse_event, sla_status, assigned_to';

/**
 * Consulta en tiempo real (SOLO LECTURA) todas las OM / reportes de Dora para un sector de Gobernanza.
 */
export async function fetchDoraOportunidadesMejora(sectorId) {
    const sKey = String(sectorId || 'DXI').toUpperCase();
    const doraSectors = GOBERNANZA_TO_DORA_SECTORS[sKey] || [];
    if (!doraSectors.length) {
        return { reports: [], metrics: { total: 0, resueltos: 0, pendientes: 0, validacion: 0, criticos: 0, pctResolucion: 0, avgDiasCierre: null }, doraSectors: [] };
    }

    // 1. Reportes directos donde reports.sector pertenece al sector + asignaciones multi-sector
    const [directRes, assignRes] = await Promise.all([
        doraReadOnlyClient
            .from('reports')
            .select(REPORT_SELECT_COLS)
            .in('sector', doraSectors)
            .neq('status', 'discarded')
            .order('created_at', { ascending: false })
            .limit(500),
        doraReadOnlyClient
            .from('sector_assignments')
            .select('report_id, sector, status, resolution_notes, root_cause, corrective_plan, immediate_action, resolved_at')
            .in('sector', doraSectors)
            .limit(500),
    ]);

    if (directRes.error) throw directRes.error;

    const byId = new Map();
    (directRes.data || []).forEach(r => {
        byId.set(r.id, { ...r, dora_sector_match: r.sector });
    });

    // 2. Traer reportes adicionales que llegaron vía sector_assignments (sin duplicar)
    const extraIds = [];
    const assignByReport = new Map();
    (assignRes.data || []).forEach(a => {
        if (!assignByReport.has(a.report_id)) assignByReport.set(a.report_id, a);
        if (a.report_id && !byId.has(a.report_id)) extraIds.push(a.report_id);
    });

    if (extraIds.length > 0) {
        const uniqueExtra = [...new Set(extraIds)].slice(0, 200);
        const { data: extraReports } = await doraReadOnlyClient
            .from('reports')
            .select(REPORT_SELECT_COLS)
            .in('id', uniqueExtra)
            .neq('status', 'discarded');

        (extraReports || []).forEach(r => {
            const asg = assignByReport.get(r.id);
            byId.set(r.id, {
                ...r,
                dora_sector_match: asg?.sector || r.sector,
                status: asg?.status || r.status,
                resolution_notes: asg?.resolution_notes || r.resolution_notes,
                root_cause: asg?.root_cause || r.root_cause,
                corrective_plan: asg?.corrective_plan || r.corrective_plan,
                immediate_action: asg?.immediate_action || r.immediate_action,
                resolved_at: asg?.resolved_at || r.resolved_at,
            });
        });
    }

    const reports = [...byId.values()].sort(
        (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

    // 3. Métricas ejecutivas en vivo
    const total = reports.length;
    let resueltos = 0;
    let pendientes = 0;
    let validacion = 0;
    let criticos = 0;
    let sumDiasCierre = 0;
    let cntDiasCierre = 0;

    reports.forEach(r => {
        const st = String(r.status || '');
        if (st === 'resolved') resueltos++;
        else if (st === 'quality_validation') validacion++;
        else pendientes++;

        const urg = String(r.ai_urgency || '').toLowerCase();
        if (r.is_adverse_event || urg.includes('crit') || urg.includes('alta') || urg === 'high' || urg === 'critical') {
            criticos++;
        }

        if (r.resolved_at && r.created_at) {
            const diffDays = (new Date(r.resolved_at).getTime() - new Date(r.created_at).getTime()) / 86400000;
            if (Number.isFinite(diffDays) && diffDays >= 0 && diffDays <= 365) {
                sumDiasCierre += diffDays;
                cntDiasCierre++;
            }
        }
    });

    return {
        reports,
        doraSectors,
        metrics: {
            total,
            resueltos,
            pendientes,
            validacion,
            criticos,
            pctResolucion: total > 0 ? Math.round((resueltos / total) * 100) : 0,
            avgDiasCierre: cntDiasCierre > 0 ? Math.round((sumDiasCierre / cntDiasCierre) * 10) / 10 : null,
        },
    };
}
