import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGedcom, parseDate, GedcomImportError, LIMITS} from '../docs/gedcom.mjs';

const encode = value => new TextEncoder().encode(value);
const ged = (body, {version = '5.5.1', charset = 'UTF-8'} = {}) => `0 HEAD\n1 GEDC\n2 VERS ${version}\n1 CHAR ${charset}\n${body}0 TRLR\n`;
const ancestor = ({id = '@ANCESTOR@', name = 'Ada /Fixture/', birth = '1800', death = '1850', extra = ''} = {}) =>
  `0 ${id} INDI\n1 NAME ${name}\n${birth === null ? '' : `1 BIRT\n2 DATE ${birth}\n`}\n${death === null ? '' : `1 DEAT\n2 DATE ${death}\n`}${extra}`;
const parse = body => parseGedcom(encode(ged(body)));
function errorCode(bytes, expected) {
  assert.throws(() => parseGedcom(bytes), e => e instanceof GedcomImportError && e.code === expected);
}

test('minimal UTF-8 import returns a small projection with opaque identifiers', () => {
  const result = parse(ancestor({name: 'Zoë /Fixture/'}));
  assert.deepEqual(result.people, [{id: 'p1', name: 'Zoë Fixture', events: [
    {type: 'BIRT', date: '1800', place: '', citationCount: 0},
    {type: 'DEAT', date: '1850', place: '', citationCount: 0}
  ], relationships: []}]);
  assert.equal(result.summary.importedPeople, 1);
  assert.equal(result.summary.visiblePeople, 1);
  assert.equal(result.summary.withheldPeople, 0);
  assert.deepEqual(Object.keys(result).sort(), ['people', 'summary', 'warnings']);
  assert.ok(!JSON.stringify(result).includes('@ANCESTOR@'));
});

test('UTF-8 BOM and CRLF exports import correctly', () => {
  const result = parseGedcom(encode('\ufeff' + ged(ancestor()).replaceAll('\n', '\r\n')));
  assert.equal(result.people[0].name, 'Ada Fixture');
});

test('version and character-set declarations are mandatory and unique', () => {
  for (const version of ['7.0', '5.5', '99.99']) errorCode(encode(ged(ancestor(), {version})), 'VERSION');
  for (const charset of ['ANSEL', 'ASCII', 'UNICODE']) errorCode(encode(ged(ancestor(), {charset})), 'CHARSET');
  errorCode(encode(ged(ancestor()).replace('2 VERS 5.5.1', '2 VERS 5.5.1\n2 VERS 7.0')), 'VERSION');
  errorCode(encode(ged(ancestor()).replace('1 CHAR UTF-8', '1 CHAR UTF-8\n1 CHAR ANSEL')), 'CHARSET');
  errorCode(encode(ged(ancestor()).replace('1 GEDC\n2 VERS 5.5.1\n', '')), 'VERSION');
});

test('HEAD and TRLR must surround the whole file once', () => {
  const valid = ged(ancestor());
  for (const value of [ancestor() + '0 TRLR\n', valid + '0 @EXTRA@ INDI\n', '0 @PRE@ INDI\n' + valid,
    valid.replace('0 TRLR', '0 HEAD\n0 TRLR'), valid.replace('0 TRLR', '0 TRLR\n0 TRLR'),
    valid.replace('0 TRLR', '0 TRLR\n1 NOTE CANARY')]) errorCode(encode(value), 'STRUCTURE');
});

test('invalid UTF-8 is rejected without fallback or echoing the field', () => {
  const bytes = Uint8Array.from([...encode(ged(ancestor())), 0xe9]);
  errorCode(bytes, 'ENCODING');
  const utf16 = Uint8Array.from([0xff, 0xfe, 0x30, 0x00]);
  errorCode(utf16, 'ENCODING');
});

