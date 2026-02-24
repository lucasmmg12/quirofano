/**
 * InternacionSearch — Buscador de pedidos de internación
 * Similar a PracticeSearch pero con encabezados institucionales.
 * 
 * Encabezados 1-6: campo manual de código
 * Encabezado 7 (Prácticas): abre buscador del nomenclador para elegir práctica + cantidad
 */
import { useState, useRef, useEffect } from 'react';
import { Search, Plus, X, BedDouble, FileText } from 'lucide-react';
import { PRACTICES, CATEGORIES } from '../data/nomenclador';
import { filterPractices } from '../utils/searchUtils';

// Encabezados de internación
const ENCABEZADOS = [
    { id: 'internacion', label: 'Internación', header: 'Solicito autorización de internación en Sanatorio Argentino', hasCode: true },
    { id: 'cirugia', label: 'Cirugía', header: 'Solicito autorización de cirugía en Sanatorio Argentino', hasCode: true },
    { id: 'uci', label: 'UCI', header: 'Solicito autorización en UCI en Sanatorio Argentino', hasCode: true },
    { id: 'utip', label: 'UTIP', header: 'Solicito autorización en UTIP en Sanatorio Argentino', hasCode: true },
    { id: 'utin', label: 'UTIN', header: 'Solicito autorización en UTIN en Sanatorio Argentino', hasCode: true },
    { id: 'sutura', label: 'Sutura de Herida', header: 'Solicito autorización de Sutura de Herida', hasCode: true },
    { id: 'practicas', label: 'Prácticas', header: 'Solicito autorización', hasCode: false },
];

const ENCABEZADO_COLORS = {
    internacion: '#7C3AED',
    cirugia: '#EF4444',
    uci: '#F59E0B',
    utip: '#0EA5E9',
    utin: '#14B8A6',
    sutura: '#EC4899',
    practicas: '#6366F1',
};

