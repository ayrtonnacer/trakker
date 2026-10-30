# Tasker CRM Foco (extensión de Chrome)

- **Registrar desde cualquier pestaña:** el ícono de la extensión abre un popup para empezar y parar el timer, con tus proyectos y tareas recientes. No hace falta entrar a la página.
- **Modo foco:** bloquea los sitios que cargaste mientras corre el timer, y anota cada intento de abrirlos. Al parar el timer o cerrar la pestaña de la app se desbloquean y las pestañas bloqueadas vuelven a donde estaban.
- **Estadísticas:** la app muestra qué sitios te distraen y a qué horas, al lado de tus horas de mayor rendimiento.

## Instalar
1. Descargá esta carpeta `extension` (o el repo entero).
2. En Chrome, Edge o Brave abrí `chrome://extensions` (o `edge://extensions`) y activá **Modo de desarrollador**.
3. Tocá **Cargar descomprimida** y elegí la carpeta `extension`.
4. **Refrescá la pestaña de Tasker CRM** (Ctrl+R): la extensión sólo se conecta cuando la página carga.
5. Tocá **Modo foco** debajo del timer y cargá los sitios. En ese cuadro tenés que ver “Extensión conectada”.

## Actualizar
Descargá la carpeta de nuevo, tocá ↻ en la tarjeta de la extensión en `chrome://extensions` y refrescá Tasker CRM.

## Cómo funciona el popup
La app vive en una pestaña de tu navegador (ahí están tus datos). El popup le pide el estado y le manda los comandos a esa pestaña. Si la app no está abierta, el popup ofrece **abrirla en segundo plano** (pestaña fijada). Dejala abierta mientras trabajás: de ahí corre el timer y el bloqueo.

## Si no funciona
- ¿El cuadro de Modo foco dice “No detecto la extensión”? Refrescá la página; si sigue igual, revisá que la extensión esté activada.
- ¿El popup dice que abras la app? Abrila una vez con la extensión instalada y refrescá.
- Funciona en cualquier dirección de la app (vercel.app o dominio propio). No funciona en Firefox ni Safari.
- En modo incógnito hay que permitir la extensión en su tarjeta de `chrome://extensions`.
- El registro de distracciones se guarda en este navegador (no se sincroniza con GitHub).
