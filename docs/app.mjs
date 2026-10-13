import {parserWorkerSource} from './parser-worker-source.mjs';
// No family values enter a URL, browser storage, telemetry, or a network request.
const $ = (id) => document.getElementById(id);
const controls = {consent:$('consent'),file:$('gedcom'),read:$('read-tree'),clear:$('clear-tree'),search:$('search')};
const IDLE_MS = 30 * 60 * 1000;
const HARD_MS = 2 * 60 * 60 * 1000;
const MAX_BYTES = 5 * 1024 * 1024;
const PAGE_SIZE = 50;
const standalone = window.self === window.top;
let tree = null;
let worker = null;
let workerUrl = null;
let parsingTimer = null;
let epoch = 0;
let busy = false;
let selectedId = null;
let currentPage = 0;
let lastActivity = 0;
let importedAt = 0;

function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = String(text);
  if (className) el.className = className;
  return el;
}

function status(message, isError = false) {
  $('status').textContent = message;
  $('status').className = isError ? 'error' : '';
}

function stopWorker() {
  if (worker) worker.terminate();
  worker = null;
  if (workerUrl) URL.revokeObjectURL(workerUrl);
  workerUrl = null;
  if (parsingTimer) clearTimeout(parsingTimer);
  parsingTimer = null;
}

function updateControls() {
  controls.file.disabled = !standalone || busy || !controls.consent.checked;
  controls.read.disabled = !standalone || busy || !controls.consent.checked || !controls.file.files.length;
  controls.consent.disabled = !standalone || busy;
  controls.clear.disabled = !busy && !tree;
}

function clearTree(message = 'Your tree has been cleared from this viewer.') {
  epoch += 1;
  stopWorker();
  tree = null;
  selectedId = null;
  currentPage = 0;
  lastActivity = 0;
  importedAt = 0;
  busy = false;
  controls.search.value = '';
  controls.file.value = '';
  controls.consent.checked = false;
  for (const id of ['summary','notices','people-list','person-detail','people-count','page-number','session-note']) $(id).replaceChildren();
  $('tree-panel').hidden = true;
  $('notices').hidden = true;
  $('import-panel').hidden = false;
  controls.read.textContent = 'Read my tree →';
  status(message);
  updateControls();
}

function expired(now = Date.now()) {
  return tree && (now - importedAt >= HARD_MS || now - lastActivity >= IDLE_MS);
}

function checkExpiry() {
  if (expired()) {
    clearTree('The session expired and your tree was cleared. You can read your file again.');
    return true;
  }
  return false;
}

function activity(event) {
  if (checkExpiry()) return;
  if (tree && event.isTrusted) lastActivity = Date.now();
}

function dateText(event) {
  return (typeof event.date === 'string' ? event.date : event.date?.raw) || 'Date not shown';
}

function lifespan(person) {
  const birth = person.events.find((event) => event.type === 'BIRT');
  const death = person.events.find((event) => event.type === 'DEAT');
  return [birth ? 'Born ' + dateText(birth) : '', death ? 'Died ' + dateText(death) : ''].filter(Boolean).join(' · ');
}

function showSummary() {
  $('summary').replaceChildren();
  const counts = [[tree.summary.visiblePeople,'Ancestors shown'],[tree.summary.withheldPeople,'People withheld'],[tree.summary.importedPeople,'People recorded in file']];
  for (const [value, label] of counts) {
    const item = node('div',undefined,'summary-item');
    item.append(node('strong',value),node('span',label));
    $('summary').append(item);
  }
  $('notices').replaceChildren();
  const notices = tree.warnings || [];
  if (tree.summary.withheldPeople) notices.unshift('People without a safely bounded recorded death before 1926, or with private or contradictory records, are withheld.');
  if (notices.length) {
    $('notices').append(node('h3','Import notes'));
    const list = node('ul');
    for (const notice of [...new Set(notices)].slice(0,20)) list.append(node('li',notice));
    $('notices').append(list);
  }
  $('notices').hidden = !notices.length;
  $('session-note').textContent = 'Held only in this browser · 30-minute inactivity limit · Two-hour session limit';
}

