let hcData = new Map(); // Map de Número de admisión -> { admision, evoluciones[], fojas[] }
let listeners = new Set();

export const hcLocalStore = {
    setData: (dataMap) => {
        hcData = dataMap;
        listeners.forEach(listener => listener());
    },
    getData: () => hcData,
    getAdmissionData: (numeroAdmision) => hcData.get(numeroAdmision),
    subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },
    hasData: () => hcData.size > 0
};
