/**
 * WhatsAppLineStatus — Live counter of today's initiated conversations per WhatsApp line
 * Shows in the topbar when viewing 'mensajeria' or 'cirugias'
 * Fires a visual alert if any line exceeds 30 initiated conversations today
 */
import { useState, useEffect } from 'react';
import { MessageSquare, AlertTriangle, Phone } from 'lucide-react';
import { supabase } from '../lib/supabase';

const ALERT_THRESHOLD = 30;

export default function WhatsAppLineStatus() {
    const [lines, setLines] = useState([]);
    const [counts, setCounts] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
        // Refresh every 60 seconds
        const interval = setInterval(loadData, 60_000);
        return () => clearInterval(interval);
    }, []);

    const loadData = async () => {
        try {
            // Fetch lines
            const { data: linesData } = await supabase
                .from('whatsapp_lines')
                .select('id, label, phone, color, is_active')
                .eq('is_active', true)
                .order('id');

            if (!linesData) return;
            setLines(linesData);

            // Count today's outgoing messages per line (conversations initiated = first outgoing msg per phone per day)
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            const { data: msgData } = await supabase
                .from('whatsapp_messages')
                .select('line_id, sender_phone')
                .eq('direction', 'outgoing')
                .gte('created_at', todayStart.toISOString());

            // Count unique conversations initiated per line
            const lineCounts = {};
            linesData.forEach(l => { lineCounts[l.id] = new Set(); });

            (msgData || []).forEach(msg => {
                const lineId = msg.line_id || 'line_a'; // fallback for old messages
                if (lineCounts[lineId]) {
                    lineCounts[lineId].add(msg.sender_phone);
                }
            });

            const result = {};
            Object.entries(lineCounts).forEach(([lineId, phoneSet]) => {
                result[lineId] = phoneSet.size;
            });

            setCounts(result);
        } catch (err) {
            console.error('WhatsAppLineStatus error:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading || lines.length === 0) return null;

    const anyAlert = lines.some(l => (counts[l.id] || 0) >= ALERT_THRESHOLD);

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '4px 6px', borderRadius: '10px',
            background: anyAlert ? '#FEF2F2' : '#F0FDF4',
            border: `1px solid ${anyAlert ? '#FECACA' : '#BBF7D0'}`,
            animation: anyAlert ? 'pulse-alert 2s ease-in-out infinite' : 'none',
            transition: 'all 0.3s',
        }}>
            {lines.map(line => {
                const count = counts[line.id] || 0;
                const isOver = count >= ALERT_THRESHOLD;
                const percentage = Math.min((count / ALERT_THRESHOLD) * 100, 100);

                return (
                    <div
                        key={line.id}
                        title={`${line.label}: ${count} conversaciones iniciadas hoy`}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '5px',
                            padding: '3px 10px', borderRadius: '8px',
                            background: isOver ? '#FEE2E2' : `${line.color}12`,
                            border: `1px solid ${isOver ? '#FCA5A5' : line.color + '30'}`,
                            transition: 'all 0.3s',
                            position: 'relative',
                            overflow: 'hidden',
                        }}
                    >
                        {/* Progress bar background */}
                        <div style={{
                            position: 'absolute', left: 0, top: 0, bottom: 0,
                            width: `${percentage}%`,
                            background: isOver
                                ? 'rgba(239,68,68,0.12)'
                                : `${line.color}10`,
                            transition: 'width 0.5s ease',
                            borderRadius: '8px',
                        }} />

                        {isOver ? (
                            <AlertTriangle size={11} color="#EF4444" style={{ position: 'relative', zIndex: 1 }} />
                        ) : (
                            <span style={{
                                width: '6px', height: '6px', borderRadius: '50%',
                                background: line.color, display: 'inline-block',
                                position: 'relative', zIndex: 1,
                            }} />
                        )}

                        <span style={{
                            fontSize: '0.68rem', fontWeight: 700,
                            color: isOver ? '#DC2626' : '#374151',
                            fontFamily: 'monospace', position: 'relative', zIndex: 1,
                            whiteSpace: 'nowrap',
                        }}>
                            ···{line.phone.slice(-4)}
                        </span>

                        <span style={{
                            fontSize: '0.72rem', fontWeight: 800,
                            color: isOver ? '#DC2626' : line.color,
                            position: 'relative', zIndex: 1,
                            minWidth: '16px', textAlign: 'center',
                        }}>
                            {count}
                        </span>

                        <span style={{
                            fontSize: '0.58rem', color: '#94A3B8',
                            position: 'relative', zIndex: 1,
                        }}>
                            /{ALERT_THRESHOLD}
                        </span>
                    </div>
                );
            })}

            {anyAlert && (
                <span style={{
                    fontSize: '0.62rem', fontWeight: 800,
                    color: '#DC2626', whiteSpace: 'nowrap',
                    animation: 'pulse-alert 1.5s ease-in-out infinite',
                }}>
                    ⚠️ LÍMITE
                </span>
            )}

            <style>{`
                @keyframes pulse-alert {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.7; }
                }
            `}</style>
        </div>
    );
}
