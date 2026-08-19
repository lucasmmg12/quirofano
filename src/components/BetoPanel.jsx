/**
 * BetoPanel.jsx — Simon IA integrado en ADM-QUI
 * Renderiza el módulo completo SimonPanel con Chat, Documentos, Reglas y Analytics
 */
import SimonPanel from './simon/SimonPanel'

export default function BetoPanel({ addToast }) {
    return <SimonPanel addToast={addToast} />
}
