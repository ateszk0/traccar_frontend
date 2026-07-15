import store from '../store/state.js';
import { getInitials, formatSpeed, formatTimeAgo, getDeviceStatus } from '../utils/format.js';
import { api } from '../api/traccar.js';
import { drawRoute, clearRoute } from './map.js';

export function initDeviceDetail() {
    const panel = document.getElementById('device-detail');
    const closeBtn = document.getElementById('close-detail');
    
    // UI Elements
    const avatar = document.getElementById('detail-avatar');
    const nameEl = document.getElementById('detail-name');
    const statusBadge = document.getElementById('detail-status');
    const speedEl = document.getElementById('detail-speed');
    const batteryEl = document.getElementById('detail-battery');
    const timeEl = document.getElementById('detail-time');
    const addressEl = document.getElementById('detail-address').querySelector('span');
    const replayBtn = document.getElementById('btn-replay');
    const requestSingleBtn = document.getElementById('btn-request-single');
    const extraInfoEl = document.getElementById('detail-extra-info');
    const avatarUpload = document.getElementById('avatar-upload');
    
    let isRequestSingleLoading = false;
    let cooldownTimer = null;
    const COOLDOWN_MS = 60000;

    function updateRequestButtonState() {
        const lastRequest = parseInt(localStorage.getItem('lastPositionRequestTime') || '0', 10);
        const elapsed = Date.now() - lastRequest;
        
        if (elapsed < COOLDOWN_MS) {
            const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
            requestSingleBtn.disabled = true;
            requestSingleBtn.innerHTML = `<i data-lucide="clock"></i> Várj ${remaining}s...`;
            lucide.createIcons();
            
            if (!cooldownTimer) {
                cooldownTimer = setInterval(updateRequestButtonState, 1000);
            }
        } else {
            requestSingleBtn.disabled = false;
            requestSingleBtn.innerHTML = '<i data-lucide="refresh-cw"></i> Friss pozíció lekérése';
            lucide.createIcons();
            if (cooldownTimer) {
                clearInterval(cooldownTimer);
                cooldownTimer = null;
            }
        }
    }
    
    updateRequestButtonState();

    requestSingleBtn.addEventListener('click', async () => {
        const id = store.state.selectedDeviceId;
        if (!id || isRequestSingleLoading || requestSingleBtn.disabled) return;
        
        try {
            isRequestSingleLoading = true;
            requestSingleBtn.innerHTML = '<i data-lucide="loader" class="animate-spin"></i> Lekérés...';
            lucide.createIcons();
            
            await api.sendCommand(id, 'positionSingle');
            
            if (window.showToast) {
                window.showToast('Pozíciólekérési parancs elküldve!', 'success');
            }
            
            localStorage.setItem('lastPositionRequestTime', Date.now().toString());
        } catch (e) {
            console.error('Error sending command', e);
            if (window.showToast) {
                window.showToast('Nem sikerült elküldeni a parancsot.', 'warning');
            }
        } finally {
            isRequestSingleLoading = false;
            updateRequestButtonState();
        }
    });
    
    avatar.addEventListener('click', () => {
        const id = store.state.selectedDeviceId;
        if (!id || !store.state.user) return;
        
        const user = store.state.user;
        
        // Permission check: ONLY admin can edit device avatar from the detail panel
        // Regular users must use the Profile tab for their own device.
        if (!user.administrator) {
            if (window.showToast) {
                window.showToast('Nincs jogosultságod módosítani az eszközképet itt.', 'warning');
            }
            return;
        }
        
        avatarUpload.click();
    });
    
    avatarUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        const id = store.state.selectedDeviceId;
        if (!file || !id) return;
        
        try {
            avatar.innerHTML = '<i data-lucide="loader" class="animate-spin" style="width: 24px; height: 24px;"></i>';
            lucide.createIcons();
            
            await api.uploadDeviceImage(id, file);
            
            // Refresh devices to get the new image
            const devices = await api.getDevices();
            if (devices) {
                store.setDevices(devices);
            }
        } catch (err) {
            console.error('Error uploading avatar:', err);
            alert('Hiba történt a profilkép feltöltésekor!');
            // Triggers a re-render from store to reset avatar state
            store.notify(); 
        } finally {
            avatarUpload.value = ''; // Reset input
        }
    });
    
    closeBtn.addEventListener('click', () => {
        store.setSelectedDevice(null);
        clearRoute();
    });
    
    const intervalSelect = document.getElementById('history-interval');
    
    let isReplayLoading = false;
    
    replayBtn.addEventListener('click', async () => {
        const id = store.state.selectedDeviceId;
        if (!id || isReplayLoading) return;
        
        try {
            isReplayLoading = true;
            replayBtn.innerHTML = '<i data-lucide="loader" class="animate-spin"></i> Betöltés...';
            lucide.createIcons();
            
            const to = new Date();
            let from = new Date();
            const interval = intervalSelect.value;
            
            if (interval === 'today') {
                from.setHours(0, 0, 0, 0);
            } else if (interval === 'yesterday') {
                from.setDate(from.getDate() - 1);
                from.setHours(0, 0, 0, 0);
                to.setDate(to.getDate() - 1);
                to.setHours(23, 59, 59, 999);
            } else if (interval === 'last24') {
                from.setHours(from.getHours() - 24);
            } else if (interval === 'last3days') {
                from.setDate(from.getDate() - 3);
            } else if (interval === 'lastweek') {
                from.setDate(from.getDate() - 7);
            }
            
            const history = await api.getHistory(id, from, to);
            if (history && history.length > 0) {
                drawRoute(history);
                replayBtn.innerHTML = '<i data-lucide="check"></i> Betöltve';
            } else {
                replayBtn.innerHTML = '<i data-lucide="info"></i> Nincs adat';
            }
        } catch (e) {
            console.error('Error fetching history', e);
            replayBtn.innerHTML = '<i data-lucide="x"></i> Hiba történt';
        } finally {
            lucide.createIcons();
            isReplayLoading = false;
            setTimeout(() => {
                if (!isReplayLoading) {
                    replayBtn.innerHTML = '<i data-lucide="history"></i> Betöltés';
                    lucide.createIcons();
                }
            }, 3000);
        }
    });
    
    store.subscribe(async (state) => {
        const id = state.selectedDeviceId;
        if (!id) {
            panel.classList.add('hidden');
            clearRoute();
            return;
        }
        
        const device = state.devices[id];
        const position = state.positions[id];
        
        if (!device) return;
        
        // Populate Data
        if (device.attributes && device.attributes.deviceImage) {
            let imgUrl = device.attributes.deviceImage;
            if (!imgUrl.startsWith('http') && !imgUrl.startsWith('data:')) {
                // Remove leading slash if present
                if (imgUrl.startsWith('/')) imgUrl = imgUrl.substring(1);
                imgUrl = `/api/${imgUrl}`;
            }
            avatar.innerHTML = `<img src="${imgUrl}" alt="${device.name}" onerror="this.outerHTML='${getInitials(device.name)}'">`;
        } else {
            avatar.textContent = getInitials(device.name);
        }
        
        nameEl.textContent = device.name;
        
        const status = getDeviceStatus(device, position);
        statusBadge.textContent = status === 'online' ? 'Online' : status === 'unknown' ? 'Ismeretlen' : 'Offline';
        statusBadge.style.color = status === 'online' ? 'var(--color-success)' : status === 'unknown' ? 'var(--color-warning)' : 'var(--color-offline)';
        statusBadge.style.backgroundColor = status === 'online' ? 'rgba(16, 185, 129, 0.1)' : status === 'unknown' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(148, 163, 184, 0.1)';
        
        if (position) {
            speedEl.textContent = formatSpeed(position.speed);
            timeEl.textContent = formatTimeAgo(position.deviceTime || position.serverTime);
            
            if (position.attributes && position.attributes.batteryLevel !== undefined) {
                batteryEl.textContent = `${Math.round(position.attributes.batteryLevel)} %`;
            } else if (position.attributes && position.attributes.battery !== undefined) {
                // Some devices send battery instead of batteryLevel
                batteryEl.textContent = `${Math.round(position.attributes.battery)} %`;
            } else {
                batteryEl.textContent = '- %';
            }
            
            if (position.address) {
                addressEl.textContent = position.address;
            } else {
                addressEl.textContent = `${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}`;
                // Optionally trigger reverse geocoding via nominatim or similar if needed
            }
        } else {
            speedEl.textContent = '-';
            batteryEl.textContent = '- %';
            timeEl.textContent = '-';
            addressEl.textContent = 'Nincs pozíció adat';
        }
        
        // Populate extra info
        extraInfoEl.innerHTML = renderExtraInfo(device, position);
        
        panel.classList.remove('hidden');
    });

    // Navigation Modal Logic
    const btnNavigate = document.getElementById('btn-navigate');
    const navModal = document.getElementById('navigation-modal');
    const closeNavModal = document.getElementById('close-navigation');
    const navGoogle = document.getElementById('nav-google');
    const navWaze = document.getElementById('nav-waze');
    const navApple = document.getElementById('nav-apple');

    btnNavigate.addEventListener('click', () => {
        const id = store.state.selectedDeviceId;
        if (!id) return;
        
        const position = store.state.positions[id];
        if (!position) {
            if (window.showToast) window.showToast('Nincs ismert pozíció!', 'warning');
            return;
        }

        const lat = position.latitude;
        const lon = position.longitude;

        navGoogle.href = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
        navWaze.href = `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`;
        navApple.href = `http://maps.apple.com/?daddr=${lat},${lon}`;

        navModal.classList.remove('hidden');
    });

    closeNavModal.addEventListener('click', () => {
        navModal.classList.add('hidden');
    });
}
function renderExtraInfo(device, position) {
    let rows = [];
    
    // Device info
    if (device.model) rows.push({ label: 'Modell', val: device.model });
    if (device.phone) rows.push({ label: 'Telefonszám', val: device.phone });
    if (device.contact) rows.push({ label: 'Kapcsolat', val: device.contact });
    
    // Position attributes
    if (position && position.attributes) {
        const attr = position.attributes;
        if (attr.totalDistance !== undefined) {
            rows.push({ label: 'Összes távolság', val: `${(attr.totalDistance / 1000).toFixed(1)} km` });
        }
        if (attr.motion !== undefined) {
            rows.push({ label: 'Mozgásban', val: attr.motion ? 'Igen' : 'Nem' });
        }
        if (attr.ignition !== undefined) {
            rows.push({ label: 'Gyújtás', val: attr.ignition ? 'Be' : 'Ki' });
        }
        if (attr.hours !== undefined) {
            rows.push({ label: 'Üzemóra', val: `${(attr.hours / 3600000).toFixed(1)} óra` });
        }
        if (position.accuracy !== undefined && position.accuracy > 0) {
            rows.push({ label: 'GPS Pontosság', val: `${Math.round(position.accuracy)} m` });
        }
        if (position.altitude !== undefined && position.altitude !== 0) {
            rows.push({ label: 'Magasság', val: `${Math.round(position.altitude)} m` });
        }
    }
    
    if (rows.length === 0) return '';
    
    return rows.map(r => `
        <div class="extra-row">
            <span class="extra-label">${r.label}</span>
            <span class="extra-val">${r.val}</span>
        </div>
    `).join('');
}
