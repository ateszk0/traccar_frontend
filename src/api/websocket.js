import store from '../store/state.js?v=5';

let socket = null;
let reconnectTimer = null;

export function connectWebSocket() {

    if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
        return;
    }

    // Connect to WebSocket using same host as base URL, replace https with wss
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/api/socket`;
    
    console.log('[WebSocket] Connecting to', wsUrl);
    socket = new WebSocket(wsUrl);
    
    socket.onopen = () => {
        console.log('[WebSocket] Connected');
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
    };
    
    socket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.devices) {
                store.setDevices(data.devices);
            }
            
            if (data.positions) {
                store.setPositions(data.positions);
            }
            
            if (data.events) {
                data.events.forEach(ev => {
                    if (ev.type === 'geofenceEnter' || ev.type === 'geofenceExit') {
                        const device = store.state.devices[ev.deviceId];
                        const geofence = store.state.geofences[ev.geofenceId];
                        
                        if (device && geofence) {
                            const action = ev.type === 'geofenceEnter' ? 'megérkezett ide' : 'elhagyta ezt a helyet';
                            const toastType = ev.type === 'geofenceEnter' ? 'success' : 'info';
                            
                            if (window.showToast) {
                                window.showToast(`${device.name} ${action}: ${geofence.name}`, toastType);
                            }
                        }
                    }
                });
            }
        } catch (e) {
            console.error('[WebSocket] Error parsing message', e);
        }
    };
    
    socket.onclose = () => {
        console.log('[WebSocket] Disconnected');
        // Auto reconnect
        if (store.state.user) {
            reconnectTimer = setTimeout(connectWebSocket, 5000);
        }
    };
    
    socket.onerror = (err) => {
        console.error('[WebSocket] Error', err);
    };
}

export function disconnectWebSocket() {
    if (socket) {
        socket.close();
        socket = null;
    }
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
}
