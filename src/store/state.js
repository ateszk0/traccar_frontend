// Store state management
const store = {
    state: {
        user: null,
        devices: {}, // id -> device object
        positions: {}, // deviceId -> position object
        geofences: {}, // id -> geofence object
        selectedDeviceId: null,
        isDarkMode: localStorage.getItem('theme') === 'dark',
    },
    
    listeners: [],
    
    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    },
    
    notify() {
        this.listeners.forEach(listener => listener(this.state));
    },
    
    setUser(user) {
        this.state.user = user;
        this.notify();
    },
    
    setDevices(devicesArray) {
        devicesArray.forEach(d => {
            this.state.devices[d.id] = { ...this.state.devices[d.id], ...d };
        });
        this.notify();
    },
    
    updateDevice(device) {
        this.state.devices[device.id] = { ...this.state.devices[device.id], ...device };
        this.notify();
    },
    
    setPositions(positionsArray) {
        positionsArray.forEach(p => {
            this.state.positions[p.deviceId] = p;
        });
        this.notify();
    },
    
    setSelectedDevice(id) {
        this.state.selectedDeviceId = id;
        this.notify();
    },
    
    toggleTheme() {
        this.state.isDarkMode = !this.state.isDarkMode;
        localStorage.setItem('theme', this.state.isDarkMode ? 'dark' : 'light');
        this.notify();
    },
    
    logout() {
        this.state.user = null;
        this.state.devices = {};
        this.state.positions = {};
        this.state.selectedDeviceId = null;
        this.notify();
    }
};

export default store;
