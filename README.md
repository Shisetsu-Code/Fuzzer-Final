# Fuzzer Final

MCP para ChatGPT con navegador persistente en GitHub Actions. Solo demos públicas. Ejecuta spins normales, Ante Bet y compras disponibles; conserva coordenadas y tráfico HTTP/WebSocket en Cloudflare.

## Uso

1. Conectá `https://fuzzer-final.braian-n-l.workers.dev/mcp` como MCP con OAuth en ChatGPT. La pantalla de autorización pide la clave `ACCESS_TOKEN` del archivo local ignorado `.dev.vars`; no es tu contraseña de GitHub ni Cloudflare. La autorización dura 24 horas.
2. Iniciá **Demo runner** en Actions (o dejá el arranque programado). El navegador atiende trabajos durante hasta 45 minutos y mantiene cada juego abierto mientras ejecuta su recorrido.
3. Pedí `run_games` con los juegos y sus URLs demo. `normalSpins:1`, `anteSpins:1`, `buyAll:true`, `speed:4` son los valores predeterminados.
4. Usá `observe`: las pantallas conocidas avanzan solas. En `needs_input`, ChatGPT ve la captura y envía `act` con coordenadas normalizadas del **viewport completo**, el `observationId` actual y un `commandId` único. Reintentar una llamada incierta conserva el mismo ID. `resume` devuelve el control al motor. Para un canvas desconocido, ChatGPT completa el recorrido y usa `finish_game` con un resumen explícito de lo comprobado.
5. `export_game` entrega mapa de controles y acciones con secuencia, estado, capturas y endpoints. `get_trace` entrega los payloads HTTP/WS de cada acción. Las trazas grandes se descargan de la ruta autenticada indicada.

```json
{"games":[{"id":"gates-of-olympus","url":"https://www.pragmaticplay.com/en/games/gates-of-olympus/"}],"speed":4,"normalSpins":1,"anteSpins":1,"buyAll":true}
```

El arranque programado puede tardar varios minutos. Para arranque inmediato desde `run_games`, configurar opcionalmente en el Worker `GITHUB_DISPATCH_TOKEN`: token fino limitado a **este repo**, permiso Actions:write. No copiar un token personal de acceso general. Un runner ya activo toma el trabajo en aproximadamente 2 segundos. Los límites de GitHub Actions siguen aplicando.

## Qué se guarda

- **D1:** trabajos, estado/heartbeat, órdenes con deduplicación, controles y rectángulos, secuencia de acciones e índice `transport + method/direction + endpoint`.
- **R2 privado:** JPEG antes/después y traza JSON por acción. Incluye URL completa, método, cabeceras sin Authorization/Cookie, body de request y response, código HTTP, frames WS enviados/recibidos, timestamp y acción asociada. Payloads binarios usan base64; se conserva su longitud y cualquier truncamiento.
- Las continuaciones automáticas conservan coordenadas y captura anterior dentro de la acción que abrió el bonus.
- Los parámetros de sesión del demo permanecen en evidencia privada. Un endpoint guardado no garantiza replay en otra sesión: se necesita una sesión fresca del proveedor. No se ejecuta replay HTTP automático.

No se publican trazas ni capturas como artifacts de un repo público. El runner mantiene copia temporal local para recuperar evidencia si una subida falla; termina con error, sin repetir el clic.

## Alcance real

Adaptador inicial para el runtime público de Pragmatic y controles DOM. Otros canvas y variantes no reconocidas usan la visión de ChatGPT en la misma sesión: no hay promesa de reconocimiento universal. `completed` se limita a las acciones descubiertas/comprobadas; una pantalla desconocida, un timeout o una captura sin controles no demuestra ausencia de compras.

Motor de animación 1x/2x/4x/8x instalado antes de cargar el juego. Acelera timers, RAF y Web Animations; no acelera la red ni el servidor. Si un juego no tolera 4x, usar 1x. Una ronda activa sigue mientras haya progreso, con pausa visual tras 45s sin cambios de fase ni tráfico de juego; entrada visual 10min, 150 pasos por juego. Las capturas se actualizan durante el recorrido. `observe` refresca una pantalla pausada; los clics rechazan imágenes de más de 15s. Se informa el motivo de espera. Reiniciar un runner pierde el navegador: un heartbeat viejo requiere investigar el trabajo y crear otro explícitamente; no se repite una compra incierta.

Cada juego tiene un presupuesto total de 15 minutos. El proceso acepta nuevos trabajos durante 45 minutos y termina la tanda que ya tomó; Actions permite hasta 6 horas para completar una tanda de hasta 20 juegos. Los juegos que excedan su presupuesto quedan incompletos con motivo explícito.

Hosts iniciales: demos oficiales de Pragmatic. Otros proveedores requieren agregar sus hosts demo exactos a `DEMO_HOSTS` del Worker. No usar cuentas, cookies importadas, URLs de caja o casinos con dinero real.

## Desarrollo y despliegue

Node 22+, `npm ci`, `npm run check`, `npm test`; `npx playwright install chromium`; `npm run test:browser`. `npm run deploy` publica el Worker; `npm run db:migrate` aplica el esquema. `node scripts/configure.mjs` genera secretos nuevos solo si `.dev.vars` no existe, los carga al Worker y configura el token de runner en GitHub. Necesita sesiones válidas de Wrangler/GitHub CLI. No modifica otros proyectos.

Las credenciales no se versionan. La DB y bucket son dedicados a Fuzzer Final. La especificación corta y el plan están en `docs/implementation.md`.

Proveniencia: la extracción Pragmatic y el reloj se adaptaron de `Shisetsu-Code/hybrid-cloud-fuzzer`, repositorio del mismo propietario. El control persistente, MCP y almacenamiento se implementaron aquí.
