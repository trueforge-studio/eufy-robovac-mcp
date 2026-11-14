'use strict';

const { isIP } = require('node:net');
const { RoboVac, CleanSpeed, WorkMode } = require('eufy-robovac');

const HELP = `Eufy RoboVac local control (Tuya 3.3)
Usage: npm start -- <command> [value]
  discover          Find the configured device ID's IP; does not move the vacuum
  connect           Check connectivity and disconnect
  status            Read current status and battery level
  start             Start automatic cleaning
  pause             Pause cleaning
  home              Return to the charging base
  locate            Activate the audible locator
  speed standard|boost|max|off
  mode auto|spot|edge|small-room
  help              Show this help

Set EUFY_DEVICE_ID and EUFY_LOCAL_KEY in .env (see README).
EUFY_IP is optional. discover always searches by ID, even when an IP is configured.`;

function readConfig(env) {
  const deviceId = (env.EUFY_DEVICE_ID || '').trim();
  const localKey = env.EUFY_LOCAL_KEY || '';
  const ip = (env.EUFY_IP || '').trim() || undefined;
  const timeout = Number(env.EUFY_TIMEOUT_SECONDS || 10);
  if (!deviceId) throw new Error('Missing EUFY_DEVICE_ID. Check your .env file.');
  if (localKey.length !== 16 || Buffer.byteLength(localKey) !== 16) {
    throw new Error('EUFY_LOCAL_KEY must contain exactly 16 ASCII characters/bytes.');
  }
  if (ip && isIP(ip) !== 4) throw new Error('EUFY_IP must be an IPv4 address.');
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 60) {
    throw new Error('EUFY_TIMEOUT_SECONDS must be an integer between 1 and 60.');
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
  throw new Error('Invalid command or arguments. Run npm start -- help.');
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
          throw new Error('The device advertises a protocol other than Tuya 3.3.');
        }
      }
      if (command === 'discover') return { ip: robot.api.device.ip, protocol: robot.api.device.version };
      await robot.connect();
      switch (command) {
        case 'connect': return { connected: true };
        case 'status': {
          const data = await robot.getStatuses(true);
          if (!data || !data.dps) throw new Error('The response contains no DPS data.');
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
      return { message: 'Request sent; verify the result with status or on the vacuum.' };
    };
    return await Promise.race([work(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Operation timed out.')), (config.timeout + 15) * 1000);
    })]);
  } catch {
    // Legacy library exceptions may include packet contents or device details.
    throw new Error('Unable to complete the operation. Check the device ID, local key, IP, local network and Tuya 3.3 support. If a command was sent, check the vacuum status before retrying.');
  } finally {
    clearTimeout(timer);
    // In this installed version disconnect destroys the socket synchronously.
    try {
      await robot.disconnect();
    } catch {
      throw new Error('Unable to close the connection. The program will exit; check the vacuum status.');
    }
  }
}

module.exports = { HELP, execute, readConfig, validateCommand };
