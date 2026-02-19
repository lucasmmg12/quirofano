import { useState } from 'react';
import { Send, X, Phone, MessageSquare } from 'lucide-react';

export default function WhatsAppModal({ isOpen, onClose, onSend, patientData, items }) {
    const [phoneNumber, setPhoneNumber] = useState('');
    const [sending, setSending] = useState(false);

    if (!isOpen) return null;

    const handleSend = async () => {
        if (!phoneNumber.trim()) return;

        setSending(true);
        try {
            await onSend(phoneNumber.replace(/\D/g, ''));
            onClose();
        } catch {
            // Error handled in parent
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal animate-scale-in" onClick={e => e.stopPropagation()}>
                <div className="modal__header">
                    <div className="modal__header-title">
                        <MessageSquare size={20} style={{ color: '#25D366' }} />
                        <h3>Enviar Pedido por WhatsApp</h3>
                    </div>
                    <button className="modal__close" onClick={onClose} aria-label="Cerrar">
                        <X size={20} />
                    </button>
                </div>

                <div className="modal__body">
                    <div className="modal__preview">
                        <p className="modal__preview-label">Se enviará:</p>
                        <div className="modal__preview-content">
                            <p><strong>Paciente:</strong> {patientData.nombre || 'Sin especificar'}</p>
                            <p><strong>Prácticas:</strong> {items.length} ítem(s)</p>
                            <ul className="modal__preview-list">
                                {items.slice(0, 5).map(item => (
                                    <li key={item.id}>[{item.code}] {item.name} × {item.quantity}</li>
                                ))}
                                {items.length > 5 && <li>... y {items.length - 5} más</li>}
                            </ul>
                        </div>
                    </div>

                    <div className="field-group">
                        <label className="field-label">
                            <Phone size={14} />
                            Número de WhatsApp
                        </label>
                        <input
                            id="whatsapp-phone"
                            type="tel"
                            className="field-input"
                            placeholder="Ej: 2645551234"
                            value={phoneNumber}
                            onChange={e => setPhoneNumber(e.target.value)}
                            autoFocus
                        />
                        <p className="field-hint">Ingrese el número sin 0 ni 15. Incluir código de área.</p>
                    </div>
                </div>

                <div className="modal__footer">
                    <button className="btn btn--ghost" onClick={onClose}>
                        Cancelar
                    </button>
                    <button
                        className="btn btn--whatsapp"
                        onClick={handleSend}
                        disabled={!phoneNumber.trim() || sending}
                    >
                        {sending ? (
                            <>Enviando...</>
                        ) : (
                            <>
                                <Send size={16} />
                                Enviar por WhatsApp
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
