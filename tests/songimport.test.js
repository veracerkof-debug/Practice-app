// Импорт песен из программ для вывода текста: каждый формат — на маленьком настоящем примере
import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import initSqlJs from 'sql.js';
import { resolve } from 'node:path';
import { rtfToText, parseXML, find, fromChordPro, fromOpenLyrics, fromPro6, fromPro7, importSongs, setSqlWasm } from '../src/core/songimport.js';

const WASM = resolve('node_modules/sql.js/dist/sql-wasm.wasm');
setSqlWasm(WASM);
const u8 = (s) => new TextEncoder().encode(s);
const RTF_RU = '{\\rtf1\\ansi\\ansicpg1251\\deff0{\\fonttbl{\\f0 Arial;}}{\\colortbl;\\red0\\green0\\blue0;}\\f0\\fs60 \\u1057?\\u1083?\\u1072?\\u1074?\\u1072? \\par \\\'c1\\\'ee\\\'e3\\\'f3}';

describe('разбор RTF и XML', () => {
  it('RTF: \\uN и \\\'hh в кодировке документа, таблицы шрифтов пропускаются', () => {
    expect(rtfToText(RTF_RU)).toBe('Слава\nБогу');
  });
  it('XML: сущности, вложенность, атрибуты', () => {
    const d = parseXML('<?xml version="1.0"?><a x="1 &amp; 2"><b>т&lt;1</b><b/></a>');
    expect(find(d, 'b').length).toBe(2);
    expect(find(d, 'a')[0].attrs.x).toBe('1 & 2');
  });
});

