/**
 * CommandPalette — Spotlight/Ctrl+K global para invocar Beto
 * 
 * Se activa con Ctrl+K desde cualquier punto del sistema.
 * Secciones: Navegación rápida, Acciones frecuentes, Búsqueda con Beto.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Search, ArrowRight, Stethoscope, DollarSign, MessageCircle,
    Home, ClipboardCheck, Ticket, Brain, Settings, BarChart3,
    Sparkles, Command, FileText, PackageCheck, Microscope,
    Zap, TrendingUp, Clock
} from 'lucide-react';

const MODULE_ITEMS = [
    { id: 'inicio', label: 'Inicio', icon: Home, keywords: ['home', 'inicio', 'principal'] },
    { id: 'mensajeria', label: 'Mensajería / Chat', icon: MessageCircle, keywords: ['chat', 'whatsapp', 'mensajes'] },
    { id: 'pedidos', label: 'Nuevo Pedido', icon: FileText, keywords: ['pedido', 'practica', 'nomenclador'] },
    { id: 'cirugias', label: 'Control de Cirugías', icon: Stethoscope, keywords: ['cirugia', 'operacion', 'quirofano'] },
    { id: 'pacientes', label: 'Pacientes 360°', icon: Home, keywords: ['paciente', '360', 'ficha', 'historia'] },
    { id: 'deudas', label: 'Gestión de Deudas', icon: DollarSign, keywords: ['deuda', 'cobro', 'factura'] },
    { id: 'altas', label: 'Altas Administrativas', icon: ClipboardCheck, keywords: ['alta', 'ingreso', 'egreso'] },
    { id: 'turnos', label: 'Cola de Turnos', icon: Ticket, keywords: ['turno', 'cola', 'espera'] },
    { id: 'metricas', label: 'Métricas de Cirugías', icon: BarChart3, keywords: ['metrica', 'estadistica', 'grafico'] },
    { id: 'asociaciones_entrega', label: 'Entrega Asociaciones', icon: PackageCheck, keywords: ['asociacion', 'entrega', 'documentacion'] },
    { id: 'laboratorios', label: 'Anatomía Patológica', icon: Microscope, keywords: ['laboratorio', 'biopsia', 'anatomia'] },
    { id: 'documentos', label: 'Documentos', icon: FileText, keywords: ['documento', 'archivo', 'pdf', 'excel', 'categoria'] },
    { id: 'consultas', label: 'Consultas de Guardia', icon: ClipboardCheck, keywords: ['consulta', 'guardia', 'urgencia', 'emergencia'] },
    { id: 'beto', label: 'Beto IA', icon: Brain, keywords: ['beto', 'ia', 'documento', 'ocr'] },
    { id: 'config', label: 'Configuración', icon: Settings, keywords: ['config', 'ajuste', 'usuario'] },
];

const QUICK_ACTIONS = [
    { label: 'Cirugías de hoy', prompt: '📊 Reporte de cirugías de hoy', icon: Stethoscope },
    { label: 'Pendientes', prompt: '🔔 ¿Qué hay pendiente hoy?', icon: Clock },
    { label: 'Resumen de deudas', prompt: '💰 Resumen de deudas sin gestionar', icon: DollarSign },
    { label: 'Tendencias', prompt: '📈 Dame un análisis de tendencias de cirugías del último mes', icon: TrendingUp },
];

export default function CommandPalette({ isOpen, onClose, onNavigate, onBetoQuery }) {
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    const filteredModules = MODULE_ITEMS.filter(item =>
        !query || item.label.toLowerCase().includes(query.toLowerCase()) ||
        item.keywords.some(k => k.includes(query.toLowerCase()))
    );

    const filteredActions = QUICK_ACTIONS.filter(a =>
        !query || a.label.toLowerCase().includes(query.toLowerCase())
    );

    const allItems = [
        ...filteredModules.map(m => ({ type: 'nav', ...m })),
        ...filteredActions.map(a => ({ type: 'action', ...a })),
    ];

    // If query doesn't match anything, show "Ask Beto" option
    const showBetoOption = query.trim().length > 2 && allItems.length < 3;

    const handleSelect = useCallback((item) => {
        if (item.type === 'nav') {
            onNavigate(item.id);
        } else if (item.type === 'action') {
            onBetoQuery?.(item.prompt);
        } else if (item.type === 'beto') {
            onBetoQuery?.(query);
        }
        onClose();
    }, [onNavigate, onBetoQuery, onClose, query]);

    const handleKeyDown = useCallback((e) => {
        const total = allItems.length + (showBetoOption ? 1 : 0);
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => Math.min(prev + 1, total - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex < allItems.length) {
                handleSelect(allItems[selectedIndex]);
            } else if (showBetoOption) {
                handleSelect({ type: 'beto' });
            }
        } else if (e.key === 'Escape') {
            onClose();
        }
    }, [allItems, selectedIndex, showBetoOption, handleSelect, onClose]);

    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 99999,
                background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)',
                display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                paddingTop: '15vh',
                animation: 'beto-fade-in 0.15s ease-out',
            }}
            onClick={onClose}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    width: '580px', maxHeight: '480px',
                    background: '#fff', borderRadius: '16px',
                    boxShadow: '0 25px 60px rgba(0,0,0,0.3), 0 0 0 1px rgba(99,102,241,0.1)',
                    overflow: 'hidden', display: 'flex', flexDirection: 'column',
                    animation: 'beto-slide-up 0.2s ease-out',
                    fontFamily: "'Inter', -apple-system, sans-serif",
                }}
            >
                {/* Search Input */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '16px 20px', borderBottom: '1px solid #E2E8F0',
                }}>
                    <Search size={20} style={{ color: '#94A3B8', flexShrink: 0 }} />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
                        onKeyDown={handleKeyDown}
                        placeholder="Buscar módulos, acciones, o preguntale a Beto..."
                        style={{
                            flex: 1, border: 'none', outline: 'none',
                            fontSize: '0.95rem', color: '#1E293B',
                            fontFamily: 'inherit', background: 'transparent',
                        }}
                    />
                    <kbd style={{
                        padding: '2px 6px', borderRadius: '4px',
                        background: '#F1F5F9', border: '1px solid #E2E8F0',
                        fontSize: '0.65rem', fontWeight: 600, color: '#64748B',
                        fontFamily: 'monospace',
                    }}>ESC</kbd>
                </div>

                {/* Results */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                    {/* Navigation section */}
                    {filteredModules.length > 0 && (
                        <>
                            <div style={{
                                padding: '6px 12px', fontSize: '0.68rem', fontWeight: 700,
                                color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em',
                            }}>Navegación</div>
                            {filteredModules.map((item, i) => {
                                const Icon = item.icon;
                                const isSelected = selectedIndex === i;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => handleSelect({ type: 'nav', ...item })}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '12px',
                                            width: '100%', padding: '10px 12px', border: 'none',
                                            borderRadius: '8px', cursor: 'pointer', textAlign: 'left',
                                            background: isSelected ? '#EEF2FF' : 'transparent',
                                            color: isSelected ? '#4338CA' : '#334155',
                                            fontSize: '0.88rem', fontWeight: isSelected ? 600 : 500,
                                            transition: 'all 0.1s',
                                        }}
                                        onMouseEnter={() => setSelectedIndex(i)}
                                    >
                                        <Icon size={18} style={{ opacity: 0.7, flexShrink: 0 }} />
                                        <span style={{ flex: 1 }}>{item.label}</span>
                                        {isSelected && <ArrowRight size={14} style={{ opacity: 0.5 }} />}
                                    </button>
                                );
                            })}
                        </>
                    )}

                    {/* Quick Actions section */}
                    {filteredActions.length > 0 && (
                        <>
                            <div style={{
                                padding: '6px 12px', fontSize: '0.68rem', fontWeight: 700,
                                color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em',
                                marginTop: filteredModules.length > 0 ? '8px' : 0,
                            }}>
                                <Zap size={10} style={{ display: 'inline', marginRight: '4px' }} />
                                Acciones Rápidas
                            </div>
                            {filteredActions.map((action, i) => {
                                const idx = filteredModules.length + i;
                                const Icon = action.icon;
                                const isSelected = selectedIndex === idx;
                                return (
                                    <button
                                        key={action.label}
                                        onClick={() => handleSelect({ type: 'action', ...action })}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '12px',
                                            width: '100%', padding: '10px 12px', border: 'none',
                                            borderRadius: '8px', cursor: 'pointer', textAlign: 'left',
                                            background: isSelected ? '#F0FDF4' : 'transparent',
                                            color: isSelected ? '#15803D' : '#334155',
                                            fontSize: '0.88rem', fontWeight: isSelected ? 600 : 500,
                                            transition: 'all 0.1s',
                                        }}
                                        onMouseEnter={() => setSelectedIndex(idx)}
                                    >
                                        <Icon size={18} style={{ opacity: 0.7, flexShrink: 0 }} />
                                        <span style={{ flex: 1 }}>{action.label}</span>
                                        <Sparkles size={12} style={{ opacity: 0.3 }} />
                                    </button>
                                );
                            })}
                        </>
                    )}

                    {/* Ask Beto fallback */}
                    {showBetoOption && (
                        <button
                            onClick={() => handleSelect({ type: 'beto' })}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '12px',
                                width: '100%', padding: '14px 12px',
                                borderRadius: '8px', cursor: 'pointer', textAlign: 'left',
                                background: selectedIndex >= allItems.length
                                    ? 'linear-gradient(135deg, #EEF2FF 0%, #F5F3FF 100%)'
                                    : '#F8FAFC',
                                color: '#4338CA', fontSize: '0.88rem', fontWeight: 600,
                                transition: 'all 0.1s', marginTop: '4px',
                                border: '1px solid #E0E7FF',
                            }}
                            onMouseEnter={() => setSelectedIndex(allItems.length)}
                        >
                            <Sparkles size={18} style={{ color: '#6366F1' }} />
                            <span style={{ flex: 1 }}>
                                Preguntarle a Beto: "<em>{query}</em>"
                            </span>
                            <ArrowRight size={14} style={{ opacity: 0.5 }} />
                        </button>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '10px 20px', borderTop: '1px solid #F1F5F9',
                    display: 'flex', alignItems: 'center', gap: '16px',
                    fontSize: '0.68rem', color: '#94A3B8',
                }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <kbd style={{ padding: '1px 4px', borderRadius: '3px', background: '#F1F5F9', border: '1px solid #E2E8F0', fontSize: '0.6rem' }}>↑↓</kbd>
                        Navegar
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <kbd style={{ padding: '1px 4px', borderRadius: '3px', background: '#F1F5F9', border: '1px solid #E2E8F0', fontSize: '0.6rem' }}>↵</kbd>
                        Seleccionar
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Command size={10} />
                        <kbd style={{ padding: '1px 4px', borderRadius: '3px', background: '#F1F5F9', border: '1px solid #E2E8F0', fontSize: '0.6rem' }}>K</kbd>
                        Abrir/Cerrar
                    </span>
                </div>
            </div>
        </div>
    );
}
