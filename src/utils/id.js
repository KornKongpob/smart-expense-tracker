export const generateId = () => `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
export const generateTransferId = () => `tr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
