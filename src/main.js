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
        if (!confirm('Biztosan ki akarsz jelentkezni?')) return;
        
        try {
            await api.logout();
        } catch(e) {
            console.error('Logout error', e);
        }
        store.logout();
        disconnectWebSocket();
        showLoginView();
    });

    // Profile Modal
    const profileBtn = document.getElementById('profile-btn');
    const profileModal = document.getElementById('profile-modal');
    const closeProfileBtn = document.getElementById('close-profile');
    const profileAvatar = document.getElementById('profile-avatar');
    const profileAvatarUpload = document.getElementById('profile-avatar-upload');
    const profileName = document.getElementById('profile-name');
    const profileEmail = document.getElementById('profile-email');

    function openProfileModal() {
        try {
            const user = store.state.user;
            if (!user) {
                if (window.showToast) window.showToast('Nincs bejelentkezett felhasználó!', 'warning');
                return;
            }
            
            profileName.textContent = user.name || 'Ismeretlen';
            profileEmail.textContent = user.email || user.emailAddress || '';
            
            // Find matching device to show avatar
            const myDevice = Object.values(store.state.devices || {}).find(d => d.name === user.name);
            if (myDevice && myDevice.attributes && myDevice.attributes.deviceImage) {
                let imgUrl = myDevice.attributes.deviceImage;
                if (!imgUrl.startsWith('http') && !imgUrl.startsWith('data:')) {
                    if (imgUrl.startsWith('/')) imgUrl = imgUrl.substring(1);
                    imgUrl = `/api/${imgUrl}`;
                }
                const fallback = (user.name || 'U').charAt(0).toUpperCase();
                profileAvatar.innerHTML = `<img src="${imgUrl}" alt="${user.name}" onerror="this.outerHTML='${fallback}'">`;
            } else {
                profileAvatar.textContent = user.name ? user.name.charAt(0).toUpperCase() : 'U';
            }
            
            profileModal.classList.remove('hidden');
        } catch (e) {
            console.error('Hiba a profil megnyitásakor:', e);
        }
    }

    profileBtn.addEventListener('click', openProfileModal);
    closeProfileBtn.addEventListener('click', () => profileModal.classList.add('hidden'));

    profileAvatar.addEventListener('click', () => {
        profileAvatarUpload.click();
    });

    profileAvatarUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        const user = store.state.user;
        if (!file || !user) return;
        
        const myDevice = Object.values(store.state.devices).find(d => d.name === user.name);
        if (!myDevice) {
            showToast('Nincs saját eszközöd beállítva. Kérj meg egy admint, hogy hozzon létre eszközt a neveddel!', 'warning');
            return;
        }
        
        try {
            profileAvatar.innerHTML = '<i data-lucide="loader" class="animate-spin" style="width: 24px; height: 24px;"></i>';
            lucide.createIcons();
            
            await api.uploadDeviceImage(myDevice.id, file);
            if (window.showToast) window.showToast('Profilkép sikeresen frissítve!', 'success');
            
            // Refresh devices
            const devices = await api.getDevices();
            if (devices) {
                store.setDevices(devices);
                openProfileModal(); // Refresh modal UI
            }
        } catch (err) {
            console.error('Error uploading avatar:', err);
            if (window.showToast) window.showToast('Hiba történt a profilkép feltöltésekor!', 'warning');
            openProfileModal(); // Reset modal UI
        } finally {
            profileAvatarUpload.value = '';
        }
    });

    // Initialize Components
    initLogin(onLoginSuccess);
    initMap();
    initSidebar();
    initDeviceDetail();
    
    
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
