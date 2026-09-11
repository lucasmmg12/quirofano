import React, { useState, useEffect, useMemo } from 'react';
import { 
    X, User, Bed, Calendar, Clock, Activity, FileText, Stethoscope, 
    FlaskConical, HeartPulse, ShieldAlert, CheckCircle2, Phone, 
    MessageSquare, Download, ExternalLink, FileSpreadsheet, AlertTriangle, 
    ChevronRight, Building2, Hash, Heart, RefreshCw, Layers, DollarSign,
    Receipt, Check, Copy, Wind
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import * as XLSX from 'xlsx';
import UciKinesiologiaPanel from './UciKinesiologiaPanel';

/**
 * UciPacienteDossierModal
 * Dossier Clínico y Ficha 360° del Paciente de UCI / Gobernanza.
 * Muestra absolutamente toda la información clínica, diagnóstica,
 * quirúrgica, traslados, guardia, laboratorio y administrativa disponible en SALUS y Supabase.
 */
export default function UciPacienteDossierModal({
    isOpen,
    onClose,
    patient = null,
    historialCamas = [],
    initialTab = 'resumen'
}) {
    const [activeTab, setActiveTab] = useState(initialTab || 'resumen'); // 'resumen' | 'kinesiologia' | 'diagnosticos' | 'estudios' | 'camas' | 'cirugias' | 'guardia' | 'administrativo'
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    // Datos cruzados del paciente
    const [pacienteInfo, setPacienteInfo] = useState(null);
    const [admisionInfo, setAdmisionInfo] = useState(null);
    const [diagnosticos, setDiagnosticos] = useState([]);
    const [peticiones, setPeticiones] = useState([]);
    const [traslados, setTraslados] = useState([]);
    const [cirugias, setCirugias] = useState([]);
    const [consultasGuardia, setConsultasGuardia] = useState([]);
    const [deudasInfo, setDeudasInfo] = useState(null);
    const [presupuestos, setPresupuestos] = useState([]);
    const [kinesiologia, setKinesiologia] = useState([]);

    // Cargar información consolidada en tiempo real cuando se abre el modal
    useEffect(() => {
        if (!isOpen || !patient) return;

        let isMounted = true;
        setLoading(true);
        setActiveTab(initialTab || 'resumen');

        const fetchFullPatientData = async () => {
            try {
                const nhcVal = patient.nhc ? String(patient.nhc).trim() : null;
                const nombreVal = patient.paciente || patient.nombre || '';
                const admisionVal = patient.numero_admision || patient.idAdmision || patient.id || null;
                const dniCandidate = patient.dni ? String(patient.dni).trim() : null;

                // 1. Buscar en hospital_pacientes para rescatar DNI, teléfono, email, sexo
                let hpData = null;
                if (nhcVal) {
                    const { data: hpByNhc } = await supabase
                        .from('hospital_pacientes')
                        .select('*')
                        .eq('nhc', nhcVal)
                        .limit(1)
                        .maybeSingle();
                    hpData = hpByNhc;
                }
                if (!hpData && nombreVal) {
                    const tokens = nombreVal.replace(/,/g, ' ').trim().split(/\s+/).filter(t => t.length > 2);
                    let q = supabase.from('hospital_pacientes').select('*');
                    tokens.slice(0, 3).forEach(token => {
                        q = q.ilike('nombre', `%${token}%`);
                    });
                    const { data: hpByName } = await q.limit(1).maybeSingle();
                    hpData = hpByName;
                }

                const resolvedDni = hpData?.dni || dniCandidate;
                const resolvedNhc = hpData?.nhc || nhcVal;
                const resolvedPhone = hpData?.telefono || null;

                if (isMounted) {
                    setPacienteInfo({
                        ...patient,
                        dni: resolvedDni,
                        nhc: resolvedNhc,
                        telefono: resolvedPhone,
                        email: hpData?.email || null,
                        sexo: hpData?.sexo || null,
                        edad: patient.edad || hpData?.edad || null,
                        centro: hpData?.centro || patient.centro || 'SAN LUIS SUR'
                    });
                }

                // Queries paralelas
                const promises = [];

                // 2. Admisión detallada (altas_administrativas)
                promises.push(
                    (async () => {
                        let admMatch = null;
                        if (admisionVal) {
                            const isNumeric = /^\d+$/.test(String(admisionVal).trim());
                            const filter = isNumeric 
                                ? `numero_admision.eq.${admisionVal},id.eq.${admisionVal}` 
                                : `numero_admision.eq.${admisionVal}`;
                            const { data } = await supabase
                                .from('altas_administrativas')
                                .select('*')
                                .or(filter)
                                .limit(1)
                                .maybeSingle();
                            admMatch = data;
                        }
                        if (!admMatch && nombreVal) {
                            const tokens = nombreVal.replace(/,/g, ' ').trim().split(/\s+/).filter(t => t.length > 2);
                            let q = supabase.from('altas_administrativas').select('*');
                            tokens.slice(0, 2).forEach(t => { q = q.ilike('paciente', `%${t}%`); });
                            const { data } = await q.order('fecha_ingreso', { ascending: false }).limit(1).maybeSingle();
                            admMatch = data;
                        }
                        return { key: 'admision', data: admMatch };
                    })()
                );

                // 3. Diagnósticos de SALUS (calidad_pacientes_diagnosticos)
                promises.push(
                    (async () => {
                        let diags = [];
                        if (resolvedNhc) {
                            const { data } = await supabase
                                .from('calidad_pacientes_diagnosticos')
                                .select('*')
                                .eq('nhc', resolvedNhc)
                                .order('fecha_visita', { ascending: false });
                            diags = data || [];
                        }
                        if (diags.length === 0 && resolvedDni) {
                            const { data } = await supabase
                                .from('calidad_pacientes_diagnosticos')
                                .select('*')
                                .eq('dni', resolvedDni)
                                .order('fecha_visita', { ascending: false });
                            diags = data || [];
                        }
                        if (diags.length === 0 && nombreVal) {
                            const tokens = nombreVal.replace(/,/g, ' ').trim().split(/\s+/).filter(t => t.length > 2);
                            let q = supabase.from('calidad_pacientes_diagnosticos').select('*');
                            tokens.slice(0, 2).forEach(t => { q = q.ilike('paciente', `%${t}%`); });
                            const { data } = await q.order('fecha_visita', { ascending: false }).limit(20);
                            diags = data || [];
                        }
                        return { key: 'diagnosticos', data: diags };
                    })()
                );

                // 4. Peticiones de Pruebas y Estudios (calidad_peticiones_pruebas)
                promises.push(
                    (async () => {
                        let pets = [];
                        // A. Buscar por id_paciente con NHC
                        if (resolvedNhc) {
                            const { data } = await supabase
                                .from('calidad_peticiones_pruebas')
                                .select('*')
                                .eq('id_paciente', resolvedNhc)
                                .order('fecha_solicitud', { ascending: false });
                            if (data && data.length > 0) pets = pets.concat(data);
                        }
                        // B. Buscar por nombre
                        if (nombreVal) {
                            const tokens = nombreVal.replace(/,/g, ' ').trim().split(/\s+/).filter(t => t.length > 2);
                            let q = supabase.from('calidad_peticiones_pruebas').select('*');
                            tokens.slice(0, 2).forEach(t => { q = q.ilike('paciente', `%${t}%`); });
                            const { data } = await q.order('fecha_solicitud', { ascending: false }).limit(30);
                            if (data && data.length > 0) {
                                // Deduplicar por id_peticion
                                const seen = new Set(pets.map(p => p.id_peticion || p.id));
                                data.forEach(d => {
                                    if (!seen.has(d.id_peticion || d.id)) {
                                        seen.add(d.id_peticion || d.id);
                                        pets.push(d);
                                    }
                                });
                            }
                        }
                        return { key: 'peticiones', data: pets };
                    })()
                );

                // 5. Historial de Camas y Traslados (calidad_admisiones_camas_historial)
                promises.push(
                    (async () => {
                        let moves = [];
                        if (admisionVal) {
                            const isNumeric = /^\d+$/.test(String(admisionVal).trim());
                            const filter = isNumeric 
                                ? `numero_admision.eq.${admisionVal},id_admision.eq.${admisionVal}` 
                                : `numero_admision.eq.${admisionVal}`;
                            const { data } = await supabase
                                .from('calidad_admisiones_camas_historial')
                                .select('*')
                                .or(filter)
                                .order('fecha_inicio', { ascending: true });
                            if (data && data.length > 0) moves = data;
                        }
                        if (moves.length === 0 && resolvedNhc) {
                            const { data } = await supabase
                                .from('calidad_admisiones_camas_historial')
                                .select('*')
                                .eq('nhc', resolvedNhc)
                                .order('fecha_inicio', { ascending: true });
                            if (data && data.length > 0) moves = data;
                        }
                        if (moves.length === 0 && (historialCamas || []).length > 0) {
                            moves = historialCamas.filter(h => 
                                (admisionVal && (h.numero_admision === admisionVal || h.id_admision === admisionVal)) ||
                                (resolvedNhc && h.nhc === resolvedNhc) ||
                                (nombreVal && (h.paciente || '').toLowerCase().includes(nombreVal.toLowerCase().slice(0, 8)))
                            ).sort((a, b) => new Date(a.fecha_inicio || 0) - new Date(b.fecha_inicio || 0));
                        }
                        return { key: 'traslados', data: moves };
                    })()
                );

                // 6. Cirugías (surgeries)
                promises.push(
                    (async () => {
                        let surgs = [];
                        if (resolvedDni) {
                            const { data } = await supabase
                                .from('surgeries')
                                .select('*')
                                .eq('dni', resolvedDni)
                                .order('fecha_cirugia', { ascending: false });
                            surgs = data || [];
                        }
                        if (surgs.length === 0 && nombreVal) {
                            const tokens = nombreVal.replace(/,/g, ' ').trim().split(/\s+/).filter(t => t.length > 2);
                            let q = supabase.from('surgeries').select('*');
                            tokens.slice(0, 2).forEach(t => { q = q.ilike('nombre', `%${t}%`); });
                            const { data } = await q.order('fecha_cirugia', { ascending: false }).limit(10);
                            surgs = data || [];
                        }
                        return { key: 'cirugias', data: surgs };
                    })()
                );

                // 7. Guardia Clínica (consultas_guardia)
                promises.push(
                    (async () => {
                        let cgs = [];
                        if (resolvedNhc) {
                            const { data } = await supabase
                                .from('consultas_guardia')
                                .select('*')
                                .eq('nhc', parseInt(resolvedNhc, 10))
                                .order('fecha_visita', { ascending: false });
                            cgs = data || [];
                        }
                        if (cgs.length === 0 && resolvedDni) {
                            const { data } = await supabase
                                .from('consultas_guardia')
                                .select('*')
                                .eq('nif', resolvedDni)
                                .order('fecha_visita', { ascending: false });
                            cgs = data || [];
                        }
                        if (cgs.length === 0 && nombreVal) {
                            const tokens = nombreVal.replace(/,/g, ' ').trim().split(/\s+/).filter(t => t.length > 2);
                            let q = supabase.from('consultas_guardia').select('*');
                            tokens.slice(0, 2).forEach(t => { q = q.ilike('paciente', `%${t}%`); });
                            const { data } = await q.order('fecha_visita', { ascending: false }).limit(10);
                            cgs = data || [];
                        }
                        return { key: 'guardia', data: cgs };
                    })()
                );

                // 8. Deudas y Presupuestos
                promises.push(
                    (async () => {
                        let deudaObj = null;
                        if (resolvedNhc) {
                            const { data } = await supabase
                                .from('deudas_pacientes')
                                .select('*, deudas_facturas(*)')
                                .eq('nhc', resolvedNhc)
                                .maybeSingle();
                            deudaObj = data;
                        }
                        let presup = [];
                        if (resolvedNhc) {
                            const { data } = await supabase
                                .from('presupuestos')
                                .select('*')
                                .eq('nhc', resolvedNhc)
                                .order('fecha', { ascending: false });
                            presup = data || [];
                        }
                        return { key: 'admin', data: { deuda: deudaObj, presupuestos: presup } };
                    })()
                );

                // 9. Kinesiología y Terapia Respiratoria en UCI (calidad_uci_kinesiologia)
                promises.push(
                    (async () => {
                        let kine = [];
                        if (resolvedNhc) {
                            const { data } = await supabase
                                .from('calidad_uci_kinesiologia')
                                .select('*')
                                .eq('nhc', resolvedNhc)
                                .order('fecha_hora', { ascending: true });
                            kine = data || [];
                        }
                        if (kine.length === 0 && nombreVal) {
                            const tokens = nombreVal.replace(/,/g, ' ').trim().split(/\s+/).filter(t => t.length > 2);
                            let q = supabase.from('calidad_uci_kinesiologia').select('*');
                            tokens.slice(0, 2).forEach(t => { q = q.ilike('paciente', `%${t}%`); });
                            const { data } = await q.order('fecha_hora', { ascending: true }).limit(500);
                            kine = data || [];
                        }
                        return { key: 'kinesiologia', data: kine };
                    })()
                );

                const results = await Promise.allSettled(promises);
                if (!isMounted) return;

                results.forEach(res => {
                    if (res.status === 'fulfilled') {
                        const { key, data } = res.value;
                        if (key === 'admision') setAdmisionInfo(data);
                        if (key === 'diagnosticos') setDiagnosticos(data || []);
                        if (key === 'peticiones') setPeticiones(data || []);
                        if (key === 'traslados') setTraslados(data || []);
                        if (key === 'cirugias') setCirugias(data || []);
                        if (key === 'guardia') setConsultasGuardia(data || []);
                        if (key === 'kinesiologia') setKinesiologia(data || []);
                        if (key === 'admin') {
                            setDeudasInfo(data?.deuda || null);
                            setPresupuestos(data?.presupuestos || []);
                        }
                    }
                });

            } catch (err) {
                console.error('Error fetching patient dossier:', err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchFullPatientData();

        return () => {
            isMounted = false;
        };
    }, [isOpen, patient, historialCamas]);

    if (!isOpen || !patient) return null;

    const currentName = pacienteInfo?.paciente || patient.paciente || 'PACIENTE';
    const currentNhc = pacienteInfo?.nhc || patient.nhc || '-';
    const currentDni = pacienteInfo?.dni || patient.dni || '-';
    const currentPhone = pacienteInfo?.telefono || cirugias[0]?.telefono || null;
    const currentAdmision = admisionInfo?.numero_admision || patient.numero_admision || patient.id || '-';
    const currentCliente = admisionInfo?.cliente || patient.cliente || 'Particular';
    const currentDoctor = admisionInfo?.doctor || 'Sin médico asignado';
    const currentProceso = admisionInfo?.proceso || patient.especialidad || 'UCI';
    const isActive = !patient.fechaAlta && (!admisionInfo?.fecha_alta);

    // Copiar resumen al portapapeles
    const handleCopySummary = () => {
        const text = `SANATORIO ARGENTINO - FICHA CLÍNICA DE PACIENTE
Nombre: ${currentName}
DNI: ${currentDni} | NHC: ${currentNhc} | Tel: ${currentPhone || 'No registrado'}
Admisión: ${currentAdmision} | Obra Social: ${currentCliente}
Médico: ${currentDoctor} | Servicio: ${currentProceso}
Estado: ${isActive ? 'Internado Activo' : 'Alta / Egresado'}
Diagnósticos registrados: ${diagnosticos.length}
Estudios/Peticiones: ${peticiones.length}
Cirugías: ${cirugias.length}
Movimientos de Cama: ${traslados.length}`;
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Exportar a Excel
    const handleExportExcel = () => {
        const wb = XLSX.utils.book_new();

        // Hoja 1: Resumen
        const resumenData = [
            ['FICHA CLÍNICA INTEGRAL 360° - SANATORIO ARGENTINO', ''],
            ['Fecha de Reporte', new Date().toLocaleString('es-AR')],
            ['', ''],
            ['DATOS DEL PACIENTE', ''],
            ['Nombre Completo', currentName],
            ['DNI', currentDni],
            ['NHC (Historia Clínica)', currentNhc],
            ['Edad', `${patient.edad || pacienteInfo?.edad || '-'} años`],
            ['Sexo', pacienteInfo?.sexo || '-'],
            ['Teléfono', currentPhone || 'No registrado'],
            ['Obra Social / Cobertura', currentCliente],
            ['', ''],
            ['DATOS DE INTERNACIÓN', ''],
            ['N° Admisión', currentAdmision],
            ['Servicio / Proceso', currentProceso],
            ['Médico Tratante', currentDoctor],
            ['Fecha Ingreso', patient.fechaIngreso ? new Date(patient.fechaIngreso).toLocaleDateString('es-AR') : '-'],
            ['Fecha Alta', patient.fechaAlta ? new Date(patient.fechaAlta).toLocaleDateString('es-AR') : 'Activo'],
            ['Estado / Motivo Egreso', patient.motivoAlta || admisionInfo?.motivo_alta || 'Internado Activo'],
            ['Observaciones', admisionInfo?.observaciones || '-']
        ];
        const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
        XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen Paciente');

        // Hoja 2: Diagnósticos
        if (diagnosticos.length > 0) {
            const wsDiag = XLSX.utils.json_to_sheet(diagnosticos.map(d => ({
                'Fecha': d.fecha_visita ? new Date(d.fecha_visita).toLocaleDateString('es-AR') : '-',
                'Formulario': d.formulario,
                'Diagnóstico (CIE)': d.diagnostico,
                'Motivo / Anamnesis': d.motivo || '-',
                'Centro': d.centro
            })));
            XLSX.utils.book_append_sheet(wb, wsDiag, 'Diagnósticos');
        }

        // Hoja 3: Estudios
        if (peticiones.length > 0) {
            const wsPets = XLSX.utils.json_to_sheet(peticiones.map(p => ({
                'Fecha Solicitud': p.fecha_solicitud ? new Date(p.fecha_solicitud).toLocaleString('es-AR') : '-',
                'Estudio Solicitado': p.estudio,
                'Modalidad': p.modalidad || p.tipo_articulo,
                'Solicitante': p.solicitante || '-',
                'Habitación / Box': p.habitacion || '-',
                'Prioridad': p.prioridad || 'Normal'
            })));
            XLSX.utils.book_append_sheet(wb, wsPets, 'Estudios y Pruebas');
        }

        // Hoja 4: Traslados de Cama
        if (traslados.length > 0) {
            const wsMoves = XLSX.utils.json_to_sheet(traslados.map((m, idx) => ({
                'Paso': idx + 1,
                'Habitación / Cama': `${m.habitacion} ${m.cama && m.cama !== ',' ? `(${m.cama})` : ''}`,
                'Servicio': m.servicio,
                'Fecha Ingreso Cama': m.fecha_inicio ? new Date(m.fecha_inicio).toLocaleString('es-AR') : '-',
                'Fecha Egreso Cama': m.fecha_fin ? new Date(m.fecha_fin).toLocaleString('es-AR') : 'Activo',
                'Especialidad': m.especialidad
            })));
            XLSX.utils.book_append_sheet(wb, wsMoves, 'Traslados Cama');
        }

        XLSX.writeFile(wb, `Ficha_Clinica_${currentName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`);
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100050,
            padding: '20px'
        }}>
            <div style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                width: '1100px',
                maxWidth: '96%',
                maxHeight: '92vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: '1px solid #CBD5E1',
                overflow: 'hidden'
            }}>
                
                {/* ─── HEADER DEL PACIENTE (ESTILO CLÍNICO PREMIUM) ─── */}
                <div style={{
                    background: 'linear-gradient(135deg, #0F172A 0%, #1E3A8A 100%)',
                    color: '#FFFFFF',
                    padding: '20px 24px',
                    position: 'relative',
                    flexShrink: 0
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            position: 'absolute',
                            top: '16px',
                            right: '16px',
                            background: 'rgba(255, 255, 255, 0.15)',
                            border: 'none',
                            color: '#FFFFFF',
                            borderRadius: '50%',
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                        }}
                        onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)'}
                        onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                    >
                        <X size={18} />
                    </button>

                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px', paddingRight: '40px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{
                                width: '56px',
                                height: '56px',
                                borderRadius: '14px',
                                background: 'linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 4px 10px rgba(37, 99, 235, 0.4)',
                                flexShrink: 0
                            }}>
                                <User size={28} color="#FFFFFF" />
                            </div>

                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.01em' }}>
                                        {currentName}
                                    </h2>
                                    <span style={{
                                        background: isActive ? '#10B981' : '#64748B',
                                        color: '#FFFFFF',
                                        fontSize: '0.68rem',
                                        fontWeight: 800,
                                        padding: '2px 8px',
                                        borderRadius: '12px',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px'
                                    }}>
                                        {isActive ? '● Internado Activo' : 'Alta Médica'}
                                    </span>
                                    {patient.isDefuncion && (
                                        <span style={{ background: '#DC2626', color: '#FFF', fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: '12px' }}>
                                            ÓBITO
                                        </span>
                                    )}
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '6px', fontSize: '0.78rem', opacity: 0.9, flexWrap: 'wrap' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Hash size={13} /> DNI: <strong>{currentDni}</strong>
                                    </span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <FileText size={13} /> NHC: <strong>{currentNhc}</strong>
                                    </span>
                                    {(patient.edad || pacienteInfo?.edad) && (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Calendar size={13} /> Edad: <strong>{patient.edad || pacienteInfo?.edad} años</strong>
                                        </span>
                                    )}
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Building2 size={13} /> Cobertura: <strong style={{ color: '#93C5FD' }}>{currentCliente}</strong>
                                    </span>
                                    {currentPhone && (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Phone size={13} /> Tel: <strong>{currentPhone}</strong>
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Botones de acción rápida */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                            <button
                                onClick={handleCopySummary}
                                style={{
                                    background: 'rgba(255, 255, 255, 0.12)',
                                    border: '1px solid rgba(255, 255, 255, 0.25)',
                                    borderRadius: '8px',
                                    color: '#FFFFFF',
                                    padding: '6px 12px',
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                {copied ? <Check size={14} color="#34D399" /> : <Copy size={14} />}
                                {copied ? 'Copiado' : 'Copiar'}
                            </button>

                            <button
                                onClick={handleExportExcel}
                                style={{
                                    background: '#15803D',
                                    border: 'none',
                                    borderRadius: '8px',
                                    color: '#FFFFFF',
                                    padding: '6px 12px',
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 2px 4px rgba(21, 128, 61, 0.3)'
                                }}
                            >
                                <FileSpreadsheet size={14} />
                                Exportar Excel
                            </button>
                        </div>
                    </div>

                    {/* Resumen rápido de la cama actual o última */}
                    <div style={{
                        marginTop: '14px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        borderRadius: '8px',
                        padding: '8px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '0.75rem',
                        border: '1px solid rgba(255, 255, 255, 0.15)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <span>Cama Actual / Sector: <strong style={{ color: '#FCD34D' }}>{patient.habitacion || 'UCI'}</strong></span>
                            <span>N° Admisión: <strong>{currentAdmision}</strong></span>
                            <span>Médico de Cabecera: <strong>{currentDoctor}</strong></span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Clock size={13} />
                            <span>Estancia Total: <strong>{patient.totalDays || 1} días</strong></span>
                        </div>
                    </div>
                </div>

                {/* ─── PESTAÑAS DE NAVEGACIÓN ─── */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 20px',
                    borderBottom: '1px solid #E2E8F0',
                    background: '#F8FAFC',
                    flexShrink: 0
                }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                        {[
                            { id: 'resumen', label: 'Resumen 360°', icon: FileText, count: null },
                            { id: 'kinesiologia', label: 'Kinesiología & ARM', icon: Wind, count: kinesiologia.length, highlight: true },
                            { id: 'diagnosticos', label: 'Diagnósticos SALUS', icon: Stethoscope, count: diagnosticos.length },
                            { id: 'estudios', label: 'Estudios & Peticiones', icon: FlaskConical, count: peticiones.length },
                            { id: 'camas', label: 'Ruta de Camas', icon: Bed, count: traslados.length },
                            { id: 'cirugias', label: 'Cirugías & Quirófano', icon: HeartPulse, count: cirugias.length },
                            { id: 'guardia', label: 'Consultas Guardia', icon: AlertTriangle, count: consultasGuardia.length },
                            { id: 'administrativo', label: 'Facturación / Admin', icon: Receipt, count: deudasInfo?.facturas?.length || null }
                        ].map(tab => {
                            const isSelected = activeTab === tab.id;
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '12px 14px',
                                        border: 'none',
                                        borderBottom: isSelected ? '3px solid #2563EB' : '3px solid transparent',
                                        background: 'transparent',
                                        fontSize: '0.8rem',
                                        fontWeight: isSelected ? 800 : 600,
                                        color: isSelected ? '#1E40AF' : '#64748B',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s'
                                    }}
                                >
                                    <Icon size={15} color={isSelected ? '#2563EB' : '#94A3B8'} />
                                    <span>{tab.label}</span>
                                    {tab.count !== null && (
                                        <span style={{
                                            background: isSelected ? '#DBEAFE' : '#E2E8F0',
                                            color: isSelected ? '#1E40AF' : '#475569',
                                            fontSize: '0.68rem',
                                            fontWeight: 800,
                                            padding: '1px 6px',
                                            borderRadius: '10px'
                                        }}>
                                            {tab.count}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {loading && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', color: '#2563EB', fontWeight: 600 }}>
                            <RefreshCw size={13} className="animate-spin" />
                            <span>Consultando SALUS...</span>
                        </div>
                    )}
                </div>

                {/* ─── CUERPO Y CONTENIDO DE LAS PESTAÑAS ─── */}
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '20px 24px',
                    background: '#FFFFFF'
                }}>

                    {/* ════ PESTAÑA 1: RESUMEN CLÍNICO 360° ════ */}
                    {activeTab === 'resumen' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                            
                            {/* Scorecards métricos */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '10px', padding: '12px 16px' }}>
                                    <span style={{ fontSize: '0.7rem', color: '#1E40AF', fontWeight: 700, textTransform: 'uppercase' }}>Estancia Total</span>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1E3A8A', marginTop: '4px' }}>
                                        {patient.totalDays || 1} <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>días</span>
                                    </div>
                                    <span style={{ fontSize: '0.7rem', color: '#3B82F6' }}>Ingreso: {patient.fechaIngreso ? new Date(patient.fechaIngreso).toLocaleDateString('es-AR') : '-'}</span>
                                </div>

                                <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '10px', padding: '12px 16px' }}>
                                    <span style={{ fontSize: '0.7rem', color: '#15803D', fontWeight: 700, textTransform: 'uppercase' }}>Diagnósticos Codificados</span>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#166534', marginTop: '4px' }}>
                                        {diagnosticos.length}
                                    </div>
                                    <span style={{ fontSize: '0.7rem', color: '#16A34A' }}>CIE-10 / Formularios</span>
                                </div>

                                <div style={{ background: '#FAF5FF', border: '1px solid #E9D5FF', borderRadius: '10px', padding: '12px 16px' }}>
                                    <span style={{ fontSize: '0.7rem', color: '#7E22CE', fontWeight: 700, textTransform: 'uppercase' }}>Estudios Solicitados</span>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#581C87', marginTop: '4px' }}>
                                        {peticiones.length}
                                    </div>
                                    <span style={{ fontSize: '0.7rem', color: '#9333EA' }}>RX, TAC, Lab, Eco</span>
                                </div>

                                <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '10px', padding: '12px 16px' }}>
                                    <span style={{ fontSize: '0.7rem', color: '#B45309', fontWeight: 700, textTransform: 'uppercase' }}>Traslados de Cama</span>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#78350F', marginTop: '4px' }}>
                                        {traslados.length}
                                    </div>
                                    <span style={{ fontSize: '0.7rem', color: '#D97706' }}>Movimientos en la internación</span>
                                </div>
                            </div>

                            {/* Detalle Clínico y de Admisión */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '16px' }}>
                                
                                {/* Tarjeta: Proceso e Información de Admisión */}
                                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
                                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Building2 size={16} color="#2563EB" />
                                        Detalles de la Admisión e Internación
                                    </h4>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.78rem' }}>
                                        <div>
                                            <span style={{ color: '#64748B', display: 'block', fontSize: '0.7rem' }}>N° Admisión</span>
                                            <strong style={{ color: '#0F172A' }}>{currentAdmision}</strong>
                                        </div>
                                        <div>
                                            <span style={{ color: '#64748B', display: 'block', fontSize: '0.7rem' }}>Servicio Clínico</span>
                                            <strong style={{ color: '#0F172A' }}>{currentProceso}</strong>
                                        </div>
                                        <div>
                                            <span style={{ color: '#64748B', display: 'block', fontSize: '0.7rem' }}>Médico Tratante</span>
                                            <strong style={{ color: '#1E40AF' }}>{currentDoctor}</strong>
                                        </div>
                                        <div>
                                            <span style={{ color: '#64748B', display: 'block', fontSize: '0.7rem' }}>Procedencia</span>
                                            <strong style={{ color: '#0F172A' }}>{patient.procedencia || 'Derivado desde Urgencias'}</strong>
                                        </div>
                                        <div>
                                            <span style={{ color: '#64748B', display: 'block', fontSize: '0.7rem' }}>Fecha de Ingreso</span>
                                            <strong style={{ color: '#0F172A' }}>{patient.fechaIngreso ? new Date(patient.fechaIngreso).toLocaleString('es-AR') : '-'}</strong>
                                        </div>
                                        <div>
                                            <span style={{ color: '#64748B', display: 'block', fontSize: '0.7rem' }}>Fecha de Alta</span>
                                            <strong style={{ color: patient.fechaAlta ? '#0F172A' : '#10B981' }}>
                                                {patient.fechaAlta ? new Date(patient.fechaAlta).toLocaleString('es-AR') : 'Internado Activo'}
                                            </strong>
                                        </div>
                                    </div>

                                    {admisionInfo?.observaciones && (
                                        <div style={{ marginTop: '12px', background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '10px 12px' }}>
                                            <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700, display: 'block', textTransform: 'uppercase' }}>
                                                Observaciones de Admisión / Enfermería:
                                            </span>
                                            <span style={{ fontSize: '0.8rem', color: '#334155', fontStyle: 'italic', marginTop: '2px', display: 'block' }}>
                                                "{admisionInfo.observaciones}"
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Tarjeta: Diagnósticos Principales Resumidos */}
                                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
                                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Stethoscope size={16} color="#2563EB" />
                                            <span>Diagnósticos Registrados</span>
                                        </div>
                                        <button
                                            onClick={() => setActiveTab('diagnosticos')}
                                            style={{ background: 'transparent', border: 'none', color: '#2563EB', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                                        >
                                            Ver todos →
                                        </button>
                                    </h4>

                                    {diagnosticos.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '20px', color: '#94A3B8', fontSize: '0.76rem' }}>
                                            No se registraron diagnósticos codificados en SALUS para este NHC.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {diagnosticos.slice(0, 3).map((d, i) => (
                                                <div key={i} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                                        <span style={{ fontSize: '0.65rem', color: '#1E40AF', fontWeight: 700, background: '#EFF6FF', padding: '1px 5px', borderRadius: '4px' }}>
                                                            {d.formulario}
                                                        </span>
                                                        <span style={{ fontSize: '0.68rem', color: '#94A3B8' }}>
                                                            {d.fecha_visita ? new Date(d.fecha_visita).toLocaleDateString('es-AR') : '-'}
                                                        </span>
                                                    </div>
                                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1E293B', display: 'block' }}>
                                                        {d.diagnostico}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Timeline de Traslados dentro de Resumen */}
                            {traslados.length > 0 && (
                                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
                                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Bed size={16} color="#2563EB" />
                                        Cronología de Cama en la Institución ({traslados.length} traslados)
                                    </h4>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflowX: 'auto', paddingBottom: '6px' }}>
                                        {traslados.map((m, idx) => {
                                            const isLast = idx === traslados.length - 1;
                                            return (
                                                <React.Fragment key={idx}>
                                                    <div style={{
                                                        background: isLast && isActive ? '#ECFDF5' : '#FFFFFF',
                                                        border: isLast && isActive ? '1.5px solid #10B981' : '1px solid #CBD5E1',
                                                        borderRadius: '10px',
                                                        padding: '10px 14px',
                                                        minWidth: '160px',
                                                        flexShrink: 0
                                                    }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#1E40AF' }}>
                                                                {idx + 1}. {m.habitacion} {m.cama && m.cama !== ',' ? `(${m.cama})` : ''}
                                                            </span>
                                                            {isLast && isActive && (
                                                                <span style={{ fontSize: '0.6rem', background: '#10B981', color: '#FFF', padding: '1px 5px', borderRadius: '4px', fontWeight: 800 }}>
                                                                    ACTUAL
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span style={{ fontSize: '0.68rem', color: '#64748B', display: 'block', marginTop: '4px' }}>
                                                            {m.fecha_inicio ? new Date(m.fecha_inicio).toLocaleDateString('es-AR') : '-'}
                                                            {' → '}
                                                            {m.fecha_fin ? new Date(m.fecha_fin).toLocaleDateString('es-AR') : 'Activo'}
                                                        </span>
                                                    </div>
                                                    {!isLast && <ChevronRight size={16} color="#94A3B8" style={{ flexShrink: 0 }} />}
                                                </React.Fragment>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                        </div>
                    )}

                    {/* ════ PESTAÑA: KINESIOLOGÍA & TERAPIA RESPIRATORIA EN UCI ════ */}
                    {activeTab === 'kinesiologia' && (
                        <UciKinesiologiaPanel 
                            nhc={currentNhc} 
                            patient={patient} 
                            records={kinesiologia} 
                        />
                    )}

                    {/* ════ PESTAÑA 2: DIAGNÓSTICOS CLÍNICOS SALUS ════ */}
                    {activeTab === 'diagnosticos' && (
                        <div>
                            {diagnosticos.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748B' }}>
                                    <Stethoscope size={40} color="#94A3B8" style={{ margin: '0 auto 12px auto' }} />
                                    <p style={{ fontWeight: 700, fontSize: '0.95rem', margin: 0 }}>No hay diagnósticos codificados en SALUS</p>
                                    <p style={{ fontSize: '0.8rem', color: '#94A3B8', marginTop: '4px' }}>No se encontraron formularios clínicos con códigos CIE-10 para el NHC {currentNhc}.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))', gap: '14px' }}>
                                    {diagnosticos.map((d, i) => (
                                        <div key={i} style={{
                                            background: '#F8FAFC',
                                            border: '1px solid #E2E8F0',
                                            borderRadius: '12px',
                                            padding: '16px',
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', paddingBottom: '8px', marginBottom: '10px' }}>
                                                <span style={{ fontSize: '0.72rem', color: '#1E40AF', fontWeight: 800, background: '#EFF6FF', padding: '2px 8px', borderRadius: '6px' }}>
                                                    {d.formulario || 'Visita Clínica'}
                                                </span>
                                                <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                                                    {d.fecha_visita ? new Date(d.fecha_visita).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}
                                                </span>
                                            </div>

                                            <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.35 }}>
                                                {d.diagnostico}
                                            </div>

                                            {d.motivo && (
                                                <div style={{
                                                    fontSize: '0.8rem',
                                                    color: '#334155',
                                                    marginTop: '10px',
                                                    background: '#FFFFFF',
                                                    padding: '10px 12px',
                                                    borderRadius: '8px',
                                                    border: '1px solid #E2E8F0',
                                                    lineHeight: 1.45
                                                }}>
                                                    <strong style={{ fontSize: '0.7rem', color: '#64748B', display: 'block', textTransform: 'uppercase', marginBottom: '3px' }}>
                                                        Anamnesis / Examen Clínico:
                                                    </strong>
                                                    "{d.motivo}"
                                                </div>
                                            )}

                                            <div style={{ marginTop: '10px', fontSize: '0.7rem', color: '#94A3B8', display: 'flex', justifyContent: 'space-between' }}>
                                                <span>Centro: {d.centro || 'SAN LUIS SUR'}</span>
                                                {d.id_visita && <span>ID Visita: {d.id_visita}</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ════ PESTAÑA 3: ESTUDIOS, PETICIONES, TAC, RX ════ */}
                    {activeTab === 'estudios' && (
                        <div>
                            {peticiones.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748B' }}>
                                    <FlaskConical size={40} color="#94A3B8" style={{ margin: '0 auto 12px auto' }} />
                                    <p style={{ fontWeight: 700, fontSize: '0.95rem', margin: 0 }}>No hay peticiones o estudios registrados</p>
                                    <p style={{ fontSize: '0.8rem', color: '#94A3B8', marginTop: '4px' }}>No se registraron órdenes de radiología, tomografía ni laboratorio en SALUS.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <div style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '4px' }}>
                                        Se encontraron <strong>{peticiones.length}</strong> solicitudes y estudios clínicos:
                                    </div>

                                    <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                            <thead>
                                                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left', color: '#475569' }}>
                                                    <th style={{ padding: '10px 14px' }}>Fecha</th>
                                                    <th style={{ padding: '10px 14px' }}>Estudio Solicitado</th>
                                                    <th style={{ padding: '10px 14px' }}>Modalidad</th>
                                                    <th style={{ padding: '10px 14px' }}>Médico Solicitante</th>
                                                    <th style={{ padding: '10px 14px' }}>Box / Cama</th>
                                                    <th style={{ padding: '10px 14px' }}>Prioridad</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {peticiones.map((p, idx) => (
                                                    <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: '#0F172A', fontWeight: 600 }}>
                                                            {p.fecha_solicitud ? new Date(p.fecha_solicitud).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                                                        </td>
                                                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#1E293B' }}>
                                                            {p.estudio}
                                                        </td>
                                                        <td style={{ padding: '10px 14px' }}>
                                                            <span style={{
                                                                background: (p.modalidad || '').includes('TAC') ? '#FEF2F2' : '#EFF6FF',
                                                                color: (p.modalidad || '').includes('TAC') ? '#DC2626' : '#1E40AF',
                                                                fontSize: '0.68rem',
                                                                fontWeight: 800,
                                                                padding: '2px 8px',
                                                                borderRadius: '6px'
                                                            }}>
                                                                {p.modalidad || p.tipo_articulo || 'Imágenes'}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '10px 14px', color: '#475569' }}>
                                                            {p.solicitante || 'Guardia / Terapia'}
                                                        </td>
                                                        <td style={{ padding: '10px 14px', color: '#64748B' }}>
                                                            {p.habitacion || '-'}
                                                        </td>
                                                        <td style={{ padding: '10px 14px' }}>
                                                            <span style={{
                                                                background: (p.prioridad || '').toLowerCase() === 'urgente' ? '#DC2626' : '#E2E8F0',
                                                                color: (p.prioridad || '').toLowerCase() === 'urgente' ? '#FFF' : '#334155',
                                                                fontSize: '0.65rem',
                                                                fontWeight: 800,
                                                                padding: '1px 6px',
                                                                borderRadius: '4px'
                                                            }}>
                                                                {p.prioridad || 'Normal'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ════ PESTAÑA 4: RUTA DE TRASLADOS DE CAMA ════ */}
                    {activeTab === 'camas' && (
                        <div>
                            {traslados.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748B' }}>
                                    <Bed size={40} color="#94A3B8" style={{ margin: '0 auto 12px auto' }} />
                                    <p style={{ fontWeight: 700, fontSize: '0.95rem', margin: 0 }}>Sin historial de traslados registrado</p>
                                    <p style={{ fontSize: '0.8rem', color: '#94A3B8', marginTop: '4px' }}>El paciente permanece únicamente en la cama {patient.habitacion}.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                                        Línea de tiempo de camas asignadas al paciente durante toda la internación:
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {traslados.map((m, idx) => {
                                            const isLast = idx === traslados.length - 1;
                                            return (
                                                <div key={idx} style={{
                                                    background: isLast && isActive ? '#F0FDF4' : '#F8FAFC',
                                                    border: isLast && isActive ? '1.5px solid #86EFAC' : '1px solid #E2E8F0',
                                                    borderRadius: '12px',
                                                    padding: '14px 18px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                                        <div style={{
                                                            width: '36px',
                                                            height: '36px',
                                                            borderRadius: '50%',
                                                            background: isLast && isActive ? '#10B981' : '#2563EB',
                                                            color: '#FFFFFF',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontWeight: 800,
                                                            fontSize: '0.85rem'
                                                        }}>
                                                            {idx + 1}
                                                        </div>

                                                        <div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <strong style={{ fontSize: '0.95rem', color: '#0F172A' }}>
                                                                    {m.habitacion} {m.cama && m.cama !== ',' ? `(${m.cama})` : ''}
                                                                </strong>
                                                                <span style={{ fontSize: '0.7rem', color: '#64748B', background: '#E2E8F0', padding: '1px 6px', borderRadius: '4px' }}>
                                                                    {m.servicio}
                                                                </span>
                                                                {isLast && isActive && (
                                                                    <span style={{ fontSize: '0.68rem', background: '#10B981', color: '#FFF', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>
                                                                        CAMAS ACTUAL
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span style={{ fontSize: '0.73rem', color: '#64748B', marginTop: '2px', display: 'block' }}>
                                                                Especialidad: {m.especialidad} • Cobertura: {m.cliente || currentCliente}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div style={{ textAlign: 'right' }}>
                                                        <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block' }}>Período en Cama</span>
                                                        <strong style={{ fontSize: '0.82rem', color: '#0F172A' }}>
                                                            {m.fecha_inicio ? new Date(m.fecha_inicio).toLocaleDateString('es-AR') : '-'}
                                                            {' → '}
                                                            {m.fecha_fin ? new Date(m.fecha_fin).toLocaleDateString('es-AR') : 'Activo'}
                                                        </strong>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ════ PESTAÑA 5: CIRUGÍAS Y QUIRÓFANOS ════ */}
                    {activeTab === 'cirugias' && (
                        <div>
                            {cirugias.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748B' }}>
                                    <HeartPulse size={40} color="#94A3B8" style={{ margin: '0 auto 12px auto' }} />
                                    <p style={{ fontWeight: 700, fontSize: '0.95rem', margin: 0 }}>Sin intervenciones quirúrgicas registradas</p>
                                    <p style={{ fontSize: '0.8rem', color: '#94A3B8', marginTop: '4px' }}>No se encontraron cirugías en Quirófanos Centrales para este paciente.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {cirugias.map((c, i) => (
                                        <div key={i} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <div>
                                                    <span style={{ fontSize: '0.7rem', color: '#2563EB', fontWeight: 800, background: '#EFF6FF', padding: '2px 8px', borderRadius: '6px' }}>
                                                        {c.grupo_agendas || 'QUIRÓFANOS CENTRALES'}
                                                    </span>
                                                    <h4 style={{ margin: '6px 0 2px 0', fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>
                                                        {c.modulo || c.descripcion}
                                                    </h4>
                                                    <span style={{ fontSize: '0.76rem', color: '#64748B' }}>
                                                        Cirujano / Equipo: <strong style={{ color: '#1E40AF' }}>{c.medico}</strong>
                                                    </span>
                                                </div>

                                                <div style={{ textAlign: 'right' }}>
                                                    <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block' }}>Fecha de Cirugía</span>
                                                    <strong style={{ fontSize: '0.9rem', color: '#0F172A' }}>
                                                        {c.fecha_cirugia ? new Date(c.fecha_cirugia + 'T00:00:00').toLocaleDateString('es-AR') : '-'}
                                                    </strong>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ════ PESTAÑA 6: GUARDIA CLÍNICA ════ */}
                    {activeTab === 'guardia' && (
                        <div>
                            {consultasGuardia.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748B' }}>
                                    <AlertTriangle size={40} color="#94A3B8" style={{ margin: '0 auto 12px auto' }} />
                                    <p style={{ fontWeight: 700, fontSize: '0.95rem', margin: 0 }}>Sin consultas de guardia registradas</p>
                                    <p style={{ fontSize: '0.8rem', color: '#94A3B8', marginTop: '4px' }}>No figuran atenciones en el Servicio de Urgencias Médicas.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {consultasGuardia.map((g, i) => (
                                        <div key={i} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '0.7rem', color: '#B45309', fontWeight: 800, background: '#FEF3C7', padding: '2px 8px', borderRadius: '6px' }}>
                                                        {g.agenda || 'GUARDIA CLÍNICA'}
                                                    </span>
                                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#DC2626' }}>
                                                        {g.tipo_visita}
                                                    </span>
                                                </div>
                                                <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                                                    {g.fecha_visita ? new Date(g.fecha_visita + 'T00:00:00').toLocaleDateString('es-AR') : '-'} {g.hora_visita || ''}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.82rem', color: '#1E293B' }}>
                                                Especialidad: <strong>{g.visita_especialidad}</strong> • Asistencia: <strong>{g.asistencia}</strong>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ════ PESTAÑA 7: FACTURACIÓN, DEUDA Y PRESUPUESTOS ════ */}
                    {activeTab === 'administrativo' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                
                                {/* Estado de deuda */}
                                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
                                    <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <DollarSign size={16} color="#10B981" />
                                        Estado de Deuda y Facturas
                                    </h4>

                                    {deudasInfo ? (
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                <span style={{ fontSize: '0.78rem', color: '#64748B' }}>Deuda Total Registrada:</span>
                                                <strong style={{ fontSize: '1.1rem', color: deudasInfo.deuda_total > 0 ? '#DC2626' : '#10B981' }}>
                                                    ${(deudasInfo.deuda_total || 0).toLocaleString('es-AR')}
                                                </strong>
                                            </div>
                                            <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                                Facturas asociadas: {deudasInfo.cantidad_facturas || 0}
                                            </span>
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: '0.8rem', color: '#10B981', fontWeight: 600 }}>
                                            ✓ Paciente sin deuda activa en el sistema.
                                        </div>
                                    )}
                                </div>

                                {/* Presupuestos */}
                                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px' }}>
                                    <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Receipt size={16} color="#2563EB" />
                                        Presupuestos Emitidos ({presupuestos.length})
                                    </h4>

                                    {presupuestos.length === 0 ? (
                                        <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
                                            No se emitieron presupuestos previos para este paciente.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {presupuestos.map((p, i) => (
                                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', background: '#FFFFFF', padding: '6px 8px', borderRadius: '6px' }}>
                                                    <span>{p.fecha ? new Date(p.fecha).toLocaleDateString('es-AR') : '-'}</span>
                                                    <strong>${(p.importe_total || 0).toLocaleString('es-AR')}</strong>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                </div>

                {/* ─── FOOTER CON BOTÓN DE CERRAR ─── */}
                <div style={{
                    padding: '12px 24px',
                    borderTop: '1px solid #E2E8F0',
                    background: '#F8FAFC',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexShrink: 0
                }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                        Datos integrados en tiempo real desde <strong>SALUS (Oracle)</strong> y <strong>Supabase (Gobernanza QOAG)</strong>.
                    </div>

                    <button
                        onClick={onClose}
                        style={{
                            background: '#F1F5F9',
                            color: '#334155',
                            border: '1px solid #CBD5E1',
                            borderRadius: '8px',
                            padding: '8px 18px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                        }}
                    >
                        Cerrar Ficha
                    </button>
                </div>

            </div>
        </div>
    );
}
