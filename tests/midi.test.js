import { describe, it, expect } from 'vitest';
import { writeMidi, readMidi, createDecoder, isMpe, takeDur } from '../src/music/midi.js';

const near = (a, b, d = 0.01) => Math.abs(a - b) < d;

describe('MIDI: пианино', () => {
  const ev = [
    { t: 0, k: 'on', id: 'a', m: 60, v: 1 },
    { t: 0.5, k: 'on', id: 'b', m: 64, v: 0.5 },
    { t: 1, k: 'off', id: 'a' },
    { t: 1.2, k: 'ped', v: 1 },
    { t: 1.5, k: 'off', id: 'b', r: true },
    { t: 2, k: 'ped', v: 0 },
  ];
  it('без скольжения — не MPE', () => expect(isMpe(ev)).toBe(false));
  it('файл читается обратно: ноты, время, сила, педаль', () => {
    const u8 = writeMidi(ev, { name: 'Пианино' });
    expect(String.fromCharCode(...u8.slice(0, 4))).toBe('MThd');
    const r = readMidi(u8);
    expect(r.name).toBe('Пианино');
    const ons = r.ev.filter((e) => e.k === 'on');
    expect(ons.map((e) => e.m)).toEqual([60, 64]);
    expect(near(ons[1].t, 0.5)).toBe(true);
    expect(near(ons[0].v, 1)).toBe(true);
    expect(near(ons[1].v, 64 / 127)).toBe(true);
    const offs = r.ev.filter((e) => e.k === 'off');
    expect(offs).toHaveLength(2);
    expect(offs[1].r).toBe(true); // отпущена при нажатой педали
    expect(r.ev.filter((e) => e.k === 'ped').map((e) => e.v)).toEqual([1, 0]);
    expect(near(r.dur, 2)).toBe(true);
  });
});

describe('MIDI: скольжение (MPE)', () => {
  const ev = [
    { t: 0, k: 'on', id: 1, m: 60.25, y: 0.5 },
    { t: 0.1, k: 'on', id: 2, m: 67, y: 0 },
    { t: 0.5, k: 'mv', id: 1, m: 72.5, y: 1 },
    { t: 1, k: 'off', id: 1 },
    { t: 1, k: 'off', id: 2 },
  ];
  it('дробная высота — MPE', () => expect(isMpe(ev)).toBe(true));
  it('голоса — свои каналы; высота и выразительность сохраняются', () => {
    const r = readMidi(writeMidi(ev));
    const ons = r.ev.filter((e) => e.k === 'on');
    expect(ons).toHaveLength(2);
    expect(near(ons[0].m, 60.25)).toBe(true);
    expect(near(ons[0].y, 0.5, 0.01)).toBe(true);
    expect(ons[0].id).not.toBe(ons[1].id);
    const mv = r.ev.filter((e) => e.k === 'mv' && e.id === ons[0].id);
    expect(mv.some((e) => e.m != null && near(e.m, 72.5))).toBe(true);
    expect(mv.some((e) => e.y === 1)).toBe(true);
    // второй голос не сдвинулся от изгиба первого
    expect(r.ev.filter((e) => e.k === 'mv' && e.id === ons[1].id && e.m != null)).toHaveLength(0);
  });
  it('больше 15 голосов — старый замолкает, файл цел', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ t: i * 0.01, k: 'on', id: i, m: 60 + i + 0.5 }));
    const r = readMidi(writeMidi(many));
    expect(r.ev.filter((e) => e.k === 'on')).toHaveLength(20);
    expect(r.ev.filter((e) => e.k === 'off')).toHaveLength(20);
  });
});

describe('MIDI: разбор сообщений', () => {
  it('диапазон изгиба из RPN, ударные пропускаются, «все ноты выкл»', () => {
    const d = createDecoder();
    d.msg(0, [0xb0, 101, 0]); d.msg(0, [0xb0, 100, 0]); d.msg(0, [0xb0, 6, 12]);
    const on = d.msg(0, [0x90, 60, 100])[0];
    const mv = d.msg(0.1, [0xe0, 0, 0x60])[0]; // 0x3000 = +0.5 диапазона
    expect(near(mv.m, 66)).toBe(true);
    expect(mv.id).toBe(on.id);
    expect(d.msg(0.2, [0x99, 36, 100])).toEqual([]);
    expect(d.msg(0.3, [0xb0, 123, 0])).toEqual([{ t: 0.3, k: 'off', id: on.id }]);
  });
  it('note on с силой 0 — отпускание; бегущий статус в файле', () => {
    // формат 0, деление 96, бегущий статус: 90 3C 40, 60 3C 00
    const u8 = new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96, 0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 12,
      0, 0x90, 0x3c, 0x40, 0x60, 0x3c, 0x00, 0, 0xff, 0x2f, 0x00, 0]);
    const r = readMidi(u8);
    expect(r.ev.map((e) => e.k)).toEqual(['on', 'off']);
    expect(near(r.ev[1].t, 0.5)).toBe(true); // 96 тиков при 120 bpm = полсекунды
  });
  it('не MIDI — ошибка', () => expect(() => readMidi(new Uint8Array([1, 2, 3]))).toThrow());
  it('длительность', () => expect(takeDur([{ t: 1 }, { t: 3 }, { t: 2 }])).toBe(3));
});

describe('MIDI: поток с клавиатуры', async () => {
  const { splitBytes } = await import('../src/core/midi.js');
  it('несколько сообщений, бегущий статус, такт и SysEx пропускаются', () => {
    const st = { run: 0 };
    expect(splitBytes([0x90, 60, 100, 64, 90, 0xf8, 0xf0, 1, 2, 0xf7, 0x80, 60, 0], st)).toEqual([[0x90, 60, 100], [0x90, 64, 90], [0x80, 60, 0]]);
    // бегущий статус продолжается в следующем пакете
    expect(splitBytes([67, 80], st)).toEqual([[0x80, 67, 80]]);
    expect(splitBytes([0xc0, 5])).toEqual([[0xc0, 5]]);
  });
});