test('size, field, hierarchy, duplicate and nesting guards reject safely', () => {
  errorCode(new Uint8Array(), 'SIZE');
  errorCode(new Uint8Array(LIMITS.bytes + 1), 'SIZE');
  errorCode(encode(ged(ancestor({extra: `1 NOTE ${'a'.repeat(LIMITS.lineLength)}\n`}))), 'LINE_LENGTH');
  errorCode(encode(ged(ancestor({extra: '4 NOTE CANARY\n'}))), 'HIERARCHY');
  errorCode(encode(ged(ancestor() + ancestor())), 'DUPLICATE_ID');
  errorCode(encode(ged(ancestor({extra: '1 @CANARY@ NOTE value\n'}))), 'NESTED_ID');
  const depth = Array.from({length: 33}, (_, i) => `${i + 1} _DEPTH value\n`).join('');
  errorCode(encode(ged(`0 @P@ INDI\n${depth}`)), 'DEPTH');
  errorCode(encode(ged(`0 @P@ INDI\n${'1 NOTE x\n'.repeat(LIMITS.nodes)}`)), 'NODES');
  errorCode(encode(ged(ancestor({extra: '1 NOTE \0\n'}))), 'NUL');
});

test('parseDate preserves conservative exact, range and uncertain bounds', () => {
  assert.deepEqual([parseDate('12 MAY 1832').min_year, parseDate('12 MAY 1832').precision], [1832, 'day']);
  assert.equal(parseDate('29 FEB 1900').precision, 'unknown');
  assert.equal(parseDate('29 FEB 2000').precision, 'day');
  assert.deepEqual([parseDate('BET 1800 AND 1805').min_year, parseDate('BET 1800 AND 1805').max_year], [1800, 1805]);
  assert.equal(parseDate('BET 1805 AND 1800').precision, 'unknown');
  assert.equal(parseDate('BEF 1926').max_year, 1925);
  assert.equal(parseDate('BEF 1 MAY 1926').max_year, 1926);
  assert.equal(parseDate('AFT 1800').min_year, 1801);
  assert.equal(parseDate('AFT MAY 1800').min_year, 1800);
  for (const q of ['ABT', 'CAL', 'EST', 'INT']) {
    assert.equal(parseDate(`${q} 1900`).min_year, null);
    assert.equal(parseDate(`${q} 1900`).max_year, null);
    assert.equal(parseDate(`${q} 1900`).nominal_year, 1900);
  }
  assert.equal(parseDate('@#DJULIAN@ 12 MAY 1800').max_year, null);
  assert.equal(parseDate('@#DGREGORIAN@ 12 MAY 1800').max_year, 1800);
});

test('living, unknown and recently deceased records are withheld by default', () => {
  const body = ancestor() + ancestor({id: '@LIVING@', name: 'Living /Canary/', birth: '1980', death: null}) +
    ancestor({id: '@UNKNOWN@', name: 'Unknown /Canary/', birth: null, death: null}) +
    ancestor({id: '@RECENT@', name: 'Recent /Canary/', birth: '1900', death: '1980'});
  const result = parse(body);
  assert.equal(result.summary.importedPeople, 4);
  assert.equal(result.summary.withheldPeople, 3);
  assert.equal(result.people.length, 1);
  assert.ok(!JSON.stringify(result).includes('Canary'));
  assert.equal(parse(ancestor({death: 'ABT 1900'})).people.length, 0);
  assert.equal(parse(ancestor({death: 'BEF 1926'})).people.length, 1);
  assert.equal(parse(ancestor({death: 'BEF 1 MAY 1926'})).people.length, 0);
  assert.equal(parse(ancestor({death: null, extra: '1 DEAT Y\n'})).people.length, 0);
});

test('every death and duplicate birth/date assertion affects eligibility', () => {
  for (const extra of ['1 DEAT\n2 DATE 1950\n', '1 DEAT\n2 DATE ABT 1850\n', '1 DEAT Y\n',
    '1 DEAT N\n2 DATE 1840\n', '1 BIRT\n2 DATE 1980\n', '1 BIRT\n2 DATE ABT 1980\n']) {
    assert.equal(parse(ancestor({extra})).people.length, 0);
  }
  assert.equal(parse(ancestor({death: '1850\n2 DATE 1980'})).people.length, 0);
  assert.equal(parse(ancestor({birth: '1800\n2 DATE 1980'})).people.length, 0);
});

