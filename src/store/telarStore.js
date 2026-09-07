import { create } from 'zustand';

export const useTelarStore = create((set) => ({
    activeIndicators: [],
    
    addIndicator: (indicator) => set((state) => {
        if (!state.activeIndicators.find(i => i.id === indicator.id)) {
            return { activeIndicators: [...state.activeIndicators, indicator] };
        }
        return state;
    }),
    
    removeIndicator: (indicatorId) => set((state) => ({
        activeIndicators: state.activeIndicators.filter(i => i.id !== indicatorId)
    })),
    
    setIndicators: (indicators) => set({ activeIndicators: indicators }),
    
    clearIndicators: () => set({ activeIndicators: [] }),
}));
