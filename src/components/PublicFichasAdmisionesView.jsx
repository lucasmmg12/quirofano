/**
 * PublicFichasAdmisionesView.jsx — Portal Público de Recepción para Entrega de Fichas
 * 
 * Permite a Francisco y al personal de Recepción gestionar el circuito de entrega
 * desde cualquier tablet o PC mediante un link público sin necesidad de login.
 */
import React from 'react';
import FichasAdmisionesPanel from './FichasAdmisionesPanel';

export default function PublicFichasAdmisionesView() {
    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
            {/* Navbar Público Institucional */}
            <header style={{
                background: '#ffffff', borderBottom: '1px solid #e2e8f0',
                padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                position: 'sticky', top: 0, zIndex: 100
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <img
                        src="/logosanatorio.png"
                        alt="Sanatorio Argentino"
                        style={{ width: '40px', height: '40px', objectFit: 'contain' }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    <div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.3px' }}>
                            SANATORIO ARGENTINO
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
                            Portal Público de Recepción · Entrega de Fichas de Admisiones
                        </div>
                    </div>
                </div>

                <div style={{
                    background: '#e0f2fe', color: '#0369a1', padding: '4px 10px',
                    borderRadius: '20px', fontSize: '0.75rem', fontWeight: 800
                }}>
                    Modo Recepción / Cadetería 7:00 hs
                </div>
            </header>

            {/* Contenido Principal */}
            <main>
                <FichasAdmisionesPanel isPublic={true} currentUser={{ nombre: 'Recepción' }} />
            </main>
        </div>
    );
}