test('restriction flags anywhere in an individual including a citation are honored', () => {
  for (const extra of ['1 _LIVING Y\n', '1 _ALIVE TRUE\n', '1 _PRIV 1\n', '1 RESN privacy\n',
    '1 RESN confidential\n', '1 CHR\n2 RESN privacy\n', '1 BIRT\n2 DATE 1802\n2 SOUR @S@\n3 RESN confidential\n']) {
    assert.equal(parse(ancestor({extra})).people.length, 0);
  }
  assert.equal(parse(ancestor({extra: '1 _LIVING N\n'})).people.length, 1);
});

test('unknown non-false restriction codes fail closed', () => {
  for (const tag of ['_PRIV', '_PRIVATE', '_CONFIDENTIAL', '_LIVING', '_ALIVE', '_LVG']) {
    assert.equal(parse(ancestor({extra: `1 ${tag} FLAG_CANARY\n`})).people.length, 0);
    for (const value of ['N', 'NO', 'FALSE', '0']) assert.equal(parse(ancestor({extra: `1 ${tag} ${value}\n`})).people.length, 1);
  }
  for (const value of ['locked', 'none', 'UNKNOWN_CANARY']) assert.equal(parse(ancestor({extra: `1 RESN ${value}\n`})).people.length, 0);
});

test('empty and whitespace-only restriction declarations fail closed', () => {
  for (const tag of ['RESN', '_PRIV', '_PRIVATE', '_CONFIDENTIAL', '_LIVING', '_ALIVE', '_LVG']) {
    for (const value of ['', '   ', '\t']) assert.equal(parse(ancestor({extra: `1 ${tag} ${value}\n`})).people.length, 0);
  }
  const family = ancestor({id: '@A@'}) + ancestor({id: '@B@', name: 'Bea /Fixture/'}) +
    '0 @F@ FAM\n1 HUSB @A@\n1 WIFE @B@\n1 RESN\n';
  assert.ok(parse(family).people.every(p => !p.relationships.length));
});

test('restricted source records propagate withholding through references', () => {
  const result = parse(ancestor({extra: '1 SOUR @PRIVATE_SOURCE@\n'}) +
    '0 @PRIVATE_SOURCE@ SOUR\n1 TITL SOURCE_CANARY\n1 RESN confidential\n');
  assert.equal(result.people.length, 0);
  assert.ok(!JSON.stringify(result).includes('SOURCE_CANARY'));
});

test('restriction propagation includes chained sources and terminates on cycles', () => {
  const body = ancestor({extra: '1 SOUR @FIRST@\n'}) +
    '0 @FIRST@ SOUR\n1 SOUR @SECOND@\n0 @SECOND@ SOUR\n1 SOUR @FIRST@\n1 SOUR @PRIVATE@\n0 @PRIVATE@ SOUR\n1 RESN confidential\n';
  assert.equal(parse(body).people.length, 0);
  assert.equal(parse(ancestor({extra: '1 SOUR @A@\n'}) + '0 @A@ SOUR\n1 SOUR @B@\n0 @B@ SOUR\n1 SOUR @A@\n').people.length, 1);
});

test('duplicate birth events and DATE fields remain visible together', () => {
  const result = parse(ancestor({birth: '1800\n2 DATE 1802', extra: '1 BIRT\n2 DATE 1804\n'}));
  assert.deepEqual(result.people[0].events.filter(e => e.type === 'BIRT').map(e => e.date), ['1800', '1802', '1804']);
  assert.ok(result.warnings.some(w => w.startsWith('Repeated fields')));
});

