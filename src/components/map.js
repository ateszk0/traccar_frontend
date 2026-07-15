import store from '../store/state.js';
import { getInitials } from '../utils/format.js';

let map = null;
let markers = {}; // deviceId -> leaflet marker
let routeLayer = null; // Leaflet FeatureGroup for history

export function clearRoute() {
    if (routeLayer && map) {
        map.removeLayer(routeLayer);
        routeLayer = null;
    }
}

export function drawRoute(positions) {
    if (!map || positions.length === 0) return;
    
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
    
    // Subscribe to store changes
    store.subscribe((state) => {
        updateMarkers(state.devices, state.positions, state.selectedDeviceId);
    });
}

function updateMarkers(devices, positions, selectedDeviceId) {
    if (!map) return;
    
    const currentDeviceIds = new Set(Object.keys(devices));
    
    // Remove old markers
    Object.keys(markers).forEach(id => {
        if (!currentDeviceIds.has(id)) {
            map.removeLayer(markers[id]);
            delete markers[id];
        }
    });
    
    // Add/Update markers
    let needsBoundsUpdate = false;
    const bounds = L.latLngBounds();
    
    Object.values(devices).forEach(device => {
        const position = positions[device.id];
        if (!position) return;
        
        const latLng = [position.latitude, position.longitude];
        bounds.extend(latLng);
        needsBoundsUpdate = true;
        
        const isSelected = selectedDeviceId === device.id;
        
        if (!markers[device.id]) {
            // Create new marker
            markers[device.id] = createMarker(device, position, isSelected);
            markers[device.id].addTo(map);
            
            // Fly to marker if it's selected directly after being created
            if (isSelected) {
                map.flyTo(latLng, 16, { duration: 1.5 });
            }
        } else {
            // Update existing marker
            markers[device.id].setLatLng(latLng);
            updateMarkerIcon(markers[device.id], device, isSelected);
            
            // If this is the selected device and it just moved, keep it centered if we want to follow it
            // Or just fly to it when newly selected. Handled in sidebar.js click event.
        }
    });
    
    // Optionally fit bounds on first load when multiple markers appear
    if (Object.keys(markers).length > 0 && map.getZoom() === 12 && store.state.selectedDeviceId === null) {
       // map.fitBounds(bounds, { padding: [50, 50] });
    }
}

function createMarker(device, position, isSelected) {
    const icon = buildIcon(device, isSelected);
    
    const marker = L.marker([position.latitude, position.longitude], { 
        icon: icon,
        zIndexOffset: isSelected ? 1000 : 0
    });
    
    marker.on('click', () => {
        store.setSelectedDevice(device.id);
        map.flyTo([position.latitude, position.longitude], 16, { duration: 1 });
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
            imgUrl = `https://trackdata.atisn.com/api/${imgUrl}`;
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
