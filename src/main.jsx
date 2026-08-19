import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import RecepcionView from './components/RecepcionView.jsx'
import TurnoKiosco from './components/TurnoKiosco.jsx'
import './index.css'
import './simon-redesign.css'

// ─── Global Error Boundary ───────────────────────────────────────────
// Prevents white screen of death by catching any React rendering error
// and displaying a diagnostic fallback UI.
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false, error: null, errorInfo: null }
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error }
    }
    componentDidCatch(error, errorInfo) {
        this.setState({ errorInfo })
        console.error('[ErrorBoundary] Uncaught error:', error, errorInfo)
    }
    render() {
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
                        onClick: () => window.location.reload(),
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

// Simple path-based routing without React Router
// /recepcion → standalone reception view (no login)
// /turno     → standalone kiosk for queue tickets (no login)
// everything else → normal app with login
const pathname = window.location.pathname;
const isRecepcion = pathname === '/recepcion' || pathname === '/recepcion/';
const isTurno = pathname === '/turno' || pathname === '/turno/';

const RootComponent = isTurno ? TurnoKiosco : isRecepcion ? RecepcionView : App;

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <ErrorBoundary>
            <RootComponent />
        </ErrorBoundary>
    </React.StrictMode>,
)