test('notes, media, source prose, event prose and raw identifiers never reach projection', () => {
  const body = ancestor({extra: '1 NOTE NOTE_CANARY\n2 CONT CONT_CANARY\n2 CONC CONC_CANARY\n1 OBJE @MEDIA_CANARY@\n1 CHR EVENT_CANARY\n2 DATE 1801\n2 SOUR @SOURCE_CANARY@\n3 PAGE PAGE_CANARY\n3 DATA\n4 TEXT SOURCE_PROSE_CANARY\n'}) +
    '0 @MEDIA_CANARY@ OBJE\n1 FILE https://canary.invalid/private.jpg\n0 @SOURCE_CANARY@ SOUR\n1 TITL TITLE_CANARY\n1 TEXT SHARED_CANARY\n';
  const result = parse(body), serialized = JSON.stringify(result);
  assert.ok(!serialized.includes('CANARY'));
  assert.ok(!serialized.includes('https://'));
  assert.equal(result.people[0].events.find(e => e.type === 'CHR').citationCount, 1);
});

test('living names and nicknames embedded in historical allowed fields are withheld', () => {
  const body = ancestor({extra: '1 CHR\n2 DATE 1801\n2 PLAC House of Lily\n1 BAPM\n2 DATE 1801\n2 PLAC Home of Living Canary\n'}) +
    ancestor({id: '@L@', name: 'Living /Canary/', death: null, extra: '2 NICK Lily\n'});
  const result = parse(body), serialized = JSON.stringify(result);
  assert.equal(result.people.length, 1);
  assert.equal(result.people[0].events.find(e => e.type === 'CHR').place, '');
  assert.ok(!serialized.includes('Lily'));
  assert.ok(!serialized.includes('Living Canary'));
});

test('additional excluded NAME aliases are screened alongside nicknames', () => {
  const body = ancestor({extra: '1 CHR\n2 DATE 1801\n2 PLAC Home of Alias Secret\n'}) +
    ancestor({id: '@L@', death: null, name: 'Excluded /Person/', extra: '1 NAME Alias /Secret/\n'});
  assert.equal(parse(body).people[0].events.find(e => e.type === 'CHR').place, '');
});

test('contact strings and HTML/script content cannot pass name/place projection', () => {
  for (const place of ['mail@canary.invalid', 'https://canary.invalid', 'Telephone 01234 567890', '<img src=x onerror=alert(1)>', 'Street \u202eCANARY']) {
    const result = parse(ancestor({extra: `1 CHR\n2 DATE 1801\n2 PLAC ${place}\n`}));
    assert.equal(result.people[0].events.find(e => e.type === 'CHR').place, '');
  }
  const result = parse(ancestor({name: 'Email /canary@invalid/'}));
  assert.equal(result.people[0].name, 'Name withheld');
  assert.ok(!JSON.stringify(result).includes('canary@invalid'));
});

test('malformed date prose is withheld and invalid birth cannot hide a living person', () => {
  const result = parse(ancestor({extra: '1 CHR\n2 DATE 1801 (DATE_CANARY)\n'}));
  assert.equal(result.people[0].events.find(e => e.type === 'CHR').date, '');
  assert.ok(!JSON.stringify(result).includes('DATE_CANARY'));
  assert.equal(parse(ancestor({birth: 'DOB_CANARY'})).people.length, 0);
});

test('relationships require both historical endpoints and preserve generic linkage', () => {
  const body = ancestor({id: '@PARENT@', name: 'Parent /Fixture/', extra: '1 FAMS @F@\n'}) +
    ancestor({id: '@CHILD@', name: 'Child /Fixture/', birth: '1820', death: '1870', extra: '1 FAMC @F@\n2 PEDI adopted\n'}) +
    ancestor({id: '@LIVING@', name: 'Living /Canary/', death: null}) +
    '0 @F@ FAM\n1 HUSB @PARENT@\n1 CHIL @CHILD@\n1 CHIL @LIVING@\n';
  const result = parse(body);
  assert.deepEqual(result.people[0].relationships, [{id: 'p2', name: 'Child Fixture', kind: 'child'}]);
  assert.deepEqual(result.people[1].relationships, [{id: 'p1', name: 'Parent Fixture', kind: 'parent'}]);
  assert.ok(!JSON.stringify(result).includes('Living Canary'));
  assert.ok(!JSON.stringify(result.people).includes('biological'));
  assert.ok(!JSON.stringify(result).includes('@F@'));
});

