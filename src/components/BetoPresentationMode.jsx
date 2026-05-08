/**
 * BetoPresentationMode — #14 Fullscreen slide presentation from Beto data
 */
import { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Maximize2, Minimize2, Calendar, BarChart3, TrendingUp, Stethoscope } from 'lucide-react';

export default function BetoPresentationMode({ isOpen, onClose, slides = [] }) {
    const [cur, setCur] = useState(0);
    const [fs, setFs] = useState(false);

    useEffect(() => { if (isOpen) setCur(0); }, [isOpen]);

    const handleKey = useCallback((e) => {
        if (!isOpen) return;
        if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); setCur(p => Math.min(p + 1, slides.length - 1)); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); setCur(p => Math.max(p - 1, 0)); }
        else if (e.key === 'Escape') onClose();
        else if (e.key === 'f') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); setFs(p => !p); }
    }, [isOpen, slides.length, onClose]);

    useEffect(() => { window.addEventListener('keydown', handleKey); return () => window.removeEventListener('keydown', handleKey); }, [handleKey]);

    if (!isOpen || !slides.length) return null;
    const slide = slides[cur];
    const pct = ((cur + 1) / slides.length) * 100;

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'linear-gradient(135deg,#0F172A,#1E293B)', display: 'flex', flexDirection: 'column', fontFamily: "'Inter',sans-serif", animation: 'beto-fade-in .3s' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'rgba(255,255,255,.6)', fontSize: '.8rem', fontWeight: 600 }}>
                    <img src="/logosanatorio.png" alt="" style={{ width: 28, height: 28, borderRadius: 6, opacity: .8 }} /> Beto • Reporte
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ padding: '4px 12px', borderRadius: 20, background: 'rgba(255,255,255,.1)', color: 'rgba(255,255,255,.7)', fontSize: '.72rem', fontWeight: 600 }}>{cur + 1}/{slides.length}</span>
                    <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,.1)', border: 'none', color: 'rgba(255,255,255,.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
                </div>
            </div>
            <div style={{ height: 3, background: 'rgba(255,255,255,.1)' }}><div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#6366F1,#8B5CF6)', transition: 'width .3s', borderRadius: 2 }} /></div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 80px', position: 'relative' }}>
                {cur > 0 && <button onClick={() => setCur(p => p - 1)} style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,.1)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={24} /></button>}
                {cur < slides.length - 1 && <button onClick={() => setCur(p => p + 1)} style={{ position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)', width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,.1)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronRight size={24} /></button>}
                <div key={cur} style={{ width: '100%', maxWidth: 800, background: '#fff', borderRadius: 20, padding: 48, boxShadow: '0 25px 60px rgba(0,0,0,.4)', animation: 'beto-slide-up .3s' }}>
                    {slide.type && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 20, marginBottom: 16, background: '#EEF2FF', color: '#4338CA', fontSize: '.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>{slide.type}</div>}
                    <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#1E293B', margin: '0 0 12px', lineHeight: 1.2 }}>{slide.title}</h2>
                    {slide.subtitle && <p style={{ fontSize: '1rem', color: '#64748B', marginBottom: 24 }}>{slide.subtitle}</p>}
                    {slide.content && <div style={{ fontSize: '.95rem', color: '#334155', lineHeight: 1.7, whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: slide.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>') }} />}
                    {slide.stats && <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(slide.stats.length, 4)},1fr)`, gap: 16, marginTop: 24 }}>{slide.stats.map((s, i) => <div key={i} style={{ padding: 20, borderRadius: 14, background: `${s.color || '#6366F1'}10`, border: `1px solid ${s.color || '#6366F1'}20`, textAlign: 'center' }}><div style={{ fontSize: '2rem', fontWeight: 800, color: s.color || '#6366F1' }}>{s.value}</div><div style={{ fontSize: '.78rem', fontWeight: 600, color: '#64748B', marginTop: 4 }}>{s.label}</div></div>)}</div>}
                    {slide.table && <div style={{ marginTop: 24, overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}><thead><tr>{slide.table.headers.map((h, i) => <th key={i} style={{ padding: '10px 14px', textAlign: 'left', borderBottom: '2px solid #E2E8F0', color: '#64748B', fontWeight: 700, fontSize: '.72rem', textTransform: 'uppercase' }}>{h}</th>)}</tr></thead><tbody>{slide.table.rows.map((row, i) => <tr key={i}>{row.map((c, j) => <td key={j} style={{ padding: '10px 14px', borderBottom: '1px solid #F1F5F9', color: '#334155' }}>{c}</td>)}</tr>)}</tbody></table></div>}
                </div>
            </div>
            <div style={{ padding: '12px 24px', display: 'flex', justifyContent: 'center', gap: 20, fontSize: '.68rem', color: 'rgba(255,255,255,.4)' }}>← → Navegar &nbsp;|&nbsp; F Fullscreen &nbsp;|&nbsp; ESC Salir</div>
        </div>
    );
}