describe('форматы', () => {
  it('ChordPro: директивы, аккорды [C] остаются в тексте', () => {
    const s = fromChordPro('{title: Велик Господь}\n{artist: Хор}\n{key: G}\n{tempo: 72}\n{soc}\n[G]Велик Гос[D]подь\n{eoc}', 'x.cho');
    expect(s).toMatchObject({ title: 'Велик Господь', artist: 'Хор', key: 'G', bpm: 72 });
    expect(s.notes).toContain('Припев\n[G]Велик Гос[D]подь');
  });
  it('OpenLyrics: части по verseOrder, <br/> и <chord>', () => {
    const xml = '<?xml version="1.0"?><song xmlns="http://openlyrics.info/namespace/2009/song" version="0.9"><properties><titles><title>Аллилуйя</title></titles><authors><author>Иван</author></authors><key>D</key><tempo type="bpm">90</tempo><verseOrder>c v1 c</verseOrder></properties><lyrics>' +
      '<verse name="v1"><lines><chord name="D"/>Свят<br/>Свят Господь</lines></verse><verse name="c"><lines>Аллилуйя</lines></verse></lyrics></song>';
    const s = fromOpenLyrics(xml, 'a.xml');
    expect(s).toMatchObject({ title: 'Аллилуйя', artist: 'Иван', key: 'D', bpm: 90 });
    expect(s.notes).toBe('Припев\nАллилуйя\n\nКуплет 1\n[D]Свят\nСвят Господь\n\nПрипев\nАллилуйя');
  });
  it('ProPresenter 6: группы и RTF в base64', () => {
    const b = Buffer.from(RTF_RU).toString('base64');
    const xml = '<RVPresentationDocument CCLISongTitle="Слава" CCLIArtistCredits="Автор"><groups><RVSlideGrouping name="Куплет 1"><slides><RVDisplaySlide><displayElements><RVTextElement><NSString rvXMLIvarName="RTFData">' + b + '</NSString></RVTextElement></displayElements></RVDisplaySlide></slides></RVSlideGrouping></groups></RVPresentationDocument>';
    const s = fromPro6(xml, 'x.pro6');
    expect(s).toMatchObject({ title: 'Слава', artist: 'Автор' });
    expect(s.notes).toBe('Куплет 1\nСлава\nБогу');
  });
  it('ProPresenter 7: protobuf — название (поле 3) и RTF слайдов по порядку', () => {
    const vint = (n) => { const o = []; while (n > 127) { o.push((n & 127) | 128); n >>>= 7; } o.push(n); return o; };
    const fld = (f, bytes) => [...vint(f * 8 + 2), ...vint(bytes.length), ...bytes];
    const rtf1 = [...u8(RTF_RU)], rtf2 = [...u8('{\\rtf1\\ansi Amen}')];
    const slide = (r) => fld(4, fld(1, fld(7, r))); // вложенность как у настоящих слайдов
    const pres = new Uint8Array([...fld(3, [...u8('Песнь хвалы')]), ...fld(12, [...slide(rtf1), ...slide(rtf2), ...slide(rtf2)])]);
    const s = fromPro7(pres, 'x.pro');
    expect(s.title).toBe('Песнь хвалы');
    expect(s.notes).toBe('Слава\nБогу\n\nAmen');
  });
  it('PowerPoint и групповой импорт из zip', async () => {
    const slide = (txt) => strToU8('<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>' + txt + '</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>');
    const pptx = zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'ppt/slides/slide2.xml': slide('Второй'), 'ppt/slides/slide1.xml': slide('Первый') });
    const zip = zipSync({ 'Гимн.pptx': pptx, 'b/Песня.cho': strToU8('{title: Вторая}\nТекст'), 'logo.png': new Uint8Array([1, 2, 3]) });
    const r = await importSongs([{ name: 'пакет.zip', u8: zip }]);
    expect(r.errors).toEqual([]);
    expect(r.songs.map((s) => s.title).sort()).toEqual(['Вторая', 'Гимн']);
    expect(r.songs.find((s) => s.title === 'Гимн').notes).toBe('Первый\n\nВторой');
  });
  it('EasyWorship: Songs.db + SongWords.db', async () => {
    const SQL = await initSqlJs({ locateFile: () => WASM });
    const a = new SQL.Database(); a.run('CREATE TABLE song (title TEXT, author TEXT); INSERT INTO song VALUES (\'Хвала\', \'Пётр\');');
    const b = new SQL.Database(); b.run('CREATE TABLE word (song_id INTEGER, words TEXT)'); b.run('INSERT INTO word VALUES (1, ?)', [RTF_RU]);
    const r = await importSongs([{ name: 'Songs.db', u8: a.export() }, { name: 'SongWords.db', u8: b.export() }]);
    expect(r.errors).toEqual([]);
    expect(r.songs).toEqual([expect.objectContaining({ title: 'Хвала', artist: 'Пётр', notes: 'Слава\nБогу' })]);
  });
});

import { apiBase, toSong } from '../src/core/holyrics.js';
import { normKey } from '../src/core/screens/songimport.js';
describe('Holyrics', () => {
  it('адрес и порт', () => {
    expect(apiBase('192.168.1.5', '8091')).toBe('http://192.168.1.5:8091');
    expect(apiBase('http://10.0.0.2:9000/')).toBe('http://10.0.0.2:9000');
    expect(apiBase('')).toBe(null);
  });
  it('песня: слайды по частям, описание слайда — заголовок части', () => {
    const s = toSong({ title: 'Свят', artist: 'Хор', key: 'C#m', bpm: 72.0, slides: [{ text: 'Свят, свят', slide_description: 'Verse 1' }, { text: 'Господь', slide_description: 'Verse 1' }, { text: 'Аллилуйя', slide_description: 'Chorus' }] });
    expect(s).toMatchObject({ title: 'Свят', artist: 'Хор', key: 'C#m', bpm: 72 });
    expect(s.notes).toBe('Verse 1\nСвят, свят\n\nГосподь\n\nChorus\nАллилуйя');
  });
  it('тональность — в написании приложения', () => {
    expect(normKey('C#m')).toBe(normKey('C♯m'));
    expect(normKey('Bb')).toBe('B♭');
    expect(normKey('x')).toBe(null);
  });
});
