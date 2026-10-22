import { describe, it, expect } from 'vitest';
import { runLegacy } from './legacy.js';
import {
  lsizes, lpos, getWS, fixWS, halves, setLayout, closePane, dropTool, addPane, assign, sizeOf, wsKey, visible,
} from '../src/core/workspace.js';

const L = runLegacy([/^const LMAP=/, /^function lsizes\(/, /^function lpos\(/, /^function sizeOf\(/], '{lsizes,lpos,sizeOf}',
  { WS: () => ({ layout: globalThis.__lay }), __lay: 'HH' });
const ALL = ['metro', 'tuner', 'piano', 'drone', 'theory', 'audio', 'notes'];
const LAYOUTS = ['F', 'HH', 'HQ', 'HS', 'QH', 'QQ', 'QS', 'SH', 'SQ', 'SS', 'L1', 'L2', 'L12', 'L21', 'L4'];

describe('рабочее пространство — как в прототипе', () => {
  it('размеры и положение окон в раскладках', () => {
    for (const l of LAYOUTS) {
      expect(lsizes(l), l).toEqual(L.lsizes(l));
      expect(lpos(l), l).toEqual(L.lpos(l));
    }
  });
  it('размер окна по пикселям', () => {
    const W = 380, H = 700;
    for (const [w, h] of [[380, 700], [380, 340], [185, 340], [380, 160], [185, 700], [300, 500], [370, 470], [220, 340]]) {
      expect(sizeOf('HH', w, h, W, H), w + '×' + h).toBe(L.sizeOf({ offsetWidth: w, offsetHeight: h }, W, H));
    }
    expect(sizeOf('F', 10, 10, W, H)).toBe('full');
  });
});

describe('рабочее пространство — действия', () => {
  const ws = (layout, panes = ALL.slice(), focus = 0) => ({ layout, panes, focus, sub: {}, ratio: 0.5 });
  it('новая сессия берёт раскладку свободной практики; ключи сессий', () => {
    const dev = { wsMap: { free: { layout: 'L2', panes: ['piano', 'metro'], focus: 0 } } };
    const w = getWS(dev, { type: 'song', songId: 's1' });
    expect(w.layout).toBe('HH');
    expect(dev.wsMap['song:s1']).toBe(w);
    expect([null, { type: 'free' }, { type: 'tool', tool: 'metro' }].map(wsKey)).toEqual(['free', 'free', 'tool:metro']);
    expect(getWS({}, null).panes).toEqual(ALL);
  });
  it('выключенные инструменты убираются, старые окна переименовываются', () => {
    const w = fixWS(ws('QQ', ['metro', 'circle', 'audio', 'tuner'], 3), ['metro', 'tuner', 'theory', 'audio']);
    expect(w.panes).toEqual(['metro', 'theory', 'audio', 'tuner']);
    expect(w.focus).toBe(3);
    expect(fixWS(ws('QQ', ['metro'], 3), ['metro']).panes).toEqual(['metro', 'metro', 'metro', 'metro']);
  });
  it('бывшие общие окна (метроном+тюнер, пианино+пэды) — каждому инструменту своё', () => {
    const w = { layout: 'HH', panes: ['rhythm', 'keys', 'theory'], focus: 0, sub: { rhythm: 'tuner', keys: 'drone' } };
    fixWS(w, ['metro', 'tuner', 'piano', 'drone', 'theory']);
    expect(visible(w)).toEqual(['tuner', 'drone']);
    expect(w.panes).toEqual(['tuner', 'drone', 'theory', 'metro', 'piano']);
    expect(fixWS({ layout: 'F', panes: ['rhythm'], focus: 0 }, ['metro', 'tuner']).panes).toEqual(['metro', 'tuner']);
  });
  it('бросить инструмент: весь экран делится, половина — на четверти или полосы', () => {
    let w = ws('F');
    expect(dropTool(w, 'piano', 0, 'bottom')).toBe(1);
    expect([w.layout, visible(w)]).toEqual(['HH', ['metro', 'piano']]);
    expect(dropTool(w, 'theory', 1, 'right')).toBe(2);
    expect([w.layout, visible(w)]).toEqual(['HQ', ['metro', 'piano', 'theory']]);
    expect(dropTool(w, 'audio', 0, 'top')).toBe(0);
    expect([w.layout, visible(w)]).toEqual(['SQ', ['audio', 'metro', 'piano', 'theory']]);
    // уже на экране — окна меняются местами
    expect(dropTool(w, 'theory', 0, 'center')).toBe(0);
    expect(visible(w)).toEqual(['theory', 'metro', 'piano', 'audio']);
    // в четверть — замена
    expect(dropTool(w, 'notes', 2, 'top')).toBe(2);
    expect(visible(w)).toEqual(['theory', 'metro', 'notes', 'audio']);
  });
  it('закрыть окно и добавить окно', () => {
    const w = ws('HQ', ['metro', 'piano', 'theory', 'audio', 'notes']);
    closePane(w, 1);
    expect([w.layout, visible(w)]).toEqual(['HH', ['metro', 'theory']]);
    closePane(w, 0);
    expect([w.layout, visible(w)]).toEqual(['F', ['theory']]);
    expect(addPane(w, 0, 'bottom')).toBe(1);
    expect(visible(w)).toEqual(['theory', 'metro']); // следующее окно — первый инструмент, которого нет на экране
    const full = ws('QQ', ['a', 'b', 'c', 'd']);
    expect(addPane(full, 0, 'bottom')).toBe(null);
    expect(halves(ws('QH')).bot).toEqual(['piano']);
  });
  it('инструмент в окно в фокусе; смена раскладки сбрасывает фокус', () => {
    const w = ws('HH', ALL.slice(), 1);
    expect(assign(w, 'metro')).toBe(1);
    expect(visible(w)).toEqual(['tuner', 'metro']);
    expect(assign(w, 'metro')).toBe(-1);
    setLayout(w, 'F', ['notes']);
    expect([w.focus, w.panes[0], w.panes.length]).toEqual([0, 'notes', 7]);
  });
});

import { getWS as getWS2 } from '../src/core/workspace.js';
describe('раскладка на компьютере', () => {
  it('первая свободная практика — два окна: метроном и табы', () => {
    const w = getWS2({}, null, { desk: true });
    expect(w.layout).toBe('HH');
    expect(w.panes.slice(0, 2)).toEqual(['metro', 'notes']);
  });
  it('сохранённая раскладка не меняется', () => {
    const d = { wsMap: { free: { layout: 'F', panes: ['tuner'], focus: 0 } } };
    expect(getWS2(d, null, { desk: true }).layout).toBe('F');
  });
});
