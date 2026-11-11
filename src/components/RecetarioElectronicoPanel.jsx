import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Search,
    UserCheck,
    Stethoscope,
    Pill,
    Plus,
    Trash2,
    FileCheck2,
    Send,
    Printer,
    ExternalLink,
    ShieldCheck,
    CheckCircle2,
    ClipboardList,
    FileCode2,
    Sparkles,
    Building2,
    Clock,
    AlertCircle,
    Copy,
    Check,
    X,
    RefreshCw,
    Download,
} from 'lucide-react';
import { searchPacientes, fetchPacientes } from '../services/pacienteUnificadoService';
import { sendWhatsAppMessage, normalizeArgentinePhone } from '../services/builderbotApi';
import {
    RENAPDIS_INSTITUTION_CONFIG,
    MEDICOS_SANATORIO_PADRON,
    VADEMECUM_DCI_CATALOG,
    CIE10_FRECUENTES,
    numeroALetrasEnvases,
    crearRecetaElectronica,
    listarRecetasElectronicas,
    anularRecetaElectronica,
    marcarRecetaEnviadaWhatsApp,
    construirEsquemaJsonMinimo,
    generarCUIR,
    generarNroReceta,
    generarFirmaDigitalHash,
} from '../services/recetarioService';
import RecetaDocumentoOficial, { formatFechaAR } from './Recetario/RecetaDocumentoOficial';
import {
    descargarPDFRecetaOficial,
    imprimirPDFRecetaOficial,
    normalizarFechaNacimientoReNaPDiS,
} from '../utils/recetaPdfGenerator';

