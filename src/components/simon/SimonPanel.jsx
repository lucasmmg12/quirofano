/**
 * SimonPanel.jsx — Contenedor Principal de Simon IA en ADM-QUI
 * Integra en pestañas superiores:
 * 1. Chat & Archivos (RAGPanel)
 * 2. Reglas & Conocimiento (RAGRules)
 * 3. Analíticas (SimonAnalytics)
 */
import { useState } from 'react'
import { Brain, Shield, BarChart3 } from 'lucide-react'
import RAGPanel from './RAGPanel'
import RAGRules from './RAGRules'
import SimonAnalytics from './SimonAnalytics'
import '../../simon-redesign.css'

export default function SimonPanel({ addToast }) {
    const [subTab, setSubTab] = useState('chat') // 'chat' | 'rules' | 'analytics'

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: '#ffffff', overflow: 'hidden' }}>
            {/* Top Navigation Bar for Simon Suites */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justify: 'space-between',
                padding: '12px 24px',
                background: '#ffffff',
                borderBottom: '1px solid #e2e8f0',
                zIndex: 20
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.25)'
                    }}>
                        <Brain size={20} />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                            Simon IA — Asistente Inteligente
                        </h2>
                        <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>
                            Sanatorio Argentino · Base de Conocimiento RAG V3.2
                        </p>
                    </div>
                </div>

                {/* Sub-tabs */}
                <div style={{ display: 'flex', gap: '6px', background: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
                    <button
                        onClick={() => setSubTab('chat')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            border: 'none',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            background: subTab === 'chat' ? '#ffffff' : 'transparent',
                            color: subTab === 'chat' ? '#3b82f6' : '#64748b',
                            boxShadow: subTab === 'chat' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
                        }}
                    >
                        <Brain size={15} />
                        Chat & Documentos
                    </button>

                    <button
                        onClick={() => setSubTab('rules')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            border: 'none',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            background: subTab === 'rules' ? '#ffffff' : 'transparent',
                            color: subTab === 'rules' ? '#3b82f6' : '#64748b',
                            boxShadow: subTab === 'rules' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
                        }}
                    >
                        <Shield size={15} />
                        Reglas de Simon
                    </button>

                    <button
                        onClick={() => setSubTab('analytics')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            border: 'none',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            background: subTab === 'analytics' ? '#ffffff' : 'transparent',
                            color: subTab === 'analytics' ? '#3b82f6' : '#64748b',
                            boxShadow: subTab === 'analytics' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'
                        }}
                    >
                        <BarChart3 size={15} />
                        Analytics
                    </button>
                </div>
            </div>

            {/* Sub-tab content */}
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                {subTab === 'chat' && <RAGPanel />}
                {subTab === 'rules' && <RAGRules />}
                {subTab === 'analytics' && <SimonAnalytics />}
            </div>
        </div>
    )
}
