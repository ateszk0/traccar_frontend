import store from './store/state.js?v=5';
import { api } from './api/traccar.js?v=5';
import { connectWebSocket, disconnectWebSocket } from './api/websocket.js?v=5';
import { initLogin } from './components/login.js?v=5';
import { initMap } from './components/map.js?v=5';
import { initSidebar } from './components/sidebar.js?v=5';
import { initDeviceDetail } from './components/deviceDetail.js?v=5';

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
            
            // Server-side avatar from user attributes
            const fallback = (user.name || 'U').charAt(0).toUpperCase();
            if (user.attributes && user.attributes.profileImage) {
                profileAvatar.innerHTML = `<img src="${user.attributes.profileImage}" alt="${user.name}" onerror="this.outerHTML='${fallback}'">`;
            } else {
                profileAvatar.textContent = fallback;
            }
            
            profileModal.classList.remove('hidden');
        } catch (e) {
            console.error('Hiba a profil megnyitásakor:', e);
            alert('Hiba történt a profil megnyitásakor!');
        }
    }

    profileBtn.addEventListener('click', openProfileModal);
    closeProfileBtn.addEventListener('click', () => profileModal.classList.add('hidden'));
    profileModal.addEventListener('click', (e) => {
        if (e.target === profileModal) profileModal.classList.add('hidden');
    });

    profileAvatar.addEventListener('click', () => {
        profileAvatarUpload.click();
    });

    function resizeImageAndSave(file, user) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = async function() {
                const maxSide = 480;
                let width = img.width;
                let height = img.height;
                if (width > maxSide || height > maxSide) {
                    if (width > height) {
                        height = Math.round(height * (maxSide / width));
                        width = maxSide;
                    } else {
                        width = Math.round(width * (maxSide / height));
                        height = maxSide;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const base64String = canvas.toDataURL('image/jpeg', 0.85);
                
                try {
                    // Refresh user data first just in case
                    const currentUser = await api.checkSession();
                    if (!currentUser.attributes) currentUser.attributes = {};
                    currentUser.attributes.profileImage = base64String;
                    
                    // Upload to Traccar Server
                    await api.updateUser(currentUser);
                    store.setUser(currentUser);
                    
                    if (window.showToast) window.showToast('Profilkép feltöltve a szerverre (480p)!', 'success');
                    openProfileModal(); // Refresh UI
                } catch (apiErr) {
                    console.error('API hiba a mentésnél:', apiErr);
                    if (window.showToast) window.showToast('Hiba a szerverre mentés során!', 'warning');
                    openProfileModal();
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    profileAvatarUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        const user = store.state.user;
        if (!file || !user) return;
        
        try {
            profileAvatar.innerHTML = '<i data-lucide="loader" class="animate-spin" style="width: 24px; height: 24px;"></i>';
            lucide.createIcons();
            
            resizeImageAndSave(file, user);
        } catch (err) {
            console.error('Error reading avatar:', err);
            if (window.showToast) window.showToast('Hiba történt a profilkép beállításakor!', 'warning');
            openProfileModal(); // Reset
        } finally {
            profileAvatarUpload.value = ''; // Reset input
        }
    });

    // Initialize Components
    initLogin(onLoginSuccess);
    initMap();
    initSidebar();
    initDeviceDetail();

    // ─── Mobile Sidebar Toggle ───
    const sidebarEl = document.getElementById('sidebar');
    const toggleListBtn = document.getElementById('btn-toggle-list');
    const closeSidebarBtn = document.getElementById('close-sidebar');

    if (toggleListBtn) {
        toggleListBtn.addEventListener('click', () => {
            sidebarEl.classList.toggle('mobile-open');
        });
    }
    if (closeSidebarBtn) {
        closeSidebarBtn.addEventListener('click', () => {
            sidebarEl.classList.remove('mobile-open');
        });
    }

    // Auto-close sidebar when device selected on mobile
    store.subscribe((state) => {
        if (state.selectedDeviceId && window.innerWidth <= 768) {
            sidebarEl.classList.remove('mobile-open');
        }
    });
    
    // My Location FAB
    document.getElementById('btn-my-location').addEventListener('click', () => {
        if (!store.state.user) return;
        const myName = store.state.user.name;
        const myDevice = Object.values(store.state.devices).find(d => d.name === myName);
        if (myDevice) {
            const pos = store.state.positions[myDevice.id];
            if (pos) {
                import('./components/map.js?v=5').then(module => {
                    module.flyToLocation(pos.latitude, pos.longitude, 16);
                });
            } else {
                showToast('Nem található pozíció a saját eszközhöz.', 'warning');
            }
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

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => {
            console.warn('[SW] Registration failed:', err);
        });
    });
}

// Start the app
document.addEventListener('DOMContentLoaded', initializeApp);
