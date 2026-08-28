import React, { useState, useEffect, useRef } from 'react';
import { getShareData, sendShareChat } from '../../api/shareClient';
import { 
    MessageSquare, 
    ChevronDown, 
    ChevronUp, 
    Share2, 
    Send, 
    Bot,
    FileText,
    BrainCircuit,
    Loader2,
    Sparkles,
    CheckCircle2
} from 'lucide-react';

export default function PublicRecordView() {
    const token = window.location.pathname.split('/share/')[1];
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Chat state
    const [chatMessages, setChatMessages] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        const loadData = async () => {
            try {
                const result = await getShareData(token);
                setData(result);
            } catch (e) {
                setError('No se pudo cargar el análisis compartido.');
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [token]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages, isTyping]);

    const handleSendMessage = async (e, forcedMessage = null) => {
        if (e) e.preventDefault();
        const textToSend = forcedMessage || inputValue;
        if (!textToSend.trim() || isTyping) return;

        const userMsg = { role: 'user', content: textToSend };
        setChatMessages(prev => [...prev, userMsg]);
        setInputValue('');
        setIsTyping(true);

        try {
            const aiResponse = await sendShareChat(token, userMsg.content);
            setChatMessages(prev => [...prev, { role: 'ai', content: aiResponse.content }]);
        } catch (e) {
            setChatMessages(prev => [...prev, { role: 'ai', content: 'Hubo un error al procesar tu pregunta.' }]);
        } finally {
            setIsTyping(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#f4f6f8] flex items-center justify-center">
                <div className="flex flex-col items-center gap-4 text-[#3b82f6]">
                    <Loader2 className="w-10 h-10 animate-spin" />
                    <span className="font-semibold text-lg text-[#1e293b]">Analizando grabación...</span>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="min-h-screen bg-[#f4f6f8] flex items-center justify-center">
                <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 text-center">
                    <p className="text-red-500 font-bold mb-2 text-xl">Error</p>
                    <p className="text-slate-600">{error || 'Enlace no válido o expirado.'}</p>
                </div>
            </div>
        );
    }

    const suggestions = [
        "¿Qué acciones se decidieron en la reunión?",
        "¿Cuál es la fecha límite para cada tarea?",
        "¿Quién es responsable de cada tarea?"
    ];

    return (
        <div className="min-h-screen bg-[#f8fafc] font-sans flex flex-col">
            {/* Top Header */}
            <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-20 sticky top-0 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
                <div className="flex items-center gap-2 text-blue-600">
                    <BrainCircuit className="w-7 h-7" />
                    <span className="font-bold text-xl tracking-tight text-slate-800">Beto <span className="text-blue-600">AI</span></span>
                </div>
                <button 
                    className="bg-[#1e293b] hover:bg-black text-white px-5 py-2 rounded-lg font-medium text-sm transition-colors shadow-sm"
                    onClick={() => window.open('/', '_blank')}
                >
                    ¡Prueba Beto IA en tu equipo!
                </button>
            </header>

            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
                {/* Left Column: Main Analysis (Flat Design) */}
                <div className="flex-1 overflow-y-auto px-6 py-8 md:px-12 md:py-10 bg-white">
                    <div className="max-w-4xl mx-auto">
                        
                        {/* Title Section */}
                        <div className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h1 className="text-3xl md:text-4xl font-bold text-[#0f172a] mb-3 tracking-tight">Acta de Reunión Inteligente</h1>
                                <p className="text-[#64748b] text-base flex items-center gap-2 font-medium">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                    Generado automáticamente el {new Date(data.createdAt).toLocaleDateString()}
                                </p>
                            </div>
                            <button 
                                className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#334155] rounded-full transition-colors font-semibold text-sm shrink-0"
                                onClick={() => {
                                    navigator.clipboard.writeText(window.location.href);
                                    alert("¡Enlace copiado al portapapeles!");
                                }}
                            >
                                <Share2 className="w-4 h-4" />
                                Copiar Link
                            </button>
                        </div>

                        {/* Flat Summary */}
                        <section className="mb-14">
                            <h2 className="text-2xl font-bold text-[#0f172a] mb-6">Resumen de acciones acordadas</h2>
                            <div className="max-w-none text-[#334155] leading-relaxed text-[17px] space-y-4">
                                {data.summary.split('. ').map((sentence, idx) => {
                                    if(!sentence.trim()) return null;
                                    const text = sentence.trim() + (sentence.trim().endsWith('.') ? '' : '.');
                                    return (
                                        <div key={idx} className="flex gap-4 items-start">
                                            <span className="text-blue-500 mt-1 shrink-0 text-xl leading-none font-bold">•</span>
                                            <span>{text}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>

                        {/* Specific Analysis (Clean Accordions) */}
                        <section>
                            <h2 className="text-2xl font-bold text-[#0f172a] mb-6">Desglose de Puntos Clave</h2>
                            <div className="space-y-4">
                                {data.specificAnalysis?.map((item) => (
                                    <AnalysisAccordion key={item.id} item={item} />
                                ))}
                            </div>
                        </section>
                    </div>
                </div>

                {/* Right Column: Sidebar Chat (Beto AI) */}
                <div className="w-full md:w-[420px] bg-[#f8fafc] border-l border-slate-200 flex flex-col h-[calc(100vh-64px)] shrink-0 shadow-[-10px_0_20px_rgba(0,0,0,0.02)] z-10 relative">
                    
                    {/* Chat Header */}
                    <div className="p-5 border-b border-slate-200 bg-white flex items-center gap-3">
                        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2 rounded-xl text-white shadow-sm">
                            <Bot className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800 text-base">Beto IA</h3>
                            <p className="text-xs text-slate-500 font-medium">Asistente analítico</p>
                        </div>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-[#f8fafc]">
                        
                        {/* Initial Beto Greeting with Chips */}
                        <div className="flex justify-start">
                            <div className="max-w-[95%] text-sm">
                                <p className="text-[#334155] leading-relaxed mb-4 text-[14.5px]">
                                    ¡Hola! Soy Beto 😊<br/><br/>
                                    Úsame para registrar puntos clave mientras grabas video o audio. Cuando termines, combinaré tus puntos clave con toda la grabación para crear una nota completa.<br/><br/>
                                    ¿Tienes preguntas sobre esta nota? ¡Solo pregunta! Por ejemplo:
                                </p>
                                
                                <div className="flex flex-col gap-2.5">
                                    {suggestions.map((sug, i) => (
                                        <button 
                                            key={i}
                                            onClick={() => handleSendMessage(null, sug)}
                                            className="text-left bg-[#e2e8f0]/60 hover:bg-[#cbd5e1]/50 text-[#334155] px-4 py-2.5 rounded-lg text-sm font-medium transition-colors border border-transparent hover:border-[#cbd5e1]"
                                        >
                                            {sug}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Dynamically appended user/ai messages */}
                        {chatMessages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[14.5px] leading-relaxed ${
                                    msg.role === 'user' 
                                        ? 'bg-[#2563eb] text-white shadow-sm rounded-br-sm' 
                                        : 'bg-white border border-slate-200 text-slate-700 shadow-sm rounded-bl-sm'
                                }`}>
                                    {msg.content}
                                </div>
                            </div>
                        ))}
                        
                        {isTyping && (
                            <div className="flex justify-start">
                                <div className="bg-white border border-slate-200 text-slate-500 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-75" />
                                    <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-150" />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Chat Input */}
                    <div className="p-4 bg-white border-t border-slate-200">
                        <form onSubmit={(e) => handleSendMessage(e)} className="relative flex items-center">
                            <input
                                type="text"
                                placeholder="Ingresa tu pregunta..."
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                className="w-full pl-4 pr-12 py-3.5 rounded-xl border border-slate-200 bg-[#f8fafc] focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all text-sm shadow-inner"
                                disabled={isTyping}
                            />
                            <button 
                                type="submit"
                                disabled={!inputValue.trim() || isTyping}
                                className="absolute right-2 p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                            >
                                <Send className="w-5 h-5" />
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}

function AnalysisAccordion({ item }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className={`bg-white border rounded-xl overflow-hidden transition-all duration-300 ${isOpen ? 'border-blue-200 shadow-md shadow-blue-500/5' : 'border-slate-200 hover:border-slate-300 shadow-sm'}`}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-5 bg-white transition-colors"
            >
                <div className="flex items-center gap-4 text-left">
                    <span className={`flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold transition-colors ${isOpen ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                        Q
                    </span>
                    <span className={`font-semibold text-[15.5px] ${isOpen ? 'text-blue-900' : 'text-slate-800'}`}>
                        {item.question}
                    </span>
                </div>
                {isOpen ? <ChevronUp className="w-5 h-5 text-blue-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
            </button>
            
            {isOpen && (
                <div className="px-5 pb-5 pt-2">
                    <div className="bg-[#f8fafc] p-4 rounded-xl border border-slate-100 text-[#334155] text-sm leading-relaxed whitespace-pre-line relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 rounded-l-xl"></div>
                        {item.ai_response_summary}
                    </div>
                </div>
            )}
        </div>
    );
}
