/**
 * Share Client API
 * Mocks the backend for generating and retrieving Public Record Shares (Sider AI Clone).
 */

// Simulated delay for realistic UX
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// In-memory store for mocked shares (only persists until page reload)
const MOCK_DB = new Map();

/**
 * Generates a deep analysis share from a conversation.
 * @param {Array} messages - The raw chat messages
 * @returns {Promise<{ share_token: string, public_url: string }>}
 */
export async function generateShare(messages) {
    await delay(2500); // Simulate OpenAI analysis time

    const shareToken = crypto.randomUUID();
    
    // Generate mock analysis
    const summary = "La conversación se centró en la resolución de dudas operativas sobre auditoría de historias clínicas. El usuario consultó sobre los pasos para cargar datos faltantes y cómo validar los códigos de prácticas asociados. El asistente proporcionó una guía paso a paso basada en el manual de procedimientos institucionales.";
    
    const specificAnalysis = messages.filter(m => m.role === 'user').map((msg, index) => ({
        id: index,
        question: msg.content,
        intent: "Consulta Operativa",
        insight: "El usuario demuestra una brecha de conocimiento en el proceso de validación, se sugiere reforzar con capacitación.",
        ai_response_summary: "El asistente clarificó el uso del panel de auditoría y los atajos correspondientes."
    }));

    MOCK_DB.set(shareToken, {
        summary,
        specificAnalysis,
        createdAt: new Date().toISOString()
    });

    return {
        share_token: shareToken,
        public_url: `${window.location.origin}/share/${shareToken}`
    };
}

/**
 * Retrieves the public share data by token.
 * @param {string} token 
 */
export async function getShareData(token) {
    await delay(800);
    const data = MOCK_DB.get(token);
    
    if (!data) {
        // Return a default mock if it was opened in a new tab (in-memory map lost)
        return {
            summary: "Este es un resumen de ejemplo porque el enlace se abrió en una nueva sesión (Mock). La charla original abarcó temas de gobernanza de datos, calidad y validación de liquidaciones en el sistema ADM-QUI.",
            specificAnalysis: [
                {
                    id: 1,
                    question: "¿Cómo valido una liquidación rechazada?",
                    intent: "Soporte Técnico",
                    insight: "Pregunta frecuente. El usuario necesitaba conocer el flujo de excepciones.",
                    ai_response_summary: "Se le indicó ir al Panel de Deudas y usar el botón de 'Revisión Manual'."
                }
            ],
            createdAt: new Date().toISOString()
        };
    }
    
    return data;
}

/**
 * Chats with the RAG using ONLY the summary as context.
 * @param {string} token 
 * @param {string} question 
 */
export async function sendShareChat(token, question) {
    await delay(1200);
    return {
        content: `(Respuesta simulada basada en el resumen) - Entiendo tu pregunta sobre "${question}". Basado en el resumen de la charla, los puntos clave tratados fueron la auditoría y validación de prácticas. ¿Deseas saber algo más específico sobre esos puntos?`
    };
}