function showPeople() {
  if (!tree || checkExpiry()) return;
  const query = controls.search.value.trim().toLocaleLowerCase();
  const people = tree.people.filter((person) => person.name.toLocaleLowerCase().includes(query));
  const pageCount = Math.max(1,Math.ceil(people.length / PAGE_SIZE));
  currentPage = Math.min(currentPage,pageCount - 1);
  const start = currentPage * PAGE_SIZE;
  $('people-list').replaceChildren();
  $('people-count').textContent = people.length + (people.length === 1 ? ' ancestor' : ' ancestors') + (query ? ' match your search.' : ' available to browse.');
  for (const person of people.slice(start,start + PAGE_SIZE)) {
    const button = node('button',undefined,'person-button');
    button.type = 'button';
    button.setAttribute('aria-current',String(person.id === selectedId));
    button.append(node('span',person.name || 'Name withheld'),node('small',lifespan(person)));
    button.addEventListener('click',() => selectPerson(person.id));
    $('people-list').append(button);
  }
  if (!people.length) $('people-list').append(node('p','No ancestors match this search.','small'));
  $('previous').disabled = currentPage === 0;
  $('next').disabled = currentPage >= pageCount - 1;
  $('page-number').textContent = 'Page ' + (currentPage + 1) + ' of ' + pageCount;
}

const eventNames = {BIRT:'Birth',DEAT:'Death',CHR:'Christening',BAPM:'Baptism',BURI:'Burial',MARR:'Marriage'};

function selectPerson(id) {
  if (!tree || checkExpiry()) return;
  const person = tree.people.find((item) => item.id === id);
  if (!person) return;
  selectedId = id;
  const detail = $('person-detail');
  detail.replaceChildren(node('p','From your GEDCOM','eyebrow'),node('h2',person.name || 'Name withheld'),node('span','Imported assertion · Not independently verified','assertion-badge'));
  const births = new Set(person.events.filter((event) => event.type === 'BIRT').map(dateText));
  if (births.size > 1) detail.append(node('p','Multiple birth dates are recorded. Each assertion is shown below; this viewer does not choose a historical answer.','conflict-note'));
  const events = node('section',undefined,'detail-section');
  events.append(node('h3','Recorded events'));
  for (const event of person.events) {
    const row = node('div',undefined,'event');
    row.append(node('span',eventNames[event.type] || 'Recorded event','event-label'));
    const values = node('div');
    values.append(node('p',dateText(event),'event-value'));
    if (event.place) values.append(node('p',event.place,'event-place'));
    if (event.citationCount) values.append(node('p',event.citationCount + ' imported citation' + (event.citationCount === 1 ? '' : 's') + ' · Details withheld','event-source'));
    row.append(values);
    events.append(row);
  }
  if (!person.events.length) events.append(node('p','No supported public fields are shown.','small'));
  detail.append(events);
  const relatives = node('section',undefined,'detail-section');
  relatives.append(node('h3','Family connections'));
  for (const relative of person.relationships) {
    const row = node('div',undefined,'relative');
    const button = node('button',relative.name || 'Name withheld','text-button');
    button.addEventListener('click',() => {
      selectPerson(relative.id);
      if (window.innerWidth < 650) detail.scrollIntoView({behavior:'smooth',block:'start'});
    });
    row.append(button,node('span',relative.kind + ' in recorded family'));
    relatives.append(row);
  }
  if (!person.relationships.length) relatives.append(node('p','No eligible family connections are shown.','small'));
  relatives.append(node('p','Family links are assertions in your file. A link does not establish biological parentage.','small'));
  detail.append(relatives);
  showPeople();
}

