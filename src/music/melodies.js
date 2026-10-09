// Мелодии для игры по подсказке (глайдер, терменвокс): общественное достояние — народные и классика, слова
// старше ста лет. Нота — [MIDI, длительность в долях, слог]. Пустой слог — распев того же слога.
// Только данные и расчёты, без DOM и звука.

const N = (s) => s.trim().split(/\s+/).map((x) => {
  const [m, d, w = ''] = x.split(':');
  return [+m, +d, w.replace(/_/g, ' ')];
});

export const MELODIES = [
  { id: 'ode', bpm: 100, name: { ru: 'Ода к радости', uz: 'Shodlik qasidasi', en: 'Ode to Joy' }, by: 'L. van Beethoven · F. Schiller',
    notes: N(`64:1:Freu 64:1:de 65:1:schö 67:1:ner 67:1:Göt 65:1:ter 64:1:fun 62:1:ken 60:1:Toch 60:1:ter 62:1:aus 64:1:E 64:1.5:ly 62:0.5:si 62:2:um
      64:1:Wir 64:1:be 65:1:tre 67:1:ten 67:1:feu 65:1:er 64:1:trun 62:1:ken 60:1:Himm 60:1:li 62:1:sche 64:1:dein 62:1.5:Hei 60:0.5:lig 60:2:tum`) },
  { id: 'twinkle', bpm: 96, name: { ru: 'Мерцай, звёздочка', uz: 'Yulduzcha', en: 'Twinkle, Twinkle, Little Star' }, by: 'Folk · J. Taylor',
    notes: N(`60:1:Twin 60:1:kle 67:1:twin 67:1:kle 69:1:lit 69:1:tle 67:2:star 65:1:how 65:1:I 64:1:won 64:1:der 62:1:what 62:1:you 60:2:are
      67:1:Up 67:1:a 65:1:bove 65:1:the 64:1:world 64:1:so 62:2:high 67:1:like 67:1:a 65:1:dia 65:1:mond 64:1:in 64:1:the 62:2:sky
      60:1:Twin 60:1:kle 67:1:twin 67:1:kle 69:1:lit 69:1:tle 67:2:star 65:1:how 65:1:I 64:1:won 64:1:der 62:1:what 62:1:you 60:2:are`) },
  { id: 'jacques', bpm: 108, name: { ru: 'Братец Яков', uz: 'Jak aka', en: 'Frère Jacques' }, by: 'Folk',
    notes: N(`60:1:Frè 62:1:re 64:1:Jac 60:1:ques 60:1:frè 62:1:re 64:1:Jac 60:1:ques 64:1:dor 65:1:mez 67:2:vous 64:1:dor 65:1:mez 67:2:vous
      67:0.5:son 69:0.5:nez 67:0.5:les 65:0.5:ma 64:1:ti 60:1:nes 67:0.5:son 69:0.5:nez 67:0.5:les 65:0.5:ma 64:1:ti 60:1:nes
      60:1:din 55:1:dan 60:2:don 60:1:din 55:1:dan 60:2:don`) },
  { id: 'jingle', bpm: 120, name: { ru: 'Бубенцы', uz: "Qo'ng'iroqchalar", en: 'Jingle Bells' }, by: 'J. Pierpont (1857)',
    notes: N(`64:1:Jin 64:1:gle 64:2:bells 64:1:jin 64:1:gle 64:2:bells 64:1:jin 67:1:gle 60:1.5:all 62:0.5:the 64:4:way
      65:1:Oh 65:1:what 65:1.5:fun 65:0.5:it 65:1:is 64:1:to 64:1:ride 64:0.5:in 64:0.5:a 64:1:one 62:1:horse 62:1:o 64:1:pen 62:2:sleigh 67:2:hey!`) },
  { id: 'grace', bpm: 84, name: { ru: 'О благодать', uz: 'Ajib inoyat', en: 'Amazing Grace' }, by: 'J. Newton (1779)',
    notes: N(`62:1:A 67:2:ma 71:0.5:zing 67:0.5 71:2:grace 69:1:how 67:2:sweet 64:1:the 62:2:sound 62:1:that 67:2:saved 71:0.5:a 67:0.5 71:2:wretch 69:1:like 74:5:me
      71:1:I 74:1.5:once 71:0.5:was 74:0.5 67:0.5 71:2:lost 69:1:but 67:2:now 64:1:am 62:2:found 62:1:was 67:2:blind 71:0.5:but 67:0.5 71:2:now 69:1:I 67:3:see`) },
  { id: 'green', bpm: 100, name: { ru: 'Зелёные рукава', uz: "Yashil yenglar", en: 'Greensleeves' }, by: 'Folk (XVI)',
    notes: N(`69:1:A 72:2:las 74:1:my 76:1.5:love 77:0.5 76:1:you 74:2:do 71:1:me 67:1.5:wrong 69:0.5 71:1:to 72:2:cast 69:1:me 69:1.5:off 68:0.5 69:1:dis 71:2:cour 68:1:teous 64:2:ly
      69:1:For 72:2:I 74:1:have 76:1.5:loved 77:0.5 76:1:you 74:2:well 71:1:and 67:1.5:long 69:0.5 71:1:de 72:1.5:light 71:0.5:ing 69:1:in 68:1.5:your 66:0.5:com 68:1:pa 69:3:ny`) },
];
export const melodyById = (id) => MELODIES.find((m) => m.id === id) || null;
export const melodyName = (mel, lang) => mel.name[lang] || mel.name.en;

