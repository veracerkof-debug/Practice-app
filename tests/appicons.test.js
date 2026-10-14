import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { APP_ICON_IDS, appIconSVG, DEFAULT_ICON } from '../src/ui/appicons.js';

describe('иконка приложения', () => {
  it('каждая рисуется; по умолчанию — Мелета', () => {
    expect(DEFAULT_ICON).toBe('melete');
    APP_ICON_IDS.forEach((id) => expect(appIconSVG(id)).toMatch(/^<svg class="appic"[\s\S]*<\/svg>$/));
  });
  it('у каждой есть alias в манифесте и картинки Android', () => {
    const man = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
    const java = readFileSync('android/app/src/main/java/app/practice/beta/IconPlugin.java', 'utf8');
    APP_ICON_IDS.forEach((id) => {
      expect(man).toContain('.Icon' + id[0].toUpperCase() + id.slice(1) + '"');
      expect(java).toContain('"' + id + '"');
      if (id !== 'classic') expect(existsSync('android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_' + id + '_fg.png')).toBe(true);
    });
    // значок в списке приложений — только у alias (иначе было бы два)
    expect((man.match(/category\.LAUNCHER/g) || []).length).toBe(APP_ICON_IDS.length);
    expect((man.match(/android:enabled="true"/g) || []).length).toBe(1);
  });
});
