import store from '../store/state.js?v=8';
import { getInitials, formatSpeed, formatTimeAgo, getDeviceStatus } from '../utils/format.js?v=8';

export function initSidebar() {
    const listEl = document.getElementById('device-list');
    
    store.subscribe((state) => {
        if (!state.user) return; // Not logged in
        
        const devices = Object.values(state.devices);
        if (devices.length === 0) {
            listEl.innerHTML = '<div class="loading-state">Nincsenek eszközök</div>';
            return;
        }
        
        // Sort devices by name
        devices.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        
        listEl.innerHTML = devices.map(device => {
            const position = state.positions[device.id];
            const isSelected = state.selectedDeviceId === device.id;
            return buildDeviceCard(device, position, isSelected);
        }).join('');
        
        // Attach event listeners
        lucide.createIcons({ root: listEl });
        
        const cards = listEl.querySelectorAll('.device-card');
        cards.forEach(card => {
            card.addEventListener('click', () => {
                const id = parseInt(card.dataset.id, 10);
                store.setSelectedDevice(id);
                // The map component also listens to store and will fly to the marker
            });
        });
    });
}

function buildDeviceCard(device, position, isSelected) {
    const status = getDeviceStatus(device, position);
    
    let avatarContent = getInitials(device.name);
    if (device.attributes && device.attributes.deviceImage) {
        let imgUrl = device.attributes.deviceImage;
        if (!imgUrl.startsWith('http') && !imgUrl.startsWith('data:')) {
            if (imgUrl.startsWith('/')) imgUrl = imgUrl.substring(1);
            imgUrl = `/api/${imgUrl}`;
        }
        avatarContent = `<img src="${imgUrl}" alt="${device.name}" onerror="this.outerHTML='${getInitials(device.name)}'">`;
    }
    
    let metaHtml = '<span class="meta-item"><i data-lucide="wifi-off"></i> Offline</span>';
    
    if (position) {
        const speed = formatSpeed(position.speed);
        const timeAgo = formatTimeAgo(position.deviceTime || position.serverTime);
        
        metaHtml = `
            <span class="meta-item"><i data-lucide="activity"></i> ${speed}</span>
            <span class="meta-item"><i data-lucide="clock"></i> ${timeAgo}</span>
        `;
    }
    
    return `
        <div class="device-card ${isSelected ? 'active' : ''}" data-id="${device.id}">
            <div class="avatar">
                ${avatarContent}
                <div class="status-indicator ${status}"></div>
            </div>
            <div class="device-info">
                <div class="device-name" title="${device.name || 'Ismeretlen'}">${device.name || 'Ismeretlen'}</div>
                <div class="device-meta">
                    ${metaHtml}
                </div>
            </div>
            <i data-lucide="chevron-right" style="color: var(--color-text-muted); width: 20px;"></i>
        </div>
    `;
}
