import { useState, useRef, useEffect } from 'react';
import { Search, Plus, X } from 'lucide-react';
import { PRACTICES, CATEGORIES } from '../data/nomenclador';
import { filterPractices } from '../utils/searchUtils';

export default function PracticeSearch({ onAddToCart }) {
    const [query, setQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState('all');
    const [showResults, setShowResults] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const inputRef = useRef(null);
    const resultsRef = useRef(null);

    const filteredPractices = filterPractices(query, PRACTICES, activeCategory);
    const showDropdown = showResults && (query.length > 0 || activeCategory !== 'all');
    const displayResults = showDropdown ? filteredPractices.slice(0, 15) : [];

    // Keyboard navigation
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
            handleAdd(displayResults[selectedIndex]);
        } else if (e.key === 'Escape') {
            setShowResults(false);
            setSelectedIndex(-1);
        }
    };

    // Scroll selected item into view
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

    const handleAdd = (practice) => {
        onAddToCart(practice);
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
            laboratorio: '#8B5CF6',
            imagen: '#0EA5E9',
            anestesia: '#F59E0B',
            cirugia: '#EF4444',
            farmacia: '#22C55E',
            cardiologia: '#EC4899',
            kinesiologia: '#14B8A6',
        };
        return colors[categoryId] || '#64748B';
    };

    return (
        <div className="practice-search animate-fade-in">
            <div className="practice-search__header">
                <h3 className="practice-search__title">
                    <Search size={18} />
                    Buscar Prácticas
                </h3>
                <span className="practice-search__count">
                    {PRACTICES.length} prácticas disponibles
                </span>
            </div>

            {/* Category Filter Chips */}
            <div className="practice-search__categories">
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
                            backgroundColor: cat.id === 'all' ? 'var(--primary-500)' : getCategoryColor(cat.id),
                            borderColor: cat.id === 'all' ? 'var(--primary-500)' : getCategoryColor(cat.id),
                        } : {}}
                    >
                        {cat.label}
                    </button>
                ))}
            </div>

            {/* Search Input */}
            <div className="practice-search__input-wrapper">
                <Search size={18} className="practice-search__input-icon" />
                <input
                    ref={inputRef}
                    id="practice-search-input"
                    type="text"
                    className="practice-search__input"
                    placeholder="Buscar por código o nombre de práctica..."
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
                                onClick={() => handleAdd(practice)}
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
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleAdd(practice);
                                    }}
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
    );
}
