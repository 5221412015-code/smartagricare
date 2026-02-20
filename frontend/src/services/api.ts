// API goes through Vite proxy (/api → localhost:5000), so use same origin
const API_BASE_URL = import.meta.env.VITE_API_URL || '';
// ML service: use env var if set, otherwise in dev use hostname:5001, in prod same origin
const ML_SERVICE_URL = import.meta.env.VITE_ML_URL ||
  (import.meta.env.DEV ? `http://${window.location.hostname}:5001` : '');

async function apiFetch<T = any>(url: string, options: RequestInit = {}): Promise<T> {
    const token = localStorage.getItem('smartagricare_token');
    const headers: Record<string, string> = { ...(options.headers as Record<string, string> || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';

    // Add 15s timeout
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 15000);

    try {
        const res = await fetch(url, { ...options, headers, signal: controller.signal });
        clearTimeout(id);
        const text = await res.text();
        let data: any;
        try {
            data = JSON.parse(text);
        } catch {
            throw new Error(`Server returned invalid response (${res.status})`);
        }
        if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
        return data;
    } catch (err: any) {
        clearTimeout(id);
        if (err.name === 'AbortError') throw new Error("Request timeout. Server unreachable.");
        throw err;
    }
}

export const authAPI = {
    login: (email: string, password: string) =>
        apiFetch(`${API_BASE_URL}/api/auth/login`, { method: 'POST', body: JSON.stringify({ email, password }) }),
    register: (name: string, email: string, password: string) =>
        apiFetch(`${API_BASE_URL}/api/auth/register`, { method: 'POST', body: JSON.stringify({ name, email, password }) }),
    forgotPassword: (email: string) =>
        apiFetch(`${API_BASE_URL}/api/auth/forgot-password`, { method: 'POST', body: JSON.stringify({ email }) }),
    resetPassword: (email: string, otp: string, newPassword: string) =>
        apiFetch(`${API_BASE_URL}/api/auth/reset-password`, { method: 'POST', body: JSON.stringify({ email, otp, newPassword }) }),
    updateProfile: (userId: number, fields: { name?: string; phone?: string; location?: string }) =>
        apiFetch(`${API_BASE_URL}/api/auth/profile`, { method: 'PUT', body: JSON.stringify({ userId, ...fields }) }),
};

export const weatherAPI = {
    getCurrentWeather: (lat: number, lng: number) =>
        apiFetch(`${API_BASE_URL}/api/weather?lat=${lat}&lng=${lng}`).then(d => d.weather || d),
};

export const diseaseAPI = {
    detectDisease: (imageFile: File) => {
        const formData = new FormData();
        formData.append('image', imageFile);
        return apiFetch(`${ML_SERVICE_URL}/predict`, { method: 'POST', body: formData });
    },
    saveReport: (report: { userId?: number; disease: string; confidence: number; cause: string; treatment: string[]; stores: string[]; imageName?: string }) =>
        apiFetch(`${API_BASE_URL}/api/disease/report`, { method: 'POST', body: JSON.stringify(report) }),
    getReports: (userId: number) =>
        apiFetch(`${API_BASE_URL}/api/disease/reports?userId=${userId}`),
};

export const cropAPI = {
    getMeta: () =>
        apiFetch(`${API_BASE_URL}/api/crop-meta`),
    getRecommendations: (season: string, soil?: string, water?: string, district?: string, land?: string) =>
        apiFetch(`${API_BASE_URL}/api/crops/recommend`, {
            method: 'POST',
            body: JSON.stringify({ season, soil, water, district, land }),
        }),
    getCropDetails: (name: string) =>
        apiFetch(`${API_BASE_URL}/api/crops/${encodeURIComponent(name)}`),
};

export const storeAPI = {
    getNearbyStores: (lat: number, lng: number, radius?: number) =>
        apiFetch(`${API_BASE_URL}/api/stores/nearby?lat=${lat}&lng=${lng}${radius ? `&radius=${radius}` : ''}`),
};

export const voiceAPI = {
    processQuery: (query: string, language?: string) =>
        apiFetch(`${API_BASE_URL}/api/voice/query`, { method: 'POST', body: JSON.stringify({ query, language }) }),
};
