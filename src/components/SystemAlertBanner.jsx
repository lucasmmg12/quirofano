import { useState, useEffect } from 'react';
import { AlertTriangle, Info, XCircle, AlertOctagon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchActiveAlerts } from '../services/systemService';

export default function SystemAlertBanner() {
    const [alerts, setAlerts] = useState([]);

    useEffect(() => {
        // Carga inicial
        const loadAlerts = async () => {
            try {
                const active = await fetchActiveAlerts();
                setAlerts(active);
            } catch (error) {
                console.error('Error cargando system alerts:', error);
            }
        };

        loadAlerts();

        // Suscripción en tiempo real
        const channel = supabase.channel('public:system_alerts')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'system_alerts' }, payload => {
                // Si hay un cambio, volvemos a cargar las activas para mantener el orden correcto
                loadAlerts();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    if (alerts.length === 0) return null;

    return (
        <div style={{
            display: 'flex', flexDirection: 'column',
            width: '100%', zIndex: 1000
        }}>
            {alerts.map(alert => {
                let bg, color, border, Icon;
                
                switch (alert.severity) {
                    case 'error':
                        bg = '#FEF2F2'; color = '#DC2626'; border = '#FCA5A5'; Icon = AlertOctagon;
                        break;
                    case 'warning':
                        bg = '#FFFBEB'; color = '#D97706'; border = '#FDE68A'; Icon = AlertTriangle;
                        break;
                    case 'info':
                    default:
                        bg = '#EFF6FF'; color = '#2563EB'; border = '#BFDBFE'; Icon = Info;
                        break;
                }

                return (
                    <div key={alert.id} style={{
                        background: bg, borderBottom: `1px solid ${border}`, color: color,
                        padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: '12px', fontSize: '0.9rem', fontWeight: 500,
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                        animation: 'slide-down 0.3s ease'
                    }}>
                        <Icon size={18} />
                        <div>
                            {alert.service_affected && <strong style={{ marginRight: '6px' }}>{alert.service_affected}:</strong>}
                            {alert.message}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
