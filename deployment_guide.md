# Telepítési Útmutató (Proxmox + Portainer Stacks + Traccar)

Mivel a frontendünk **build-less** (tiszta HTML, CSS és JavaScript), a hosztolása rendkívül egyszerű. 

A legkényelmesebb megoldás egy **Nginx webszerver futtatása Dockerben, Portainer segítségével**. 

---

## Beüzemelés Portainer Stacks (Docker Compose) használatával

A Portainer "Stacks" funkciója lényegében a Docker Compose-t takarja. A zökkenőmentes futtatáshoz a fájlokat el kell helyeznünk a Docker hosztodon, majd a Portainerben létrehozni a Stacket.

### 1. Kód elhelyezése a Docker hoszt gépen
Lépj be SSH-n keresztül a Docker hoszt gépedre (nem a Traccar LXC-be, hanem arra a gépre/VM-re, amin a Docker és a Portainer fut), és hozz létre egy mappát:

```bash
mkdir -p /opt/family-tracker/html
```

Másold be a frontend projekt összes fájlját (az `index.html`-t és a `src` mappát) a `/opt/family-tracker/html/` mappába. (Ezt megteheted Git segítségével, vagy SFTP/SCP-vel is).

### 2. Hozd létre az `nginx.conf` konfigurációt
Hozd létre az Nginx beállításait tartalmazó fájlt a `/opt/family-tracker/nginx.conf` útvonalon:

> [!IMPORTANT]
> A `TRACCAR_LXC_IP` helyére írd be a Traccar LXC konténered belső IP-címét (pl. `http://192.168.1.50:8082`).

```nginx
server {
    listen 80;
    server_name localhost;

    root /usr/share/nginx/html;
    index index.html;

    # Statikus frontend fájlok kiszolgálása
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Traccar API kérések továbbítása a Traccar LXC-nek
    location /api {
        proxy_pass http://TRACCAR_LXC_IP:8082; # <-- Írd be a Traccar LXC IP-jét!
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket kapcsolat továbbítása a valós idejű frissítésekhez
    location /api/socket {
        proxy_pass http://TRACCAR_LXC_IP:8082/api/socket; # <-- Írd be a Traccar LXC IP-jét!
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

### 3. A Stack létrehozása Portainerben
1. Nyisd meg a Portainer felületét.
2. Menj a **Stacks** menüpontra, majd kattints az **Add stack** gombra.
3. Adj neki egy nevet (pl. `family-tracker`).
4. A **Web editor**-ba másold be az alábbi Docker Compose kódot:

```yaml
version: '3.8'

services:
  web:
    image: nginx:alpine
    container_name: family-tracker-nginx
    restart: unless-stopped
    ports:
      - "8080:80" # A Docker hosztod 8080-as portján fog figyelni
    volumes:
      # A hoszton létrehozott html mappa becsatolása az Nginx webrootba
      - /opt/family-tracker/html:/usr/share/nginx/html:ro
      # Az nginx.conf konfigurációs fájl becsatolása
      - /opt/family-tracker/nginx.conf:/etc/nginx/conf.d/default.conf:ro
```

5. Kattints a lap alján a **Deploy the stack** gombra.

### 4. Reverse Proxy beállítása
A meglévő fordított proxy-don (pl. Nginx Proxy Manager, Cloudflare Tunnel stb.) irányítsd a `https://map.atisn.com` domaint a Docker hosztod IP-címére és a `8080`-as portra.

---

## Miért jó ez a felépítés?
* **Rendkívül gyors frissítés:** Ha frissíteni szeretnéd a kódot (pl. Git pull-lal a `/opt/family-tracker/html` mappában), nem kell újraépítened a konténert. A böngésző frissítése után azonnal látni fogod az új verziót.
* **Egyszerű Nginx konfiguráció:** Ha módosítani kell a proxy beállításokon, csak átírod a hoszton a `/opt/family-tracker/nginx.conf` fájlt, és a Portainerben újraindítod (Restart) ezt a stacket.