// Крайние ноты мелодии
export function melodySpan(mel) {
  const ms = mel.notes.map((n) => n[0]);
  return { lo: Math.min(...ms), hi: Math.max(...ms) };
}

// Диапазон поверхности под мелодию: самая узкая ширина из widths, в которую мелодия входит с запасом в полтона,
// и нижняя нота так, чтобы мелодия была посередине (lo — по возможности «до»)
export function fitRange(mel, widths, cur = null) {
  const { lo, hi } = melodySpan(mel), span = hi - lo;
  if (cur && lo >= cur.lo && hi <= cur.lo + cur.width) return cur; // уже входит — ничего не трогаем
  const width = widths.find((w) => w >= span + 2) || widths[widths.length - 1];
  let from = Math.round((lo + hi) / 2 - width / 2);
  const c = from - (((from % 12) + 12) % 12); // ближайшее «до» снизу
  if (c <= lo - 1 && c + width >= hi + 1) from = c;
  return { lo: Math.max(0, Math.min(from, lo - 1)), width };
}

// Ведущий по мелодии: кормят текущей высотой (MIDI с дробью или null — тишина), он отвечает, попал ли играющий
// в нужную ноту. Нота засчитывается, когда высота держится в пределах tol полутона hold мс. Повтор той же ноты —
// после нового звукоизвлечения (onset), после ухода с ноты или когда нота удержана ещё repeat мс.
export function createFollower(mel, { tol = 0.45, hold = 90, repeat = 380 } = {}) {
  let i = 0, since = null, armed = true, hitAt = 0;
  const note = () => mel.notes[i];
  return {
    get index() { return i; },
    get note() { return note(); },
    reset(k = 0) { i = k; since = null; armed = true; },
    // → 'hit' (нота взята, следующая — новая цель), 'done' (мелодия сыграна, начинается сначала) или null
    feed(m, t, onset = false) {
      if (onset) armed = true;
      if (m == null) { since = null; armed = true; return null; }
      const target = note()[0], on = Math.abs(m - target) <= tol;
      if (!on) { since = null; armed = true; return null; }
      if (!armed && t - hitAt < repeat) return null;
      if (since == null) since = t;
      if (t - since < hold) return null;
      i++; since = null; hitAt = t;
      armed = false; // та же высота дальше — не новая нота, пока не будет нового звукоизвлечения
      if (i >= mel.notes.length) { i = 0; return 'done'; }
      return 'hit';
    },
  };
}

// Окно нот вокруг текущей: одна сыгранная, текущая и несколько следующих — [{ m, w, k: 'past' | 'cur' | 'next' }]
export function melodyWindow(mel, i, ahead = 4) {
  const out = [];
  for (let k = Math.max(0, i - 1); k <= Math.min(mel.notes.length - 1, i + ahead); k++) {
    const [m, , w] = mel.notes[k];
    out.push({ m, w, k: k < i ? 'past' : k === i ? 'cur' : 'next' });
  }
  return out;
}
