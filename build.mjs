import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Bundle only the reviewed parser, never a dataset or uploaded file. No dependencies.
const parserPath = new URL('./docs/gedcom.mjs',import.meta.url);
const targetPath = new URL('./docs/parser-worker-source.mjs',import.meta.url);
const parser = await readFile(parserPath,'utf8');
const hash = createHash('sha256').update(parser).digest('hex');
const body = parser.replace(/^export\s+/gm,'') + `
globalThis.onmessage = ({data}) => {
  try {
    const result = parseGedcom(data.bytes);
    globalThis.postMessage({ok:true,result});
  } catch (error) {
    const message = error instanceof GedcomImportError ? error.message : 'The file could not be read. Try a GEDCOM 5.5.1 UTF-8 export.';
    globalThis.postMessage({ok:false,message});
  }
};\n`;
const source = `// Generated from gedcom.mjs; SHA-256 ${hash}. No family data.\nexport const parserWorkerSource = ${JSON.stringify(body)};\n`;
if (process.argv.includes('--check')) {
  const current = await readFile(targetPath,'utf8');
  if (current !== source) throw new Error('Parser worker bundle is stale. Run node build.mjs before testing or publishing.');
  process.stdout.write('Reviewed parser and worker bundle match.\n');
} else {
  await writeFile(targetPath,source);
  process.stdout.write('Bundled reviewed parser only.\n');
}
