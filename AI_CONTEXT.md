# Traccar+ Frontend - Development Context for AI

This document contains all critical context, architectural decisions, and current features of the "Traccar+" project. Read this carefully before starting any new development or debugging.

## 1. Project Overview
**Traccar+** is a custom, modern, lightweight vanilla JavaScript frontend for a Traccar GPS tracking backend. 
- **Goal:** Provide a very clean, responsive, and aesthetic UI (mobile-friendly, dark/light mode) without heavy frameworks.
- **Tech Stack:** HTML5, Vanilla CSS, Vanilla JavaScript (ES Modules).
- **Libraries (loaded via CDN):** 
  - [Leaflet](https://leafletjs.com/) (Map rendering)
  - [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster) (Marker grouping)
  - [Lucide Icons](https://lucide.dev/) (SVG icons)

## 2. Deployment & Infrastructure
- The frontend is served via an **Nginx Docker container**.
- **Crucial Architecture:** Nginx acts as a reverse proxy. It serves the static files (this codebase) AND proxies all requests starting with `/api` to the backend Traccar server (usually running on port 8082, often in an LXC container).
- **Because of the proxy:** ALL backend requests in the JS code must use relative paths (e.g., `/api/session`, `/api/devices`) and must NEVER hardcode the backend IP.
- **Auth Mechanism:** Traccar uses a cookie-based session (`JSESSIONID`). Therefore, all `fetch` requests must include `credentials: 'include'`.

## 3. Code Architecture
The code relies on ES Modules and a very simple reactive state pattern.

- `index.html`: The single page structure. Uses `hidden` classes to toggle views (e.g., `#login-view` vs `#main-view`). Contains all modals.
- `src/main.js`: Application entry point. Initializes all components, handles theme, and the Profile Modal.
- `src/store/state.js`: A custom, lightweight reactive store. Holds `user`, `devices`, `positions`, `geofences`. Components can call `store.subscribe((state) => {...})` to react to WebSocket or API updates.
- `src/api/traccar.js`: A wrapper around `fetch` (`traccarFetch`). Handles Traccar API calls.
- `src/api/websocket.js`: Connects to `wss://<host>/api/socket`. Listens for live updates (positions, devices) and directly mutates the `store`.
- `src/components/`:
  - `map.js`: Manages the Leaflet map and `MarkerClusterGroup`. Includes custom logic to draw route history and stacked avatar icons.
  - `deviceDetail.js`: Manages the side/bottom sliding panel for a selected device.
  - `login.js`: Handles auth logic, basic XSS sanitization, and UI toggles.
  - `sidebar.js`: Renders the list of devices on the left side (or full screen on mobile).

## 4. Key Features & Implementation Details

### A. Marker Clustering & Map Logic
- **Clustering:** Devices close to each other are clustered. The cluster icon dynamically displays up to 3 stacked user avatars (`device.attributes.deviceImage` or initials).
- **Follow Mode:** Clicking a device in the sidebar automatically focuses and follows it on the map. If the user drags the map manually (triggering `dragstart`), the follow mode is immediately disabled until a new device is clicked.

### B. Image Uploads & Avatars
There are TWO distinct avatars in this system:
1. **Device Avatar (`device.attributes.deviceImage`):** What everyone sees on the map. Can ONLY be modified by **Admin users** via the Device Detail panel. Uploaded to `/api/devices/{id}/image`.
2. **User Profile Image (`user.attributes.profileImage`):** What the logged-in user sees as their own profile picture in the top left. Uploaded via `api.updateUser` (PUT `/api/users/{id}`). 
   - *Custom Logic:* Before uploading the User Profile image, the frontend reads the file, draws it to a `<canvas>`, resizes it to a maximum dimension of **480p**, and converts it to a JPEG Base64 string to save server memory.

### C. Security & Anti-Spam
- **Position Request Cooldown:** Traccar allows requesting a single fresh position. To prevent battery drain and server spam, this button is locked by a **60-second global cooldown**. The timestamp is stored in `localStorage` (`lastPositionRequestTime`), so the cooldown persists even if the user refreshes the page.
- **Logout:** Asks for confirmation before ending the session.

### D. Navigation Integration
- Inside the Device Detail panel, there is an "Útvonal" (Route) button.
- Clicking it opens a modal offering deep-links to **Google Maps**, **Waze**, and **Apple Maps**.
- These links use standard URI schemes (e.g., `https://waze.com/ul?ll=lat,lon&navigate=yes`), automatically opening the native mobile apps on iOS/Android.

## 5. CSS & Styling Principles
- Uses CSS Variables (`:root`) for colors, spacing, and theming.
- Dark mode is implemented via the `.dark` class on the `<html>` element.
- The UI is heavily inspired by modern glassmorphism and clean aesthetics (rounded corners, subtle borders).
- Avoid `width: 100%` on generic tags like `button` without scoping it (e.g. `button[type="submit"]`), as it breaks specific icons like the password visibility toggle.

## 6. Known Quirks / Future Notes
- **Lucide Icons Re-rendering:** When dynamically changing HTML that contains an icon (e.g., toggling the password eye icon), you must use `.innerHTML = '<i data-lucide="..."></i>'` followed by `lucide.createIcons()`. `lucide` replaces the `<i>` tag with an `<svg>`, so trying to set attributes on the old `<i>` reference will fail.
- **Browser Caching:** The frontend heavily caches ES modules and CSS. When deploying updates, instruct users to hard-refresh (Ctrl+F5) or use Incognito mode for initial testing.
