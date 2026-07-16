import store from '../store/state.js?v=11';
import { getInitials, formatSpeed, formatTimeAgo, getDeviceStatus } from '../utils/format.js?v=11';
import { api } from '../api/traccar.js?v=11';
import { drawRoute, clearRoute } from './map.js?v=11';

export function initDeviceDetail() {
    const panel = document.getElementById('device-detail');
    const closeBtn = document.getElementById('close-detail');
    const dragHandle = document.getElementById('sheet-drag-handle');
    const sheetPeek = document.getElementById('sheet-peek');
    
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

    // ═══════════════════════════════════════════════
    // ═══════════════════════════════════════════════
    // BOTTOM SHEET DRAG LOGIC (mobile only)
    // ═══════════════════════════════════════════════
    const PEEK_HEIGHT = 140; // px visible in peek state
    const HALF_RATIO = 0.45; // 45% of screen
    
    // Sheet states as translateY values (from top of sheet)
    function getSnapPoints() {
        // Fallback to window.innerHeight * 0.85 if offsetHeight is 0
        const sh = panel.offsetHeight || (window.innerHeight * 0.85);
        return {
            peek: sh - PEEK_HEIGHT,                     // Most of sheet hidden
            half: sh - (window.innerHeight * HALF_RATIO), // ~45% visible
            full: 0,                                     // Fully open
            closed: sh + 50                              // Off screen
        };
    }
    
    let currentState = 'peek'; // 'peek' | 'half' | 'full'
    let touchStartY = 0;
    let touchStartTranslateY = 0;
    let isDragging = false;
    let lastTouchY = 0;
    let lastTouchTime = 0;
    let velocity = 0;
    let currentTranslateY = 0; // Explicitly track to avoid DOMMatrix parsing
    
    function isMobile() {
        return window.innerWidth <= 768;
    }
    
    function setSheetPosition(translateY, animate = true) {
        if (!isMobile()) return;
        currentTranslateY = translateY;
        
        if (animate) {
            panel.classList.remove('dragging');
        } else {
            panel.classList.add('dragging');
        }
        panel.style.transform = `translateY(${translateY}px)`;
    }
    
    function snapTo(state, animate = true) {
        const snaps = getSnapPoints();
        currentState = state;
        if (state === 'closed') {
            panel.classList.add('hidden');
            return;
        }
        setSheetPosition(snaps[state], animate);
    }
    
    // Open sheet to peek state
    function openSheet() {
        if (isMobile()) {
            panel.classList.remove('hidden');
            // Force layout recalculation so the transition works
            void panel.offsetWidth;
            snapTo('peek', true);
        } else {
            panel.classList.remove('hidden');
        }
    }
    
    // Pointer events on drag handle AND peek section
    function handlePointerDown(e) {
        if (!isMobile()) return;
        // Only handle primary button (left click or touch)
        if (e.button !== 0 && e.type !== 'touchstart') return;
        
        isDragging = true;
        touchStartY = e.clientY || (e.touches && e.touches[0].clientY);
        lastTouchY = touchStartY;
        lastTouchTime = Date.now();
        velocity = 0;
        
        if (!currentTranslateY) {
            currentTranslateY = getSnapPoints()[currentState] || getSnapPoints().peek;
        }
        touchStartTranslateY = currentTranslateY;
        
        panel.classList.add('dragging');
        if (e.pointerId !== undefined) {
            e.target.setPointerCapture(e.pointerId);
        }
    }
    
    function handlePointerMove(e) {
        if (!isDragging || !isMobile()) return;
        
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        const deltaY = clientY - touchStartY;
        
        if (Math.abs(deltaY) > 5 && e.cancelable) {
            e.preventDefault();
        }
        
        let newY = touchStartTranslateY + deltaY;
        
        const snaps = getSnapPoints();
        newY = Math.max(snaps.full - 20, Math.min(snaps.closed, newY));
        
        if (newY < snaps.full) {
            newY = snaps.full + (newY - snaps.full) * 0.3;
        }
        
        const now = Date.now();
        const dt = now - lastTouchTime;
        if (dt > 0) {
            velocity = (clientY - lastTouchY) / dt;
        }
        lastTouchY = clientY;
        lastTouchTime = now;
        
        currentTranslateY = newY;
        panel.style.transform = `translateY(${newY}px)`;
    }
    
    function handlePointerUp(e) {
        if (!isDragging || !isMobile()) return;
        isDragging = false;
        panel.classList.remove('dragging');
        if (e.pointerId !== undefined) {
            e.target.releasePointerCapture(e.pointerId);
        }
        
        const snaps = getSnapPoints();
        const VELOCITY_THRESHOLD = 0.25;
        
        if (Math.abs(velocity) > VELOCITY_THRESHOLD) {
            if (velocity > 0) {
                if (currentState === 'full') snapTo('half');
                else if (currentState === 'half') snapTo('peek');
                else {
                    store.setSelectedDevice(null);
                    showingRoute = false;
                    clearRoute();
                }
            } else {
                if (currentState === 'peek') snapTo('half');
                else if (currentState === 'half') snapTo('full');
                else snapTo('full');
            }
            return;
        }
        
        const distances = [
            { state: 'full', dist: Math.abs(currentTranslateY - snaps.full) },
            { state: 'half', dist: Math.abs(currentTranslateY - snaps.half) },
            { state: 'peek', dist: Math.abs(currentTranslateY - snaps.peek) }
        ];
        
        if (currentTranslateY > snaps.peek + 60) {
            store.setSelectedDevice(null);
            showingRoute = false;
            clearRoute();
            return;
        }
        
        distances.sort((a, b) => a.dist - b.dist);
        snapTo(distances[0].state);
    }
    
    // Attach events to drag handle and peek section
    [dragHandle, sheetPeek].forEach(el => {
        if (!el) return;
        // Use pointer events for mouse + touch support
        if (window.PointerEvent) {
            el.addEventListener('pointerdown', handlePointerDown, { passive: true });
            el.addEventListener('pointermove', handlePointerMove, { passive: false });
            el.addEventListener('pointerup', handlePointerUp, { passive: true });
            el.addEventListener('pointercancel', handlePointerUp, { passive: true });
        } else {
            // Fallback for older Safari
            el.addEventListener('touchstart', handlePointerDown, { passive: true });
            el.addEventListener('touchmove', handlePointerMove, { passive: false });
            el.addEventListener('touchend', handlePointerUp, { passive: true });
            el.addEventListener('touchcancel', handlePointerUp, { passive: true });
        }
    });

    // ═══════════════════════════════════════════════
    // ORIGINAL FUNCTIONALITY
    // ═══════════════════════════════════════════════

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
            requestSingleBtn.innerHTML = '<i data-lucide="refresh-cw"></i> Friss pozíció';
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
            
            const devices = await api.getDevices();
            if (devices) {
                store.setDevices(devices);
            }
        } catch (err) {
            console.error('Error uploading avatar:', err);
            alert('Hiba történt a profilkép feltöltésekor!');
            store.notify(); 
        } finally {
            avatarUpload.value = '';
        }
    });
    
    closeBtn.addEventListener('click', () => {
        store.setSelectedDevice(null);
        showingRoute = false;
        clearRoute();
    });
    
    const intervalSelect = document.getElementById('history-interval');
    
    let isReplayLoading = false;
    let showingRoute = false;
    
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
                
                // Hide panel on mobile to see the map
                if (isMobile()) {
                    showingRoute = true;
                    snapTo('closed');
                }
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
    
    // ═══════════════════════════════════════════════
    // STORE SUBSCRIPTION
    // ═══════════════════════════════════════════════
    let lastDeviceId = null;
    
    store.subscribe(async (state) => {
        const id = state.selectedDeviceId;
        if (!id) {
            if (isMobile()) {
                snapTo('closed');
            } else {
                panel.classList.add('hidden');
            }
            showingRoute = false;
            clearRoute();
            lastDeviceId = null;
            return;
        }
        
        const device = state.devices[id];
        const position = state.positions[id];
        
        if (!device) return;
        
        // Populate Data
        if (device.attributes && device.attributes.deviceImage) {
            let imgUrl = device.attributes.deviceImage;
            if (!imgUrl.startsWith('http') && !imgUrl.startsWith('data:')) {
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
                batteryEl.textContent = `${Math.round(position.attributes.battery)} %`;
            } else {
                batteryEl.textContent = '- %';
            }
            
            if (position.address) {
                addressEl.textContent = position.address;
            } else {
                addressEl.textContent = `${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}`;
            }
        } else {
            speedEl.textContent = '-';
            batteryEl.textContent = '- %';
            timeEl.textContent = '-';
            addressEl.textContent = 'Nincs pozíció adat';
        }
        
        // Populate extra info
        extraInfoEl.innerHTML = renderExtraInfo(device, position);
        
        // Handle sheet visibility and route cleanup
        const isNewDevice = id !== lastDeviceId;
        if (isNewDevice) {
            if (showingRoute) {
                showingRoute = false;
                clearRoute();
            }
            openSheet();
            lastDeviceId = id;
        } else if (!showingRoute && !isMobile()) {
            panel.classList.remove('hidden');
        }
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
    navModal.addEventListener('click', (e) => {
        if (e.target === navModal) navModal.classList.add('hidden');
    });
}

function renderExtraInfo(device, position) {
    let rows = [];
    
    if (device.model) rows.push({ label: 'Modell', val: device.model });
    if (device.phone) rows.push({ label: 'Telefonszám', val: device.phone });
    if (device.contact) rows.push({ label: 'Kapcsolat', val: device.contact });
    
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
