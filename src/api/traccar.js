import store from '../store/state.js?v=11';

const BASE_URL = '/api';

/**
 * Standard fetch wrapper for Traccar API
 * Includes credentials to send/receive JSESSIONID cookie
 */
async function traccarFetch(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint}`;
    
    const fetchOptions = {
        ...options,
        credentials: 'include',
    };
    
    if (options.body && typeof options.body === 'object' && !(options.body instanceof URLSearchParams) && !(options.body instanceof Blob) && !(options.body instanceof FormData)) {
        fetchOptions.headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        fetchOptions.body = JSON.stringify(options.body);
    }

    try {
        const response = await fetch(url, fetchOptions);
        
        if (response.status === 401) {
            throw new Error('Unauthorized');
        }
        
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }
        
        if (response.status === 204 || response.headers.get('content-length') === '0') {
            return null;
        }
        
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return await response.json();
        }
        
        return await response.text();
    } catch (error) {
        console.error(`[Traccar API] Error calling ${endpoint}:`, error);
        throw error;
    }
}

export const api = {
    // Session
    async login(email, password) {
        return traccarFetch('/session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({ email, password })
        });
    },
    
    async checkSession() {
        return traccarFetch('/session');
    },
    
    async updateUser(user) {
        return traccarFetch(`/users/${user.id}`, {
            method: 'PUT',
            body: user
        });
    },
    
    async logout() {
        return traccarFetch('/session', { method: 'DELETE' });
    },
    
    // Devices & Positions
    async getDevices() {
        return traccarFetch('/devices');
    },
    
    async getGeofences() {
        return traccarFetch('/geofences');
    },
    
    async getPositions() {
        return traccarFetch('/positions');
    },
    
    async getHistory(deviceId, fromDate, toDate) {
        const params = new URLSearchParams();
        params.append('deviceId', deviceId);
        params.append('from', fromDate.toISOString());
        params.append('to', toDate.toISOString());
        
        return traccarFetch(`/positions?${params.toString()}`);
    },
    
    async uploadDeviceImage(deviceId, file) {
        const formData = new FormData();
        formData.append('file', file);
        return traccarFetch(`/devices/${deviceId}/image`, {
            method: 'POST',
            body: formData
        });
    },
    
    async sendCommand(deviceId, type, attributes = {}) {
        return traccarFetch('/commands/send', {
            method: 'POST',
            body: {
                deviceId,
                type,
                attributes
            }
        });
    }
};
