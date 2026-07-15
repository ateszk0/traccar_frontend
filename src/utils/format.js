export function formatSpeed(speedKnots) {
    if (speedKnots == null) return '0 km/h';
    // 1 knot = 1.852 km/h
    const kmh = speedKnots * 1.852;
    return `${Math.round(kmh)} km/h`;
}

export function formatTimeAgo(dateString) {
    if (!dateString) return 'Ismeretlen';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Épp most';
    if (diffMins < 60) return `${diffMins} perce`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} órája`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} napja`;
}

export function getDeviceStatus(device, position) {
    if (device.status === 'online') return 'online';
    if (device.status === 'offline') return 'offline';
    return 'unknown';
}

export function getInitials(name) {
    if (!name) return '?';
    return name.substring(0, 2).toUpperCase();
}
