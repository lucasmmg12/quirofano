import React from 'react';

export default function TxtProvinciaPanel() {
    return (
        <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '15px 20px', background: '#fff', borderBottom: '1px solid #E2E8F0' }}>
                <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#1E293B' }}>Txt Provincia</h2>
                <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748B' }}>Módulo de generación de TXT para OSP</p>
            </div>
            <div style={{ flex: 1, background: '#F8FAFC' }}>
                <iframe 
                    src="https://osptxt-j6mm.vercel.app/" 
                    style={{ width: '100%', height: '100%', border: 'none' }}
                    title="Txt Provincia"
                    allow="clipboard-write"
                />
            </div>
        </div>
    );
}
