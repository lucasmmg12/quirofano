/**
 * LibreDeDeudaSubmodulo.jsx — Submódulo de Certificados de Libre Deuda
 * Sanatorio Argentino S.R.L.
 *
 * Permite buscar pacientes registrados en el sistema o ingresar datos 100% manualmente,
 * previsualizar el certificado institucional oficial con logo y descargarlo/imprimirlo en A4.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Search, FileText, Printer, CheckCircle, RefreshCw, X, User,
    Shield, Calendar, Edit3, Copy, Eye, Plus, ArrowLeft, History, Hash
} from 'lucide-react';
import { searchPacientes } from '../services/pacienteUnificadoService';
import { createCertificadoLibreDeuda, fetchCertificadosLibreDeuda } from '../services/deudaService';

export default function LibreDeDeudaSubmodulo({ addToast, currentUser, initialPatient, onBackToList }) {
    // ─── Estado del Formulario ───
    const today = new Date();
    const meses = [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
    ];

    const [dia, setDia] = useState(today.getDate().toString());
    const [mes, setMes] = useState(meses[today.getMonth()]);
    const [anio, setAnio] = useState(today.getFullYear().toString().slice(-2));

    const [pacienteNombre, setPacienteNombre] = useState('');
    const [pacienteDni, setPacienteDni] = useState('');
    const [nInternacion, setNInternacion] = useState('');
    const [incluirGarante, setIncluirGarante] = useState(true);
    const [garanteNombre, setGaranteNombre] = useState('');
    const [asesorNombre, setAsesorNombre] = useState(currentUser?.nombre || 'Asesor Administrativo');
    const [observaciones, setObservaciones] = useState('');

    // Referencias de selección / vinculación
    const [selectedPatientId, setSelectedPatientId] = useState(null);
    const [selectedDeudasId, setSelectedDeudasId] = useState(null);
    const [selectedNhc, setSelectedNhc] = useState(null);

    // ─── Búsqueda de Pacientes en tiempo real ───
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef(null);

    // ─── Historial de Certificados Emitidos ───
    const [certificadosHistorial, setCertificadosHistorial] = useState([]);
    const [loadingHistorial, setLoadingHistorial] = useState(false);
    const [historialSearch, setHistorialSearch] = useState('');

    // ─── Estado de guardado / impresión ───
    const [saving, setSaving] = useState(false);
    const [lastIssuedCert, setLastIssuedCert] = useState(null);
    const printContainerRef = useRef(null);

    // ─── Cargar historial ───
    const loadHistorial = useCallback(async (query = '') => {
        setLoadingHistorial(true);
        try {
            const data = await fetchCertificadosLibreDeuda(query);
            setCertificadosHistorial(data);
        } catch (err) {
            console.error('Error al cargar historial de certificados:', err);
        } finally {
            setLoadingHistorial(false);
        }
    }, []);

    useEffect(() => {
        loadHistorial();
    }, [loadHistorial]);

    // Pre-cargar datos si viene de la vista de detalle de un deudor o paciente
    useEffect(() => {
        if (initialPatient) {
            setPacienteNombre(initialPatient.nombre || '');
            setPacienteDni(initialPatient.dni || '');
            setNInternacion(initialPatient.n_admision || initialPatient.nhc || '');
            if (initialPatient.garante || initialPatient.responsable) {
                setGaranteNombre(initialPatient.garante || initialPatient.responsable || '');
                setIncluirGarante(true);
            }
            setSelectedPatientId(initialPatient.id_paciente || null);
            setSelectedDeudasId(initialPatient.id || null);
            setSelectedNhc(initialPatient.nhc || null);
        }
    }, [initialPatient]);

    // Click outside handler para cerrar dropdown de búsqueda
    useEffect(() => {
        function handleClickOutside(e) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setShowDropdown(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Ejecutar búsqueda de paciente
    const handleSearchInput = async (val) => {
        setSearchQuery(val);
        if (!val || val.trim().length < 2) {
            setSearchResults([]);
            setShowDropdown(false);
            return;
        }

        setSearching(true);
        setShowDropdown(true);

        try {
            const { data } = await searchPacientes(val, { pageSize: 10 });
            setSearchResults(data || []);
        } catch (err) {
            console.error('Error buscando pacientes:', err);
            setSearchResults([]);
        } finally {
            setSearching(false);
        }
    };

    // Seleccionar paciente del desplegable
    const handleSelectPatient = (pac) => {
        setPacienteNombre(pac.nombre || '');
        setPacienteDni(pac.dni || '');
        setNInternacion(pac.nhc || pac.id_paciente || '');
        setSelectedPatientId(pac.id_paciente || null);
        setSelectedNhc(pac.nhc || null);
        setShowDropdown(false);
        setSearchQuery('');
        addToast?.(`Datos de ${pac.nombre} autocompletados`, 'info');
    };

    // Limpiar formulario para ingreso manual
    const handleClearForm = () => {
        setPacienteNombre('');
        setPacienteDni('');
        setNInternacion('');
        setGaranteNombre('');
        setIncluirGarante(true);
        setSelectedPatientId(null);
        setSelectedDeudasId(null);
        setSelectedNhc(null);
        setLastIssuedCert(null);
        addToast?.('Formulario listo para ingreso manual', 'info');
    };

    // Formatear texto completo del certificado
    const getCertText = () => {
        const fechaTexto = `San Juan, ${dia} de ${mes} de 20${anio}`;
        const p1 = `Por medio de la presente, quien suscribe, en mi carácter de Asesor Administrativo del Sanatorio Argentino S.R.L., deja constancia que el/la paciente ${pacienteNombre.trim() || '________________________'}, DNI ${pacienteDni.trim() || '________________'}, internado/a bajo la Internación N.º ${nInternacion.trim() || '________'}, no registra obligaciones de pago pendientes con esta Institución al día de la fecha.`;
        
        const p2 = incluirGarante && garanteNombre.trim()
            ? `Asimismo, se deja expresa constancia de que, habiéndose cancelado la totalidad de las obligaciones económicas derivadas de la mencionada internación, la garantía suscripta oportunamente por el/la Sr./Sra. ${garanteNombre.trim()}, en carácter de garante, queda sin efecto y sin valor obligacional alguno respecto de la presente internación, no manteniendo responsabilidad pendiente frente al Sanatorio Argentino S.R.L. por dicho concepto.`
            : incluirGarante
                ? `Asimismo, se deja expresa constancia de que, habiéndose cancelado la totalidad de las obligaciones económicas derivadas de la mencionada internación, la garantía suscripta oportunamente por el/la Sr./Sra. __________________________, en carácter de garante, queda sin efecto y sin valor obligacional alguno respecto de la presente internación, no manteniendo responsabilidad pendiente frente al Sanatorio Argentino S.R.L. por dicho concepto.`
                : '';

        const p3 = `Se extiende el presente certificado a solicitud del interesado, para ser presentado ante quien corresponda.`;

        return { fechaTexto, p1, p2, p3 };
    };

    // Emitir e Imprimir Certificado
    const handleEmitirEImprimir = async () => {
        if (!pacienteNombre.trim()) {
            addToast?.('Por favor ingresa el nombre del paciente', 'error');
            return;
        }

        setSaving(true);
        try {
            const { fechaTexto } = getCertText();
            const certData = {
                pacienteNombre: pacienteNombre.trim(),
                pacienteDni: pacienteDni.trim(),
                nInternacion: nInternacion.trim(),
                garanteNombre: incluirGarante ? garanteNombre.trim() : null,
                asesorNombre: asesorNombre.trim() || 'Asesor Administrativo',
                fechaTexto,
                nhc: selectedNhc || nInternacion.trim(),
                idPaciente: selectedPatientId,
                pacienteDeudasId: selectedDeudasId,
                observaciones: observaciones.trim(),
            };

            const created = await createCertificadoLibreDeuda(certData);
            setLastIssuedCert(created);
            addToast?.(`Certificado ${created.codigo} registrado exitosamente`, 'success');
            loadHistorial();

            // Disparar ventana de impresión
            setTimeout(() => {
                window.print();
            }, 300);
        } catch (err) {
            console.error('Error emitiendo certificado:', err);
            addToast?.('Error al registrar el certificado: ' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    // Copiar texto al portapapeles
    const handleCopyText = () => {
        const { fechaTexto, p1, p2, p3 } = getCertText();
        const fullText = `SANATORIO ARGENTINO S.R.L.\nDesde 1974\n\nCERTIFICADO DE LIBRE DEUDA\n\n${fechaTexto}\n\n${p1}\n\n${p2 ? p2 + '\n\n' : ''}${p3}\n\n___________________________________\n${asesorNombre}\nAsesor Administrativo\nSanatorio Argentino S.R.L.`;
        
        navigator.clipboard.writeText(fullText);
        addToast?.('Texto del certificado copiado al portapapeles', 'info');
    };

    const { fechaTexto, p1, p2, p3 } = getCertText();

    return (
        <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto', fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>
            
            {/* Header / Submódulo Navigation */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {onBackToList && (
                        <button
                            onClick={onBackToList}
                            style={{
                                padding: '8px 12px', borderRadius: '10px', border: '1px solid #E2E8F0',
                                background: '#fff', color: '#64748B', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                                fontSize: '0.85rem', fontWeight: 600, transition: 'all 0.15s'
                            }}
                        >
                            <ArrowLeft size={16} /> Volver a Deudas
                        </button>
                    )}
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#0D3B66', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FileText size={24} style={{ color: '#2563EB' }} /> Emisión de Certificado de Libre Deuda
                        </h2>
                        <span style={{ fontSize: '0.8rem', color: '#64748B' }}>
                            Búsqueda unificada de pacientes o ingreso manual de constancias formales
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={handleClearForm}
                        style={{
                            padding: '8px 14px', borderRadius: '10px', border: '1px solid #CBD5E1',
                            background: '#F8FAFC', color: '#475569', fontSize: '0.82rem', fontWeight: 700,
                            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px'
                        }}
                    >
                        <RefreshCw size={14} /> Ingreso Manual / Limpiar
                    </button>
                </div>
            </div>

            {/* Layout Grid: Left Form Controls + Right Document Preview */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 480px) 1fr', gap: '24px', alignItems: 'start' }}>
                
                {/* LEFT PANEL: Form Inputs & Patient Search */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    {/* Búsqueda de Pacientes en la BD */}
                    <div style={{ background: '#fff', padding: '18px', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
                        <h4 style={{ margin: '0 0 12px 0', fontSize: '0.92rem', fontWeight: 800, color: '#0D3B66', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Search size={16} style={{ color: '#2563EB' }} /> Buscar en Base de Datos de Pacientes
                        </h4>
                        
                        <div style={{ position: 'relative' }} ref={dropdownRef}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '10px',
                                padding: '8px 12px', borderRadius: '10px', background: '#F8FAFC',
                                border: '1.5px solid #E2E8F0'
                            }}>
                                <Search size={15} style={{ color: '#94A3B8' }} />
                                <input
                                    type="text"
                                    placeholder="Escribe Nombre, DNI o NHC..."
                                    value={searchQuery}
                                    onChange={(e) => handleSearchInput(e.target.value)}
                                    onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                                    style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', color: '#0D3B66', fontWeight: 600 }}
                                />
                                {searching && <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite', color: '#2563EB' }} />}
                            </div>

                            {/* Dropdown de resultados */}
                            {showDropdown && searchResults.length > 0 && (
                                <div style={{
                                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                                    marginTop: '4px', background: '#fff', borderRadius: '12px',
                                    border: '1px solid #E2E8F0', boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                                    maxHeight: '260px', overflowY: 'auto'
                                }}>
                                    {searchResults.map((pac) => (
                                        <div
                                            key={pac.id_paciente || pac.nhc || pac.nombre}
                                            onClick={() => handleSelectPatient(pac)}
                                            style={{
                                                padding: '10px 14px', borderBottom: '1px solid #F1F5F9',
                                                cursor: 'pointer', transition: 'background 0.15s'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = '#F0F9FF'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0D3B66' }}>
                                                {pac.nombre}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: '#64748B', display: 'flex', gap: '12px', marginTop: '2px' }}>
                                                {pac.dni && <span>DNI: <strong>{pac.dni}</strong></span>}
                                                {pac.nhc && <span>NHC: <strong>{pac.nhc}</strong></span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <p style={{ margin: '8px 0 0 0', fontSize: '0.72rem', color: '#94A3B8' }}>
                            Al seleccionar un paciente, los campos del certificado se autocompletarán automáticamente.
                        </p>
                    </div>

                    {/* Datos del Certificado Formulario */}
                    <div style={{ background: '#fff', padding: '18px', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 2px 10px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#0D3B66', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Edit3 size={16} style={{ color: '#2563EB' }} /> Datos de la Constancia
                        </h4>

                        {/* Fecha */}
                        <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                                Fecha de Emisión (San Juan, __ de ________ de 20__)
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 1fr', gap: '8px' }}>
                                <div>
                                    <span style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 600 }}>Día</span>
                                    <input
                                        type="text" value={dia} onChange={(e) => setDia(e.target.value)}
                                        style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', fontWeight: 700, outline: 'none' }}
                                    />
                                </div>
                                <div>
                                    <span style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 600 }}>Mes</span>
                                    <input
                                        type="text" value={mes} onChange={(e) => setMes(e.target.value)}
                                        style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', fontWeight: 700, outline: 'none' }}
                                    />
                                </div>
                                <div>
                                    <span style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 600 }}>Año (2 dígitos)</span>
                                    <input
                                        type="text" value={anio} onChange={(e) => setAnio(e.target.value)}
                                        style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', fontWeight: 700, outline: 'none' }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Paciente Nombre */}
                        <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                                Nombre Completo del Paciente *
                            </label>
                            <input
                                type="text"
                                placeholder="Ej: PEREZ, JUAN CARLOS"
                                value={pacienteNombre}
                                onChange={(e) => setPacienteNombre(e.target.value)}
                                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.88rem', fontWeight: 700, color: '#0D3B66', outline: 'none', boxSizing: 'border-box' }}
                            />
                        </div>

                        {/* DNI e Internación */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                                    DNI del Paciente
                                </label>
                                <input
                                    type="text"
                                    placeholder="Ej: 30123456"
                                    value={pacienteDni}
                                    onChange={(e) => setPacienteDni(e.target.value)}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', fontWeight: 600, outline: 'none', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                                    Internación N.º / NHC
                                </label>
                                <input
                                    type="text"
                                    placeholder="Ej: 45892"
                                    value={nInternacion}
                                    onChange={(e) => setNInternacion(e.target.value)}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', fontWeight: 600, outline: 'none', boxSizing: 'border-box' }}
                                />
                            </div>
                        </div>

                        {/* Garante */}
                        <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0D3B66', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <input
                                        type="checkbox"
                                        checked={incluirGarante}
                                        onChange={(e) => setIncluirGarante(e.target.checked)}
                                        style={{ accentColor: '#2563EB' }}
                                    />
                                    Incluir cláusula de Garante
                                </label>
                            </div>
                            {incluirGarante && (
                                <input
                                    type="text"
                                    placeholder="Nombre del Garante (Sr./Sra.)"
                                    value={garanteNombre}
                                    onChange={(e) => setGaranteNombre(e.target.value)}
                                    style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.82rem', fontWeight: 600, outline: 'none', marginTop: '4px', boxSizing: 'border-box' }}
                                />
                            )}
                        </div>

                        {/* Asesor Administrativo */}
                        <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                                Firmante (Asesor Administrativo)
                            </label>
                            <input
                                type="text"
                                value={asesorNombre}
                                onChange={(e) => setAsesorNombre(e.target.value)}
                                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', fontWeight: 600, outline: 'none', boxSizing: 'border-box' }}
                            />
                        </div>

                        {/* Acciones principales */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                            <button
                                onClick={handleEmitirEImprimir}
                                disabled={saving}
                                style={{
                                    width: '100%', padding: '12px', borderRadius: '12px',
                                    background: 'linear-gradient(135deg, #10B981, #059669)', color: '#fff',
                                    border: 'none', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                    boxShadow: '0 3px 12px rgba(16,185,129,0.3)', transition: 'all 0.15s'
                                }}
                            >
                                {saving ? <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Printer size={18} />}
                                {saving ? 'Registrando...' : 'Emitir e Imprimir Certificado A4'}
                            </button>

                            <button
                                onClick={handleCopyText}
                                style={{
                                    width: '100%', padding: '9px', borderRadius: '10px',
                                    background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE',
                                    fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                                }}
                            >
                                <Copy size={15} /> Copiar Texto Formal
                            </button>
                        </div>
                    </div>
                </div>

                {/* RIGHT PANEL: Institutional Certificate Preview (A4 WYSWYG) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    {/* Tarjeta contenedora de previsualización */}
                    <div style={{
                        background: '#fff', borderRadius: '16px', border: '1px solid #CBD5E1',
                        boxShadow: '0 8px 30px rgba(0,0,0,0.06)', padding: '40px 48px',
                        minHeight: '680px', position: 'relative', display: 'flex', flexDirection: 'column',
                        justify: 'space-between'
                    }} ref={printContainerRef} className="printable-certificate-area">
                        
                        {/* Certificado Document Structure */}
                        <div>
                            {/* Logo + Header Sanatorio */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', borderBottom: '2px solid #0D3B66', paddingBottom: '16px', marginBottom: '32px' }}>
                                <img
                                    src="/logosanatorio.png"
                                    alt="Sanatorio Argentino"
                                    style={{ width: '64px', height: '64px', objectFit: 'contain' }}
                                    onError={(e) => { e.target.style.display = 'none'; }}
                                />
                                <div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0D3B66', letterSpacing: '0.5px' }}>
                                        SANATORIO ARGENTINO S.R.L.
                                    </div>
                                    <div style={{ fontSize: '0.82rem', color: '#64748B', fontWeight: 600 }}>
                                        Desde 1974
                                    </div>
                                </div>
                                {lastIssuedCert && (
                                    <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                                        <span style={{ padding: '4px 10px', borderRadius: '12px', background: '#ECFDF5', color: '#059669', fontSize: '0.75rem', fontWeight: 800, border: '1px solid #A7F3D0' }}>
                                            Código: {lastIssuedCert.codigo}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Título Principal */}
                            <div style={{ textAlign: 'center', margin: '28px 0 32px 0' }}>
                                <h2 style={{
                                    fontSize: '1.35rem', fontWeight: 900, color: '#0D3B66',
                                    letterSpacing: '1px', textTransform: 'uppercase', margin: 0
                                }}>
                                    CERTIFICADO DE LIBRE DEUDA
                                </h2>
                            </div>

                            {/* Fecha */}
                            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1E293B', marginBottom: '28px' }}>
                                {fechaTexto}
                            </div>

                            {/* Cuerpo del Certificado */}
                            <div style={{ fontSize: '0.95rem', color: '#1E293B', lineHeight: '1.8', textAlign: 'justify', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <p style={{ margin: 0 }}>
                                    {p1}
                                </p>

                                {p2 && (
                                    <p style={{ margin: 0 }}>
                                        {p2}
                                    </p>
                                )}

                                <p style={{ margin: 0 }}>
                                    {p3}
                                </p>
                            </div>
                        </div>

                        {/* Bloque de Firma al pie */}
                        <div style={{ marginTop: '80px', paddingTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                            <div style={{ textAlign: 'center', width: '280px' }}>
                                <div style={{ borderBottom: '1px solid #475569', marginBottom: '8px', height: '40px' }} />
                                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0D3B66' }}>
                                    {asesorNombre || 'Asesor Administrativo'}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>
                                    Asesor Administrativo
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600 }}>
                                    Sanatorio Argentino S.R.L.
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* HISTORIAL DE CERTIFICADOS EMITIDOS */}
                    <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0', padding: '18px', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#0D3B66', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <History size={16} style={{ color: '#2563EB' }} /> Certificados Emitidos Recientemente
                            </h4>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input
                                    type="text"
                                    placeholder="Buscar en historial..."
                                    value={historialSearch}
                                    onChange={(e) => {
                                        setHistorialSearch(e.target.value);
                                        loadHistorial(e.target.value);
                                    }}
                                    style={{ padding: '4px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.78rem', outline: 'none' }}
                                />
                            </div>
                        </div>

                        {loadingHistorial ? (
                            <div style={{ padding: '20px', textAlign: 'center', color: '#94A3B8', fontSize: '0.82rem' }}>
                                Cargando historial...
                            </div>
                        ) : certificadosHistorial.length === 0 ? (
                            <div style={{ padding: '20px', textAlign: 'center', color: '#94A3B8', fontSize: '0.82rem' }}>
                                No se registran certificados emitidos aún.
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                    <thead>
                                        <tr style={{ background: '#F8FAFC', borderBottom: '1.5px solid #E2E8F0', color: '#475569', textAlign: 'left' }}>
                                            <th style={{ padding: '8px' }}>Código</th>
                                            <th style={{ padding: '8px' }}>Paciente</th>
                                            <th style={{ padding: '8px' }}>DNI</th>
                                            <th style={{ padding: '8px' }}>Internación</th>
                                            <th style={{ padding: '8px' }}>Asesor</th>
                                            <th style={{ padding: '8px' }}>Fecha</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {certificadosHistorial.map((c) => (
                                            <tr key={c.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 800, color: '#2563EB' }}>
                                                    {c.codigo}
                                                </td>
                                                <td style={{ padding: '8px', fontWeight: 700, color: '#0D3B66' }}>
                                                    {c.paciente_nombre}
                                                </td>
                                                <td style={{ padding: '8px', color: '#64748B' }}>{c.paciente_dni || '—'}</td>
                                                <td style={{ padding: '8px', color: '#64748B' }}>{c.n_internacion || '—'}</td>
                                                <td style={{ padding: '8px', color: '#475569', fontWeight: 600 }}>{c.asesor_nombre}</td>
                                                <td style={{ padding: '8px', color: '#94A3B8', fontSize: '0.75rem' }}>
                                                    {new Date(c.created_at).toLocaleDateString('es-AR')}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                </div>

            </div>

            {/* Estilos CSS específicos de Impresión A4 */}
            <style>{`
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    .printable-certificate-area, .printable-certificate-area * {
                        visibility: visible;
                    }
                    .printable-certificate-area {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100% !important;
                        padding: 20mm !important;
                        box-shadow: none !important;
                        border: none !important;
                    }
                }
            `}</style>

        </div>
    );
}
