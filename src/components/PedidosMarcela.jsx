/**
 * PedidosMarcela — Panel de emisión de pedidos exclusivo para Marcela
 *
 * Includes:
 * 1. Practice search (Doppler, Adicionales)
 * 2. Certificate form (Certificado de Internación)
 * 3. Oxigenoterapia form (Req. diario, Dosis, Horas, Período, Diag.)
 * 4. Internación Domiciliaria form (APP, Diag, Visitas)
 * 5. Cart + Print
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
    Search, Plus, X, ClipboardPlus, Printer, User, CreditCard,
    Stethoscope, Heart, ShieldCheck, Wind, Home as HomeIcon,
} from 'lucide-react';
import { MARCELA_PRACTICES, MARCELA_CATEGORIES, MARCELA_CATEGORY_COLORS } from '../data/nomencladorMarcela';
import { filterPractices } from '../utils/searchUtils';
import PatientHeader from './PatientHeader.jsx';
import Cart from './Cart.jsx';
import PrintTemplate from './PrintTemplate.jsx';
import { getTodayISO, formatDate } from '../utils/searchUtils';
import { createOrder, markOrderPrinted } from '../services/dataService';

// ── Initial states for special forms ──
const CERT_INITIAL = {
    nombrePaciente: '', dniPaciente: '', tipoTerapia: 'intensiva',
    nombreCuidador: '', dniCuidador: '', diagnostico: '',
    vigencia: '72', unidadVigencia: 'hs', fecha: getTodayISO(),
};

const OXI_INITIAL = {
    requerimientoDiario: '', dosis: '', horas: '',
    periodo: '', diagnostico: '',
};

const DOM_INITIAL = {
    app: '', diagnostico: '', visitaMedica: '',
    visitaEnfermeria: '', visitaKinesiologia: '',
};

// ── Shared styles ──
const fieldGroupStyle = { display: 'flex', flexDirection: 'column', gap: '4px' };
const labelStyle = {
    fontSize: '0.72rem', fontWeight: 700, color: 'var(--neutral-500)',
    textTransform: 'uppercase', letterSpacing: '0.04em',
    display: 'flex', alignItems: 'center', gap: '5px',
};
const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)',
    border: '1.5px solid var(--neutral-200)', fontSize: '0.85rem',
    fontFamily: 'inherit', outline: 'none', transition: 'border-color 0.2s',
    background: '#fff',
};
const selectStyle = { ...inputStyle, cursor: 'pointer', appearance: 'auto' };

export default function PedidosMarcela({ addToast }) {
    // ── Patient data (shared across all modes) ──
    const [patientData, setPatientData] = useState({
        nombre: '', obraSocial: '', afiliado: '', diagnostico: '',
        tratamiento: '', cirugia: '', fecha: getTodayISO(), medico: '',
    });

    // ── Cart ──
    const [cartItems, setCartItems] = useState([]);

    // ── Search ──
    const [query, setQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState('all');
    const [showResults, setShowResults] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const inputRef = useRef(null);
    const resultsRef = useRef(null);

    // ── Print ──
    const printRef = useRef(null);
    const [printItems, setPrintItems] = useState(null);

    // ── Special form states ──
    const [certData, setCertData] = useState(CERT_INITIAL);
    const [oxiData, setOxiData] = useState(OXI_INITIAL);
    const [domData, setDomData] = useState(DOM_INITIAL);
    const [specialPrint, setSpecialPrint] = useState(null); // { type, data }

    // ── Derived ──
    const specialCategories = ['certificado', 'oxigenoterapia', 'domiciliaria'];
    const isSpecialMode = specialCategories.includes(activeCategory);
    const searchablePractices = MARCELA_PRACTICES.filter(p => !specialCategories.includes(p.category));
    const filteredPractices = filterPractices(query, searchablePractices, isSpecialMode ? 'all' : activeCategory);
    const showDropdown = showResults && !isSpecialMode && (query.length > 0 || activeCategory !== 'all');
    const displayResults = showDropdown ? filteredPractices.slice(0, 20) : [];

    // ── Clear special print after printing ──
    useEffect(() => {
        const clear = () => setSpecialPrint(null);
        window.addEventListener('afterprint', clear);
        return () => window.removeEventListener('afterprint', clear);
    }, []);

    // ══════════════════════════════════════════════
    // CART OPERATIONS
    // ══════════════════════════════════════════════
    const handleAddToCart = useCallback((practice) => {
        setCartItems(prev => {
            const existing = prev.find(item => item.code === practice.code);
            if (existing) {
                addToast?.(`"${practice.name}" ya está en el carrito — cantidad incrementada`, 'info');
                return prev.map(item =>
                    item.code === practice.code ? { ...item, quantity: item.quantity + 1 } : item
                );
            }
            addToast?.(`Agregado: ${practice.name}`, 'success');
            return [...prev, {
                id: uuidv4(), code: practice.code, name: practice.name,
                displayName: practice.name, category: practice.category,
                quantity: 1, date: patientData.fecha,
                customField: null, customLabel: null, customValue: '',
                isInternacion: false,
            }];
        });
    }, [patientData.fecha, addToast]);

    const handleUpdateItem = useCallback((id, field, value) => {
        setCartItems(prev => prev.map(item => item.id !== id ? item : { ...item, [field]: value }));
    }, []);

    const handleRemoveItem = useCallback((id) => {
        setCartItems(prev => prev.filter(item => item.id !== id));
        addToast?.('Práctica eliminada del carrito', 'info');
    }, [addToast]);

    const handleClearCart = useCallback(() => {
        if (cartItems.length === 0) return;
        if (window.confirm(`¿Eliminar ${cartItems.length} práctica(s) del carrito?`)) {
            setCartItems([]);
            addToast?.('Carrito limpiado', 'info');
        }
    }, [cartItems.length, addToast]);

    // ══════════════════════════════════════════════
    // PRINT — from cart
    // ══════════════════════════════════════════════
    const handlePrint = useCallback(async (singleItem = null) => {
        setPrintItems(singleItem);
        try {
            const itemsToSave = singleItem ? [singleItem] : cartItems;
            const order = await createOrder(patientData, itemsToSave);
            await markOrderPrinted(order.id);
            addToast?.('Pedido guardado en historial', 'success');
        } catch (e) {
            console.warn('No se pudo guardar en DB, imprimiendo igual:', e);
        }
        setTimeout(() => window.print(), 100);
    }, [patientData, cartItems, addToast]);

    const handlePrintAll = useCallback(() => {
        if (cartItems.length === 0) { addToast?.('El carrito está vacío', 'error'); return; }
        handlePrint(null);
    }, [cartItems.length, handlePrint, addToast]);

    const handlePrintSingle = useCallback((item) => handlePrint(item), [handlePrint]);

    // ══════════════════════════════════════════════
    // SPECIAL FORM HANDLERS
    // ══════════════════════════════════════════════

    // --- Certificate ---
    const generateCertText = () => {
        const c = certData;
        const unidad = c.unidadVigencia === 'dias' ? 'días' : 'hs';
        return `Certifico que ${c.nombrePaciente || '________'}, DNI ${c.dniPaciente || '________'} se encuentra internado/a en terapia ${c.tipoTerapia} de Sanatorio Argentino (terapia abierta) a cuidado de ${c.nombreCuidador || '________'} DNI ${c.dniCuidador || '________'} con diagnóstico ${c.diagnostico || '________'} por ${c.vigencia || '72'} ${unidad} para ser presentado a quien corresponda.`;
    };

    const handlePrintCert = () => {
        if (!certData.nombrePaciente) { addToast?.('Completá al menos el nombre del paciente', 'error'); return; }
        setSpecialPrint({ type: 'certificado', data: { ...certData, text: generateCertText() } });
        setTimeout(() => window.print(), 100);
    };

    // --- Oxigenoterapia ---
    const handlePrintOxi = () => {
        if (!patientData.nombre) { addToast?.('Completá los datos del paciente arriba', 'error'); return; }
        setSpecialPrint({ type: 'oxigenoterapia', data: { ...oxiData }, patient: { ...patientData } });
        setTimeout(() => window.print(), 100);
    };

    // --- Domiciliaria ---
    const handlePrintDom = () => {
        if (!patientData.nombre) { addToast?.('Completá los datos del paciente arriba', 'error'); return; }
        setSpecialPrint({ type: 'domiciliaria', data: { ...domData }, patient: { ...patientData } });
        setTimeout(() => window.print(), 100);
    };

    // ══════════════════════════════════════════════
    // SEARCH HANDLERS
    // ══════════════════════════════════════════════
    const handleAdd = (practice) => {
        handleAddToCart(practice);
        setQuery(''); setSelectedIndex(-1); inputRef.current?.focus();
    };
    const clearSearch = () => { setQuery(''); setSelectedIndex(-1); inputRef.current?.focus(); };
    const handleKeyDown = (e) => {
        if (!showDropdown) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(prev => Math.min(prev + 1, displayResults.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(prev => Math.max(prev - 1, -1)); }
        else if (e.key === 'Enter' && selectedIndex >= 0) { e.preventDefault(); handleAdd(displayResults[selectedIndex]); }
        else if (e.key === 'Escape') { setShowResults(false); setSelectedIndex(-1); }
    };
    const getCategoryColor = (id) => MARCELA_CATEGORY_COLORS[id] || '#64748B';

    // Helper: focus border color
    const focusBorder = (color) => ({
        onFocus: e => e.target.style.borderColor = color,
        onBlur: e => e.target.style.borderColor = 'var(--neutral-200)',
    });

    // ══════════════════════════════════════════════
    // RENDER
    // ══════════════════════════════════════════════
    return (
        <>
            <div className="content no-print">
                <PatientHeader patientData={patientData} setPatientData={setPatientData} hiddenFields={['tratamiento', 'cirugia']} />

                {/* ── Category Search Panel ── */}
                <div className="practice-search animate-fade-in">
                    <div className="practice-search__header">
                        <h3 className="practice-search__title">
                            <ClipboardPlus size={18} />
                            Pedidos Marcela
                        </h3>
                        <span className="practice-search__count">
                            {searchablePractices.length} prácticas · 3 formularios
                        </span>
                    </div>

                    {/* Category Chips */}
                    <div className="practice-search__categories">
                        {MARCELA_CATEGORIES.map(cat => (
                            <button
                                key={cat.id}
                                className={`category-chip ${activeCategory === cat.id ? 'category-chip--active' : ''}`}
                                onClick={() => {
                                    setActiveCategory(cat.id);
                                    setShowResults(!specialCategories.includes(cat.id));
                                    setSelectedIndex(-1);
                                }}
                                style={activeCategory === cat.id ? {
                                    backgroundColor: cat.id === 'all' ? 'var(--primary-500)' : getCategoryColor(cat.id),
                                    borderColor: cat.id === 'all' ? 'var(--primary-500)' : getCategoryColor(cat.id),
                                } : {}}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>

                    {/* ═══════════════════════════════════════ */}
                    {/* FORM: Internación Domiciliaria         */}
                    {/* ═══════════════════════════════════════ */}
                    {activeCategory === 'domiciliaria' && (
                        <div className="animate-fade-in" style={{
                            background: '#F5F3FF', border: '1.5px solid #C4B5FD',
                            borderRadius: 'var(--radius-lg)', padding: '24px', marginTop: '12px',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                <HomeIcon size={20} style={{ color: '#7C3AED' }} />
                                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#5B21B6' }}>
                                    Solicitud de Internación Domiciliaria
                                </h4>
                            </div>

                            <p style={{
                                fontSize: '0.78rem', color: 'var(--neutral-500)', marginBottom: '16px',
                                fontStyle: 'italic',
                            }}>
                                Los datos del paciente (nombre, obra social, afiliado) se toman del encabezado superior.
                            </p>

                            <div style={{
                                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                                gap: '16px',
                            }}>
                                <div style={fieldGroupStyle}>
                                    <label style={labelStyle}><Stethoscope size={13} /> APP (Antecedentes)</label>
                                    <input type="text" placeholder="Ej: hipertensión, diabetes, nefrectomía"
                                        value={domData.app}
                                        onChange={e => setDomData(p => ({ ...p, app: e.target.value.toUpperCase() }))}
                                        style={inputStyle} {...focusBorder('#7C3AED')} />
                                </div>
                                <div style={fieldGroupStyle}>
                                    <label style={labelStyle}><Stethoscope size={13} /> Diagnóstico</label>
                                    <input type="text" placeholder="Ej: herpes zoster, colecistitis aguda"
                                        value={domData.diagnostico}
                                        onChange={e => setDomData(p => ({ ...p, diagnostico: e.target.value.toUpperCase() }))}
                                        style={inputStyle} {...focusBorder('#7C3AED')} />
                                </div>
                                <div style={fieldGroupStyle}>
                                    <label style={labelStyle}>Visita Médica</label>
                                    <input type="text" placeholder="Ej: 1 vez cada 15 días"
                                        value={domData.visitaMedica}
                                        onChange={e => setDomData(p => ({ ...p, visitaMedica: e.target.value }))}
                                        style={inputStyle} {...focusBorder('#7C3AED')} />
                                </div>
                                <div style={fieldGroupStyle}>
                                    <label style={labelStyle}>Visita Enfermería</label>
                                    <input type="text" placeholder="Ej: 1 vez al día"
                                        value={domData.visitaEnfermeria}
                                        onChange={e => setDomData(p => ({ ...p, visitaEnfermeria: e.target.value }))}
                                        style={inputStyle} {...focusBorder('#7C3AED')} />
                                </div>
                                <div style={fieldGroupStyle}>
                                    <label style={labelStyle}>Visita Kinesioterapia</label>
                                    <input type="text" placeholder="Ej: 1 vez al día · física y respiratoria"
                                        value={domData.visitaKinesiologia}
                                        onChange={e => setDomData(p => ({ ...p, visitaKinesiologia: e.target.value }))}
                                        style={inputStyle} {...focusBorder('#7C3AED')} />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
                                <button onClick={() => setDomData(DOM_INITIAL)} style={{
                                    padding: '10px 20px', borderRadius: 'var(--radius-md)',
                                    border: '1.5px solid var(--neutral-200)', background: '#fff',
                                    fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', color: 'var(--neutral-500)',
                                }}>Limpiar</button>
                                <button onClick={handlePrintDom} style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '10px 24px', borderRadius: 'var(--radius-md)',
                                    background: '#7C3AED', color: '#fff', fontSize: '0.85rem', fontWeight: 700,
                                    border: 'none', cursor: 'pointer', boxShadow: '0 2px 8px #7C3AED40',
                                }}
                                    onMouseOver={e => e.currentTarget.style.background = '#6D28D9'}
                                    onMouseOut={e => e.currentTarget.style.background = '#7C3AED'}
                                ><Printer size={16} /> Imprimir Solicitud</button>
                            </div>
                        </div>
                    )}

                    {/* ═══════════════════════════════════════ */}
                    {/* FORM: Oxigenoterapia                    */}
                    {/* ═══════════════════════════════════════ */}
                    {activeCategory === 'oxigenoterapia' && (
                        <div className="animate-fade-in" style={{
                            background: '#F0F9FF', border: '1.5px solid #7DD3FC',
                            borderRadius: 'var(--radius-lg)', padding: '24px', marginTop: '12px',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                <Wind size={20} style={{ color: '#0284C7' }} />
                                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0C4A6E' }}>
                                    Solicitud de Oxigenoterapia con Concentrador de Oxígeno
                                </h4>
                            </div>

                            <p style={{
                                fontSize: '0.78rem', color: 'var(--neutral-500)', marginBottom: '16px',
                                fontStyle: 'italic',
                            }}>
                                Los datos del paciente (nombre, obra social, afiliado) se toman del encabezado superior.
                            </p>

                            <div style={{
                                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                                gap: '16px',
                            }}>
                                <div style={fieldGroupStyle}>
                                    <label style={labelStyle}>Requerimiento diario</label>
                                    <input type="text" placeholder="Ej: continuo 24hs"
                                        value={oxiData.requerimientoDiario}
                                        onChange={e => setOxiData(p => ({ ...p, requerimientoDiario: e.target.value }))}
                                        style={inputStyle} {...focusBorder('#0EA5E9')} />
                                </div>
                                <div style={fieldGroupStyle}>
                                    <label style={labelStyle}>Dosis</label>
                                    <input type="text" placeholder="Ej: 3 L/min"
                                        value={oxiData.dosis}
                                        onChange={e => setOxiData(p => ({ ...p, dosis: e.target.value }))}
                                        style={inputStyle} {...focusBorder('#0EA5E9')} />
                                </div>
                                <div style={fieldGroupStyle}>
                                    <label style={labelStyle}>Horas</label>
                                    <input type="text" placeholder="Ej: 24 hs"
                                        value={oxiData.horas}
                                        onChange={e => setOxiData(p => ({ ...p, horas: e.target.value }))}
                                        style={inputStyle} {...focusBorder('#0EA5E9')} />
                                </div>
                                <div style={fieldGroupStyle}>
                                    <label style={labelStyle}>Período</label>
                                    <input type="text" placeholder="Ej: 30 días"
                                        value={oxiData.periodo}
                                        onChange={e => setOxiData(p => ({ ...p, periodo: e.target.value }))}
                                        style={inputStyle} {...focusBorder('#0EA5E9')} />
                                </div>
                                <div style={{ ...fieldGroupStyle, gridColumn: '1 / -1' }}>
                                    <label style={labelStyle}><Stethoscope size={13} /> Diagnóstico</label>
                                    <input type="text" placeholder="Ej: EPOC REAGUDIZADO"
                                        value={oxiData.diagnostico}
                                        onChange={e => setOxiData(p => ({ ...p, diagnostico: e.target.value.toUpperCase() }))}
                                        style={inputStyle} {...focusBorder('#0EA5E9')} />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
                                <button onClick={() => setOxiData(OXI_INITIAL)} style={{
                                    padding: '10px 20px', borderRadius: 'var(--radius-md)',
                                    border: '1.5px solid var(--neutral-200)', background: '#fff',
                                    fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', color: 'var(--neutral-500)',
                                }}>Limpiar</button>
                                <button onClick={handlePrintOxi} style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '10px 24px', borderRadius: 'var(--radius-md)',
                                    background: '#0284C7', color: '#fff', fontSize: '0.85rem', fontWeight: 700,
                                    border: 'none', cursor: 'pointer', boxShadow: '0 2px 8px #0284C740',
                                }}
                                    onMouseOver={e => e.currentTarget.style.background = '#0369A1'}
                                    onMouseOut={e => e.currentTarget.style.background = '#0284C7'}
                                ><Printer size={16} /> Imprimir Solicitud</button>
                            </div>
                        </div>
                    )}

                    {/* ═══════════════════════════════════════ */}
                    {/* FORM: Certificado                       */}
                    {/* ═══════════════════════════════════════ */}
                    {activeCategory === 'certificado' && (
                        <div className="animate-fade-in" style={{
                            background: '#FFFBEB', border: '1.5px solid #FDE68A',
                            borderRadius: 'var(--radius-lg)', padding: '24px', marginTop: '12px',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                <ShieldCheck size={20} style={{ color: '#D97706' }} />
                                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#92400E' }}>
                                    Certificado de Internación
                                </h4>
                            </div>

                            {/* Live preview */}
                            <div style={{
                                background: '#fff', border: '1px solid #FDE68A',
                                borderRadius: 'var(--radius-md)', padding: '14px 16px',
                                fontSize: '0.82rem', lineHeight: '1.6', color: 'var(--neutral-600)',
                                marginBottom: '20px', fontStyle: 'italic',
                            }}>
                                {generateCertText()}
                            </div>

                            <div style={{
                                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                                gap: '16px',
                            }}>
                                <div style={fieldGroupStyle}>
                                    <label style={labelStyle}><User size={13} /> Nombre del Paciente</label>
                                    <input type="text" placeholder="Ej: MALDONADO HERNANDEZ, FRANCISCO JOSE"
                                        value={certData.nombrePaciente}
                                        onChange={e => setCertData(p => ({ ...p, nombrePaciente: e.target.value.toUpperCase() }))}
                                        style={inputStyle} {...focusBorder('#F59E0B')} />
                                </div>
                                <div style={fieldGroupStyle}>
                                    <label style={labelStyle}><CreditCard size={13} /> DNI Paciente</label>
                                    <input type="text" placeholder="Ej: 07808684"
                                        value={certData.dniPaciente}
                                        onChange={e => setCertData(p => ({ ...p, dniPaciente: e.target.value }))}
                                        style={inputStyle} {...focusBorder('#F59E0B')} />
                                </div>
                                <div style={fieldGroupStyle}>
                                    <label style={labelStyle}><Heart size={13} /> Tipo de Terapia</label>
                                    <select value={certData.tipoTerapia}
                                        onChange={e => setCertData(p => ({ ...p, tipoTerapia: e.target.value }))}
                                        style={selectStyle}>
                                        <option value="intensiva">Intensiva</option>
                                        <option value="intermedia">Intermedia</option>
                                        <option value="intensiva/intermedia">Intensiva/Intermedia</option>
                                    </select>
                                </div>
                                <div style={fieldGroupStyle}>
                                    <label style={labelStyle}><Stethoscope size={13} /> Diagnóstico</label>
                                    <input type="text" placeholder="Ej: INSUFICIENCIA RESPIRATORIA"
                                        value={certData.diagnostico}
                                        onChange={e => setCertData(p => ({ ...p, diagnostico: e.target.value.toUpperCase() }))}
                                        style={inputStyle} {...focusBorder('#F59E0B')} />
                                </div>
                                <div style={fieldGroupStyle}>
                                    <label style={labelStyle}><User size={13} /> Nombre del Cuidador/a</label>
                                    <input type="text" placeholder="Ej: PEREZ, MARIA"
                                        value={certData.nombreCuidador}
                                        onChange={e => setCertData(p => ({ ...p, nombreCuidador: e.target.value.toUpperCase() }))}
                                        style={inputStyle} {...focusBorder('#F59E0B')} />
                                </div>
                                <div style={fieldGroupStyle}>
                                    <label style={labelStyle}><CreditCard size={13} /> DNI Cuidador/a</label>
                                    <input type="text" placeholder="Ej: 30567890"
                                        value={certData.dniCuidador}
                                        onChange={e => setCertData(p => ({ ...p, dniCuidador: e.target.value }))}
                                        style={inputStyle} {...focusBorder('#F59E0B')} />
                                </div>
                                <div style={fieldGroupStyle}>
                                    <label style={labelStyle}>Vigencia</label>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <input type="number" value={certData.vigencia}
                                            onChange={e => setCertData(p => ({ ...p, vigencia: e.target.value }))}
                                            style={{ ...inputStyle, maxWidth: '100px' }} {...focusBorder('#F59E0B')} />
                                        <select value={certData.unidadVigencia}
                                            onChange={e => setCertData(p => ({ ...p, unidadVigencia: e.target.value }))}
                                            style={{ ...selectStyle, maxWidth: '100px' }}>
                                            <option value="hs">Horas</option>
                                            <option value="dias">Días</option>
                                        </select>
                                    </div>
                                </div>
                                <div style={fieldGroupStyle}>
                                    <label style={labelStyle}>Fecha</label>
                                    <input type="date" value={certData.fecha}
                                        onChange={e => setCertData(p => ({ ...p, fecha: e.target.value }))}
                                        style={inputStyle} {...focusBorder('#F59E0B')} />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
                                <button onClick={() => setCertData(CERT_INITIAL)} style={{
                                    padding: '10px 20px', borderRadius: 'var(--radius-md)',
                                    border: '1.5px solid var(--neutral-200)', background: '#fff',
                                    fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', color: 'var(--neutral-500)',
                                }}>Limpiar</button>
                                <button onClick={handlePrintCert} style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '10px 24px', borderRadius: 'var(--radius-md)',
                                    background: '#D97706', color: '#fff', fontSize: '0.85rem', fontWeight: 700,
                                    border: 'none', cursor: 'pointer', boxShadow: '0 2px 8px #D9770640',
                                }}
                                    onMouseOver={e => e.currentTarget.style.background = '#B45309'}
                                    onMouseOut={e => e.currentTarget.style.background = '#D97706'}
                                ><Printer size={16} /> Imprimir Certificado</button>
                            </div>
                        </div>
                    )}

                    {/* ═══════════════════════════════════════ */}
                    {/* SEARCH — for Doppler / Adicionales      */}
                    {/* ═══════════════════════════════════════ */}
                    {!isSpecialMode && (
                        <>
                            <div className="practice-search__input-wrapper">
                                <Search size={18} className="practice-search__input-icon" />
                                <input ref={inputRef} id="marcela-search-input" type="text"
                                    className="practice-search__input"
                                    placeholder="Buscar por código o nombre de práctica..."
                                    value={query}
                                    onChange={e => { setQuery(e.target.value); setShowResults(true); setSelectedIndex(-1); }}
                                    onFocus={() => setShowResults(true)}
                                    onKeyDown={handleKeyDown} autoComplete="off" />
                                {query && (
                                    <button className="practice-search__clear" onClick={clearSearch} aria-label="Limpiar búsqueda">
                                        <X size={16} />
                                    </button>
                                )}
                            </div>

                            {showDropdown && (
                                <div className="practice-search__results animate-scale-in" ref={resultsRef}>
                                    {displayResults.length === 0 ? (
                                        <div className="practice-search__no-results">
                                            <Search size={24} />
                                            <p>No se encontraron prácticas para "<strong>{query}</strong>"</p>
                                        </div>
                                    ) : (
                                        displayResults.map((practice, index) => (
                                            <div key={practice.code}
                                                className={`practice-result ${index === selectedIndex ? 'practice-result--selected' : ''}`}
                                                onClick={() => handleAdd(practice)}>
                                                <div className="practice-result__info">
                                                    <span className="practice-result__category-dot"
                                                        style={{ backgroundColor: getCategoryColor(practice.category) }} />
                                                    <span className="practice-result__code">{practice.code}</span>
                                                    <span className="practice-result__name">{practice.name}</span>
                                                    {practice.uImagen && (
                                                        <span style={{ fontSize: '0.65rem', color: 'var(--neutral-400)', fontStyle: 'italic', marginLeft: '8px' }}>
                                                            U.Img: {practice.uImagen}
                                                        </span>
                                                    )}
                                                    {practice.uInsumo && (
                                                        <span style={{ fontSize: '0.65rem', color: 'var(--neutral-400)', fontStyle: 'italic', marginLeft: '8px' }}>
                                                            U.Ins: {practice.uInsumo}
                                                        </span>
                                                    )}
                                                </div>
                                                <button className="practice-result__add"
                                                    onClick={e => { e.stopPropagation(); handleAdd(practice); }}
                                                    aria-label={`Agregar ${practice.name}`}>
                                                    <Plus size={16} />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                    {filteredPractices.length > 20 && (
                                        <div className="practice-search__more">
                                            +{filteredPractices.length - 20} resultados más
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Cart */}
                <Cart items={cartItems} onUpdateItem={handleUpdateItem}
                    onRemoveItem={handleRemoveItem} onClearCart={handleClearCart}
                    onPrintAll={handlePrintAll} onPrintSingle={handlePrintSingle} />
            </div>

            {/* ══════════════════════════════════════════════ */}
            {/* PRINT TEMPLATES (hidden on screen)            */}
            {/* ══════════════════════════════════════════════ */}

            {/* Regular cart print */}
            <PrintTemplate ref={printRef} patientData={patientData}
                items={printItems ? [] : cartItems} singleItem={printItems || null} />

            {/* ── Special Print: Certificado ── */}
            {specialPrint?.type === 'certificado' && (
                <div className="print-area">
                    <div className="print-page">
                        <div className="print-patient-name">{certData.nombrePaciente}</div>
                        <div className="print-fields" style={{ marginTop: '6mm' }}>
                            <p style={{ fontSize: '10pt', lineHeight: '2', textAlign: 'justify' }}>
                                {specialPrint.data.text}
                            </p>
                        </div>
                        <div className="print-bottom-section">
                            <div className="print-date-block">
                                <span className="print-date-value">{formatDate(certData.fecha)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Special Print: Oxigenoterapia ── */}
            {specialPrint?.type === 'oxigenoterapia' && (() => {
                const p = specialPrint.patient || patientData;
                const d = specialPrint.data;
                return (
                    <div className="print-area">
                        <div className="print-page">
                            <div className="print-patient-name">{p.nombre}</div>
                            <div className="print-os-line">
                                {p.obraSocial}{p.afiliado ? `: ${p.afiliado}` : ''}
                            </div>
                            <div className="print-solicito-label">Solicito</div>
                            <div className="print-study-title">
                                Solicito Oxigenoterapia con{'\n'}Concentrador de Oxígeno
                            </div>
                            <div className="print-fields">
                                <div className="print-field-row">
                                    <span className="print-field-label">Req. diario:</span>
                                    <span className="print-field-value">{d.requerimientoDiario || ''}</span>
                                </div>
                                <div className="print-field-row">
                                    <span className="print-field-label">Dosis:</span>
                                    <span className="print-field-value">{d.dosis || ''}</span>
                                </div>
                                <div className="print-field-row">
                                    <span className="print-field-label">Horas:</span>
                                    <span className="print-field-value">{d.horas || ''}</span>
                                </div>
                                <div className="print-field-row">
                                    <span className="print-field-label">Período:</span>
                                    <span className="print-field-value">{d.periodo || ''}</span>
                                </div>
                                <div className="print-field-row">
                                    <span className="print-field-label">Diag.:</span>
                                    <span className="print-field-value">{d.diagnostico || ''}</span>
                                </div>
                            </div>
                            <div className="print-bottom-section">
                                <div className="print-date-block">
                                    <span className="print-date-value">{formatDate(p.fecha)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ── Special Print: Internación Domiciliaria ── */}
            {specialPrint?.type === 'domiciliaria' && (() => {
                const p = specialPrint.patient || patientData;
                const d = specialPrint.data;
                return (
                    <div className="print-area">
                        <div className="print-page">
                            <div className="print-patient-name">{p.nombre}</div>
                            <div className="print-os-line">
                                {p.obraSocial}{p.afiliado ? `: ${p.afiliado}` : ''}
                            </div>
                            <div className="print-solicito-label">Solicito</div>
                            <div className="print-study-title">
                                Solicito Internación Domiciliaria
                            </div>
                            <div className="print-fields">
                                <div className="print-field-row">
                                    <span className="print-field-label">APP:</span>
                                    <span className="print-field-value">{d.app || ''}</span>
                                </div>
                                <div className="print-field-row">
                                    <span className="print-field-label">Diag.:</span>
                                    <span className="print-field-value">{d.diagnostico || ''}</span>
                                </div>
                                <div className="print-field-row" style={{ marginTop: '4mm' }}>
                                    <span className="print-field-label">Visita Médica:</span>
                                    <span className="print-field-value">{d.visitaMedica || ''}</span>
                                </div>
                                <div className="print-field-row">
                                    <span className="print-field-label">Visita Enfermería:</span>
                                    <span className="print-field-value">{d.visitaEnfermeria || ''}</span>
                                </div>
                                <div className="print-field-row">
                                    <span className="print-field-label">Visita Kinesioterapia:</span>
                                    <span className="print-field-value">{d.visitaKinesiologia || ''}</span>
                                </div>
                            </div>
                            <div className="print-bottom-section">
                                <div className="print-date-block">
                                    <span className="print-date-value">{formatDate(p.fecha)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </>
    );
}
