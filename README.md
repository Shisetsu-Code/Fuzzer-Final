# Fuzzer Final

MCP para ChatGPT con navegador persistente en GitHub Actions. Solo demos públicas. Ejecuta spins normales, Ante Bet y compras disponibles; conserva coordenadas y tráfico HTTP/WebSocket en Cloudflare.

## Uso

1. Conectá `https://fuzzer-final.braian-n-l.workers.dev/mcp` como MCP con OAuth en ChatGPT. La pantalla de autorización pide la clave `ACCESS_TOKEN` del archivo local ignorado `.dev.vars`; no es tu contraseña de GitHub ni Cloudflare. La autorización dura 24 horas.
2. Iniciá **Demo runner** en Actions (o usá el controlador de precarga). Verificá `service_status` y la sesión `ready` antes de llamar al chat; el navegador mantiene cada juego abierto durante la preparación y el recorrido.
3. Pedí `run_games` con los juegos y sus URLs demo. `normalSpins:1`, `anteSpins:1`, `buyAll:true`, `speed:4` son los valores predeterminados.
4. Usá `observe`: las pantallas conocidas avanzan solas. En `needs_input`, ChatGPT ve la captura y envía `act` con coordenadas normalizadas del **viewport completo**, el `observationId` actual y un `commandId` único. Reintentar una llamada incierta conserva el mismo ID. `resume` devuelve el control al motor. Para un canvas desconocido, ChatGPT completa el recorrido y usa `finish_game` con un resumen explícito de lo comprobado.
5. `export_game` entrega mapa de controles y acciones con secuencia, estado, capturas y endpoints. `get_trace` entrega los payloads HTTP/WS de cada acción. Las trazas grandes se descargan de la ruta autenticada indicada.

## Preparar antes de llamar a GPT

El flujo preferido es **runner online → demo precargada → chat → operaciones**.

`node scripts/prewarm.mjs examples/prewarm-pragmatic.json` verifica presencia real del navegador, inicia el workflow si falta, prepara las demos y espera hasta que exista una sesión `ready`. Guarda los IDs en `work/prepared-jobs.json`. El controlador hace esa espera antes de enviar la tarea a un chat.

Por MCP: `service_status` informa presencia y sesiones; `prepare_games` precarga un trabajo por juego y reutiliza preparaciones repetidas. Cada sesión guarda carga/intro, captura y controles, y espera en BASE/idle sin comenzar giros, Ante ni compras. GPT recibe el `jobId` ya preparado y usa `act {kind:"resume",commandId:"...",jobId:"..."}` para comenzar su suite en el mismo navegador. Si usa `run_games` para ese único juego con la misma configuración, también reutiliza la sesión lista.

El pool precarga dos sesiones por defecto (`PRELOAD_SLOTS`, configurable en las variables del repo): permite preparar otro juego mientras el primero espera o trabaja. Cada juego tiene contexto, comandos y heartbeat propios. No existe una barrera que espere a preparar todo el catálogo antes de entregar la primera sesión lista. Los runners anteriores no pueden tomar trabajos de preparación.

Una pantalla desconocida queda `needs_input`, nunca `ready`. Un error de preparación permanece señalado hasta una intervención explícita. Los presupuestos opcionales de ejecución comienzan al activar la sesión, no mientras espera preparada. El navegador conserva las sesiones durante la vida del runner; un reinicio o vencimiento de sesión requiere comprobar de nuevo la preparación.

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

Motor de animación 1x/2x/4x/8x instalado antes de cargar el juego. Acelera timers, RAF, Web Animations y el reloj Date de JavaScript del demo para motores que lo usan en sus animaciones; no acelera la red, TLS ni el servidor. Si un juego no tolera el reloj virtual (incluida expiración de sesión calculada por el cliente), usar 1x. Una ronda activa sigue mientras haya progreso, con pausa visual tras `stallSeconds` sin cambios de fase, tráfico de juego ni contadores de tiradas/premio (45s predeterminado, configurable; no declara éxito). La animación decorativa del fondo no cuenta como progreso. Las capturas se actualizan durante el recorrido. `observe` refresca una pantalla pausada; los clics rechazan imágenes de más de 15s. Se informa el motivo de espera. Reiniciar un runner pierde el navegador: un heartbeat viejo requiere investigar el trabajo y crear otro explícitamente; no se repite una compra incierta.

No hay corte interno predeterminado por minutos, número de pasos o espera de ChatGPT. Si se desean, `run_games` y `prepare_games` admiten `maxGameMinutes`, `maxSteps` e `inputTimeoutMinutes` explícitos. Un runner totalmente ocioso espera diez minutos (`RUNNER_IDLE_MINUTES`; 0 lo mantiene conectado); una sesión preparada o activa no se cierra por ese tiempo de inactividad. El workflow conserva su límite externo de GitHub Actions de 6 horas; si lo alcanza, la tarea queda interrumpida, nunca completa por haber vencido el tiempo.

El registro `shared/demo-providers.json` admite los 24 proveedores y las 6.753 URLs del catálogo de Tester Spin, además de los lanzadores demo conocidos. La admisión del proveedor no certifica la detección de controles ni la cobertura de apuestas: los lienzos desconocidos requieren observe/act. Los destinos se validan por host y puerto exactos (incluido 1spin4win:10443). Otros lanzadores demo requieren agregar su origen al registro o a `DEMO_HOSTS` del Worker. No usar cuentas, cookies importadas, URLs de caja o casinos con dinero real.

## Desarrollo y despliegue

Node 22+, `npm ci`, `npm run check`, `npm test`; `npx playwright install chromium`; `npm run test:browser`. `npm run deploy` publica el Worker; `npm run db:migrate` aplica el esquema. `node scripts/configure.mjs` genera secretos nuevos solo si `.dev.vars` no existe, los carga al Worker y configura el token de runner en GitHub. Necesita sesiones válidas de Wrangler/GitHub CLI. No modifica otros proyectos.

Las credenciales no se versionan. La DB y bucket son dedicados a Fuzzer Final. La especificación corta y el plan están en `docs/implementation.md`.

Proveniencia: la extracción Pragmatic y el reloj se adaptaron de `Shisetsu-Code/hybrid-cloud-fuzzer`, repositorio del mismo propietario. El control persistente, MCP y almacenamiento se implementaron aquí.