test('restricted families suppress all related links and marriage events', () => {
  const body = ancestor({id: '@A@', name: 'Alpha /Fixture/'}) + ancestor({id: '@B@', name: 'Beta /Fixture/'}) +
    '0 @F@ FAM\n1 HUSB @A@\n1 WIFE @B@\n1 RESN privacy\n1 MARR\n2 DATE 1820\n';
  const result = parse(body);
  assert.ok(result.people.every(p => !p.relationships.length));
  assert.ok(result.people.every(p => !p.events.some(e => e.type === 'MARR')));
});

test('marriage events appear only when every partner is historical', () => {
  const family = '0 @F@ FAM\n1 HUSB @A@\n1 WIFE @B@\n1 MARR\n2 DATE 1820\n2 PLAC Test County\n';
  const historical = parse(ancestor({id: '@A@'}) + ancestor({id: '@B@', name: 'Bea /Fixture/'}) + family);
  assert.ok(historical.people.every(p => p.events.some(e => e.type === 'MARR' && e.date === '1820')));
  const livingPartner = parse(ancestor({id: '@A@'}) + ancestor({id: '@B@', death: null, name: 'Living /Canary/'}) + family);
  assert.equal(livingPartner.people[0].events.filter(e => e.type === 'MARR').length, 0);
});

test('individual family pointers support missing family backlinks', () => {
  const body = ancestor({id: '@A@', extra: '1 FAMS @F@\n'}) + ancestor({id: '@B@', name: 'Child /Fixture/', extra: '1 FAMC @F@\n'}) + '0 @F@ FAM\n';
  const result = parse(body);
  assert.equal(result.people[0].relationships[0].kind, 'child');
});

test('malicious diagnostics and unresolved pointers never echo imported values', () => {
  assert.throws(() => parse(ancestor({extra: 'THIS_DIAGNOSTIC_CANARY\n'})), e => !e.message.includes('CANARY'));
  const result = parse(ancestor({extra: '1 FAMC @POINTER_CANARY@\n1 _TAG_CANARY secret\n'}));
  assert.ok(!JSON.stringify(result).includes('CANARY'));
  assert.ok(result.warnings.some(w => w.startsWith('Some family')));
});

test('control characters beyond NUL reject even when hidden inside notes', () => {
  for (const value of ['\x01', '\x0b', '\x1f', '\x7f', '\u0085']) {
    errorCode(encode(ged(ancestor({extra: `1 NOTE ${value}CANARY\n`}))), 'CONTROL_CHARACTERS');
  }
});

test('a thousand invented ancestors remain within resource bounds', () => {
  const result = parse(Array.from({length: 1000}, (_, i) => ancestor({id: `@P${i}@`, name: `Fixture /Person ${i}/`})).join(''));
  assert.equal(result.people.length, 1000);
  assert.equal(result.summary.displayedEvents, 2000);
});

test('inconsistent partner sets fail before relationship expansion', () => {
  const people = ancestor({id: '@A@', extra: '1 FAMS @F@\n'}) + ancestor({id: '@B@', extra: '1 FAMS @F@\n'}) +
    ancestor({id: '@C@', extra: '1 FAMS @F@\n'});
  errorCode(encode(ged(people + '0 @F@ FAM\n')), 'FAMILY_PARTNERS');
  errorCode(encode(ged(ancestor() + '0 @F@ FAM\n1 HUSB @ANCESTOR@\n1 HUSB @ANCESTOR@\n')), 'FAMILY_PARTNERS');
});

test('event and relationship output limits prevent graph amplification', () => {
  errorCode(encode(ged(ancestor({extra: '1 CHR\n2 DATE 1801\n'.repeat(LIMITS.personEvents)}))), 'OUTPUT_LIMIT');
  const children = Array.from({length: LIMITS.personRelationships + 1}, (_, i) => ancestor({id: `@C${i}@`, name: `Child /Fixture ${i}/`}));
  const links = Array.from({length: LIMITS.personRelationships + 1}, (_, i) => `1 CHIL @C${i}@\n`).join('');
  errorCode(encode(ged(ancestor() + children.join('') + `0 @F@ FAM\n1 HUSB @ANCESTOR@\n${links}`)), 'OUTPUT_LIMIT');
});