export default function InternacionSearch({ onAddToCart }) {
    const [activeEncabezado, setActiveEncabezado] = useState(null);
    const [codigoManual, setCodigoManual] = useState('');

    // Práctica search state (only for "practicas" encabezado)
    const [query, setQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState('all');
    const [showResults, setShowResults] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const inputRef = useRef(null);
    const resultsRef = useRef(null);
    const codeInputRef = useRef(null);

    const filteredPractices = filterPractices(query, PRACTICES, activeCategory);
    const showDropdown = showResults && (query.length > 0 || activeCategory !== 'all');
    const displayResults = showDropdown ? filteredPractices.slice(0, 15) : [];

    const selectedEnc = ENCABEZADOS.find(e => e.id === activeEncabezado);

    // Keyboard navigation for practice search
    const handleKeyDown = (e) => {
        if (!showDropdown) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => Math.min(prev + 1, displayResults.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, -1));
        } else if (e.key === 'Enter' && selectedIndex >= 0) {
            e.preventDefault();
            handleAddPractice(displayResults[selectedIndex]);
        } else if (e.key === 'Escape') {
            setShowResults(false);
            setSelectedIndex(-1);
        }
    };

    // Scroll selected into view
    useEffect(() => {
        if (selectedIndex >= 0 && resultsRef.current) {
            const item = resultsRef.current.children[selectedIndex];
            if (item) item.scrollIntoView({ block: 'nearest' });
        }
    }, [selectedIndex]);

    // Close dropdown on outside click
    useEffect(() => {
        const handleOutside = (e) => {
            if (resultsRef.current && !resultsRef.current.contains(e.target) &&
                inputRef.current && !inputRef.current.contains(e.target)) {
                setShowResults(false);
            }
        };
        document.addEventListener('mousedown', handleOutside);
        return () => document.removeEventListener('mousedown', handleOutside);
    }, []);

    // Focus code input when encabezado with code is selected
    useEffect(() => {
        if (selectedEnc?.hasCode) {
            setTimeout(() => codeInputRef.current?.focus(), 100);
        }
    }, [activeEncabezado]);

    // Add encabezado with manual code to cart
    const handleAddManual = () => {
        if (!selectedEnc) return;
        onAddToCart({
            code: codigoManual.trim() || '—',
            name: selectedEnc.header,
            category: 'internacion',
            encabezado: selectedEnc.header,
            isInternacion: true,
        });
        setCodigoManual('');
    };

    // Add practice from nomenclador to cart (for "practicas" encabezado)
    const handleAddPractice = (practice) => {
        onAddToCart({
            code: practice.code,
            name: `Solicito ${practice.name}`,
            category: 'internacion',
            encabezado: `Solicito ${practice.name}`,
            isInternacion: true,
        });
        setQuery('');
        setSelectedIndex(-1);
        inputRef.current?.focus();
    };

    const clearSearch = () => {
        setQuery('');
        setSelectedIndex(-1);
        inputRef.current?.focus();
    };

    const getCategoryColor = (categoryId) => {
        const colors = {
            laboratorio: '#8B5CF6', imagen: '#0EA5E9', anestesia: '#F59E0B',
            cirugia: '#EF4444', farmacia: '#22C55E', cardiologia: '#EC4899',
            kinesiologia: '#14B8A6',
        };
        return colors[categoryId] || '#64748B';
    };

    return (
        <div className="practice-search animate-fade-in">
            {/* Header */}
            <div className="practice-search__header">
                <h3 className="practice-search__title">
                    <BedDouble size={18} />
                    Buscar Internaciones
                </h3>
                <span className="practice-search__count">
                    {ENCABEZADOS.length} tipos disponibles
                </span>
            </div>

            {/* Encabezado Chips */}
            <div className="practice-search__categories">
                {ENCABEZADOS.map(enc => (
                    <button
                        key={enc.id}
                        className={`category-chip ${activeEncabezado === enc.id ? 'category-chip--active' : ''}`}
                        onClick={() => {
                            setActiveEncabezado(enc.id === activeEncabezado ? null : enc.id);
                            setCodigoManual('');
                            setQuery('');
                            setShowResults(false);
                            setSelectedIndex(-1);
                        }}
                        style={activeEncabezado === enc.id ? {
                            backgroundColor: ENCABEZADO_COLORS[enc.id],
                            borderColor: ENCABEZADO_COLORS[enc.id],
                        } : {}}
                    >
                        {enc.label}
                    </button>
                ))}
            </div>

            {/* === Panel de acción según encabezado seleccionado === */}

            {/* Encabezados 1-6: Campo manual de código + agregar */}
            {selectedEnc?.hasCode && (
                <div className="animate-fade-in" style={{
                    background: '#F8FAFC', border: '1.5px solid #E2E8F0',
                    borderRadius: 'var(--radius-lg)', padding: '20px',
                    marginTop: '12px',
                }}>
                    <p style={{
                        margin: '0 0 12px', fontSize: '0.85rem', fontWeight: 600,
                        color: ENCABEZADO_COLORS[activeEncabezado],
                    }}>
                        <FileText size={14} style={{ verticalAlign: '-2px', marginRight: '6px' }} />
                        {selectedEnc.header}
                    </p>

                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                        <div style={{ flex: 1 }}>
                            <label style={{
                                fontSize: '0.72rem', fontWeight: 600,
                                color: 'var(--neutral-500)', marginBottom: '4px', display: 'block',
                            }}>
                                Código
                            </label>
                            <input
                                ref={codeInputRef}
                                value={codigoManual}
                                onChange={e => setCodigoManual(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleAddManual(); }}
                                placeholder="Ingresar código..."
                                style={{
                                    width: '100%', padding: '10px 12px',
                                    borderRadius: 'var(--radius-md)',
                                    border: '1.5px solid var(--neutral-200)',
                                    fontSize: '0.85rem', fontFamily: 'inherit', outline: 'none',
                                    transition: 'border-color 0.2s',
                                }}
                                onFocus={e => e.target.style.borderColor = ENCABEZADO_COLORS[activeEncabezado]}
                                onBlur={e => e.target.style.borderColor = 'var(--neutral-200)'}
                            />
                        </div>
                        <button
                            onClick={handleAddManual}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '10px 20px', borderRadius: 'var(--radius-md)',
                                background: ENCABEZADO_COLORS[activeEncabezado],
                                color: '#fff', fontSize: '0.82rem', fontWeight: 700,
                                border: 'none', cursor: 'pointer',
                                boxShadow: `0 2px 8px ${ENCABEZADO_COLORS[activeEncabezado]}40`,
                                transition: 'all 0.2s',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            <Plus size={16} /> Agregar
                        </button>
                    </div>
                </div>
            )}

            {/* Encabezado 7 (Prácticas): buscador del nomenclador */}
            {activeEncabezado === 'practicas' && (
                <div className="animate-fade-in" style={{ marginTop: '12px' }}>
                    {/* Category sub-chips for practices */}
                    <div className="practice-search__categories" style={{ marginBottom: '8px' }}>
                        {CATEGORIES.map(cat => (
                            <button
                                key={cat.id}
                                className={`category-chip ${activeCategory === cat.id ? 'category-chip--active' : ''}`}
                                onClick={() => {
                                    setActiveCategory(cat.id);
                                    setShowResults(true);
                                    setSelectedIndex(-1);
                                }}
                                style={activeCategory === cat.id ? {
                                    backgroundColor: cat.id === 'all' ? '#6366F1' : getCategoryColor(cat.id),
                                    borderColor: cat.id === 'all' ? '#6366F1' : getCategoryColor(cat.id),
                                    fontSize: '0.68rem',
                                } : { fontSize: '0.68rem' }}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>

                    {/* Practice search input */}
                    <div className="practice-search__input-wrapper">
                        <Search size={18} className="practice-search__input-icon" />
                        <input
                            ref={inputRef}
                            type="text"
                            className="practice-search__input"
                            placeholder="Buscar práctica por código o nombre..."
                            value={query}
                            onChange={e => {
                                setQuery(e.target.value);
                                setShowResults(true);
                                setSelectedIndex(-1);
                            }}
                            onFocus={() => setShowResults(true)}
                            onKeyDown={handleKeyDown}
                            autoComplete="off"
                        />
                        {query && (
                            <button className="practice-search__clear" onClick={clearSearch} aria-label="Limpiar búsqueda">
                                <X size={16} />
                            </button>
                        )}
                    </div>

                    {/* Results Dropdown */}
                    {showDropdown && (
                        <div className="practice-search__results animate-scale-in" ref={resultsRef}>
                            {displayResults.length === 0 ? (
                                <div className="practice-search__no-results">
                                    <Search size={24} />
                                    <p>No se encontraron prácticas para "<strong>{query}</strong>"</p>
                                </div>
                            ) : (
                                displayResults.map((practice, index) => (
                                    <div
                                        key={practice.code}
                                        className={`practice-result ${index === selectedIndex ? 'practice-result--selected' : ''}`}
                                        onClick={() => handleAddPractice(practice)}
                                    >
                                        <div className="practice-result__info">
                                            <span
                                                className="practice-result__category-dot"
                                                style={{ backgroundColor: getCategoryColor(practice.category) }}
                                            />
                                            <span className="practice-result__code">{practice.code}</span>
                                            <span className="practice-result__name">{practice.name}</span>
                                        </div>
                                        <button
                                            className="practice-result__add"
                                            onClick={(e) => { e.stopPropagation(); handleAddPractice(practice); }}
                                            aria-label={`Agregar ${practice.name}`}
                                        >
                                            <Plus size={16} />
                                        </button>
                                    </div>
                                ))
                            )}
                            {filteredPractices.length > 15 && (
                                <div className="practice-search__more">
                                    +{filteredPractices.length - 15} resultados más — Refine su búsqueda
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Hint when nothing is selected */}
            {!activeEncabezado && (
                <div style={{
                    padding: '24px', textAlign: 'center',
                    color: 'var(--neutral-400)', fontSize: '0.82rem',
                    fontStyle: 'italic',
                }}>
                    Seleccioná un tipo de pedido para comenzar
                </div>
            )}
        </div>
    );
}
