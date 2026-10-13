import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const dist = fileURLToPath(new URL('../docs/', import.meta.url));
const deploymentFiles = new Set(['index.html', 'styles.css', 'app.mjs', 'gedcom.mjs', 'parser-worker-source.mjs', '.nojekyll']);
const requiredFiles = ['index.html', 'styles.css', 'app.mjs', 'gedcom.mjs', 'parser-worker-source.mjs'];
const source = async name => readFile(path.join(dist, name), 'utf8');

function assertLocalAsset(reference, context) {
  assert.ok(reference, `${context}: empty resource URL`);
  assert.ok(!/^(?:[a-z][a-z\d+.-]*:|\/\/|\/)/i.test(reference), `${context}: resource must use a relative local URL`);
  assert.ok(!/[?#]/.test(reference), `${context}: resource query strings and fragments are unnecessary`);
  const resolved = path.posix.normalize(reference);
  assert.ok(!resolved.startsWith('../'), `${context}: resource escapes this static site`);
  assert.ok(deploymentFiles.has(resolved), `${context}: resource is not a reviewed deployed file`);
}

test('deployment includes only the reviewed browser assets', async () => {
  const entries = await readdir(dist, { withFileTypes: true });
  for (const entry of entries) {
    assert.ok(entry.isFile(), `unreviewed directory in deployment: ${entry.name}`);
    assert.ok(deploymentFiles.has(entry.name), `unreviewed deployed file: ${entry.name}`);
  }
  for (const name of requiredFiles) assert.ok(entries.some(entry => entry.name === name), `missing asset: ${name}`);
});

test('page loads local resources and prohibits connection, form and embedding channels', async () => {
  const html = await source('index.html');
  const cspMeta = html.match(/<meta\b(?=[^>]*http-equiv\s*=\s*["']Content-Security-Policy["'])(?=[^>]*content\s*=\s*"([^"]*)")[^>]*>/i);
  assert.ok(cspMeta, 'a restrictive CSP must be present in the static HTML');
  const directives = new Map(cspMeta[1].split(';').map(value => value.trim().split(/\s+/)).filter(value => value[0]).map(([name, ...values]) => [name, values]));
  for (const name of ['default-src', 'connect-src', 'object-src', 'form-action', 'base-uri']) {
    assert.deepEqual(directives.get(name), ["'none'"], `${name} must deny unrelated browser channels`);
  }
  assert.deepEqual(directives.get('script-src'), ["'self'"], 'scripts must be reviewed same-origin files');
  assert.deepEqual(directives.get('worker-src'), ['blob:'], 'worker must use the local fixed source and inherit the document policy');
  assert.ok(!/unsafe-eval|unsafe-inline|https?:|data:/i.test(cspMeta[1]), 'CSP must not reopen external/inline code channels');
  for (const [name, values] of directives) if (name !== 'worker-src') assert.ok(!values.includes('blob:'), `${name} must not admit Blob resources`);
  for (const tag of html.matchAll(/<(script|link|img|iframe|object|embed|source)\b([^>]*)>/gi)) {
    for (const reference of tag[2].matchAll(/\b(?:src|href|data)\s*=\s*["']([^"']+)["']/gi)) assertLocalAsset(reference[1], tag[1]);
    assert.ok(!/\bsrcset\s*=/i.test(tag[2]), 'responsive external resources need explicit review');
    assert.ok(!['iframe', 'object', 'embed'].includes(tag[1].toLowerCase()), 'embedded active content is outside the beta boundary');
  }
  for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    assert.ok(/\bsrc\s*=/.test(script[1]), 'inline executable scripts are outside the beta boundary');
    assert.equal(script[2].trim(), '', 'external module tags must not carry inline code');
  }
  assert.ok(!/\bon\w+\s*=|\baction\s*=|\bmethod\s*=\s*["']post["']/i.test(html), 'page must not add inline event code or upload forms');
  const css = await source('styles.css');
  assert.ok(!/@import\b|\burl\s*\(/i.test(css), 'styles must not add remote fonts, trackers, or resources');
});

test('all executable modules lack network, persistence, analytics and demo dependencies', async () => {
  for (const name of ['app.mjs', 'gedcom.mjs', 'parser-worker-source.mjs']) {
    const code = await source(name);
    const forbidden = [
      [/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|WebTransport|RTCPeerConnection|importScripts)\b/, 'outbound networking API'],
      [/\b(?:sendBeacon|serviceWorker|SharedWorker)\b/, 'unreviewed background/network channel'],
      [/\b(?:localStorage|sessionStorage|indexedDB|IDBFactory|caches)\b|document\s*\.\s*cookie/, 'browser persistence API'],
      [/\b(?:showSaveFilePicker|showDirectoryPicker|requestFileSystem|webkitRequestFileSystem|storage\.getDirectory)\b/, 'filesystem persistence API'],
      [/\bconsole\s*\.\s*(?:log|info|warn|error|debug|table|dir|trace)\s*\(/, 'content logging'],
      [/\b(?:googleAnalytics|gtag|dataLayer|mixpanel|amplitude|sentry|posthog)\b/i, 'analytics dependency'],
      [/evidence_fixtures|v06_evaluator|v06_state|InvestigationSession|martha_baptism|martha_census|sample_investigations\.ged/, 'synthetic investigation/demo dependency'],
      [/\beval\s*\(|\bnew\s+Function\s*\(/, 'unreviewed executable text'],
    ];
    for (const [pattern, reason] of forbidden) assert.ok(!pattern.test(code), `${name} contains ${reason}`);
    for (const reference of code.matchAll(/\b(?:import|export)\s+(?:[\s\S]*?\sfrom\s*)?["']([^"']+)["']/g)) assertLocalAsset(reference[1], `${name} import`);
    for (const reference of code.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) assertLocalAsset(reference[1], `${name} dynamic import`);
    for (const reference of code.matchAll(/\bnew\s+URL\s*\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g)) assertLocalAsset(reference[1], `${name} module resource`);
  }
});

test('fixed worker bundle returns a filtered projection and safe errors without loading more code', async () => {
  const { parserWorkerSource } = await import('../docs/parser-worker-source.mjs');
  assert.equal(typeof parserWorkerSource, 'string');
  assert.ok(!/^\s*(?:import|export)\b/m.test(parserWorkerSource), 'worker must be self-contained under the restrictive CSP');
  const messages = [];
  const sandbox = { ArrayBuffer, Uint8Array, TextDecoder, postMessage: value => messages.push(JSON.parse(JSON.stringify(value))) };
  const context = vm.createContext(sandbox);
  vm.runInContext(parserWorkerSource, context, { timeout: 5000 });
  const input = `0 HEAD\n1 SOUR BOUNDARY_TEST\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n0 @VISIBLE_ORIGINAL_ID@ INDI\n1 NAME Visible /Ancestor/\n1 BIRT\n2 DATE 1800\n1 BIRT\n2 DATE 1802\n1 DEAT\n2 DATE 1870\n1 NOTE PrivateNarrativeCanary\n0 @EXCLUDED_ORIGINAL_ID@ INDI\n1 NAME PrivateNameCanary /Living/\n0 TRLR\n`;
  sandbox.input = new TextEncoder().encode(input);
  vm.runInContext('onmessage({data:{bytes:input}})', context, { timeout: 5000 });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].ok, true);
  const projection = messages[0].result;
  assert.equal(projection.people.length, 1, 'worker must not send excluded people to the main page');
  assert.equal(projection.summary.withheldPeople, 1);
  assert.equal(projection.people[0].name, 'Visible Ancestor');
  assert.equal(projection.people[0].events.filter(event => event.type === 'BIRT').length, 2, 'worker must retain competing imported assertions');
  for (const canary of ['PrivateNarrativeCanary', 'PrivateNameCanary', '@VISIBLE_ORIGINAL_ID@', '@EXCLUDED_ORIGINAL_ID@']) {
    assert.ok(!JSON.stringify(projection).includes(canary), 'worker projection must withhold original identifiers and private text');
  }
  sandbox.input = new TextEncoder().encode('PrivateErrorCanary is not a GEDCOM');
  vm.runInContext('onmessage({data:{bytes:input}})', context, { timeout: 5000 });
  assert.equal(messages[1].ok, false);
  assert.deepEqual(Object.keys(messages[1]).sort(), ['message', 'ok']);
  assert.ok(!messages[1].message.includes('PrivateErrorCanary'), 'error messages must not repeat input prose');
});