async function readTree() {
  if (!standalone || busy || !controls.consent.checked) return;
  const file = controls.file.files[0];
  if (!file) return;
  if (file.size <= 0 || file.size > MAX_BYTES) {
    status('Choose a nonempty GEDCOM no larger than 5 MiB.',true);
    controls.file.value = '';
    updateControls();
    return;
  }
  if (!/\.(ged|gedcom)$/i.test(file.name)) {
    status('Choose a .ged or .gedcom file exported as GEDCOM 5.5.1 UTF-8.',true);
    controls.file.value = '';
    updateControls();
    return;
  }
  // Replacement clears the previous tree before any new bytes are read.
  epoch += 1;
  const job = epoch;
  stopWorker();
  tree = null;
  selectedId = null;
  for (const id of ['summary','notices','people-list','person-detail','people-count','page-number','session-note']) $(id).replaceChildren();
  $('tree-panel').hidden = true;
  controls.search.value = '';
  currentPage = 0;
  busy = true;
  updateControls();
  status('Reading on your device and applying privacy filters…');
  controls.read.textContent = 'Reading…';
  try {
    // The reviewed parser is bundled before deployment. This Blob worker inherits
    // the document policy and makes no imports or connections while holding data.
    workerUrl = URL.createObjectURL(new Blob([parserWorkerSource],{type:'text/javascript'}));
    worker = new Worker(workerUrl);
    const finishError = (message) => {
      if (job !== epoch) return;
      stopWorker();
      busy = false;
      controls.file.value = '';
      controls.read.textContent = 'Read my tree →';
      status(message,true);
      updateControls();
    };
    worker.onerror = () => finishError('The file could not be processed in this browser. Try a current browser and a reviewed GEDCOM 5.5.1 UTF-8 export.');
    worker.onmessage = ({data}) => {
      if (job !== epoch) return;
      stopWorker();
      busy = false;
      controls.file.value = '';
      controls.read.textContent = 'Read my tree →';
      if (!data.ok) {
        status(data.message,true);
        updateControls();
        return;
      }
      tree = data.result;
      importedAt = lastActivity = Date.now();
      $('tree-panel').hidden = false;
      showSummary();
      showPeople();
      if (tree.people.length) selectPerson(tree.people[0].id);
      else {
        const empty = node('div',undefined,'empty-detail');
        empty.append(node('h2','No eligible ancestors to show'),node('p','The file was read, but none of its people meets this beta’s conservative privacy rules. An older historical branch may have more eligible ancestors.'));
        $('person-detail').append(empty);
      }
      status('Your tree was read locally. The original file is unchanged.');
      updateControls();
      $('tree-panel').scrollIntoView({behavior:'smooth',block:'start'});
    };
    parsingTimer = setTimeout(() => finishError('Reading took too long and was stopped. Try a smaller reviewed branch.'),20_000);
    const bytes = await file.arrayBuffer();
    if (job !== epoch || !worker) return;
    worker.postMessage({bytes},[bytes]);
  } catch {
    if (job !== epoch) return;
    stopWorker();
    busy = false;
    controls.file.value = '';
    controls.read.textContent = 'Read my tree →';
    status('The file could not be read on this device. Nothing was uploaded or saved.',true);
    updateControls();
  }
}

controls.consent.addEventListener('change',() => {
  if (!controls.consent.checked) clearTree('Consent was withdrawn and the viewer was cleared.');
  else updateControls();
});
controls.file.addEventListener('change',updateControls);
controls.read.addEventListener('click',readTree);
controls.clear.addEventListener('click',() => clearTree());
controls.search.addEventListener('input',() => {currentPage = 0;showPeople();});
$('previous').addEventListener('click',() => {currentPage -= 1;showPeople();});
$('next').addEventListener('click',() => {currentPage += 1;showPeople();});
for (const type of ['pointerdown','keydown','input','wheel']) document.addEventListener(type,activity,{passive:true});
document.addEventListener('visibilitychange',checkExpiry);
window.addEventListener('focus',checkExpiry);
window.addEventListener('pageshow',checkExpiry);
window.addEventListener('pagehide',() => clearTree('No file has been read.'));
setInterval(checkExpiry,15_000);
updateControls();
if (!standalone) status('Open this viewer directly in its own browser tab before choosing a GEDCOM.',true);
