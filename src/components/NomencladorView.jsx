/**
 * Vista completa del Nomenclador con filtros y búsqueda
 */
import { useState, useMemo } from 'react';
import { Search, BookOpen, Hash, Tag, Filter } from 'lucide-react';
import { PRACTICES, CATEGORIES } from '../data/nomenclador';

export default function NomencladorView({ onAddToCart }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [activeCategory, setActiveCategory] = useState('all');

    const filtered = useMemo(() => {
        return PRACTICES.filter(p => {
            const matchesCategory = activeCategory === 'all' || p.category === activeCategory;
            if (!matchesCategory) return false;
            if (!searchTerm) return true;
            const term = searchTerm.toLowerCase();
            return p.code.toLowerCase().includes(term) ||
                p.name.toLowerCase().includes(term) ||
                p.category.toLowerCase().includes(term);
        });
    }, [searchTerm, activeCategory]);

    // Group by category for display
    const grouped = useMemo(() => {
        const groups = {};
        filtered.forEach(p => {
            const cat = CATEGORIES.find(c => c.id === p.category);
            const label = cat?.label || p.category;
            if (!groups[label]) groups[label] = [];
            groups[label].push(p);
        });
        return groups;
    }, [filtered]);

    const categoryColors = {
        prorroga: '#8B5CF6',
        neonatal: '#EC4899',
        anestesia: '#F59E0B',
        laboratorio: '#10B981',
        hemoterapia: '#EF4444',
        cardiologia: '#F43F5E',
        interconsulta: '#6366F1',
        biopsia: '#A855F7',
        instrumentos: '#64748B',
        kinesiologia: '#14B8A6',
        radiologia: '#3B82F6',
        ecografia: '#0EA5E9',
        eco_doppler: '#0891B2',
        ginecologia: '#D946EF',
        tomografia: '#7C3AED',
    };

    return (
        <div className="content no-print" style={{ gap: 'var(--space-4)' }}>
            {/* Header */}
            <div className="patient-header" style={{ padding: 'var(--space-5) var(--space-6)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: 'var(--radius-lg)',
                        background: 'linear-gradient(135deg, var(--primary-500), var(--primary-700))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
                    }}>
                        <BookOpen size={20} />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--neutral-900)' }}>
                            Nomenclador Completo
                        </h2>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--neutral-500)' }}>
                            {PRACTICES.length} prácticas en {CATEGORIES.length - 1} categorías
                        </p>
                    </div>
                </div>

                {/* Search */}
                <div className="practice-search__input-wrapper" style={{ marginBottom: 'var(--space-4)' }}>
                    <Search size={16} className="practice-search__input-icon" />
                    <input
                        className="practice-search__input"
                        placeholder="Buscar por código o nombre de práctica..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ fontSize: '0.85rem', padding: '12px 12px 12px 40px' }}
                    />
                </div>

                {/* Category chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {CATEGORIES.map(cat => {
                        const isActive = activeCategory === cat.id;
                        const color = categoryColors[cat.id] || 'var(--primary-600)';
                        const count = cat.id === 'all'
                            ? PRACTICES.length
                            : PRACTICES.filter(p => p.category === cat.id).length;
                        return (
                            <button
                                key={cat.id}
                                onClick={() => setActiveCategory(cat.id)}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                                    padding: '5px 12px', borderRadius: '20px',
                                    fontSize: '0.75rem', fontWeight: 600,
                                    border: `1.5px solid ${isActive ? color : 'transparent'}`,
                                    background: isActive ? color + '15' : 'var(--neutral-100)',
                                    color: isActive ? color : 'var(--neutral-600)',
                                    cursor: 'pointer', transition: 'all 0.15s',
                                }}
                            >
                                {cat.label}
                                <span style={{
                                    fontSize: '0.65rem', padding: '1px 5px',
                                    borderRadius: '10px',
                                    background: isActive ? color + '25' : 'var(--neutral-200)',
                                    color: isActive ? color : 'var(--neutral-500)',
                                }}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Results */}
            {filtered.length === 0 ? (
                <div className="cart">
                    <div className="cart__empty-state">
                        <Search size={48} strokeWidth={1.2} />
                        <h3>Sin resultados</h3>
                        <p>No se encontraron prácticas que coincidan con "{searchTerm}"</p>
                    </div>
                </div>
            ) : (
                Object.entries(grouped).map(([catLabel, practices]) => (
                    <div key={catLabel} className="cart animate-fade-in">
                        <div className="cart__header" style={{ padding: 'var(--space-3) var(--space-5)' }}>
                            <div className="cart__title-group">
                                <div className="cart__icon-badge" style={{
                                    background: (categoryColors[practices[0]?.category] || '#6366F1') + '15',
                                    color: categoryColors[practices[0]?.category] || '#6366F1',
                                }}>
                                    <Tag size={14} />
                                </div>
                                <h3 className="cart__title" style={{ fontSize: '0.9rem' }}>{catLabel}</h3>
                                <span className="cart__badge">{practices.length}</span>
                            </div>
                        </div>
                        <div className="cart__table-wrapper">
                            <table className="cart__table">
                                <thead>
                                    <tr>
                                        <th className="cart__th" style={{ width: '140px' }}>Código</th>
                                        <th className="cart__th">Práctica</th>
                                        <th className="cart__th" style={{ width: '120px' }}>Campo especial</th>
                                        {onAddToCart && <th className="cart__th" style={{ width: '80px', textAlign: 'center' }}>Acción</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {practices.map(p => {
                                        const color = categoryColors[p.category] || '#6366F1';
                                        return (
                                            <tr key={p.code + p.name} className="cart__row">
                                                <td className="cart__td">
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                        fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 700,
                                                        background: color + '12', color: color,
                                                        padding: '3px 10px', borderRadius: 'var(--radius-md)',
                                                    }}>
                                                        <Hash size={11} />{p.code}
                                                    </span>
                                                </td>
                                                <td className="cart__td" style={{ fontSize: '0.83rem' }}>
                                                    {p.name}
                                                </td>
                                                <td className="cart__td" style={{ fontSize: '0.75rem', color: 'var(--neutral-500)' }}>
                                                    {p.customField === 'days' && '📅 Días'}
                                                    {p.customField === 'roman' && '🔢 Complejidad'}
                                                    {p.customField === 'specialty' && '✏️ Especialidad'}
                                                    {!p.customField && '—'}
                                                </td>
                                                {onAddToCart && (
                                                    <td className="cart__td" style={{ textAlign: 'center' }}>
                                                        <button
                                                            onClick={() => onAddToCart(p)}
                                                            style={{
                                                                padding: '4px 12px', borderRadius: 'var(--radius-md)',
                                                                background: 'var(--primary-50)', color: 'var(--primary-600)',
                                                                border: 'none', cursor: 'pointer', fontSize: '0.75rem',
                                                                fontWeight: 600, transition: 'all 0.15s',
                                                            }}
                                                            onMouseOver={e => { e.target.style.background = 'var(--primary-100)'; }}
                                                            onMouseOut={e => { e.target.style.background = 'var(--primary-50)'; }}
                                                        >
                                                            + Agregar
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))
            )}
        </div>
    );
}
