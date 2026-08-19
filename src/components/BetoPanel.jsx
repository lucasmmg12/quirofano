/**
 * BetoPanel.jsx — Simon IA integrado en ADM-QUI (Misma estructura 1:1 que Contact Center)
 * Renderiza RAGPanel (Chat & Documentos), RAGRules o SimonAnalytics directamente según activeView
 */
import RAGPanel from './simon/RAGPanel'
import RAGRules from './simon/RAGRules'
import SimonAnalytics from './simon/SimonAnalytics'
import '../simon-redesign.css'

export default function BetoPanel({ activeView = 'beto', addToast }) {
    if (activeView === 'beto_rules') {
        return (
            <div style={{ height: 'calc(100vh - 70px)', overflowY: 'auto', background: '#f8fafc' }}>
                <RAGRules addToast={addToast} />
            </div>
        )
    }

    if (activeView === 'beto_analytics') {
        return (
            <div style={{ height: 'calc(100vh - 70px)', overflowY: 'auto', background: '#f8fafc' }}>
                <SimonAnalytics addToast={addToast} />
            </div>
        )
    }

    // Default: Chat & Documentos (RAGPanel)
    return (
        <div style={{ height: 'calc(100vh - 70px)', width: '100%', overflow: 'hidden' }}>
            <RAGPanel addToast={addToast} />
        </div>
    )
}
