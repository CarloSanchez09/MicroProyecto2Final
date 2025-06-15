# Blackjack Multiplayer Web App

¡Bienvenido a tu propio Blackjack de casino en red! Este proyecto es una app web de Blackjack multijugador en tiempo real, ideal para jugar con amigos en la misma red local (LAN) o a distancia, con interfaz profesional y lógica de apuestas.

---

## ¿Cómo funciona la app?

- **Frontend:** Hecho en React, con diseño responsivo, animaciones, y Bootstrap Icons para una experiencia tipo casino.
- **Backend:** Node.js y Socket.IO gestionan la lógica del juego, sincronización en tiempo real y las apuestas.
- **Apuestas:** Cada jugador inicia con 1000 fichas. El sistema de apuestas es automático y visual, con controles claros y feedback inmediato.
- **Partidas:** El dealer reparte, cada jugador juega su turno, y los resultados se calculan automáticamente (incluye pagos 3:2 por Blackjack).
- **Lobby:** Muestra jugadores conectados, estado de la ronda y mensajes visuales de bienvenida.

---

## Instalación rápida

1. **Clona el repositorio**
2. Instala dependencias en ambos folders:
   ```bash
   cd C:\Users\cs587\OneDrive\Escritorio\Cartas\backend
   npm install
   cd C:\Users\cs587\OneDrive\Escritorio\Cartas\frontend
   npm install
   ```
3. **Inicia el backend:**
   ```bash
   npm start
   # o node server.js
   ```
4. **Inicia el frontend:**
   ```bash
   npm start
   ```
5. Abre el navegador en la IP del servidor (ver abajo cómo cambiar IP).

---

## Cambiar la IP si te mudas de casa o red

La app está configurada para que el frontend se conecte al backend usando la IP de la máquina donde corre el servidor. Por defecto, en `frontend/src/App.js`:

```js
const socket = io(`http://${window.location.hostname}:4002`);
```

### Si cambias de red o de casa:
1. **Averigua la nueva IP local** de la computadora que hará de servidor (puedes usar `ipconfig` en Windows o `ifconfig` en Mac/Linux).
2. **Edita la línea en `App.js`:**
   ```js
   // Por ejemplo, si tu nueva IP es 192.168.1.55
   const socket = io('http://192.168.1.55:4002');
   ```
3. **Guarda y reinicia el frontend** para que los clientes se conecten a la nueva IP.
4. Todos los jugadores deben ingresar la nueva IP en su navegador (por ejemplo: `http://192.168.1.55:3000`).

> **TIP:** Si usas `window.location.hostname`, funcionará automáticamente si acceden desde la misma IP que el servidor. Si hay problemas, pon la IP manualmente.

---

## ¿Cómo jugar?
1. Ingresa tu nombre y únete a la sala.
2. Espera a que todos los jugadores se unan.
3. Coloca tu apuesta y espera que todos apuesten.
4. Un jugador inicia la partida.
5. Juega tu turno: pide carta (Hit) o planta (Stand).
6. El dealer juega y se muestran los resultados, con reparto automático de fichas.
7. ¡Siguiente ronda!

---

## Personalización
- Puedes cambiar colores, textos y reglas de apuesta editando los archivos en `frontend/src/App.js` y `frontend/src/App.css`.
- Para cambiar el puerto del backend, edita `backend/server.js`.

---

## Créditos
- Desarrollado con React, Node.js y Socket.IO.
- Inspirado en la experiencia de casino real.

---

¿Dudas o mejoras? ¡Edita este README o el código según tus necesidades!
