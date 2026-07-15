import store from '../store/state.js';
import { getInitials } from '../utils/format.js';

let map = null;
let markerClusterGroup = null;
let markers = {}; // deviceId -> leaflet marker
let routeLayer = null; // Leaflet FeatureGroup for history

let followingDeviceId = null;
let isUserDragging = false;
let lastSelectedId = null;

export function clearRoute() {
    if (routeLayer && map) {
        map.removeLayer(routeLayer);
        routeLayer = null;
    }
}

export function drawRoute(positions) {
    if (!map || !Array.isArray(positions) || positions.length === 0) return;
    
    clearRoute(); // Remove existing route first
    
    const latlngs = positions.map(p => [p.latitude, p.longitude]);
    
    const polyline = L.polyline(latlngs, {
        color: '#3b82f6',
        weight: 4,
        opacity: 0.7,
        dashArray: '10, 10',
        lineJoin: 'round'
    });
    
    routeLayer = L.featureGroup([polyline]);
    
    // Add time markers
    positions.forEach(p => {
        const time = new Date(p.deviceTime || p.serverTime);
        if (isNaN(time.getTime())) return;
        
        const timeString = time.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
        const dateString = time.toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' });
        
        const marker = L.circleMarker([p.latitude, p.longitude], {
            radius: 5,
            color: '#ffffff',
            weight: 2,
            fillColor: '#3b82f6',
            fillOpacity: 1
        });
        
        marker.bindTooltip(`<strong>${dateString} ${timeString}</strong>`, {
            direction: 'top',
            offset: [0, -5],
            opacity: 0.9
        });
        
        routeLayer.addLayer(marker);
    });
    
    routeLayer.addTo(map);
    map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });
}

export function initMap() {
    // Initialize Leaflet Map
    map = L.map('map', {
        zoomControl: false // Custom position if needed
    }).setView([47.4979, 19.0402], 12); // Default to Budapest
    
    L.control.zoom({ position: 'topleft' }).addTo(map);
    
    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    // Initialize MarkerCluster
    markerClusterGroup = L.markerClusterGroup({
        maxClusterRadius: 50,
        iconCreateFunction: createClusterIcon,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true
    });
    map.addLayer(markerClusterGroup);

    // Map drag events to interrupt follow mode
    map.on('dragstart', () => {
        isUserDragging = true;
        followingDeviceId = null;
    });

    // Subscribe to store changes
    store.subscribe((state) => {
        // Handle Follow Mode Activation
        if (state.selectedDeviceId !== lastSelectedId) {
            if (state.selectedDeviceId) {
                followingDeviceId = state.selectedDeviceId;
                isUserDragging = false;
                
                const position = state.positions[state.selectedDeviceId];
                if (position && map) {
                    map.flyTo([position.latitude, position.longitude], 16, { duration: 1 });
                }
            } else {
                followingDeviceId = null;
            }
            lastSelectedId = state.selectedDeviceId;
        }

        updateMarkers(state.devices, state.positions, state.selectedDeviceId);
    });
}

function updateMarkers(devices, positions, selectedDeviceId) {
    if (!map || !markerClusterGroup) return;
    
    const currentDeviceIds = new Set(Object.keys(devices));
    
    // Remove old markers
    Object.keys(markers).forEach(id => {
        if (!currentDeviceIds.has(id)) {
            markerClusterGroup.removeLayer(markers[id]);
            delete markers[id];
        }
    });
    
    // Add/Update markers
    Object.values(devices).forEach(device => {
        const position = positions[device.id];
        if (!position) return;
        
        const latLng = [position.latitude, position.longitude];
        const isSelected = selectedDeviceId === device.id;
        
        if (!markers[device.id]) {
            // Create new marker
            markers[device.id] = createMarker(device, position, isSelected);
            markerClusterGroup.addLayer(markers[device.id]);
        } else {
            // Update existing marker
            const marker = markers[device.id];
            marker.options.device = device; // Update device data for cluster icon
            marker.setLatLng(latLng);
            updateMarkerIcon(marker, device, isSelected);
            
            // Follow Mode: Pan if this is the followed device and user hasn't dragged
            if (followingDeviceId === device.id && !isUserDragging) {
                map.panTo(latLng, { animate: true, duration: 0.5 });
            }
        }
    });
}

function createMarker(device, position, isSelected) {
    const icon = buildIcon(device, isSelected);
    
    const marker = L.marker([position.latitude, position.longitude], { 
        icon: icon,
        zIndexOffset: isSelected ? 1000 : 0,
        device: device // Store device ref for cluster rendering
    });
    
    marker.on('click', () => {
        store.setSelectedDevice(device.id);
        // Following logic is handled in store.subscribe
    });
    
    return marker;
}

function updateMarkerIcon(marker, device, isSelected) {
    marker.setIcon(buildIcon(device, isSelected));
    marker.setZIndexOffset(isSelected ? 1000 : 0);
}

function buildIcon(device, isSelected) {
    let content = getInitials(device.name);
    
    if (device.attributes && device.attributes.deviceImage) {
        let imgUrl = device.attributes.deviceImage;
        if (!imgUrl.startsWith('http') && !imgUrl.startsWith('data:')) {
            if (imgUrl.startsWith('/')) imgUrl = imgUrl.substring(1);
            imgUrl = `/api/${imgUrl}`;
        }
        content = `<img src="${imgUrl}" alt="${device.name}" onerror="this.outerHTML='${getInitials(device.name)}'">`;
    }
    
    const selectedClass = isSelected ? 'selected' : '';
    
    const html = `
        <div class="marker-pin">
            ${content}
        </div>
    `;
    
    return L.divIcon({
        className: `custom-div-icon ${selectedClass}`,
        html: html,
        iconSize: [32, 42],
        iconAnchor: [16, 42]
    });
}

// Custom Cluster Icon generating stacked avatars
function createClusterIcon(cluster) {
    const childMarkers = cluster.getAllChildMarkers();
    let html = '<div class="cluster-avatar-container">';
    
    // Show up to 3 avatars
    const maxToShow = 3;
    const toShow = childMarkers.slice(0, maxToShow);
    
    toShow.forEach((m, i) => {
        const device = m.options.device;
        let imgHtml = getInitials(device ? device.name : '');
        
        if (device && device.attributes && device.attributes.deviceImage) {
            let imgUrl = device.attributes.deviceImage;
            if (!imgUrl.startsWith('http') && !imgUrl.startsWith('data:')) {
                if (imgUrl.startsWith('/')) imgUrl = imgUrl.substring(1);
                imgUrl = `/api/${imgUrl}`;
            }
            imgHtml = `<img src="${imgUrl}" alt="${device.name}" onerror="this.outerHTML='${getInitials(device.name)}'">`;
        }
        
        html += `<div class="cluster-avatar" style="z-index: ${maxToShow - i}">${imgHtml}</div>`;
    });
    
    if (childMarkers.length > maxToShow) {
        html += `<div class="cluster-avatar more" style="z-index: 0">+${childMarkers.length - maxToShow}</div>`;
    }
    
    html += '</div>';
    
    // Base width: 40px for first, +20px for each additional
    const width = 40 + (Math.min(childMarkers.length, maxToShow + 1) - 1) * 20;
    
    return L.divIcon({
        html: html,
        className: 'custom-cluster-icon',
        iconSize: L.point(width, 40)
    });
}
