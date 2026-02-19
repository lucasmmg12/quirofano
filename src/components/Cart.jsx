import { Trash2, Minus, Plus, ShoppingCart, Printer, Send, XCircle, Calendar } from 'lucide-react';

export default function Cart({ items, onUpdateItem, onRemoveItem, onClearCart, onPrintAll, onPrintSingle, onSendWhatsApp }) {
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

    if (items.length === 0) {
        return (
            <div className="cart cart--empty animate-fade-in">
                <div className="cart__empty-state">
                    <ShoppingCart size={48} strokeWidth={1.2} />
                    <h3>Carrito vacío</h3>
                    <p>Busque y agregue prácticas médicas desde el buscador</p>
                </div>
            </div>
        );
    }

    return (
        <div className="cart animate-fade-in">
            <div className="cart__header">
                <div className="cart__title-group">
                    <div className="cart__icon-badge">
                        <ShoppingCart size={18} />
                    </div>
                    <h3 className="cart__title">Carrito de Pedidos</h3>
                    <span className="cart__badge">{items.length} práctica{items.length !== 1 ? 's' : ''} · {totalItems} ítem{totalItems !== 1 ? 's' : ''}</span>
                </div>
            </div>

            <div className="cart__table-wrapper">
                <table className="cart__table">
                    <thead>
                        <tr>
                            <th className="cart__th cart__th--code">Código</th>
                            <th className="cart__th cart__th--name">Práctica</th>
                            <th className="cart__th cart__th--qty">Cantidad</th>
                            <th className="cart__th cart__th--date">Fecha</th>
                            <th className="cart__th cart__th--actions">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item, index) => (
                            <tr key={item.id} className="cart__row animate-fade-in" style={{ animationDelay: `${index * 50}ms` }}>
                                <td className="cart__td cart__td--code">
                                    <span className="cart__code-chip">{item.code}</span>
                                </td>
                                <td className="cart__td cart__td--name">
                                    {item.name}
                                    {/* Custom field input for practices that need extra data */}
                                    {item.customField && (
                                        <div className="cart__custom-field">
                                            <span className="cart__custom-label">{item.customLabel}</span>
                                            <input
                                                type={item.customField === 'days' ? 'number' : 'text'}
                                                className="cart__custom-input"
                                                placeholder={item.customLabel}
                                                value={item.customValue || ''}
                                                onChange={e => onUpdateItem(item.id, 'customValue', e.target.value)}
                                            />
                                        </div>
                                    )}
                                </td>
                                <td className="cart__td cart__td--qty">
                                    <div className="qty-stepper">
                                        <button
                                            className="qty-stepper__btn"
                                            onClick={() => onUpdateItem(item.id, 'quantity', Math.max(1, item.quantity - 1))}
                                            disabled={item.quantity <= 1}
                                            aria-label="Reducir cantidad"
                                        >
                                            <Minus size={14} />
                                        </button>
                                        <input
                                            type="number"
                                            className="qty-stepper__value"
                                            value={item.quantity}
                                            min={1}
                                            max={99}
                                            onChange={e => onUpdateItem(item.id, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                                        />
                                        <button
                                            className="qty-stepper__btn"
                                            onClick={() => onUpdateItem(item.id, 'quantity', item.quantity + 1)}
                                            aria-label="Aumentar cantidad"
                                        >
                                            <Plus size={14} />
                                        </button>
                                    </div>
                                </td>
                                <td className="cart__td cart__td--date">
                                    <div className="date-picker-inline">
                                        <Calendar size={14} className="date-picker-inline__icon" />
                                        <input
                                            type="date"
                                            className="date-picker-inline__input"
                                            value={item.date}
                                            onChange={e => onUpdateItem(item.id, 'date', e.target.value)}
                                        />
                                    </div>
                                </td>
                                <td className="cart__td cart__td--actions">
                                    <div className="cart__action-btns">
                                        <button
                                            className="cart__action-btn cart__action-btn--print"
                                            onClick={() => onPrintSingle(item)}
                                            title="Imprimir individual"
                                            aria-label={`Imprimir ${item.name}`}
                                        >
                                            <Printer size={15} />
                                        </button>
                                        <button
                                            className="cart__action-btn cart__action-btn--delete"
                                            onClick={() => onRemoveItem(item.id)}
                                            title="Eliminar"
                                            aria-label={`Eliminar ${item.name}`}
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="cart__footer">
                <button
                    className="btn btn--danger-ghost"
                    onClick={onClearCart}
                    id="btn-clear-cart"
                >
                    <XCircle size={16} />
                    Limpiar Carrito
                </button>
                <div className="cart__footer-actions">
                    <button
                        className="btn btn--whatsapp"
                        onClick={onSendWhatsApp}
                        id="btn-send-whatsapp"
                    >
                        <Send size={16} />
                        Enviar por WhatsApp
                    </button>
                    <button
                        className="btn btn--primary"
                        onClick={onPrintAll}
                        id="btn-print-all"
                    >
                        <Printer size={16} />
                        Imprimir Todos
                    </button>
                </div>
            </div>
        </div>
    );
}
