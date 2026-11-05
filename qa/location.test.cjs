/* global __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function location(bindings, timeout = false) {
  const source = fs.readFileSync(path.join(__dirname, '../src/components/device-location.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'setTimeout', 'clearTimeout', compiled)(
    name => { assert.equal(name, 'expo-location'); return bindings; }, module, module.exports,
    timeout ? fn => { queueMicrotask(fn); return 0; } : setTimeout, timeout ? () => {} : clearTimeout,
  );
  return module.exports.currentLocation;
}
function bindings() { return { Accuracy: { High: 4 }, requestForegroundPermissionsAsync: async () => ({ granted: true }), hasServicesEnabledAsync: async () => true, getCurrentPositionAsync: async () => ({ coords: { latitude: -23.55, longitude: -46.63 } }) }; }
test('permissão GPS negada nunca consulta coordenadas', async () => {
  const sdk = bindings(); let queried = false;
  sdk.requestForegroundPermissionsAsync = async () => ({ granted: false, canAskAgain: false });
  sdk.getCurrentPositionAsync = async () => { queried = true; };
  await assert.rejects(location(sdk), /bloqueada/); assert.equal(queried, false);
});
test('GPS desativado é recuperável e não tenta obter posição', async () => {
  const sdk = bindings(); let queried = false;
  sdk.hasServicesEnabledAsync = async () => false;
  sdk.getCurrentPositionAsync = async () => { queried = true; };
  await assert.rejects(location(sdk), /desativada/); assert.equal(queried, false);
});
test('falha de provedor GPS é convertida em orientação ao usuário', async () => {
  const sdk = bindings(); sdk.getCurrentPositionAsync = async () => { throw Error('provider-internal'); };
  await assert.rejects(location(sdk), /Não foi possível obter o GPS/);
});
test('GPS sem resposta respeita timeout (relógio simulado)', async () => {
  const sdk = bindings(); sdk.getCurrentPositionAsync = () => new Promise(() => {});
  await assert.rejects(location(sdk, true), /demorou para responder/);
});
test('GPS aceito retorna apenas coordenadas da consulta', async () => {
  assert.deepEqual(await location(bindings())(), { latitude: -23.55, longitude: -46.63 });
});
