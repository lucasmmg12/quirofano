import { useState, useRef, useEffect } from 'react';
import { User, Building2, CreditCard, Stethoscope, Calendar, UserCheck, ChevronDown, ChevronUp, Pill, X } from 'lucide-react';
import { OBRAS_SOCIALES } from '../data/nomenclador';

export default function PatientHeader({ patientData, setPatientData }) {
    const [collapsed, setCollapsed] = useState(false);
    const [osSearch, setOsSearch] = useState('');
    const [osOpen, setOsOpen] = useState(false);
    const osRef = useRef(null);

    const handleChange = (field, value) => {
        setPatientData(prev => ({ ...prev, [field]: value }));
    };

    const isComplete = patientData.nombre && patientData.obraSocial && patientData.fecha;

    // Filter obras sociales based on search input
    const filteredOS = OBRAS_SOCIALES.filter(os =>
        os.toLowerCase().includes(osSearch.toLowerCase())
    );

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (osRef.current && !osRef.current.contains(e.target)) {
                setOsOpen(false);
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
                    <div className="field-group">
                        <label className="field-label">
                            <User size={14} />
                            Nombre y Apellido
                        </label>
                        <input
                            id="patient-name"
                            type="text"
                            className="field-input"
                            placeholder="Ej: VARGAS CYNTHIA"
                            value={patientData.nombre}
                            onChange={e => handleChange('nombre', e.target.value.toUpperCase())}
                        />
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
                            N° de Afiliado
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

