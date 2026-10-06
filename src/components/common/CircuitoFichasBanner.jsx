/**
 * CircuitoFichasBanner.jsx — Guía visual del circuito de fichas de internación
 *
 * Se muestra en los tres módulos del circuito para que todos los sectores
 * sepan en qué paso están, qué les corresponde hacer y a dónde va la ficha después:
 *   1. Entrega de Fichas  (Recepción → Administración, remito firmado)
 *   2. Control de Altas   (solo fichas ENTREGADAS; traspaso con remito a Facturación)
 *   3. Facturación        (solo fichas TRASPASADAS; devolución con remito a Control de Altas)
 *
 * Props:
 *   - step: 1 | 2 | 3 → paso del módulo actual
 *   - interactive: si es true, los pasos navegan al módulo (false en la vista pública de Recepción)
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    PackageCheck, ClipboardCheck, Receipt, ArrowRight, ChevronDown,
    AlertTriangle, CornerUpLeft, Info
} from 'lucide-react';
import { fetchFichasNoEntregadasDesdeCorte, FICHAS_CIRCUITO_CORTE } from '../../services/fichasAdmisionesService';

const BLUE = '#1d4ed8';
const BLUE_SOFT = '#eff6ff';
const STORAGE_KEY = 'circuito_fichas_expandido';

const CORTE_LABEL = FICHAS_CIRCUITO_CORTE.split('-').reverse().join('/');

export const CIRCUITO_PASOS = [
    {
        step: 1,
        view: 'entrega_fichas',
        title: 'Entrega de Fichas',
        who: 'Recepción / Admisión',
        icon: PackageCheck,
        resumen: 'Recepción entrega las fichas físicas a Administración con remito firmado (7:00 hs).',
        hacer: [
            'Buscar las admisiones del día anterior en la pestaña "Pendientes".',
            'Enviar al carrito solo las fichas que se entregan físicamente.',
            'En el carrito, marcar cada ficha como documentación completa o incompleta (con motivo).',
            'Firmar quien entrega y quien recibe, y emitir la entrega: se genera el remito PDF.',
            'Las fichas devueltas por Administración aparecen en "Devueltas": completar y "Subsanar" para volver a entregarlas.'
        ],
        resultado: 'La ficha queda ENTREGADA y recién ahí aparece en Control de Altas.'
    },
    {
        step: 2,
        view: 'altas',
        title: 'Control de Altas',
        who: 'Administración – Control de Altas',
        icon: ClipboardCheck,
        resumen: 'Controla las fichas ENTREGADAS, gestiona el estado del alta y las traspasa a Facturación.',
        hacer: [
            'Trabajar solo con fichas ya entregadas por Recepción (si una admisión no aparece, su ficha todavía no fue entregada).',
            'Controlar la documentación y actualizar el estado (Auditoría, Prórroga, Presupuesto, Alta Adm, etc.).',
            'Si falta documentación física: devolverla a Recepción desde "1. Entrega de Fichas" → Historial, indicando el motivo.',
            'Con la ficha lista: seleccionarla → enviar al carrito → generar el traspaso con remito y firma.',
            'Las fichas devueltas por Facturación aparecen como "Devuelta FAC": corregir y volver a traspasar.'
        ],
        resultado: 'La ficha queda TRASPASADA y aparece en Facturación.'
    },
    {
        step: 3,
        view: 'facturacion',
        title: 'Facturación',
        who: 'Facturación Internada',
        icon: Receipt,
        resumen: 'Factura las fichas TRASPASADAS desde Control de Altas o las devuelve con remito si tienen errores.',
        hacer: [
            'Trabajar solo con fichas recibidas por traspaso con remito desde Control de Altas.',
            'Asignar el analista responsable y avanzar el estado (Pendiente → En proceso → Facturada).',
            'La factura en SALUS (PDV 21/31) se detecta automáticamente y marca la ficha como Facturada.',
            'Si la ficha tiene errores: enviarla al "Carrito Devolución" y generar el remito de devolución con motivo.',
            'Nunca devolver una ficha directamente a Recepción: siempre vuelve a Control de Altas.'
        ],
        resultado: 'La ficha queda FACTURADA (o vuelve a Control de Altas como "Devuelta FAC").'
    }
];

const REGLAS_GENERALES = [
    `Aplica a toda admisión con fecha de ingreso desde el ${CORTE_LABEL}.`,
    'El orden es siempre 1 → 2 → 3. Ningún paso se saltea.',
    'Cada movimiento físico de fichas lleva remito con firma de quien entrega y quien recibe.',
    'Las devoluciones van siempre al paso anterior: Facturación → Control de Altas → Recepción.',
    'Si una admisión no aparece en un módulo, revisar en qué paso quedó: no se carga a mano ni se saltea el circuito.'
];

export default function CircuitoFichasBanner({ step = 1, interactive = true }) {
    let navigate = null;
    try {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        navigate = useNavigate();
    } catch {
        navigate = null;
    }

    const [expanded, setExpanded] = useState(() => {
        try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
    });
    const [noEntregadas, setNoEntregadas] = useState(null);

    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEY, expanded ? '1' : '0'); } catch { /* sin storage */ }
    }, [expanded]);

    useEffect(() => {
        if (step !== 1 && step !== 2) return;
        let cancelled = false;
        fetchFichasNoEntregadasDesdeCorte().then(res => {
            if (!cancelled) setNoEntregadas(res);
        });
        return () => { cancelled = true; };
    }, [step]);

    const actual = CIRCUITO_PASOS.find(p => p.step === step) || CIRCUITO_PASOS[0];
    const canNavigate = interactive && typeof navigate === 'function';

    return (
        <section
            aria-label="Circuito de fichas de internación"
            style={{
                background: '#ffffff', border: '1px solid #dbeafe', borderRadius: '8px',
                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)', padding: '14px 16px',
                marginBottom: '16px', fontFamily: "'Inter', -apple-system, sans-serif"
            }}
        >
            {/* Encabezado */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Info size={16} color={BLUE} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                        Circuito de fichas de internación
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        — Estás en el paso {actual.step}: <strong style={{ color: BLUE }}>{actual.title}</strong>
                    </span>
                </div>
                <button
                    type="button"
                    id={`circuito-fichas-toggle-${step}`}
                    onClick={() => setExpanded(v => !v)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px',
                        borderRadius: '8px', border: '1px solid #bfdbfe', background: BLUE_SOFT,
                        color: BLUE, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer'
                    }}
                >
                    {expanded ? 'Ocultar instrucciones' : 'Ver cómo funciona el circuito'}
                    <ChevronDown size={14} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </button>
            </div>

            {/* Stepper */}
            <div style={{ display: 'flex', alignItems: 'stretch', gap: '8px', flexWrap: 'wrap' }}>
                {CIRCUITO_PASOS.map((p, idx) => {
                    const Icon = p.icon;
                    const isActive = p.step === step;
                    const isDone = p.step < step;
                    const clickable = canNavigate && !isActive;
                    return (
                        <div key={p.step} style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 220px' }}>
                            <button
                                type="button"
                                id={`circuito-fichas-paso-${p.step}`}
                                disabled={!clickable}
                                onClick={() => clickable && navigate(`/${p.view}`)}
                                title={clickable ? `Ir a ${p.title}` : p.title}
                                style={{
                                    flex: 1, display: 'flex', alignItems: 'flex-start', gap: '10px', textAlign: 'left',
                                    padding: '10px 12px', borderRadius: '8px',
                                    border: `1px solid ${isActive ? BLUE : '#e2e8f0'}`,
                                    background: isActive ? BLUE_SOFT : '#ffffff',
                                    cursor: clickable ? 'pointer' : 'default',
                                    boxShadow: isActive ? '0 1px 3px rgba(29, 78, 216, 0.15)' : 'none',
                                    transition: 'border-color 0.2s, background 0.2s'
                                }}
                                onMouseOver={e => { if (clickable) e.currentTarget.style.borderColor = '#93c5fd'; }}
                                onMouseOut={e => { if (clickable) e.currentTarget.style.borderColor = '#e2e8f0'; }}
                            >
                                <div style={{
                                    width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: isActive ? BLUE : isDone ? '#dbeafe' : '#f1f5f9',
                                    color: isActive ? '#ffffff' : isDone ? BLUE : '#64748b',
                                    fontSize: '0.8rem', fontWeight: 800
                                }}>
                                    {p.step}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 800, color: isActive ? BLUE : '#1e293b' }}>
                                        <Icon size={14} /> {p.title}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', marginTop: '1px' }}>{p.who}</div>
                                    <div style={{ fontSize: '0.74rem', color: '#475569', marginTop: '4px', lineHeight: 1.4 }}>{p.resumen}</div>
                                </div>
                            </button>
                            {idx < CIRCUITO_PASOS.length - 1 && (
                                <ArrowRight size={18} color="#94a3b8" style={{ flexShrink: 0 }} />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Aviso de fichas no entregadas (pasos 1 y 2) */}
            {noEntregadas && noEntregadas.total > 0 && (
                <div style={{
                    marginTop: '12px', display: 'flex', alignItems: 'flex-start', gap: '8px',
                    padding: '10px 12px', borderRadius: '8px', background: '#fffbeb', border: '1px solid #fde68a',
                    fontSize: '0.78rem', color: '#92400e', lineHeight: 1.45
                }}>
                    <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                    <div>
                        {step === 2 ? (
                            <>
                                <strong>{noEntregadas.total} admisiones</strong> con ingreso desde el {CORTE_LABEL} todavía
                                <strong> no se ven en Control de Altas</strong> porque Recepción no entregó su ficha física
                                ({noEntregadas.pendientes} pendientes, {noEntregadas.enCarrito} en carrito, {noEntregadas.devueltas} devueltas a Recepción).
                                Aparecen automáticamente cuando se emite la entrega en <strong>1. Entrega de Fichas</strong>.
                            </>
                        ) : (
                            <>
                                Hay <strong>{noEntregadas.total} fichas</strong> con ingreso desde el {CORTE_LABEL} sin entregar
                                ({noEntregadas.pendientes} pendientes, {noEntregadas.enCarrito} en carrito, {noEntregadas.devueltas} devueltas).
                                <strong> Control de Altas no puede trabajarlas hasta que se emita su entrega.</strong>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Instrucciones detalladas */}
            {expanded && (
                <div style={{ marginTop: '14px', borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
                        {CIRCUITO_PASOS.map(p => {
                            const isActive = p.step === step;
                            return (
                                <div key={p.step} style={{
                                    borderRadius: '8px', padding: '12px',
                                    border: `1px solid ${isActive ? '#93c5fd' : '#e2e8f0'}`,
                                    background: isActive ? '#f8fbff' : '#ffffff'
                                }}>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: isActive ? BLUE : '#1e293b', marginBottom: '6px' }}>
                                        Paso {p.step} · {p.title} {isActive && <span style={{ fontWeight: 600, color: '#64748b' }}>(este módulo)</span>}
                                    </div>
                                    <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '0.76rem', color: '#334155', lineHeight: 1.55 }}>
                                        {p.hacer.map((h, i) => <li key={i}>{h}</li>)}
                                    </ol>
                                    <div style={{ marginTop: '8px', fontSize: '0.74rem', fontWeight: 700, color: '#0f766e' }}>
                                        ✓ {p.resultado}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div style={{
                        marginTop: '12px', padding: '12px', borderRadius: '8px',
                        background: '#f8fafc', border: '1px solid #e2e8f0'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 800, color: '#0f172a', marginBottom: '6px' }}>
                            <CornerUpLeft size={14} color={BLUE} /> Reglas del circuito
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.76rem', color: '#334155', lineHeight: 1.55 }}>
                            {REGLAS_GENERALES.map((r, i) => <li key={i}>{r}</li>)}
                        </ul>
                    </div>
                </div>
            )}
        </section>
    );
}
