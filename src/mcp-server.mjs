#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { pathToFileURL } from 'node:url';
import runnerModule from './robot-runner.js';

const { createRunner } = runnerModule;
const empty = z.object({}).strict();
const instructions = `Controlas Robotina, la Eufy RoboVac 35C del usuario.
"Mándala a dormir", "a descansar" o "a cargar" significan volver a la base.
Consulta siempre una lectura nueva para informar batería o estado.
Sólo inicia movimientos o limpieza cuando el usuario los pida.
Las órdenes enviadas no confirman que la acción física haya terminado.
El movimiento manual se mide en tiempo; no conoces posición, distancias ni habitaciones.
No existen rutas guardadas ni figuras habituales. No inventes caminos a habitaciones.
Nunca solicites ni muestres la clave local o la contraseña Eufy.`;

const annotations = readOnly => ({ readOnlyHint: readOnly, destructiveHint: false,
  idempotentHint: readOnly, openWorldHint: false });
const capabilities = {
  device: 'Robotina — Eufy RoboVac 35C',
  verifiedOnThisDevice: ['estado', 'batería', 'inicio de limpieza', 'pausa', 'movimiento manual'],
  otherLibraryFeatures: ['volver a la base', 'localización sonora', 'potencia',
    'modos auto/spot/edge/small-room', 'descubrimiento por ID', 'comprobar conexión'],
  manualDirections: ['forward', 'backward', 'left', 'right'],
  savedRoutes: [],
  limitations: ['Sin mapas, posición ni medición de distancia o ángulos en esta API.',
    'Movimientos temporizados de 100 a 5000 ms; no equivalen a metros.',
    'Rutas a habitaciones pendientes de diseñar y calibrar desde un origen conocido.',
    'Pausar por red requiere conexión; en una desconexión usa el botón físico.'],
};

export function toolDefinitions(runner) {
  const control = (args, context) => runner.run('control', args, { signal: context?.signal });
  return [
    { name: 'robotina_capacidades', title: 'Funciones de Robotina',
      description: 'Enumera las funciones disponibles, verificaciones y límites del control local. No conecta con el robot.',
      schema: empty, readOnly: true, run: async () => capabilities },
    { name: 'robotina_estado', title: 'Consultar estado',
      description: 'Consulta ahora batería, estado, modo, potencia, errores y si Robotina está limpiando. No mueve el robot.',
      schema: empty, readOnly: true, run: async (_, context) => ({
        ...await control(['status'], context), consultedAt: new Date().toISOString(),
      }) },
    { name: 'robotina_bateria', title: 'Consultar batería',
      description: 'Obtiene una lectura nueva del porcentaje de batería de Robotina. No uses una lectura antigua como si fuera actual.',
      schema: empty, readOnly: true, run: async (_, context) => {
        const status = await control(['status'], context);
        if (!Number.isFinite(status.battery) || status.battery < 0 || status.battery > 100) {
          throw new Error('Batería no disponible.');
        }
        return { batteryPercent: status.battery, status: status.status, consultedAt: new Date().toISOString() };
      } },
    { name: 'robotina_limpiar', title: 'Iniciar limpieza',
      description: 'Inicia la limpieza automática de Robotina. Mueve el robot; usar cuando el usuario pida limpiar o aspirar.',
      schema: empty, readOnly: false, run: (_, context) => control(['start'], context) },
    { name: 'robotina_pausar', title: 'Pausar Robotina',
      description: 'Envía pausa. Interrumpe un movimiento manual de este MCP antes de enviar la orden. No envía a la base.',
      schema: empty, readOnly: false, run: (_, context) => control(['pause'], context) },
    { name: 'robotina_volver_base', title: 'Enviar a la base',
      description: 'Envía Robotina a su base de carga. Usar para "mándala a dormir", "a descansar", "a cargar" o "a la base". No confirma llegada.',
      schema: empty, readOnly: false, run: (_, context) => control(['home'], context) },
    { name: 'robotina_localizar', title: 'Localizar por sonido',
      description: 'Activa el aviso sonoro para encontrar Robotina. No es una lectura de su ubicación ni un mapa.',
      schema: empty, readOnly: false, run: (_, context) => control(['locate'], context) },
    { name: 'robotina_potencia', title: 'Cambiar potencia',
      description: 'Cambia la potencia de aspiración. off significa sin succión; no pausa las ruedas. Disponibilidad según firmware.',
      schema: z.object({ level: z.enum(['standard', 'boost', 'max', 'off']) }).strict(),
      readOnly: false, run: ({ level }, context) => control(['speed', level], context) },
    { name: 'robotina_modo', title: 'Elegir modo de limpieza',
      description: 'Activa un modo de limpieza: auto, spot (zona puntual), edge (bordes), small-room. Puede iniciar movimiento; según firmware.',
      schema: z.object({ mode: z.enum(['auto', 'spot', 'edge', 'small-room']) }).strict(),
      readOnly: false, run: ({ mode }, context) => control(['mode', mode], context) },
    { name: 'robotina_mover', title: 'Movimiento manual breve',
      description: 'Avanza, retrocede o gira por un tiempo entre 100 y 5000 ms y luego intenta pausar. Sólo para movimiento solicitado y supervisado. No mide metros ni grados.',
      schema: z.object({ direction: z.enum(['forward', 'backward', 'left', 'right']),
        durationMs: z.number().int().min(100).max(5000) }).strict(),
      readOnly: false, run: ({ direction, durationMs }, context) => runner.run('move',
        [direction, String(durationMs)], { signal: context?.signal }) },
    { name: 'robotina_conexion', title: 'Comprobar conexión',
      description: 'Comprueba la conexión local con Robotina y desconecta; no mueve el robot.',
      schema: empty, readOnly: true, run: (_, context) => control(['connect'], context) },
    { name: 'robotina_descubrir', title: 'Buscar IP de Robotina',
      description: 'Busca la IP del ID de Robotina ya configurado y comprueba el protocolo anunciado. No obtiene credenciales ni enumera robots desconocidos.',
      schema: empty, readOnly: true, run: (_, context) => control(['discover'], context) },
  ];
}

export function createServer(runner = createRunner()) {
  const server = new McpServer({ name: 'robotina', version: '1.0.0' }, { instructions });
  for (const tool of toolDefinitions(runner)) {
    server.registerTool(tool.name, { title: tool.title, description: tool.description,
      inputSchema: tool.schema, annotations: annotations(tool.readOnly) }, async (args, context) => {
      try {
        const data = await tool.run(args, context);
        return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
      } catch {
        return { isError: true, content: [{ type: 'text', text:
          'No se pudo completar la operación: conexión fallida, otra orden en curso o cancelación. No se confirmó el resultado físico. Revisa permisos de red local y estado de Robotina. Si sigue moviéndose, usa el botón físico.' }] };
      }
    });
  }
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runner = createRunner();
  const handle = serveStdio(() => createServer(runner), {
    onerror: () => console.error('Error de conexión MCP de Robotina.'),
  });
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await runner.close();
    await handle.close();
    process.exit(0);
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  process.stdin.once('end', close);
}
