import store from './store/state.js';
import { api } from './api/traccar.js';
import { connectWebSocket, disconnectWebSocket } from './api/websocket.js';
import { initLogin } from './components/login.js';
import { initMap } from './components/map.js';
import { initSidebar } from './components/sidebar.js';
import { initDeviceDetail } from './components/deviceDetail.js';

// DOM Elements
const loginView = document.getElementById('login-view');
const mainView = document.getElementById('main-view');

async function initializeApp() {
    // Initialize icons
    lucide.createIcons();
    
    // Setup Theme
    if (store.state.isDarkMode) {
        document.documentElement.classList.add('dark');
    }
    
    document.getElementById('theme-toggle').addEventListener('click', () => {
        store.toggleTheme();
        if (store.state.isDarkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    });

    // Logout handler
    document.getElementById('logout-btn').addEventListener('click', async () => {
        try {
            await api.logout();
        } catch(e) {
            console.error('Logout error', e);
        }
        store.logout();
        disconnectWebSocket();
        showLoginView();
    });

    // Initialize Components
    initLogin(onLoginSuccess);
    initMap();
    initSidebar();
    initDeviceDetail();
    
    // Request All Positions FAB/Header Button
    const requestAllBtn = document.getElementById('request-all-btn');
    requestAllBtn.addEventListener('click', async () => {
        const devices = Object.values(store.state.devices);
        if (devices.length === 0) return;
        
        try {
            requestAllBtn.querySelector('i').classList.add('animate-spin');
            
            // Loop through all devices and send command
            const promises = devices.map(async (device) => {
                try {
                    await api.sendCommand(device.id, 'positionSingle');
                    return { name: device.name, success: true };
                } catch (e) {
                    console.warn(`Could not send command to ${device.name}`, e);
                    return { name: device.name, success: false };
                }
            });
            
            const results = await Promise.all(promises);
            const successCount = results.filter(r => r.success).length;
            
            showToast(`${successCount} eszköznek sikeresen elküldve a frissítési parancs!`, 'success');
        } catch (e) {
            console.error('Error requesting all positions', e);
            showToast('Hiba történt a pozíciók lekérésekor.', 'warning');
        } finally {
            setTimeout(() => {
                requestAllBtn.querySelector('i').classList.remove('animate-spin');
            }, 1000);
        }
    });
    
    // My Location FAB
    document.getElementById('btn-my-location').addEventListener('click', () => {
        if (!store.state.user) return;
        const myName = store.state.user.name;
        const myDevice = Object.values(store.state.devices).find(d => d.name === myName);
        if (myDevice) {
            store.setSelectedDevice(myDevice.id);
        } else {
            showToast('Nem található saját eszköz (Nincs olyan eszköz, aminek a neve megegyezik a tieddel).', 'warning');
        }
    });

    // Check if user is already logged in
    try {
        const user = await api.checkSession();
        if (user) {
            onLoginSuccess(user);
        } else {
            showLoginView();
        }
    } catch (e) {
        showLoginView();
    }
}

async function onLoginSuccess(user) {
    store.setUser(user);
    showMainView();
    
    // Request Notification permission
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
    
    try {
        // Fetch initial data
        const [devices, positions, geofences] = await Promise.all([
            api.getDevices(),
            api.getPositions(),
            api.getGeofences().catch(() => [])
        ]);
        
        if (devices) store.setDevices(devices);
        if (positions) store.setPositions(positions);
        
        if (geofences && Array.isArray(geofences)) {
            const gfMap = {};
            geofences.forEach(g => gfMap[g.id] = g);
            store.state.geofences = gfMap;
            store.notify();
        }
        
        // Connect WebSocket for live updates
        connectWebSocket();
        
    } catch (e) {
        console.error('Error fetching initial data', e);
    }
}

function showLoginView() {
    loginView.classList.remove('hidden');
    mainView.classList.add('hidden');
}

function showMainView() {
    loginView.classList.add('hidden');
    mainView.classList.remove('hidden');
    
    // Invalidate map size after a slight delay to ensure container is fully visible
    setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
    }, 100);
}

// Global Toast utility
export function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    // Create browser notification if permitted
    if ('Notification' in window && Notification.permission === 'granted') {
        // Avoid duplicate notifications by checking active document state
        if (document.visibilityState === 'hidden' || type !== 'info') {
            new Notification('Traccar+', {
                body: message,
                icon: '/favicon.ico' // Or any suitable icon
            });
        }
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'info';
    if (type === 'success') icon = 'check-circle';
    if (type === 'warning') icon = 'alert-triangle';
    
    toast.innerHTML = `
        <i data-lucide="${icon}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    lucide.createIcons({ root: toast });
    
    setTimeout(() => {
        toast.classList.add('hiding');
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, 4000);
}

window.showToast = showToast; // Expose globally just in case

// Start the app
document.addEventListener('DOMContentLoaded', initializeApp);
