# Eufy RoboVac MCP

Servidor MCP y CLI para controlar aspiradoras Eufy RoboVac mediante el protocolo
local Tuya 3.3. Probado con RoboVac 35C. Proyecto comunitario, sin afiliación con Eufy.

Proyecto independiente con `eufy-robovac` 1.4.6. Permite buscar la IP de tu
aspiradora configurada, comprobar conexión, consultar estado, limpiar, pausar,
volver a la base, localizar y cambiar potencia. No necesita correo ni contraseña
de Eufy para funcionar una vez obtenida la clave local.

Para usar Robotina mediante peticiones en el chat, consulta [MCP.md](MCP.md).
El servidor local expone 12 herramientas y utiliza el mismo `.env`.

## Preparación

Requiere Node.js 22 o superior y npm. Se creó y verificó con Node 22.23.3 y npm
10.9.9 en macOS. Para instalar:

```sh
git clone https://github.com/trueforge-studio/eufy-robovac-mcp.git
cd eufy-robovac-mcp
npm ci
```

La instalación inicial se hizo con el comando solicitado:

```sh
npm install --save eufy-robovac
```

Abre una terminal en esta carpeta y prepara la configuración:

```sh
cp .env.example .env
chmod 600 .env
```

Edita `.env` en tu equipo:

| Variable | Valor |
| --- | --- |
| `EUFY_DEVICE_ID` | Identificador Tuya de tu aspiradora; no el nombre visible ni necesariamente su número de serie |
| `EUFY_LOCAL_KEY` | Clave local de 16 caracteres ASCII; no la contraseña Wi-Fi ni la de Eufy |
| `EUFY_IP` | Opcional: IPv4 de la aspiradora, obtenida del router |
| `EUFY_TIMEOUT_SECONDS` | Espera de descubrimiento, de 1 a 60 segundos; predeterminado 10 |

El archivo `.env` se carga automáticamente desde la raíz del proyecto. Las
variables ya definidas en tu terminal tienen prioridad. `.env` está excluido de
Git, pero sigue siendo un archivo de texto: no lo compartas ni lo subas a la nube.
No pongas secretos como argumentos en comandos ni los publiques en issues o chats.

## Cómo obtener ID y clave local

Primero vincula y comprueba tu 35C en la aplicación oficial EufyHome/eufy Clean.
El descubrimiento de esta CLI **sólo resuelve la IP de un ID conocido**: necesita
ID y clave porque el constructor del paquete los exige. No enumera todos los
equipos, identifica modelos ni recupera claves.

La [guía del proyecto Homebridge del mismo autor](https://github.com/apexad/homebridge-eufy-robovac#configuration)
remite a [eufy-clean-local-key-grabber](https://github.com/Rjevski/eufy-clean-local-key-grabber).
Ese extractor se declara sin mantenimiento; sus instrucciones y autenticación
pueden fallar con cuentas o versiones actuales. Revisa su documentación antes de
usarlo y maneja tus credenciales sólo en tu equipo. No está instalado ni ejecutado
por este proyecto. Si ya tienes una integración local configurada, puedes reutilizar
su ID y clave vigentes. El README original también describe un método histórico
con registros Android y una app antigua; no garantiza funcionar hoy.

## Uso

Comienza con operaciones que no mueven el robot:

```sh
npm start -- help
npm start -- discover
npm start -- connect
npm start -- status
```

`discover` escucha anuncios del ID configurado incluso si definiste `EUFY_IP`.
No guarda automáticamente la IP. Puedes copiarla a `.env` para evitar el
descubrimiento en las siguientes operaciones. `connect` abre y cierra la conexión;
`status` consulta batería, estado, modo, potencia y error cuando estén disponibles.

Cuando quieras ejecutar acciones:

```sh
npm start -- start
npm start -- pause
npm start -- home
npm start -- locate
npm start -- speed standard
npm start -- speed boost
npm start -- speed max
npm start -- mode edge
```

`start`, `pause` y `home` afectan al movimiento; `locate` activa el aviso de
localización. Cada ejecución desconecta al terminar. Un comando enviado no
garantiza que el robot haya completado la acción: verifica con `status` o en el
equipo. Si ocurre un timeout, comprueba el estado antes de repetir la orden.
El límite total de una ejecución es la espera configurada más 15 segundos.

## Compatibilidad y límites

Eufy [confirma que la 35C admite Wi-Fi/app](https://service.eufy.com/article-description/Which-RoboVac-models-support-WiFi-app).
La [integración comunitaria eufy_vacuum](https://github.com/bostonmhauer/eufy_vacuum)
incluye 35C/T2117 entre sus modelos. Esto respalda probar control local, pero **no
certifica esta biblioteca npm ni todos los firmwares**. En esta unidad, el usuario
ya confirmó estado, inicio, pausa y movimiento manual usando el proyecto.

El código instalado fija Tuya **3.3**, TCP **6668** y un mapa de propiedades DPS.
No implementa la API de nube de Eufy, Tuya 3.4/3.5, emparejamiento, mapas de la
casa ni actualización de firmware. Si el descubrimiento anuncia otro protocolo,
la CLI rechaza la operación. Con IP explícita no hay anuncio para verificarlo y
se intenta directamente 3.3. El firmware puede cambiar el protocolo o los DPS.

La aspiradora usa Wi-Fi de **2,4 GHz**. El computador puede usar Ethernet o 5 GHz
si ambos llegan a la misma red local y el router permite comunicarse entre ellos.
El descubrimiento escucha UDP **6666/6667** y normalmente necesita el mismo
segmento de red. Redes de invitados, aislamiento de clientes, VLAN, VPN y firewall
pueden bloquearlo. Con IP explícita se evita UDP, pero sigue siendo necesaria
conectividad TCP al robot. No abras estos puertos a Internet.

Si falla: verifica primero la app oficial, IP actual y alimentación; cierra la
app u otras integraciones si compiten por la conexión; revisa permisos de red
local de macOS. Una reserva DHCP ayuda a mantener la IP estable. Si vuelves a
emparejar el robot, la clave puede cambiar. Esta CLI controla por LAN, pero el
alta inicial y la obtención de claves pueden depender de servicios Eufy.

## API revisada y verificaciones

Se inspeccionaron `dist/index.js`, sus tipos y TuyAPI instalados, además del
[repositorio original](https://github.com/apexad/eufy-robovac). Se usa su exportación
`RoboVac`, `api.find()`, `connect()`, `getStatuses(true)`, `startCleaning()`,
`setPlayPause(false)`, `goHome()`, `setFindRobot(true)` y `setCleanSpeed()`.
Se evita `pause()` porque en 1.4.6 envía `true` al DPS 2; la CLI envía `false`.
El descubrimiento se hace explícitamente porque `doWork()` captura el error y
continúa. No se modificó el paquete instalado.

```sh
npm run check
npm test
npm audit
```

Las pruebas automatizadas usan un robot simulado y comprueban pausa,
descubrimiento sin movimiento, errores, desconexión, filtrado de salida,
movimiento temporizado, cancelación y el protocolo MCP por STDIO. No mueven el
hardware. Para una lectura real por MCP usa `npm run mcp:check -- --battery`.
Se añadió un override `debug: ^4.3.1` para corregir una vulnerabilidad baja en la
dependencia indirecta antigua; el archivo de bloqueo conserva la versión resuelta.
No se imprime el objeto interno del dispositivo ni se activa el debug del paquete.
