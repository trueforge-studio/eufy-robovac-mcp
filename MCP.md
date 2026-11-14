# Robotina desde el chat

Servidor MCP local que puedes registrar con el nombre `robotina`. Codex lo inicia por
STDIO usando Node; no abre puertos ni necesita un servicio en Internet. El
controlador carga la clave del `.env` de este proyecto. No se copió la clave ni
la contraseña Eufy a la configuración de Codex: el controlador sólo necesita el ID
y la clave local configurados en tu propio `.env`. «Robotina» es el alias usado
en las herramientas; configura las credenciales de tu aspiradora.

## Activar y comprobar

Después de instalar dependencias y configurar `.env`, ejecuta desde la raíz del
proyecto (requiere tener el comando `codex` instalado):

```sh
codex mcp add robotina -- "$(command -v node)" "$PWD/src/mcp-server.mjs"
```

1. Reinicia la conexión MCP desde los ajustes de servidores MCP de Codex. Si
   no aparece Robotina, reinicia la aplicación y vuelve a este chat.
2. En macOS, revisa **Ajustes del Sistema → Privacidad y seguridad → Red local**
   y permite acceso a Codex. Si pruebas desde Terminal, permite también Terminal.
3. Pide: **«¿Cuánta batería tiene Robotina?»**. El asistente debe usar
   `robotina_bateria` y dar una lectura nueva, no repetir una anterior.

Que un comando funcione en Terminal no garantiza que Codex tenga el mismo
permiso de red local. Si el MCP conecta y enumera herramientas, pero la consulta
del robot falla, comprueba ese permiso y que ambos estén en la misma LAN.

## Herramientas disponibles

| Herramienta | Petición de ejemplo / comportamiento |
| --- | --- |
| `robotina_capacidades` | «¿Qué puedes hacer con Robotina?»; catálogo y límites, sin red |
| `robotina_estado` | «¿Cómo está?»; lectura nueva de batería, actividad, potencia y errores |
| `robotina_bateria` | «¿Cuánta batería le queda?»; porcentaje actual |
| `robotina_limpiar` | «Ponla a aspirar»; inicia limpieza automática |
| `robotina_pausar` | «Párala»; pausa e interrumpe movimiento manual de este MCP |
| `robotina_volver_base` | «Mándala a dormir / descansar / cargar»; orden de volver a la base |
| `robotina_localizar` | «Hazla sonar»; aviso sonoro, no ubicación en un mapa |
| `robotina_potencia` | Cambiar a `standard`, `boost`, `max` u `off` (sin succión) |
| `robotina_modo` | `auto`, `spot`, `edge`, `small-room`; puede iniciar movimiento |
| `robotina_mover` | Dirección `forward`, `backward`, `left`, `right`, por 100–5000 ms; intenta pausar al terminar |
| `robotina_conexion` | Comprobar conexión sin mover el robot |
| `robotina_descubrir` | Buscar la IP del ID ya configurado; no obtiene claves |

Las herramientas se anuncian al asistente con parámetros y descripciones; no
necesitas escribir sus nombres técnicos. Una orden enviada no confirma que el
robot haya llegado a la base o terminado una acción. Los modos y potencias que
no se han probado en esta unidad siguen sujetos al firmware.

El servidor sólo permite una operación activa. Otras peticiones se rechazan en
vez de acumularse para ejecutarse después. Pausar y volver a la base cancelan
primero la operación activa. Cancelar un movimiento manual intenta enviar pausa;
si se pierde la conexión, no puede garantizar detener físicamente al robot.

## Recorridos futuros

No hay recorridos ni figuras predefinidos.

Los futuros caminos a cocina, pieza o living deberán diseñarse y calibrarse desde
un punto de partida y orientación conocidos. Esta API no proporciona mapas,
posición, odometría ni reconocimiento de habitaciones. Una secuencia de tiempos
puede desviarse si encuentra obstáculos o cambia el piso; no equivale a navegación
autónoma. La función general de movimiento breve queda disponible como base para
esas pruebas futuras, sin rutas predefinidas.

## Diagnóstico y mantenimiento

Desde la carpeta del proyecto:

```sh
npm run check
npm test
npm run mcp:check
npm run mcp:check -- --battery
```

La primera prueba MCP sólo conecta y enumera herramientas. Con `--battery` hace
una lectura real, sin mover el robot. Usa el cliente de desarrollo instalado con
`npm ci`. El servidor en sí sólo requiere las dependencias de producción.

`npm run mcp` inicia el servidor en modo STDIO: espera a un cliente MCP, no muestra
un menú interactivo. Las consultas y acciones se ejecutan en procesos separados;
sus mensajes no se mezclan con el protocolo ni muestran credenciales.

Si se mueve esta carpeta, actualiza la ruta del servidor registrado en Codex.
La configuración actual se puede comprobar con `codex mcp get robotina` y retirar
con `codex mcp remove robotina`.

Fuentes: [MCP en Codex](https://learn.chatgpt.com/docs/extend/mcp?surface=app),
[SDK oficial MCP](https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-server),
[permiso de red local en macOS](https://support.apple.com/en-gb/guide/mac-help/mchla4f49138/mac).
