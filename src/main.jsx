import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import RecepcionView from './components/RecepcionView.jsx'
import './index.css'

// Simple path-based routing without React Router
// /recepcion → standalone reception view (no login)
// everything else → normal app with login
const isRecepcion = window.location.pathname === '/recepcion' || window.location.pathname === '/recepcion/';

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        {isRecepcion ? <RecepcionView /> : <App />}
    </React.StrictMode>,
)
