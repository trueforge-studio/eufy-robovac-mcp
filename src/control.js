'use strict';

const { isIP } = require('node:net');
const { RoboVac, CleanSpeed, WorkMode } = require('eufy-robovac');

const HELP = `Control local de Eufy RoboVac (Tuya 3.3)
Uso: npm start -- <comando> [valor]
  discover          Busca la IP del EUFY_DEVICE_ID configurado; no mueve el robot
  connect           Comprueba la conexión y desconecta
  status            Consulta estado y batería
  start             Inicia limpieza automática
  pause             Pausa la limpieza
  home              Vuelve a la base
  locate            Activa el aviso para localizar el robot
  speed standard|boost|max|off
  mode auto|spot|edge|small-room
  help              Muestra esta ayuda

Configura EUFY_DEVICE_ID y EUFY_LOCAL_KEY en .env (ver README).
EUFY_IP es opcional. discover siempre busca por ID, incluso con IP configurada.`;

function readConfig(env) {
  const deviceId = (env.EUFY_DEVICE_ID || '').trim();
  const localKey = env.EUFY_LOCAL_KEY || '';
  const ip = (env.EUFY_IP || '').trim() || undefined;
  const timeout = Number(env.EUFY_TIMEOUT_SECONDS || 10);
  if (!deviceId) throw new Error('Falta EUFY_DEVICE_ID. Revisa el archivo .env.');
  if (localKey.length !== 16 || Buffer.byteLength(localKey) !== 16) {
    throw new Error('EUFY_LOCAL_KEY debe contener exactamente 16 bytes/caracteres ASCII.');
  }
  if (ip && isIP(ip) !== 4) throw new Error('EUFY_IP debe ser una dirección IPv4.');
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 60) {
    throw new Error('EUFY_TIMEOUT_SECONDS debe ser un entero entre 1 y 60.');
  }
  return { deviceId, localKey, ip, timeout };
}

function validateCommand(args) {
  const [command = 'help', value] = args;
  if (['help', '--help', '-h'].includes(command) && args.length <= 1) return 'help';
  const simple = ['discover', 'connect', 'status', 'start', 'pause', 'home', 'locate'];
  if (simple.includes(command) && args.length === 1) return command;
  if (command === 'speed' && args.length === 2 && ['standard', 'boost', 'max', 'off'].includes(value)) return command;
  if (command === 'mode' && args.length === 2 && ['auto', 'spot', 'edge', 'small-room'].includes(value)) return command;
  throw new Error('Comando o argumentos inválidos. Ejecuta npm start -- help.');
}

async function execute(args, env = process.env, createRobot = config => new RoboVac(config, false)) {
  const command = validateCommand(args);
  if (command === 'help') return HELP;
  const config = readConfig(env);
  const robot = createRobot({ deviceId: config.deviceId, localKey: config.localKey,
    ip: command === 'discover' ? undefined : config.ip });
  let timer;
  try {
    const work = async () => {
      if (!config.ip || command === 'discover') {
        // Resolve explicitly: RoboVac.doWork() swallows discovery errors in 1.4.6.
        await robot.api.find({ timeout: config.timeout });
        if (robot.api.device.version !== '3.3') {
          throw new Error('El dispositivo anuncia un protocolo distinto de Tuya 3.3.');
        }
      }
      if (command === 'discover') return { ip: robot.api.device.ip, protocol: robot.api.device.version };
      await robot.connect();
      switch (command) {
        case 'connect': return { connected: true };
        case 'status': {
          const data = await robot.getStatuses(true);
          if (!data || !data.dps) throw new Error('Respuesta sin datos DPS.');
          const d = data.dps;
          // Whitelist fields: never print raw device objects or credentials.
          return { battery: d['104'], status: d['15'], mode: d['5'],
            speed: d['102'], error: d['106'], playing: d['2'] };
        }
        case 'start': await robot.startCleaning(); break;
        // Upstream pause() incorrectly writes true in eufy-robovac 1.4.6.
        case 'pause': await robot.setPlayPause(false); break;
        case 'home': await robot.goHome(); break;
        case 'locate': await robot.setFindRobot(true); break;
        case 'speed': await robot.setCleanSpeed({ standard: CleanSpeed.STANDARD,
          boost: CleanSpeed.BOOST_IQ, max: CleanSpeed.MAX, off: CleanSpeed.NO_SUCTION }[args[1]]); break;
        case 'mode': await robot.setWorkMode({ auto: WorkMode.AUTO, spot: WorkMode.SPOT,
          edge: WorkMode.EDGE, 'small-room': WorkMode.SMALL_ROOM }[args[1]]); break;
      }
      return { message: 'Solicitud enviada; confirma el resultado con status o en la aspiradora.' };
    };
    return await Promise.race([work(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Tiempo de espera agotado.')), (config.timeout + 15) * 1000);
    })]);
  } catch {
    // Legacy library exceptions may include packet contents or device details.
    throw new Error('No se pudo completar la operación. Revisa ID, clave local, IP, red local y protocolo Tuya 3.3. Si enviaste un comando, comprueba el estado antes de repetirlo.');
  } finally {
    clearTimeout(timer);
    // In this installed version disconnect destroys the socket synchronously.
    try {
      await robot.disconnect();
    } catch {
      throw new Error('No se pudo cerrar la conexión. El programa terminará; comprueba el estado del robot.');
    }
  }
}

module.exports = { HELP, execute, readConfig, validateCommand };
