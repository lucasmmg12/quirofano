import { useState, useRef, useEffect, useCallback } from 'react';
import { User, Building2, CreditCard, Stethoscope, Calendar, UserCheck, ChevronDown, ChevronUp, Pill, X, Eraser, Search, Loader2 } from 'lucide-react';
import { OBRAS_SOCIALES } from '../data/nomenclador';
import { getTodayISO } from '../utils/searchUtils';
import { searchPatients } from '../services/patientService';

export default function PatientHeader({ patientData, setPatientData }) {
    const [collapsed, setCollapsed] = useState(false);
    const [osSearch, setOsSearch] = useState('');
    const [osOpen, setOsOpen] = useState(false);
    const osRef = useRef(null);

    // Patient autocomplete state
    const [patientQuery, setPatientQuery] = useState('');
    const [patientResults, setPatientResults] = useState([]);
    const [patientDropdownOpen, setPatientDropdownOpen] = useState(false);
    const [patientLoading, setPatientLoading] = useState(false);
    const [selectedPatientIdx, setSelectedPatientIdx] = useState(-1);
    const patientInputRef = useRef(null);
    const patientDropdownRef = useRef(null);
    const debounceRef = useRef(null);

    const handleChange = (field, value) => {
        setPatientData(prev => ({ ...prev, [field]: value }));
    };

    const isComplete = patientData.nombre && patientData.obraSocial && patientData.fecha;

    const hasAnyData = patientData.nombre || patientData.obraSocial || patientData.afiliado || patientData.diagnostico || patientData.tratamiento || patientData.medico;

    const handleClearAll = (e) => {
        e.stopPropagation();
        setPatientData({
            nombre: '',
            obraSocial: '',
            afiliado: '',
            diagnostico: '',
            tratamiento: '',
            fecha: getTodayISO(),
            medico: '',
        });
        setOsSearch('');
        setOsOpen(false);
        setCollapsed(false);
        setPatientQuery('');
        setPatientResults([]);
        setPatientDropdownOpen(false);
    };

    // Filter obras sociales based on search input
    const filteredOS = OBRAS_SOCIALES.filter(os =>
        os.toLowerCase().includes(osSearch.toLowerCase())
    );

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (osRef.current && !osRef.current.contains(e.target)) {
                setOsOpen(false);
            }
            if (patientDropdownRef.current && !patientDropdownRef.current.contains(e.target) &&
                patientInputRef.current && !patientInputRef.current.contains(e.target)) {
                setPatientDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelectOS = (os) => {
        handleChange('obraSocial', os);
        setOsSearch('');
        setOsOpen(false);
    };

    const handleClearOS = () => {
        handleChange('obraSocial', '');
        setOsSearch('');
    };

    // === Patient Autocomplete ===
    const doSearch = useCallback(async (q) => {
        if (!q || q.trim().length < 2) {
            setPatientResults([]);
            setPatientDropdownOpen(false);
            return;
        }
        setPatientLoading(true);
        try {
            const results = await searchPatients(q);
            setPatientResults(results);
            setPatientDropdownOpen(results.length > 0);
            setSelectedPatientIdx(-1);
        } catch {
            setPatientResults([]);
        } finally {
            setPatientLoading(false);
        }
    }, []);

    const handlePatientInputChange = (e) => {
        const val = e.target.value.toUpperCase();
        setPatientQuery(val);
        handleChange('nombre', val);

        // Debounce the search (300ms)
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => doSearch(val), 300);
    };

    const handleSelectPatient = (patient) => {
        setPatientData(prev => ({
            ...prev,
            nombre: patient.nombre || '',
            afiliado: patient.dni || prev.afiliado,
        }));
        setPatientQuery(patient.nombre || '');
        setPatientDropdownOpen(false);
        setPatientResults([]);
    };

    const handlePatientKeyDown = (e) => {
        if (!patientDropdownOpen || patientResults.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedPatientIdx(prev => Math.min(prev + 1, patientResults.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedPatientIdx(prev => Math.max(prev - 1, -1));
        } else if (e.key === 'Enter' && selectedPatientIdx >= 0) {
            e.preventDefault();
            handleSelectPatient(patientResults[selectedPatientIdx]);
        } else if (e.key === 'Escape') {
            setPatientDropdownOpen(false);
        }
    };

    // Scroll selected into view
    useEffect(() => {
        if (selectedPatientIdx >= 0 && patientDropdownRef.current) {
            const item = patientDropdownRef.current.children[selectedPatientIdx];
            if (item) item.scrollIntoView({ block: 'nearest' });
        }
    }, [selectedPatientIdx]);

    // Cleanup debounce on unmount
    useEffect(() => {
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, []);

    return (
        <div className="patient-header animate-fade-in">
            <div className="patient-header__top" onClick={() => setCollapsed(!collapsed)}>
                <div className="patient-header__title-group">
                    <div className="patient-header__icon-badge">
                        <User size={20} />
                    </div>
                    <div>
                        <h2 className="patient-header__title">Datos del Paciente</h2>
                        {collapsed && patientData.nombre && (
                            <p className="patient-header__summary">
                                {patientData.nombre} — {patientData.obraSocial || 'Sin OS'} — {patientData.afiliado || 'Sin Afil.'}
                            </p>
                        )}
                    </div>
                </div>
                <div className="patient-header__toggle-area">
                    {hasAnyData && (
                        <button
                            className="btn-clear-fields"
                            onClick={handleClearAll}
                            title="Limpiar todos los campos del paciente"
                        >
                            <Eraser size={14} />
                            Limpiar Campos
                        </button>
                    )}
                    {isComplete && (
                        <span className="patient-header__status patient-header__status--complete">
                            ✓ Completo
                        </span>
                    )}
                    <button className="patient-header__toggle" aria-label="Alternar formulario">
                        {collapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
                    </button>
                </div>
            </div>

            {!collapsed && (
                <div className="patient-header__fields animate-fade-in">
                    {/* Nombre — con Autocomplete de pacientes */}
                    <div className="field-group" style={{ position: 'relative' }}>
                        <label className="field-label">
                            <User size={14} />
                            Nombre y Apellido
                            <span style={{ fontSize: '0.65rem', color: 'var(--neutral-400)', fontWeight: 400, marginLeft: '4px', textTransform: 'none' }}>
                                (busca por nombre o DNI)
                            </span>
                        </label>
                        <div style={{ position: 'relative' }}>
                            <input
                                ref={patientInputRef}
                                id="patient-name"
                                type="text"
                                className="field-input"
                                placeholder="Ej: VARGAS CYNTHIA o 38078381"
                                value={patientData.nombre}
                                onChange={handlePatientInputChange}
                                onKeyDown={handlePatientKeyDown}
                                autoComplete="off"
                                style={{ paddingRight: '36px' }}
                            />
                            {patientLoading && (
                                <Loader2
                                    size={16}
                                    className="patient-search-spinner"
                                    style={{
                                        position: 'absolute', right: '12px', top: '50%',
                                        transform: 'translateY(-50%)',
                                        color: 'var(--primary-400)',
                                        animation: 'spin 1s linear infinite',
                                    }}
                                />
                            )}
                        </div>

                        {/* Patient Autocomplete Dropdown */}
                        {patientDropdownOpen && patientResults.length > 0 && (
                            <div
                                ref={patientDropdownRef}
                                className="patient-autocomplete-dropdown"
                            >
                                {patientResults.map((p, idx) => (
                                    <div
                                        key={p.id_paciente}
                                        className={`patient-autocomplete-option ${idx === selectedPatientIdx ? 'patient-autocomplete-option--selected' : ''}`}
                                        onClick={() => handleSelectPatient(p)}
                                    >
                                        <div className="patient-autocomplete-option__main">
                                            <span className="patient-autocomplete-option__name">{p.nombre}</span>
                                            {p.dni && (
                                                <span className="patient-autocomplete-option__dni">
                                                    DNI: {p.dni}
                                                </span>
                                            )}
                                        </div>
                                        {(p.edad || p.sexo) && (
                                            <span className="patient-autocomplete-option__extra">
                                                {p.sexo}{p.edad ? ` · ${p.edad}` : ''}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Obra Social — Searchable Combobox */}
                    <div className="field-group" ref={osRef}>
                        <label className="field-label">
                            <Building2 size={14} />
                            Obra Social
                        </label>
                        <div className="os-combobox">
                            {patientData.obraSocial && !osOpen ? (
                                /* Selected state: show chip */
                                <div className="os-combobox__selected" onClick={() => setOsOpen(true)}>
                                    <span className="os-combobox__selected-text">{patientData.obraSocial}</span>
                                    <button
                                        className="os-combobox__clear"
                                        onClick={(e) => { e.stopPropagation(); handleClearOS(); }}
                                        aria-label="Quitar obra social"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ) : (
                                /* Search state: show input */
                                <input
                                    id="patient-obra-social"
                                    type="text"
                                    className="field-input"
                                    placeholder="Buscar por nombre o código..."
                                    value={osSearch}
                                    onChange={e => { setOsSearch(e.target.value); setOsOpen(true); }}
                                    onFocus={() => setOsOpen(true)}
                                    autoComplete="off"
                                />
                            )}

                            {osOpen && (
                                <div className="os-combobox__dropdown">
                                    {filteredOS.length === 0 ? (
                                        <div className="os-combobox__no-results">
                                            Sin resultados para "{osSearch}"
                                        </div>
                                    ) : (
                                        filteredOS.map(os => (
                                            <div
                                                key={os}
                                                className={`os-combobox__option ${patientData.obraSocial === os ? 'os-combobox__option--selected' : ''}`}
                                                onClick={() => handleSelectOS(os)}
                                            >
                                                {os}
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="field-group">
                        <label className="field-label">
                            <CreditCard size={14} />
                            N° de Afiliado / DNI
                        </label>
                        <input
                            id="patient-afiliado"
                            type="text"
                            className="field-input"
                            placeholder="Ej: 38078381-2"
                            value={patientData.afiliado}
                            onChange={e => handleChange('afiliado', e.target.value)}
                        />
                    </div>

                    <div className="field-group">
                        <label className="field-label">
                            <Stethoscope size={14} />
                            Diagnóstico
                        </label>
                        <input
                            id="patient-diagnostico"
                            type="text"
                            className="field-input"
                            placeholder="Ej: EMB. 35 SEM."
                            value={patientData.diagnostico}
                            onChange={e => handleChange('diagnostico', e.target.value.toUpperCase())}
                        />
                    </div>

                    <div className="field-group">
                        <label className="field-label">
                            <Pill size={14} />
                            Tratamiento
                        </label>
                        <input
                            id="patient-tratamiento"
                            type="text"
                            className="field-input"
                            placeholder="Ej: CESAREA"
                            value={patientData.tratamiento}
                            onChange={e => handleChange('tratamiento', e.target.value.toUpperCase())}
                        />
                    </div>

                    <div className="field-group">
                        <label className="field-label">
                            <Calendar size={14} />
                            Fecha
                        </label>
                        <input
                            id="patient-fecha"
                            type="date"
                            className="field-input"
                            value={patientData.fecha}
                            onChange={e => handleChange('fecha', e.target.value)}
                        />
                    </div>

                    <div className="field-group field-group--full">
                        <label className="field-label">
                            <UserCheck size={14} />
                            Médico Solicitante
                        </label>
                        <input
                            id="patient-medico"
                            type="text"
                            className="field-input"
                            placeholder="Ej: Dr. María González"
                            value={patientData.medico}
                            onChange={e => handleChange('medico', e.target.value)}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

