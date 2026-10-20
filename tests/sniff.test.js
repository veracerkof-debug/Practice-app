import { describe, it, expect } from 'vitest';
import { sniffScore } from '../src/modules/notes/sniff.js';
const b = (s) => new TextEncoder().encode(s);
describe('формат табов по содержимому', () => {
  it('узнаёт PDF, Guitar Pro, MusicXML, zip-форматы, текст', () => {
    expect(sniffScore(b('%PDF-1.4 ...'))).toBe('pdf');
    expect(sniffScore(new Uint8Array([20, ...b('FICHIER GUITAR PRO v5.10'), 0, 0, 0, 0, 0]))).toBe('gp345');
    expect(sniffScore(b('BCFZ....'))).toBe('gpx');
    expect(sniffScore(b('PK\x03\x04....Content/score.gpif'))).toBe('gp7');
    expect(sniffScore(b('PK\x03\x04....META-INF/container.xml'))).toBe('mxl');
    expect(sniffScore(b('PK\x03\x04....'), 'x.gp')).toBe('gp7');
    expect(sniffScore(b('<?xml version="1.0"?><score-partwise/>'))).toBe('musicxml');
    expect(sniffScore(b('e|--3--5--|\nB|--0-----|\nG|--------|\nD|--------|\nA|--------|\nE|--------|'), 'song.gp5')).toBe('ascii');
    expect(sniffScore(b('Am F C G\nстрочка песни'))).toBe('text');
    expect(sniffScore(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]))).toBe(null);
  });
});