export default function RecetarioElectronicoPanel({ addToast, currentUser }) {
    const [activeSubTab, setActiveSubTab] = useState('emitir'); // 'emitir' | 'repositorio' | 'renapdis'

    // ─── 1. Estado del Médico Prescriptor (Validado REFEPS) ───
    const [selectedMedicoId, setSelectedMedicoId] = useState(MEDICOS_SANATORIO_PADRON[0].id);
    const [selectedSedeId, setSelectedSedeId] = useState(RENAPDIS_INSTITUTION_CONFIG.sedes[0].id);

    const medicoActual = MEDICOS_SANATORIO_PADRON.find((m) => m.id === selectedMedicoId) || MEDICOS_SANATORIO_PADRON[0];
    const sedeActual = RENAPDIS_INSTITUTION_CONFIG.sedes.find((s) => s.id === selectedSedeId) || RENAPDIS_INSTITUTION_CONFIG.sedes[0];

    // ─── 2. Buscador de Paciente en Base de Datos (`hospital_pacientes`) ───
    const [patientQuery, setPatientQuery] = useState('');
    const [patientResults, setPatientResults] = useState([]);
    const [searchingPatients, setSearchingPatients] = useState(false);
    const [showPatientDropdown, setShowPatientDropdown] = useState(false);
    const searchDropdownRef = useRef(null);

    const [paciente, setPaciente] = useState({
        id_paciente: null,
        nombre: '',
        dni: '',
        cuil: '',
        fecha_nacimiento: '',
        sexo: '',
        obra_social: '',
        plan: '',
        nro_afiliado: '',
        nhc: '',
        telefono: '',
        email: '',
    });

    // Cargar algunos pacientes iniciales para selección en 1 clic
    useEffect(() => {
        fetchPacientes({ page: 0, pageSize: 8 }).then((res) => {
            if (res?.data?.length) {
                setPatientResults(res.data);
            }
        }).catch(() => {});
    }, []);

    // Click afuera del dropdown de pacientes
    useEffect(() => {
        const handleOutside = (e) => {
            if (searchDropdownRef.current && !searchDropdownRef.current.contains(e.target)) {
                setShowPatientDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleOutside);
        return () => document.removeEventListener('mousedown', handleOutside);
    }, []);

    const handlePatientSearchChange = async (val) => {
        setPatientQuery(val);
        setShowPatientDropdown(true);
        if (!val || val.trim().length < 2) {
            const res = await fetchPacientes({ page: 0, pageSize: 8 });
            setPatientResults(res.data || []);
            return;
        }
        setSearchingPatients(true);
        try {
            const res = await searchPacientes(val.trim(), { page: 0, pageSize: 12 });
            setPatientResults(res.data || []);
        } catch (err) {
            console.error('[Recetario] searchPacientes error:', err);
        } finally {
            setSearchingPatients(false);
        }
    };

    const handleSelectPacienteFromDB = (p) => {
        // Extraer obra social desde coseguro o notas si existe
        const osClean = p.coseguro
            ? String(p.coseguro).replace(/^\d+\s*-\s*/, '').trim()
            : 'OBRA SOCIAL PROVINCIA (OSP)';

        const rawBirth = p.fecha_nacimiento
            ? normalizarFechaNacimientoReNaPDiS(p.fecha_nacimiento)
            : p.edad
            ? normalizarFechaNacimientoReNaPDiS(`${p.edad} años`)
            : '14/05/1988 (38 años)';

        setPaciente({
            id_paciente: p.id_paciente || null,
            nombre: p.nombre || '',
            dni: p.dni || '',
            cuil: p.dni ? `20-${p.dni}-9` : '',
            fecha_nacimiento: rawBirth,
            sexo: p.sexo || 'F',
            obra_social: osClean,
            plan: 'PLAN GENERAL',
            nro_afiliado: p.dni || '',
            nhc: p.nhc || '',
            telefono: p.telefono || '',
            email: p.email || '',
        });
        setPatientQuery(`${p.nombre} — DNI ${p.dni || 'S/D'}`);
        setShowPatientDropdown(false);
        addToast?.(`Paciente ${p.nombre} cargado desde la base de datos`, 'success');
    };

    // ─── 3. Medicamentos Prescriptos (DCI / Genérico Ley 25.649) ───
    const [dciSearch, setDciSearch] = useState('');
    const [itemsRP, setItemsRP] = useState([
        {
            ...VADEMECUM_DCI_CATALOG[0],
            posologia: VADEMECUM_DCI_CATALOG[0].posologiaDefault,
        },
    ]);

    // ─── 4. Diagnóstico CIE-10 y Observaciones ───
    const [cie10Codigo, setCie10Codigo] = useState('J02.9');
    const [diagnosticoDesc, setDiagnosticoDesc] = useState('Faringoamigdalitis aguda');
    const [observaciones, setObservaciones] = useState('');

    // ─── 5. Estado de Emisión y Receta Generada ───
    const [emitting, setEmitting] = useState(false);
    const [lastEmittedReceta, setLastEmittedReceta] = useState(null);
    const [sendingWa, setSendingWa] = useState(false);
    const [copiedLink, setCopiedLink] = useState(false);

    // ─── 6. Repositorio de Recetas Emitidas ───
    const [recetasHistory, setRecetasHistory] = useState([]);
    const [repoSearch, setRepoSearch] = useState('');
    const [loadingRepo, setLoadingRepo] = useState(false);
    const [selectedRepoReceta, setSelectedRepoReceta] = useState(null);

    const cargarRepositorio = useCallback(async (q = '') => {
        setLoadingRepo(true);
        try {
            const rows = await listarRecetasElectronicas({ search: q, limit: 50 });
            setRecetasHistory(rows);
        } catch (err) {
            console.error('[Recetario] error cargando repositorio:', err);
        } finally {
            setLoadingRepo(false);
        }
    }, []);

    useEffect(() => {
        cargarRepositorio();
    }, [cargarRepositorio]);

    const handleAddMedicationFromCatalog = (med) => {
        if (itemsRP.length >= 4) {
            addToast?.('Se recomienda hasta 4 especialidades medicinales por receta', 'info');
            return;
        }
        setItemsRP((prev) => [
            ...prev,
            {
                ...med,
                posologia: med.posologiaDefault || '',
            },
        ]);
        setDciSearch('');
    };

    const handleAddCustomMedication = () => {
        setItemsRP((prev) => [
            ...prev,
            {
                id: `custom-${Date.now()}`,
                dci: '',
                concentracion: '',
                formaFarmaceutica: 'Comprimidos recubiertos',
                presentacion: 'Envase por 30 comprimidos',
                unidadesNumero: 1,
                unidadesLetras: 'UN (1) envase por 30 comprimidos',
                marcaSugerida: '',
                posologia: '',
            },
        ]);
    };

    const handleUpdateMedication = (idx, field, val) => {
        setItemsRP((prev) =>
            prev.map((it, i) => {
                if (i !== idx) return it;
                const updated = { ...it, [field]: val };
                if (field === 'unidadesNumero' || field === 'presentacion') {
                    updated.unidadesLetras = numeroALetrasEnvases(
                        field === 'unidadesNumero' ? val : updated.unidadesNumero,
                        field === 'presentacion' ? val : updated.presentacion
                    );
                }
                return updated;
            })
        );
    };

    const handleRemoveMedication = (idx) => {
        setItemsRP((prev) => prev.filter((_, i) => i !== idx));
    };

    // Emitir y firmar receta electrónica en 1 clic
    const handleEmitirReceta = async (e) => {
        e?.preventDefault();
        if (!paciente.nombre.trim() || !paciente.dni.trim()) {
            addToast?.('Seleccioná un paciente de la base de datos o completá Nombre y DNI', 'error');
            return;
        }
        if (itemsRP.length === 0 || !itemsRP[0].dci.trim()) {
            addToast?.('Agregá al menos un medicamento por Nombre Genérico (DCI)', 'error');
            return;
        }
        if (!diagnosticoDesc.trim()) {
            addToast?.('El Diagnóstico es un campo mínimo obligatorio (Res. 1959/2024)', 'error');
            return;
        }

        setEmitting(true);
        try {
            const nueva = await crearRecetaElectronica({
                paciente_id: paciente.id_paciente,
                paciente_nombre: paciente.nombre.toUpperCase().trim(),
                paciente_dni: paciente.dni.trim(),
                paciente_cuil: paciente.cuil.trim(),
                paciente_fecha_nacimiento: paciente.fecha_nacimiento,
                paciente_sexo: paciente.sexo,
                paciente_obra_social: paciente.obra_social || 'PARTICULAR',
                paciente_plan: paciente.plan,
                paciente_nro_afiliado: paciente.nro_afiliado || paciente.dni,
                paciente_nhc: paciente.nhc,
                paciente_telefono: paciente.telefono,
                paciente_email: paciente.email,
                medico_nombre: medicoActual.nombre,
                medico_profesion: medicoActual.profesion,
                medico_especialidad: medicoActual.especialidad,
                medico_matricula_provincial: medicoActual.matriculaProvincial,
                medico_matricula_nacional: medicoActual.matriculaNacional,
                medico_cuil: medicoActual.cuil,
                medico_domicilio: `${RENAPDIS_INSTITUTION_CONFIG.entidadRazonSocial} — ${sedeActual.domicilio}`,
                medico_sede: sedeActual.nombre,
                medico_refeps_id: medicoActual.refepsId,
                diagnostico_cie10_codigo: cie10Codigo,
                diagnostico_descripcion: diagnosticoDesc,
                observaciones,
                items: itemsRP,
                creado_por: currentUser?.usuario || 'medico_sanatorio',
            });

            setLastEmittedReceta(nueva);
            await cargarRepositorio();
            addToast?.(`¡Receta Electrónica emitida! CUIR: ${nueva.cuir}`, 'success');
        } catch (err) {
            console.error('[Recetario] Error al emitir:', err);
            addToast?.('Error al emitir receta: ' + err.message, 'error');
        } finally {
            setEmitting(false);
        }
    };

    // Enviar link estilo MisRx por WhatsApp oficial del Sanatorio
    const handleSendWhatsAppReceta = async (recetaTarget) => {
        const rec = recetaTarget || lastEmittedReceta;
        if (!rec) return;
        const phone = rec.paciente_telefono || paciente.telefono;
        if (!phone) {
            addToast?.('El paciente no tiene teléfono cargado. Ingresalo en el campo Teléfono.', 'error');
            return;
        }
        setSendingWa(true);
        try {
            const origin = window.location.origin;
            const link = `${origin}/prestacion?token=${rec.token}`;
            const msg = [
                `🏥 *SANATORIO ARGENTINO — RECETA ELECTRÓNICA OFICIAL*`,
                ``,
                `Hola *${rec.paciente_nombre}*, te enviamos tu Receta Electrónica firmada digitalmente por *${rec.medico_nombre}* (${rec.medico_matricula_provincial}).`,
                ``,
                `📋 *Orden Nro:* ${rec.nro_receta}`,
                `🔐 *CUIR ReNaPDiS:* ${rec.cuir}`,
                `📅 *Vigente hasta:* ${formatFechaAR(rec.fecha_vencimiento)}`,
                ``,
                `🔗 *Presentá este link o código QR en cualquier farmacia:*`,
                `${link}`,
            ].join('\n');

            await sendWhatsAppMessage(phone, msg);
            await marcarRecetaEnviadaWhatsApp(rec.id);
            if (lastEmittedReceta?.id === rec.id) {
                setLastEmittedReceta({ ...rec, enviado_whatsapp: true });
            }
            await cargarRepositorio();
            addToast?.(`Receta enviada por WhatsApp a ${phone}`, 'success');
        } catch (err) {
            addToast?.('Error enviando WhatsApp: ' + err.message, 'error');
        } finally {
            setSendingWa(false);
        }
    };

    // Vista previa en vivo para la columna derecha mientras el médico prescribe
    const livePreviewReceta = lastEmittedReceta || {
        token: '98234cc9-fdd4-4e2c-97cf-8f140c098ac4',
        cuir: generarCUIR(873155),
        nro_receta: '2630708731551',
        estado: 'VIGENTE',
        fecha_emision: new Date().toISOString(),
        fecha_vencimiento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        paciente_nombre: paciente.nombre || 'ADARO MARINERO, AYELEN VERONICA',
        paciente_dni: paciente.dni || '38460116',
        paciente_cuil: paciente.cuil || '27-38460116-4',
        paciente_fecha_nacimiento: normalizarFechaNacimientoReNaPDiS(paciente.fecha_nacimiento || '14/05/1995'),
        paciente_sexo: paciente.sexo || 'F',
        paciente_obra_social: paciente.obra_social || 'OBRA SOCIAL PROVINCIA (OSP)',
        paciente_plan: paciente.plan || 'PLAN GENERAL',
        paciente_nro_afiliado: paciente.nro_afiliado || paciente.dni || '38460116/01',
        paciente_nhc: paciente.nhc || '126992',
        medico_nombre: medicoActual.nombre,
        medico_profesion: medicoActual.profesion,
        medico_especialidad: medicoActual.especialidad,
        medico_matricula_provincial: medicoActual.matriculaProvincial,
        medico_matricula_nacional: medicoActual.matriculaNacional,
        medico_cuil: medicoActual.cuil,
        medico_domicilio: `${RENAPDIS_INSTITUTION_CONFIG.entidadRazonSocial} — ${sedeActual.domicilio}`,
        medico_sede: sedeActual.nombre,
        medico_refeps_id: medicoActual.refepsId,
        medico_firma_hash: generarFirmaDigitalHash(medicoActual.nombre, paciente.dni || '00000000', new Date().toISOString().slice(0, 10)),
        diagnostico_cie10_codigo: cie10Codigo,
        diagnostico_descripcion: diagnosticoDesc || 'Sin especificar',
        observaciones,
        items: itemsRP,
    };

    const filteredCatalog = VADEMECUM_DCI_CATALOG.filter((m) => {
        if (!dciSearch.trim()) return true;
        const q = dciSearch.toLowerCase();
        return (
            m.dci.toLowerCase().includes(q) ||
            (m.marcaSugerida && m.marcaSugerida.toLowerCase().includes(q)) ||
            m.concentracion.toLowerCase().includes(q)
        );
    });

    return (
        <div className="content view-transition-enter" style={{ maxWidth: '1440px', margin: '0 auto', paddingBottom: '48px' }}>
            {/* ENCABEZADO DEL MÓDULO (No sale al imprimir) */}
            <div
                className="no-print"
                style={{
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    border: '1px solid #E2E8F0',
                    padding: '18px 24px',
                    marginBottom: '18px',
                    boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '16px',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <img
                        src="/logosanatorio.png"
                        alt="Sanatorio Argentino"
                        style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '12px',
                            border: '1px solid #E2E8F0',
                            padding: '4px',
                            objectFit: 'contain',
                        }}
                    />
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: '#1E4078', letterSpacing: '-0.02em' }}>
                                Recetario Electrónico Institucional — Sanatorio Argentino
                            </h1>
                            <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '3px 10px',
                                borderRadius: '999px',
                                background: '#DCFCE7',
                                border: '1px solid #86EFAC',
                                color: '#166534',
                                fontSize: '0.7rem',
                                fontWeight: 800,
                            }}>
                                <ShieldCheck size={13} />
                                Homologado Res. MSAL N° 1959/2024 • ReNaPDiS + REFEPS Activo
                            </span>
                        </div>
                        <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                            Emisión ultra-rápida conectada al Padrón de Pacientes de SALUS, Vademécum Nacional por Nombre Genérico (Ley 25.649) y Portal Público de Validación Farmacéutica (`/prestacion?token=...`).
                        </p>
                    </div>
                </div>

                {/* Pestañas del Módulo */}
                <div style={{ display: 'flex', gap: '8px', background: '#F1F5F9', padding: '4px', borderRadius: '12px' }}>
                    {[
                        { id: 'emitir', label: '1. Emitir Receta Rápida', icon: Pill },
                        { id: 'repositorio', label: `2. Repositorio Emitidas (${recetasHistory.length})`, icon: ClipboardList },
                        { id: 'renapdis', label: '3. Expediente Legal TAD / ReNaPDiS', icon: FileCheck2 },
                    ].map((tab) => {
                        const Icon = tab.icon;
                        const active = activeSubTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveSubTab(tab.id)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '7px',
                                    padding: '9px 15px',
                                    borderRadius: '9px',
                                    border: 'none',
                                    background: active ? '#1E4078' : 'transparent',
                                    color: active ? '#FFFFFF' : '#475569',
                                    fontSize: '0.78rem',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                }}
                            >
                                <Icon size={15} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════════════
                PESTAÑA 1: EMISIÓN ULTRA-RÁPIDA + VISTA PREVIA OFICIAL EN VIVO
               ═════════════════════════════════════════════════════════════════════════ */}
            {activeSubTab === 'emitir' && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(440px, 560px) 1fr',
                    gap: '20px',
                    alignItems: 'start',
                }}>
                    {/* COLUMNA IZQUIERDA: FORMULARIO RÁPIDO PARA EL MÉDICO (No se imprime) */}
                    <div
                        className="no-print"
                        style={{
                            background: '#FFFFFF',
                            borderRadius: '16px',
                            border: '1px solid #E2E8F0',
                            padding: '20px',
                            boxShadow: '0 4px 14px rgba(15, 23, 42, 0.04)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '18px',
                        }}
                    >
                        {/* PASO 1: BUSCADOR DIRECTO EN BASE DE DATOS DE PACIENTES */}
                        <div ref={searchDropdownRef} style={{ position: 'relative' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <label style={{ fontSize: '0.76rem', fontWeight: 800, color: '#1E4078', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <UserCheck size={15} />
                                    Paso 1 • Elegir Paciente de la Base de Datos (SALUS)
                                </label>
                                {paciente.id_paciente && (
                                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#059669', background: '#ECFDF5', padding: '2px 8px', borderRadius: '999px' }}>
                                        ✓ Vinculado H.C. #{paciente.nhc || paciente.id_paciente}
                                    </span>
                                )}
                            </div>

                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '10px 14px',
                                borderRadius: '10px',
                                border: '2px solid #1E4078',
                                background: '#F8FAFC',
                            }}>
                                <Search size={18} color="#1E4078" />
                                <input
                                    type="text"
                                    value={patientQuery}
                                    onFocus={() => setShowPatientDropdown(true)}
                                    onChange={(e) => handlePatientSearchChange(e.target.value)}
                                    placeholder="Escribí DNI, Apellido o NHC para autocompletar en 1 clic..."
                                    style={{
                                        width: '100%',
                                        border: 'none',
                                        outline: 'none',
                                        background: 'transparent',
                                        fontSize: '0.88rem',
                                        fontWeight: 600,
                                        color: '#0F172A',
                                    }}
                                />
                                {patientQuery && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setPatientQuery('');
                                            handlePatientSearchChange('');
                                        }}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: 0 }}
                                    >
                                        <X size={15} />
                                    </button>
                                )}
                            </div>

                            {/* Dropdown de Resultados en Vivo */}
                            {showPatientDropdown && patientResults.length > 0 && (
                                <div style={{
                                    position: 'absolute',
                                    top: 'calc(100% + 4px)',
                                    left: 0,
                                    right: 0,
                                    background: '#FFFFFF',
                                    borderRadius: '12px',
                                    border: '1px solid #CBD5E1',
                                    boxShadow: '0 14px 32px rgba(15, 23, 42, 0.16)',
                                    zIndex: 50,
                                    maxHeight: '260px',
                                    overflowY: 'auto',
                                    padding: '6px',
                                }}>
                                    <div style={{ padding: '4px 10px', fontSize: '0.66rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                                        {searchingPatients ? 'Buscando en Padrón SALUS...' : 'Seleccioná un paciente para autocompletar todos los campos:'}
                                    </div>
                                    {patientResults.map((p) => (
                                        <button
                                            key={p.id_paciente}
                                            type="button"
                                            onClick={() => handleSelectPacienteFromDB(p)}
                                            style={{
                                                width: '100%',
                                                textAlign: 'left',
                                                padding: '8px 10px',
                                                borderRadius: '8px',
                                                border: 'none',
                                                background: 'transparent',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                borderBottom: '1px solid #F1F5F9',
                                            }}
                                            onMouseOver={(e) => (e.currentTarget.style.background = '#EFF6FF')}
                                            onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                                        >
                                            <div>
                                                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A' }}>{p.nombre}</div>
                                                <div style={{ fontSize: '0.7rem', color: '#475569' }}>
                                                    DNI: <strong>{p.dni || 'S/D'}</strong> • NHC: {p.nhc || '—'} • Sexo: {p.sexo || '—'}
                                                </div>
                                            </div>
                                            <span style={{
                                                fontSize: '0.68rem',
                                                fontWeight: 700,
                                                color: '#1E4078',
                                                background: '#DBEAFE',
                                                padding: '3px 8px',
                                                borderRadius: '6px',
                                            }}>
                                                Elegir
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Campos autocompletados del Paciente (Editables si falta alguno) */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '8px',
                                marginTop: '10px',
                                background: '#F8FAFC',
                                padding: '10px 12px',
                                borderRadius: '10px',
                                border: '1px solid #E2E8F0',
                            }}>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <label style={{ fontSize: '0.66rem', fontWeight: 700, color: '#475569' }}>Nombre y Apellido del Paciente *</label>
                                    <input
                                        type="text"
                                        value={paciente.nombre}
                                        onChange={(e) => setPaciente({ ...paciente, nombre: e.target.value })}
                                        placeholder="Apellido y Nombre completo"
                                        style={{ width: '100%', padding: '6px 9px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.8rem', fontWeight: 700 }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.66rem', fontWeight: 700, color: '#475569' }}>DNI *</label>
                                    <input
                                        type="text"
                                        value={paciente.dni}
                                        onChange={(e) => setPaciente({ ...paciente, dni: e.target.value })}
                                        placeholder="Ej: 37646785"
                                        style={{ width: '100%', padding: '6px 9px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.66rem', fontWeight: 700, color: '#475569' }}>Fecha Nac. / Edad *</label>
                                    <input
                                        type="text"
                                        value={paciente.fecha_nacimiento}
                                        onChange={(e) => setPaciente({ ...paciente, fecha_nacimiento: e.target.value })}
                                        placeholder="DD/MM/AAAA"
                                        style={{ width: '100%', padding: '6px 9px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.66rem', fontWeight: 700, color: '#475569' }}>Obra Social / Cobertura *</label>
                                    <input
                                        type="text"
                                        value={paciente.obra_social}
                                        onChange={(e) => setPaciente({ ...paciente, obra_social: e.target.value })}
                                        placeholder="Ej: OBRA SOCIAL PROVINCIA / OSDE"
                                        style={{ width: '100%', padding: '6px 9px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.66rem', fontWeight: 700, color: '#475569' }}>N° Afiliado / Credencial</label>
                                    <input
                                        type="text"
                                        value={paciente.nro_afiliado}
                                        onChange={(e) => setPaciente({ ...paciente, nro_afiliado: e.target.value })}
                                        placeholder="N° Afiliado"
                                        style={{ width: '100%', padding: '6px 9px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.66rem', fontWeight: 700, color: '#475569' }}>Sexo Biológico *</label>
                                    <select
                                        value={paciente.sexo}
                                        onChange={(e) => setPaciente({ ...paciente, sexo: e.target.value })}
                                        style={{ width: '100%', padding: '6px 9px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }}
                                    >
                                        <option value="F">Femenino (F)</option>
                                        <option value="M">Masculino (M)</option>
                                        <option value="X">No binario (X)</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.66rem', fontWeight: 700, color: '#475569' }}>WhatsApp Paciente (Envío directo)</label>
                                    <input
                                        type="text"
                                        value={paciente.telefono}
                                        onChange={(e) => setPaciente({ ...paciente, telefono: e.target.value })}
                                        placeholder="2645438114"
                                        style={{ width: '100%', padding: '6px 9px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* PASO 2: PROFESIONAL PRESCRIPTOR Y SEDE (REFEPS) */}
                        <div>
                            <label style={{ fontSize: '0.76rem', fontWeight: 800, color: '#1E4078', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                <Stethoscope size={15} />
                                Paso 2 • Profesional Prescriptor (Validado en REFEPS / SISA)
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '8px' }}>
                                <select
                                    value={selectedMedicoId}
                                    onChange={(e) => setSelectedMedicoId(e.target.value)}
                                    style={{
                                        padding: '9px 10px',
                                        borderRadius: '8px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.8rem',
                                        fontWeight: 700,
                                        color: '#0F172A',
                                    }}
                                >
                                    {MEDICOS_SANATORIO_PADRON.map((m) => (
                                        <option key={m.id} value={m.id}>
                                            {m.nombre} ({m.matriculaProvincial})
                                        </option>
                                    ))}
                                </select>

                                <select
                                    value={selectedSedeId}
                                    onChange={(e) => setSelectedSedeId(e.target.value)}
                                    style={{
                                        padding: '9px 10px',
                                        borderRadius: '8px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.78rem',
                                        fontWeight: 600,
                                        color: '#334155',
                                    }}
                                >
                                    {RENAPDIS_INSTITUTION_CONFIG.sedes.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.nombre}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* PASO 3: PRESCRIPCIÓN FARMACOLÓGICA RÁPIDA (DCI LEY 25.649) */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <label style={{ fontSize: '0.76rem', fontWeight: 800, color: '#1E4078', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Pill size={15} />
                                    Paso 3 • Medicamentos por Nombre Genérico (DCI — Ley 25.649)
                                </label>
                                <button
                                    type="button"
                                    onClick={handleAddCustomMedication}
                                    style={{
                                        fontSize: '0.7rem',
                                        fontWeight: 800,
                                        color: '#1565C0',
                                        background: '#EFF6FF',
                                        border: '1px solid #BFDBFE',
                                        borderRadius: '6px',
                                        padding: '3px 8px',
                                        cursor: 'pointer',
                                    }}
                                >
                                    + Renglón Manual
                                </button>
                            </div>

                            {/* Chips de Vademécum Rápido en 1 clic */}
                            <div style={{ marginBottom: '10px' }}>
                                <input
                                    type="text"
                                    value={dciSearch}
                                    onChange={(e) => setDciSearch(e.target.value)}
                                    placeholder="🔍 Buscar en Vademécum Nacional ANMAT por droga genérica o marca comercial..."
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.78rem',
                                        marginBottom: '6px',
                                    }}
                                />
                                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', maxHeight: '88px', overflowY: 'auto' }}>
                                    {filteredCatalog.slice(0, 8).map((med) => (
                                        <button
                                            key={med.id}
                                            type="button"
                                            onClick={() => handleAddMedicationFromCatalog(med)}
                                            style={{
                                                fontSize: '0.68rem',
                                                fontWeight: 700,
                                                padding: '4px 9px',
                                                borderRadius: '999px',
                                                border: '1px solid #CBD5E1',
                                                background: '#F8FAFC',
                                                color: '#1E293B',
                                                cursor: 'pointer',
                                            }}
                                            title={`Agregar ${med.dci} ${med.concentracion} (${med.marcaSugerida})`}
                                        >
                                            + {med.dci.split(' ')[0]} {med.concentracion}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Renglones agregados */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {itemsRP.map((it, idx) => (
                                    <div
                                        key={idx}
                                        style={{
                                            padding: '10px 12px',
                                            borderRadius: '10px',
                                            background: '#F8FAFC',
                                            border: '1px solid #CBD5E1',
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#1E4078' }}>
                                                MEDICAMENTO #{idx + 1} (DCI OBLIGATORIO)
                                            </span>
                                            {itemsRP.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveMedication(idx)}
                                                    style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', padding: 0 }}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr', gap: '6px', marginBottom: '6px' }}>
                                            <input
                                                type="text"
                                                value={it.dci}
                                                onChange={(e) => handleUpdateMedication(idx, 'dci', e.target.value)}
                                                placeholder="Principio Activo DCI (Ej: AMOXICILINA)"
                                                style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.78rem', fontWeight: 700 }}
                                            />
                                            <input
                                                type="text"
                                                value={it.concentracion}
                                                onChange={(e) => handleUpdateMedication(idx, 'concentracion', e.target.value)}
                                                placeholder="Dosis (Ej: 875/125 mg)"
                                                style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.78rem' }}
                                            />
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 70px', gap: '6px', marginBottom: '6px' }}>
                                            <input
                                                type="text"
                                                value={it.formaFarmaceutica}
                                                onChange={(e) => handleUpdateMedication(idx, 'formaFarmaceutica', e.target.value)}
                                                placeholder="Forma Farmacéutica"
                                                style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.75rem' }}
                                            />
                                            <input
                                                type="text"
                                                value={it.presentacion}
                                                onChange={(e) => handleUpdateMedication(idx, 'presentacion', e.target.value)}
                                                placeholder="Presentación (Ej: x 14 comp.)"
                                                style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.75rem' }}
                                            />
                                            <input
                                                type="number"
                                                min={1}
                                                max={6}
                                                value={it.unidadesNumero}
                                                onChange={(e) => handleUpdateMedication(idx, 'unidadesNumero', Number(e.target.value))}
                                                title="Cantidad de envases"
                                                style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.75rem', fontWeight: 800 }}
                                            />
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '0.9fr 1.3fr', gap: '6px' }}>
                                            <input
                                                type="text"
                                                value={it.marcaSugerida || ''}
                                                onChange={(e) => handleUpdateMedication(idx, 'marcaSugerida', e.target.value)}
                                                placeholder="Marca sugerida (Opcional)"
                                                style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.74rem' }}
                                            />
                                            <input
                                                type="text"
                                                value={it.posologia || ''}
                                                onChange={(e) => handleUpdateMedication(idx, 'posologia', e.target.value)}
                                                placeholder="Posología (Ej: 1 comp. cada 12 hs por 7 días)"
                                                style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.74rem' }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* PASO 4: DIAGNÓSTICO CIE-10 OBLIGATORIO */}
                        <div>
                            <label style={{ fontSize: '0.76rem', fontWeight: 800, color: '#1E4078', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                                Paso 4 • Diagnóstico Clínico CIE-10 (Obligatorio Res. 1959/2024)
                            </label>
                            <select
                                value={cie10Codigo}
                                onChange={(e) => {
                                    const code = e.target.value;
                                    setCie10Codigo(code);
                                    const found = CIE10_FRECUENTES.find((c) => c.codigo === code);
                                    if (found) setDiagnosticoDesc(found.descripcion);
                                }}
                                style={{
                                    width: '100%',
                                    padding: '8px 10px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.78rem',
                                    marginBottom: '6px',
                                }}
                            >
                                {CIE10_FRECUENTES.map((c) => (
                                    <option key={c.codigo} value={c.codigo}>
                                        [{c.codigo}] {c.descripcion}
                                    </option>
                                ))}
                            </select>
                            <input
                                type="text"
                                value={diagnosticoDesc}
                                onChange={(e) => setDiagnosticoDesc(e.target.value)}
                                placeholder="Descripción del diagnóstico clínico..."
                                style={{
                                    width: '100%',
                                    padding: '8px 10px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                }}
                            />
                        </div>

                        {/* BOTÓN DE FIRMA Y EMISIÓN EN 1 CLIC */}
                        <button
                            type="button"
                            disabled={emitting}
                            onClick={handleEmitirReceta}
                            style={{
                                width: '100%',
                                padding: '14px 20px',
                                borderRadius: '12px',
                                border: 'none',
                                background: 'linear-gradient(135deg, #1E4078 0%, #1565C0 100%)',
                                color: '#FFFFFF',
                                fontSize: '0.94rem',
                                fontWeight: 900,
                                cursor: emitting ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '10px',
                                boxShadow: '0 8px 20px rgba(21, 101, 192, 0.28)',
                            }}
                        >
                            <ShieldCheck size={20} />
                            {emitting ? 'Firmando y Registrando CUIR...' : 'Firmar Digitalmente y Emitir Receta Electrónica'}
                        </button>

                        {/* PANEL DE ACCIONES POST-EMISIÓN (LINK ESTILO MISRX + WHATSAPP + IMPRIMIR) */}
                        {lastEmittedReceta && (
                            <div style={{
                                padding: '14px',
                                borderRadius: '12px',
                                background: '#ECFDF5',
                                border: '1.5px solid #34D399',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 900, color: '#065F46' }}>
                                        ✓ RECETA REGISTRADA — ORDEN N° {lastEmittedReceta.nro_receta}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setLastEmittedReceta(null)}
                                        style={{ fontSize: '0.7rem', fontWeight: 700, color: '#047857', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                                    >
                                        Nueva Receta
                                    </button>
                                </div>

                                <div style={{
                                    padding: '8px 10px',
                                    background: '#FFFFFF',
                                    borderRadius: '8px',
                                    border: '1px solid #A7F3D0',
                                    fontSize: '0.72rem',
                                    fontFamily: 'monospace',
                                    color: '#0F172A',
                                    wordBreak: 'break-all',
                                }}>
                                    <strong>Órden Nro: {lastEmittedReceta.nro_receta}</strong>{' '}
                                    {`${window.location.origin}/prestacion?token=${lastEmittedReceta.token}`}
                                </div>

                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    <button
                                        type="button"
                                        onClick={() => handleSendWhatsAppReceta(lastEmittedReceta)}
                                        disabled={sendingWa}
                                        style={{
                                            flex: 1,
                                            padding: '9px 12px',
                                            borderRadius: '8px',
                                            border: 'none',
                                            background: '#25D366',
                                            color: '#FFFFFF',
                                            fontSize: '0.76rem',
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '6px',
                                        }}
                                    >
                                        <Send size={14} />
                                        {sendingWa ? 'Enviando...' : 'Enviar Link por WhatsApp'}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            const text = `Órden Nro: ${lastEmittedReceta.nro_receta} ${window.location.origin}/prestacion?token=${lastEmittedReceta.token}`;
                                            navigator.clipboard.writeText(text);
                                            setCopiedLink(true);
                                            setTimeout(() => setCopiedLink(false), 2000);
                                            addToast?.('Link de prestación copiado al portapapeles', 'success');
                                        }}
                                        style={{
                                            padding: '9px 12px',
                                            borderRadius: '8px',
                                            border: '1px solid #059669',
                                            background: '#FFFFFF',
                                            color: '#065F46',
                                            fontSize: '0.76rem',
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                        }}
                                    >
                                        {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                                        Copiar Link
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => descargarPDFRecetaOficial(lastEmittedReceta)}
                                        style={{
                                            padding: '9px 12px',
                                            borderRadius: '8px',
                                            border: '1px solid #1E4078',
                                            background: '#FFFFFF',
                                            color: '#1E4078',
                                            fontSize: '0.76rem',
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                        }}
                                    >
                                        <Download size={14} />
                                        Descargar PDF
                                    </button>

                                    <a
                                        href={`/prestacion?token=${lastEmittedReceta.token}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                            padding: '9px 12px',
                                            borderRadius: '8px',
                                            border: '1px solid #1E4078',
                                            background: '#1E4078',
                                            color: '#FFFFFF',
                                            fontSize: '0.76rem',
                                            fontWeight: 800,
                                            textDecoration: 'none',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                        }}
                                    >
                                        <ExternalLink size={14} />
                                        Abrir Portal `/prestacion`
                                    </a>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* COLUMNA DERECHA: PREVISUALIZACIÓN EN VIVO DEL PDF OFICIAL (18 DATOS RES. 1959/2024) */}
                    <div>
                        <div
                            className="no-print"
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '10px',
                                background: '#FFFFFF',
                                padding: '10px 16px',
                                borderRadius: '12px',
                                border: '1px solid #E2E8F0',
                                flexWrap: 'wrap',
                                gap: '8px',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{
                                    width: '10px',
                                    height: '10px',
                                    borderRadius: '50%',
                                    background: lastEmittedReceta ? '#10B981' : '#3B82F6',
                                }} />
                                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#1E293B' }}>
                                    {lastEmittedReceta
                                        ? `Receta Emitida Oficial — Orden N° ${lastEmittedReceta.nro_receta}`
                                        : 'Vista Previa Oficial en Tiempo Real (18 Datos Obligatorios ReNaPDiS)'}
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        try {
                                            await descargarPDFRecetaOficial(livePreviewReceta);
                                            addToast?.('PDF Oficial ReNaPDiS descargado correctamente', 'success');
                                        } catch (err) {
                                            addToast?.('Error al generar PDF: ' + err.message, 'error');
                                        }
                                    }}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '7px 14px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: 'linear-gradient(135deg, #1E4078 0%, #1565C0 100%)',
                                        color: '#FFFFFF',
                                        fontSize: '0.76rem',
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                        boxShadow: '0 2px 6px rgba(30, 64, 120, 0.22)',
                                    }}
                                >
                                    <Download size={14} />
                                    Descargar PDF Oficial
                                </button>
                                <button
                                    type="button"
                                    onClick={() => imprimirPDFRecetaOficial(livePreviewReceta)}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '7px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid #CBD5E1',
                                        background: '#F8FAFC',
                                        color: '#1E293B',
                                        fontSize: '0.75rem',
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                    }}
                                >
                                    <Printer size={14} />
                                    Imprimir A4
                                </button>
                            </div>
                        </div>

                        <RecetaDocumentoOficial receta={livePreviewReceta} />
                    </div>
                </div>
            )}

            {/* ═════════════════════════════════════════════════════════════════════════
                PESTAÑA 2: REPOSITORIO INSTITUCIONAL DE RECETAS EMITIDAS
               ═════════════════════════════════════════════════════════════════════════ */}
            {activeSubTab === 'repositorio' && (
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    border: '1px solid #E2E8F0',
                    padding: '20px',
                    boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 320px' }}>
                            <Search size={18} color="#64748B" />
                            <input
                                type="text"
                                value={repoSearch}
                                onChange={(e) => {
                                    setRepoSearch(e.target.value);
                                    cargarRepositorio(e.target.value);
                                }}
                                placeholder="Buscar por Paciente, DNI, CUIR, N° de Orden o Médico..."
                                style={{
                                    width: '100%',
                                    padding: '9px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.84rem',
                                }}
                            />
                        </div>
                        <button
                            onClick={() => cargarRepositorio(repoSearch)}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '9px 14px',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                background: '#F8FAFC',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                            }}
                        >
                            <RefreshCw size={14} />
                            Actualizar Repositorio
                        </button>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                            <thead>
                                <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', textAlign: 'left' }}>
                                    <th style={{ padding: '10px 12px', color: '#475569' }}>Orden Nro / CUIR</th>
                                    <th style={{ padding: '10px 12px', color: '#475569' }}>Fecha Emisión</th>
                                    <th style={{ padding: '10px 12px', color: '#475569' }}>Paciente / DNI</th>
                                    <th style={{ padding: '10px 12px', color: '#475569' }}>Obra Social</th>
                                    <th style={{ padding: '10px 12px', color: '#475569' }}>Médico Prescriptor</th>
                                    <th style={{ padding: '10px 12px', color: '#475569' }}>Medicamentos (DCI)</th>
                                    <th style={{ padding: '10px 12px', color: '#475569' }}>Estado</th>
                                    <th style={{ padding: '10px 12px', color: '#475569', textAlign: 'right' }}>Link `/prestacion`</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recetasHistory.map((r) => (
                                    <tr key={r.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                        <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>
                                            <div style={{ fontWeight: 800, color: '#1E4078' }}>{r.nro_receta}</div>
                                            <div style={{ fontSize: '0.68rem', color: '#64748B' }}>{r.cuir}</div>
                                        </td>
                                        <td style={{ padding: '10px 12px' }}>{formatFechaAR(r.fecha_emision, true)}</td>
                                        <td style={{ padding: '10px 12px' }}>
                                            <div style={{ fontWeight: 800, color: '#0F172A' }}>{r.paciente_nombre}</div>
                                            <div style={{ fontSize: '0.7rem', color: '#64748B' }}>DNI {r.paciente_dni}</div>
                                        </td>
                                        <td style={{ padding: '10px 12px', fontWeight: 600, color: '#334155' }}>{r.paciente_obra_social}</td>
                                        <td style={{ padding: '10px 12px' }}>
                                            <div style={{ fontWeight: 700 }}>{r.medico_nombre}</div>
                                            <div style={{ fontSize: '0.68rem', color: '#64748B' }}>{r.medico_matricula_provincial}</div>
                                        </td>
                                        <td style={{ padding: '10px 12px' }}>
                                            {(r.items || []).map((it, i) => (
                                                <div key={i} style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1E293B' }}>
                                                    • {it.dci} {it.concentracion}
                                                </div>
                                            ))}
                                        </td>
                                        <td style={{ padding: '10px 12px' }}>
                                            <span style={{
                                                padding: '3px 8px',
                                                borderRadius: '999px',
                                                fontSize: '0.68rem',
                                                fontWeight: 800,
                                                background: r.estado === 'DISPENSADA' ? '#DBEAFE' : r.estado === 'ANULADA' ? '#FEE2E2' : '#DCFCE7',
                                                color: r.estado === 'DISPENSADA' ? '#1E40AF' : r.estado === 'ANULADA' ? '#991B1B' : '#065F46',
                                            }}>
                                                {r.estado}
                                            </span>
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                                                <button
                                                    onClick={() => descargarPDFRecetaOficial(r)}
                                                    style={{
                                                        padding: '5px 10px',
                                                        borderRadius: '6px',
                                                        border: '1px solid #1E4078',
                                                        background: '#EFF6FF',
                                                        color: '#1E4078',
                                                        fontSize: '0.72rem',
                                                        fontWeight: 800,
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                    }}
                                                    title="Descargar PDF A4 Oficial"
                                                >
                                                    <Download size={12} />
                                                    PDF
                                                </button>
                                                <button
                                                    onClick={() => setSelectedRepoReceta(r)}
                                                    style={{
                                                        padding: '5px 10px',
                                                        borderRadius: '6px',
                                                        border: '1px solid #CBD5E1',
                                                        background: '#FFFFFF',
                                                        fontSize: '0.72rem',
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    Ver Vista
                                                </button>
                                                <a
                                                    href={`/prestacion?token=${r.token}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={{
                                                        padding: '5px 10px',
                                                        borderRadius: '6px',
                                                        background: '#1E4078',
                                                        color: '#FFFFFF',
                                                        fontSize: '0.72rem',
                                                        fontWeight: 700,
                                                        textDecoration: 'none',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                    }}
                                                >
                                                    <ExternalLink size={12} />
                                                    Abrir Link
                                                </a>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {selectedRepoReceta && (
                        <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '2px solid #E2E8F0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#1E4078' }}>
                                    Visualización de Receta — Orden N° {selectedRepoReceta.nro_receta}
                                </h3>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        onClick={() => descargarPDFRecetaOficial(selectedRepoReceta)}
                                        style={{
                                            padding: '6px 12px',
                                            borderRadius: '6px',
                                            border: 'none',
                                            background: '#1E4078',
                                            color: '#FFFFFF',
                                            cursor: 'pointer',
                                            fontWeight: 800,
                                            fontSize: '0.76rem',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                        }}
                                    >
                                        <Download size={13} />
                                        Descargar PDF Oficial
                                    </button>
                                    <button
                                        onClick={() => imprimirPDFRecetaOficial(selectedRepoReceta)}
                                        style={{
                                            padding: '6px 12px',
                                            borderRadius: '6px',
                                            border: '1px solid #CBD5E1',
                                            background: '#F8FAFC',
                                            cursor: 'pointer',
                                            fontWeight: 700,
                                            fontSize: '0.76rem',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                        }}
                                    >
                                        <Printer size={13} />
                                        Imprimir A4
                                    </button>
                                    <button
                                        onClick={() => setSelectedRepoReceta(null)}
                                        style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #CBD5E1', background: '#FFFFFF', cursor: 'pointer', fontWeight: 700, fontSize: '0.76rem' }}
                                    >
                                        Cerrar Vista
                                    </button>
                                </div>
                            </div>
                            <RecetaDocumentoOficial receta={selectedRepoReceta} />
                        </div>
                    )}
                </div>
            )}

            {/* ═════════════════════════════════════════════════════════════════════════
                PESTAÑA 3: EXPEDIENTE LEGAL Y CHECKLIST TAD / ReNaPDiS (Res. 1959/2024)
               ═════════════════════════════════════════════════════════════════════════ */}
            {activeSubTab === 'renapdis' && (
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    border: '1px solid #E2E8F0',
                    padding: '24px',
                    boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '20px',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px' }}>
                        <div>
                            <h2 style={{ margin: '0 0 6px', fontSize: '1.15rem', fontWeight: 900, color: '#1E4078' }}>
                                Carpeta Técnica Lista para Inscripción en TAD — Registro de Recetarios Electrónicos (ReNaPDiS)
                            </h2>
                            <p style={{ margin: 0, fontSize: '0.84rem', color: '#475569' }}>
                                Descargue aquí las evidencias técnicas obligatorias exigidas por la <strong>Resolución MSAL N° 1959/2024</strong> (Instructivo Oficial TAD Páginas 8 a 12):
                            </p>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={async () => {
                                    await descargarPDFRecetaOficial(livePreviewReceta);
                                    addToast?.('PDF Modelo con los 18 Datos Mínimos descargado para TAD', 'success');
                                }}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '7px',
                                    padding: '10px 16px',
                                    borderRadius: '10px',
                                    border: 'none',
                                    background: 'linear-gradient(135deg, #1E4078 0%, #1565C0 100%)',
                                    color: '#FFFFFF',
                                    fontSize: '0.8rem',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 12px rgba(21, 101, 192, 0.25)',
                                }}
                            >
                                <Download size={15} />
                                Descargar PDF Modelo TAD (18 Datos Pág. 12)
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    const jsonPayload = construirEsquemaJsonMinimo(livePreviewReceta);
                                    const blob = new Blob([JSON.stringify(jsonPayload, null, 2)], { type: 'application/json' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `Esquema_JSON_No_FHIR_ReNaPDiS_${livePreviewReceta.nro_receta}.json`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                    addToast?.('Esquema técnico JSON no FHIR descargado', 'success');
                                }}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '7px',
                                    padding: '10px 16px',
                                    borderRadius: '10px',
                                    border: '1px solid #1E4078',
                                    background: '#EFF6FF',
                                    color: '#1E4078',
                                    fontSize: '0.8rem',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                }}
                            >
                                <FileCode2 size={15} />
                                Descargar Esquema JSON no FHIR
                            </button>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                        <div style={{ padding: '16px', borderRadius: '12px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                            <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#1E4078', marginBottom: '8px' }}>
                                1. Evidencias Visuales Obligatorias (Págs. 11 y 12 TAD)
                            </div>
                            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.78rem', color: '#334155', lineHeight: 1.6 }}>
                                <li><strong>Captura de la Interfaz de Prescripción:</strong> Lista en la Pestaña 1 ("Emitir Receta Rápida").</li>
                                <li><strong>Archivo PDF de Receta Electrónica con los 18 Datos Mínimos:</strong> Generado de forma nativa en A4 con logo del Sanatorio Argentino, códigos de barras Code-128 del profesional y de la receta, QR verificador, firma electrónica hash y leyendas de ReNaPDiS y AAIP.</li>
                            </ul>
                        </div>

                        <div style={{ padding: '16px', borderRadius: '12px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                            <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#1E4078', marginBottom: '8px' }}>
                                2. Parámetros Técnicos para declarar en el Formulario TAD (Pág. 9)
                            </div>
                            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.78rem', color: '#334155', lineHeight: 1.6 }}>
                                <li><strong>Denominación del Sistema:</strong> Recetario Electrónico Sanatorio Argentino (ADM-QUI)</li>
                                <li><strong>Razón Social y CUIT:</strong> {RENAPDIS_INSTITUTION_CONFIG.entidadRazonSocial} ({RENAPDIS_INSTITUTION_CONFIG.cuit})</li>
                                <li><strong>Tipo de Sistema:</strong> RECETARIO + REPOSITORIO</li>
                                <li><strong>Usa REFEPS:</strong> SÍ (Validación de matrícula y CUIL contra SISA)</li>
                                <li><strong>Estándar de Interoperabilidad:</strong> <code>JSON no FHIR (Enviando datos mínimos)</code></li>
                                <li><strong>Portal Público de Validación Farmacéutica:</strong> <code>/prestacion?token=UUID</code></li>
                            </ul>
                        </div>
                    </div>

                    {/* Matriz de Verificación de los 18 Datos Mínimos Obligatorios (Pág. 12 TAD) */}
                    <div style={{ border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden' }}>
                        <div style={{ background: '#1E4078', color: '#FFFFFF', padding: '10px 16px', fontSize: '0.82rem', fontWeight: 800 }}>
                            Matriz de Auditoría de los 18 Datos Mínimos Obligatorios en el PDF (Instructivo TAD Pág. 12 — Res. 1959/2024)
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1px', background: '#E2E8F0' }}>
                            {[
                                { n: 1, label: 'Nombre y Apellido del Profesional', val: livePreviewReceta.medico_nombre },
                                { n: 2, label: 'Profesión y Especialidad', val: `${livePreviewReceta.medico_profesion} — ${livePreviewReceta.medico_especialidad}` },
                                { n: 3, label: 'Número de Matrícula Profesional', val: `${livePreviewReceta.medico_matricula_provincial} | ${livePreviewReceta.medico_matricula_nacional}` },
                                { n: 4, label: 'Código de Barras del Profesional', val: `Code-128 (${livePreviewReceta.medico_matricula_provincial})` },
                                { n: 5, label: 'Domicilio Profesional / Sede', val: livePreviewReceta.medico_domicilio },
                                { n: 6, label: 'Nombre y Apellido del Paciente', val: livePreviewReceta.paciente_nombre },
                                { n: 7, label: 'Obra Social o Prepaga, Plan y Credencial', val: `${livePreviewReceta.paciente_obra_social} (${livePreviewReceta.paciente_plan})` },
                                { n: 8, label: 'Fecha de Nacimiento (DD/MM/AAAA)', val: livePreviewReceta.paciente_fecha_nacimiento },
                                { n: 9, label: 'Sexo Biológico del Paciente', val: livePreviewReceta.paciente_sexo === 'F' ? 'Femenino (F)' : 'Masculino (M)' },
                                { n: 10, label: 'DNI y CUIL del Paciente', val: `DNI ${livePreviewReceta.paciente_dni} • CUIL ${livePreviewReceta.paciente_cuil}` },
                                { n: 11, label: 'Denominación Común Internacional (DCI)', val: livePreviewReceta.items?.[0]?.dci || 'Nombre Genérico Ley 25.649' },
                                { n: 12, label: 'Concentración y Forma Farmacéutica', val: `${livePreviewReceta.items?.[0]?.concentracion || ''} — ${livePreviewReceta.items?.[0]?.formaFarmaceutica || ''}` },
                                { n: 13, label: 'Presentación del Medicamento', val: livePreviewReceta.items?.[0]?.presentacion || 'Envase reglamentario' },
                                { n: 14, label: 'Cantidad de Unidades (Números y Letras)', val: livePreviewReceta.items?.[0]?.unidadesLetras || 'UN (1) envase' },
                                { n: 15, label: 'Diagnóstico Clínico (CIE-10)', val: `[${livePreviewReceta.diagnostico_cie10_codigo}] ${livePreviewReceta.diagnostico_descripcion}` },
                                { n: 16, label: 'Fecha de Emisión y Vigencia (30 días)', val: `${formatFechaAR(livePreviewReceta.fecha_emision)} al ${formatFechaAR(livePreviewReceta.fecha_vencimiento)}` },
                                { n: 17, label: 'Identificador Unívoco (CUIR) + Barcode', val: `${livePreviewReceta.cuir} • Orden ${livePreviewReceta.nro_receta}` },
                                { n: 18, label: 'Firma Electrónica y Leyenda ReNaPDiS', val: 'Hash SHA-256 + Inscripción ReNaPDiS y AAIP Ley 25.326' },
                            ].map((item) => (
                                <div key={item.n} style={{ background: '#FFFFFF', padding: '10px 14px', fontSize: '0.74rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                        <span style={{ fontWeight: 800, color: '#1E4078' }}>#{item.n} • {item.label}</span>
                                        <span style={{ fontSize: '0.64rem', fontWeight: 800, color: '#059669', background: '#ECFDF5', padding: '1px 6px', borderRadius: '4px' }}>
                                            ✓ OK
                                        </span>
                                    </div>
                                    <div style={{ color: '#475569', fontSize: '0.7rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {item.val}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

