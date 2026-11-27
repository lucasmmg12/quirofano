import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import RecepcionView from './components/RecepcionView.jsx'
import TurnoKiosco from './components/TurnoKiosco.jsx'
import './index.css'
import './simon-redesign.css'

// ─── Auto-recuperación ante nuevos deploys en Vercel (chunks obsoletos) ───
const CHUNK_RELOAD_KEY = 'sa_chunk_reload_ts'
function isStaleChunkError(err) {
    const msg = String(err?.message || err || '').toLowerCase()
    return (
        msg.includes('failed to fetch dynamically imported module') ||
        msg.includes('importing a module script failed') ||
        msg.includes('error loading dynamically imported module') ||
        msg.includes('chunkloaderror') ||
        msg.includes('loading chunk')
    )
}
function tryAutoReloadForNewDeploy() {
    try {
        const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0)
        if (Date.now() - last > 15000) {
            sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
            if ('caches' in window) {
                caches.keys().then(names => names.forEach(name => caches.delete(name))).catch(() => {})
            }
            window.location.replace(window.location.origin + window.location.pathname + window.location.search)
            return true
        }
    } catch (_) {}
    return false
}
window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault()
    tryAutoReloadForNewDeploy()
})

// ─── Global Error Boundary ───────────────────────────────────────────
// Prevents white screen of death by catching any React rendering error
// and displaying a diagnostic fallback UI.
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false, error: null, errorInfo: null, autoReloading: false }
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error, autoReloading: isStaleChunkError(error) }
    }
    componentDidCatch(error, errorInfo) {
        this.setState({ errorInfo })
        if (isStaleChunkError(error)) {
            const reloading = tryAutoReloadForNewDeploy()
            if (reloading) {
                this.setState({ autoReloading: true })
                return
            }
            this.setState({ autoReloading: false })
        }
        console.error('[ErrorBoundary] Uncaught error:', error, errorInfo)
    }
    render() {
        if (this.state.hasError && this.state.autoReloading) {
            return React.createElement('div', {
                style: {
                    position: 'fixed', inset: 0, zIndex: 99999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: '#F8FAFC', fontFamily: "'Inter', system-ui, sans-serif",
                }
            },
                React.createElement('div', {
                    style: {
                        background: '#FFFFFF', borderRadius: 12, padding: '28px 32px',
                        border: '1px solid #E2E8F0', textAlign: 'center',
                        boxShadow: '0 4px 20px rgba(0, 59, 115, 0.08)',
                    }
                },
                    React.createElement('div', {
                        style: { fontSize: '1.05rem', fontWeight: 800, color: '#003B73', marginBottom: 6 }
                    }, 'Actualizando a la nueva versión...'),
                    React.createElement('div', {
                        style: { fontSize: '0.82rem', color: '#64748B' }
                    }, 'Sincronizando módulos de Sanatorio Argentino.')
                )
            )
        }
        if (this.state.hasError) {
            return React.createElement('div', {
                style: {
                    position: 'fixed', inset: 0, zIndex: 99999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: '#F8FAFC', fontFamily: "'Inter', system-ui, sans-serif",
                }
            },
                React.createElement('div', {
                    style: {
                        maxWidth: 560, width: '100%', margin: '0 20px',
                        background: '#fff', borderRadius: 16, padding: '40px 32px',
                        boxShadow: '0 8px 40px rgba(0,0,0,0.08)',
                        border: '1px solid #E5E7EB',
                    }
                },
                    React.createElement('div', { style: { textAlign: 'center', marginBottom: 24 } },
                        React.createElement('div', {
                            style: {
                                width: 56, height: 56, borderRadius: '50%', margin: '0 auto 16px',
                                background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 28,
                            }
                        }, '⚠️'),
                        React.createElement('h1', {
                            style: { margin: '0 0 8px', fontSize: '1.3rem', fontWeight: 800, color: '#1E293B' }
                        }, 'Error de Aplicación'),
                        React.createElement('p', {
                            style: { margin: 0, fontSize: '0.85rem', color: '#64748B' }
                        }, 'La aplicación encontró un error inesperado.')
                    ),
                    React.createElement('div', {
                        style: {
                            background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10,
                            padding: '14px 16px', marginBottom: 20, maxHeight: 200, overflowY: 'auto',
                        }
                    },
                        React.createElement('p', {
                            style: { margin: 0, fontSize: '0.8rem', fontWeight: 600, color: '#DC2626', wordBreak: 'break-word' }
                        }, String(this.state.error)),
                        this.state.errorInfo && React.createElement('pre', {
                            style: { margin: '8px 0 0', fontSize: '0.68rem', color: '#991B1B', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }
                        }, this.state.errorInfo.componentStack?.slice(0, 500))
                    ),
                    React.createElement('button', {
                        onClick: () => {
                            try {
                                if ('caches' in window) {
                                    caches.keys().then(names => {
                                        names.forEach(name => caches.delete(name));
                                    });
                                }
                            } catch (_) {}
                            window.location.href = window.location.origin + window.location.pathname + '?v=' + Date.now();
                        },
                        style: {
                            width: '100%', padding: 14, borderRadius: 10, border: 'none',
                            background: '#1E4078', color: '#fff', fontSize: '0.9rem',
                            fontWeight: 700, cursor: 'pointer',
                        }
                    }, 'Recargar Aplicación')
                )
            )
        }
        return this.props.children
    }
}

import { BrowserRouter } from 'react-router-dom'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <ErrorBoundary>
            <BrowserRouter>
                <App />
            </BrowserRouter>
        </ErrorBoundary>
    </React.StrictMode>,
)
