// Textbook: English text (structure — see ru.js)
const lab = (id) => '{{lab:' + id + '}}';
const tip = (t) => '<aside class="btip"><b>At the instrument</b>' + t + '</aside>';
const key = (t) => '<aside class="bkey"><b>Key point</b>' + t + '</aside>';

export default {
  S: {
    'bk.title': 'Textbook', 'bk.lead': 'Harmony and jazz, with examples that sound. Terms in the text are links: a tap opens the definition.',
    'bk.part0': 'Foundations', 'bk.part1': 'Jazz harmony', 'bk.part2': 'Playing', 'bk.part3': 'Practice and reference',
    'bk.toc': 'Contents', 'bk.ch': 'Chapter {n}', 'bk.prev': 'Back', 'bk.next': 'Next', 'bk.read': 'Read chapter', 'bk.terms': 'Terms',
    'bk.inBook': 'In the textbook: {t}', 'bk.find': 'Term', 'bk.none': 'Nothing found', 'bk.of': 'of {n}', 'bk.kb': 'Keyboard', 'bk.circle': 'Circle of fifths', 'bk.signs': 'accidentals',
    'ui.root': 'Root', 'ui.interval': 'Interval', 'ui.chord': 'Chord', 'ui.chords': 'Chords', 'ui.scale': 'Scale', 'ui.key': 'Key', 'ui.step': 'Step',
    'ui.example': 'Example', 'ui.voicing': 'Voicing', 'ui.rhythm': 'Rhythm', 'ui.form': 'Form', 'ui.pattern': 'Pattern', 'ui.group': 'Group', 'ui.search': 'Search', 'ui.play': 'Play',
    'sig.none': 'no accidentals', 'sig.gflat': '(or 6♭: G♭)',
    'iv.abbr': 'Short', 'iv.semis': 'Semitones', 'iv.semisShort': 'St', 'iv.sound': 'Sound', 'iv.inv': 'Inversion', 'iv.from': 'From {n}', 'iv.mel': 'Melodic', 'iv.harm': 'Harmonic',
    'ch.inv0': 'root position', 'ch.inv1': '1st inv.', 'ch.inv2': '2nd inv.', 'ch.inv3': '3rd inv.',
    'ch.invLong0': 'root position', 'ch.invLong1': 'first inversion', 'ch.invLong2': 'second inversion', 'ch.invLong3': 'third inversion',
    'ch.name': 'Name', 'ch.degs': 'Degrees', 'ch.notes': 'Notes', 'ch.alt': 'Also written', 'ch.bass': 'Bass', 'ch.block': 'Block', 'ch.arp': 'Arpeggio',
    'ust.lh': 'left hand: 1 · 3 · ♭7 of the dominant {c}', 'ust.bad': 'This triad contains the 11th or the major 7th — over a dominant with a 3rd they clash with the chord. Such structures are usually avoided.', 'ust.ok': 'Resulting tensions: {t}.',
    'sc.kb': 'Keys', 'sc.fret': 'Fretboard', 'sc.staff': 'Notes', 'sc.up': 'Up', 'sc.down': 'Down', 'sc.over': 'Over the chord', 'sc.harm': 'Chords of the scale',
    'sc.char': 'Characteristic degree — <b>{d}</b>', 'sc.chord': '; main chord — <b>{c}</b>', 'sc.avoid': '; avoid notes over the chord — {d}',
    'br.hint': 'brighter ↑ · darker ↓ — each step lowers one degree',
    'dim.text': 'One and the same eight-note scale: <b>whole–half from {wh}</b> and <b>half–whole from {hw}</b>. It fits °7 on {wh} and 7♭9 dominants on {hw}.',
    'fn.T': 'Tonic', 'fn.S': 'Subdominant', 'fn.D': 'Dominant',
    'key.major': 'Major', 'key.minor': 'Minor', 'key.natural': 'Natural minor', 'key.harmonic': 'Harmonic minor', 'key.melodic': 'Melodic minor', 'key.cad': 'Cadences',
    'key.majOf': '{k} major', 'key.minOf': '{k} minor', 'key.sig': 'Signature', 'key.rel': 'Relative', 'key.near': 'Neighbours',
    'cad.auth': 'V–I (authentic)', 'cad.plag': 'IV–I (plagal)', 'cad.dec': 'V–vi (deceptive)', 'cad.iivi': 'ii–V–I', 'cad.full': 'I–IV–V–I',
    'circ.note': 'Clockwise is up a fifth (more sharps), counter-clockwise is down a fifth — the way almost every jazz progression moves. Tap a sector to choose a key.',
    'gd.dom': 'Dominants', 'gd.min': 'Minor', 'gd.maj': 'Major', 'gd.note': 'The 3rd of one chord becomes the 7th of the next (or nearly — a half step lower). The two lines swap places at every step while the hand barely moves.',
    'turn.t1': 'I – vi – ii – V', 'turn.t2': 'iii – vi – ii – V', 'turn.t3': 'I – VI7alt – ii – V', 'turn.t4': 'iiiø – VI7alt – ii – V', 'turn.t5': 'I – ♯I°7 – ii – V',
    'turn.t6': 'All dominants: I – VI7 – II7 – V7', 'turn.t7': 'Tritone substitutes: I – ♭III7 – ♭VI7 – ♭II7', 'turn.t8': 'Major sevenths: I – ♭III – ♭VI – ♭II', 'turn.t9': 'Minor: i – ♭viø – iiø – V7alt',
    'step.-2': 'down a whole step', 'step.+2': 'up a whole step', 'step.-1': 'down a half step', 'step.+1': 'up a half step', 'step.-3': 'down a minor 3rd', 'step.+3': 'up a minor 3rd', 'step.-4': 'down a major 3rd', 'step.+4': 'up a major 3rd',
    'chain.note': 'The dominant does not resolve to the expected tonic: the next ii already belongs to another key. The ear hears a series of short hints of new keys.',
    'tbl.hint': 'around the circle of fifths; tap to hear',
    'ana.a1': 'Secondary dominants', 'ana.a2': 'Chain of ii–Vs', 'ana.a3': 'Tritone substitutes', 'ana.a4': 'Minor key', 'ana.a5': 'Passing diminished', 'ana.a6': 'Jazz blues', 'ana.a7': 'Backdoor and borrowing',
    'ana.backdoor': 'backdoor', 'ana.none': 'No chords', 'ana.borrow': '* — a chord outside the key: borrowing or modulation.',
    'ana.lgS': 'dominant → down a fifth', 'ana.lgD': '→ down a half step (tritone substitute)', 'ana.lgB': 'ii–V pair', 'ana.hint': 'chords separated by spaces, bars by “|”',
    'vt.shellA': 'Shell 1–3–7', 'vt.shellB': 'Shell 1–7–3', 'vt.guide': 'Guide tones 3 and 7', 'vt.three': 'Rootless, 3 notes', 'vt.A': 'Rootless, type A', 'vt.B': 'Rootless, type B',
    'vt.drop2': 'Drop 2', 'vt.drop24': 'Drop 2-4', 'vt.quart': 'Quartal (So What)', 'vt.ust': 'Upper structure',
    'vc.qual': 'Qualities on one root', 'vc.ab': 'A and B alternate — voices move by step', 'vc.type': 'type {t}', 'vc.play': 'Progression',
    'mi.hint': 'chords of the parallel minor and neighbouring modes', 'mi.note': 'A tap plays I → chord → I: the borrowed colour darkens and returns.',
    'tt.text': '<b>{a}</b> and <b>{b}</b> share the tritone {x}–{y}: the 3rd of one is the 7th of the other (enharmonically). Both pull towards <b>{t}</b>; {b} gets there a half step from above.',
    'tt.note': 'The substitute’s scale — Lydian dominant on {a} — contains the same notes as the altered scale on {b}.',
    'rh.before': 'Before', 'rh.after': 'After',
    'rh.r1': 'Tritone substitute', 'rh.r1n': 'The dominant is replaced by the dominant a tritone away: the bass walks down in half steps.',
    'rh.r2': 'Related ii of the substitute', 'rh.r2n': 'The tritone substitute gets its own ii: two ii–Vs a half step apart.',
    'rh.r3': 'Secondary dominants', 'rh.r3n': 'vi and ii became dominants: each chord pulls to the next.',
    'rh.r4': 'Turnaround with substitutes', 'rh.r4n': 'Roots move by half steps and fifths — the turnaround sounds fresh.',
    'rh.r5': 'Passing diminished', 'rh.r5n': '°7 between I and ii fills the bass step with a half step.',
    'rh.r6': 'Auxiliary °7', 'rh.r6n': 'A long tonic comes alive: °7 on the same root and back.',
    'rh.r7': 'Minor IV', 'rh.r7n': 'Borrowed from minor: IV darkens before returning to I.',
    'rh.r8': 'Backdoor', 'rh.r8n': 'Instead of V–I — iv–♭VII7–I: a soft arrival “through the back door”.',
    'rh.r9': 'Inserted ii', 'rh.r9n': 'A long dominant is split into ii–V.',
    'rh.r10': 'Side-step', 'rh.r10n': 'A half-step shift and back — a brief step outside the key.',
    'rh.r11': 'Chromatic line', 'rh.r11n': 'Inside a minor chord one voice moves by half steps: 1 → 7 → ♭7 → 6.',
    'rh.r12': 'Quality change', 'rh.r12n': 'Every chord of the turnaround became maj7 — same bass, new colour.',
    'ds.text': '{d} is four notes a minor third apart. Over any of {list} it sounds like a rootless dominant: 3rd, 5th, 7th and ♭9. That is why °7 resolves to four different tonics, and four dominants share one diminished scale.',
    'ct.text': 'Instead of ii–V–I — a path through three tonics that divide the octave into major thirds: {path}. Each one has its own dominant before it.',
    'v7.v1': 'down a fifth — the basic resolution', 'v7.v2': 'to a minor chord (V7/ii, V7/vi …)', 'v7.v3': 'down a half step — like a tritone substitute', 'v7.v4': 'up a whole step — deceptive (V–vi)',
    'v7.v5': 'up a whole step — like the backdoor ♭VII7–I', 'v7.v6': 'down a major 3rd — a sudden brightness', 'v7.v7': 'up a minor 3rd', 'v7.v8': 'up a major 3rd (Coltrane step)', 'v7.v9': 'down a whole step', 'v7.v10': 'up a fifth',
    'cp.c1': 'Charleston', 'cp.c2': 'Reverse Charleston', 'cp.c3': 'Anticipation (4&)', 'cp.c4': 'Two and four', 'cp.c5': 'Offbeat eighths', 'cp.c6': 'On one and three', 'cp.c7': 'Call and answer', 'cp.c8': 'Your own',
    'cp.hint': 'Two bars of the grid repeat: ii–V, then I. Tap a cell to hit the chord on that eighth; eighths swing, the bass walks.', 'cp.play': 'Play 4 bars',
    'av.notes': 'Avoid notes', 'av.alt': 'Option',
    'av.r1.0': 'maj7', 'av.r1.1': 'Ionian', 'av.r1.2': '4 (11) — a half step above the 3rd', 'av.r1.3': 'Lydian ♯4 removes the clash',
    'av.r2.0': 'm7 (ii)', 'av.r2.1': 'Dorian', 'av.r2.2': 'none; 6 — careful (tritone with ♭3)', 'av.r2.3': 'on a tonic m7/m6 — free',
    'av.r3.0': 'm7 (iii)', 'av.r3.1': 'Phrygian', 'av.r3.2': '♭2 and ♭6', 'av.r3.3': '—',
    'av.r4.0': 'm7 (vi)', 'av.r4.1': 'Aeolian', 'av.r4.2': '♭6 — a half step above the 5th', 'av.r4.3': 'Dorian, if the harmony allows',
    'av.r5.0': '7', 'av.r5.1': 'Mixolydian', 'av.r5.2': '4 (11) — against the 3rd', 'av.r5.3': '7sus4 — 4 instead of 3; Lydian dominant — ♯11',
    'av.r6.0': 'm7♭5', 'av.r6.1': 'Locrian', 'av.r6.2': '♭2 (♭9)', 'av.r6.3': 'Locrian ♮2 — 9 instead of ♭9',
    'av.r7.0': '7alt', 'av.r7.1': 'Altered', 'av.r7.2': 'none — every alteration is available', 'av.r7.3': '—',
    'av.r8.0': '°7', 'av.r8.1': 'Diminished whole–half', 'av.r8.2': 'none: tensions are a whole step above each chord tone', 'av.r8.3': '—',
    'tn.head': 'Available tensions',
    'tn.r1.0': 'maj7 / 6', 'tn.r1.1': '9, ♯11, 13', 'tn.r2.0': 'm7', 'tn.r2.1': '9, 11, 13 (as tonic); 9 and 11 (as ii)', 'tn.r3.0': 'm6 / m(maj7)', 'tn.r3.1': '9, 11',
    'tn.r4.0': '7', 'tn.r4.1': '9, 13 — natural; ♭9, ♯9, ♯11, ♭13 — altered', 'tn.r5.0': '7sus4', 'tn.r5.1': '9, 13, ♭9 (Phrygian colour)',
    'tn.r6.0': 'm7♭5', 'tn.r6.1': '9 (if the melody allows), 11, ♭13', 'tn.r7.0': '°7', 'tn.r7.1': 'a whole step above each chord tone: 9, 11, ♭13, maj7',
    'fm.b3': 'Blues — three chords', 'fm.bq': 'Blues — quick IV', 'fm.bj': 'Jazz blues', 'fm.bb': 'Bebop blues (descending ii–Vs)', 'fm.bm': 'Minor blues', 'fm.rc': 'Rhythm changes, A section', 'fm.rb': 'Rhythm changes, bridge',
    'ab.aaba': 'AABA — 32 bars (song form)', 'ab.aba': 'ABA', 'ab.abac': 'ABAC — 32 bars', 'ab.ab': 'AB — two-part', 'ab.blues': 'Blues — 12 bars', 'ab.bars': '{n} bars', 'ab.bridge': 'bridge',
    'cs.hint': 'e.g. Dm7, G7♭9, Bø, Fmaj7♯11, E7alt', 'cs.bad': 'Chord not recognised.', 'cs.note': 'Dark — chord tones, light — scale tensions', 'cs.avoid': '; careful with {d} on a strong beat',
    'pt.src': 'Source: {s} on {r}. Pentatonics that lie entirely inside it:', 'pt.name': '{a} major = {b} minor', 'pt.degs': 'degrees over {c}: {d}',
    'en.t1': 'root', 'en.t3': '3rd', 'en.t5': '5th', 'en.t7': '7th',
    'en.e1': 'Chromatic from below', 'en.e2': 'Diatonic from above', 'en.e3': 'Above (diat.) and below (chrom.)', 'en.e4': 'Below (chrom.) and above (diat.)', 'en.e5': 'Chromatic above and below',
    'en.e6': 'Two chromatic from below', 'en.e7': 'Above diat., chromatic descent', 'en.e8': 'Surround: above, below, chromatic below',
    'ex.t.ivname': 'Interval by notes', 'ex.t.ivear': 'Interval by ear', 'ex.t.chear': 'Seventh chord by ear', 'ex.t.spell': 'Chord tones', 'ex.t.iivi': 'ii–V–I in a key',
    'ex.t.subv': 'Tritone substitute', 'ex.t.rn': 'Chord degree', 'ex.t.scale': 'Scale for a chord', 'ex.t.sig': 'Key signature', 'ex.t.func': 'Chord function',
    'ex.q.ivname': 'Which interval is this?', 'ex.q.ivear': 'What did you hear?', 'ex.q.chear': 'Which seventh chord?', 'ex.q.spell': 'Which notes make {c}?', 'ex.q.iivi': 'ii–V–I in {k} major?', 'ex.q.iivim': 'ii–V–i in {k} minor?',
    'ex.q.subv': 'Tritone substitute for {c}?', 'ex.q.rn': 'Which degree is {c} in {k} major?', 'ex.q.scale': 'Main scale for {c}?', 'ex.q.sig': 'How many accidentals in {k} major?', 'ex.q.func': '{c} in {k} major — which function?',
    'ex.again': 'Listen again', 'ex.next': 'Next', 'ex.pick': 'Select at least one type.', 'ex.score': 'This round: {ok} of {n}',
    'pl.harm': 'Harmony', 'pl.impro': 'Improvisation', 'pl.ear': 'Ear', 'pl.rep': 'Repertoire', 'pl.min': '{n} min',
    'pl.harm0': 'ii–V–I voicings (A/B) in three keys', 'pl.harm1': 'Guide tones around the circle', 'pl.harm2': 'A tune: chords left hand, melody right hand', 'pl.harm3': 'Ear: seventh chords',
    'pl.impro0': 'Scales for the chords of a tune, two octaves', 'pl.impro1': 'Approaches to the 3rds', 'pl.impro2': 'Improvising on ii–V–I: only 3 and 7 on strong beats', 'pl.impro3': 'Learning a phrase from a recording',
    'pl.ear0': 'Intervals and chords by ear', 'pl.ear1': 'Finding the bass and harmony of a tune', 'pl.ear2': 'Singing guide tones over chords',
    'pl.rep0': 'New tune: form and analysis', 'pl.rep1': 'Melody by heart in every section', 'pl.rep2': 'Comping with different rhythms', 'pl.rep3': 'Revisiting an old tune',
    'pl.keys': 'Keys for the week, around the circle: {list}. Sunday — free playing.', 'pl.d0': 'Mon', 'pl.d1': 'Tue', 'pl.d2': 'Wed', 'pl.d3': 'Thu', 'pl.d4': 'Fri', 'pl.d5': 'Sat',
    'fam.all': 'All', 'fam.maj': 'Major', 'fam.min': 'Minor', 'fam.dom': 'Dominants', 'fam.hdim': 'ø and °', 'fam.sus': 'sus', 'fam.aug': '+', 'rf.sym': 'Symbol',
  },
  IV: {
    1: ['Perfect unison', 'P1'], b2: ['Minor second', 'm2 · ♭2'], 2: ['Major second', 'M2 · 2'], '#2': ['Augmented second', 'A2 · ♯2'], b3: ['Minor third', 'm3 · ♭3'], 3: ['Major third', 'M3 · 3'],
    4: ['Perfect fourth', 'P4 · 4'], '#4': ['Augmented fourth (tritone)', 'A4 · ♯4'], b5: ['Diminished fifth (tritone)', 'd5 · ♭5'], 5: ['Perfect fifth', 'P5 · 5'], '#5': ['Augmented fifth', 'A5 · ♯5'],
    b6: ['Minor sixth', 'm6 · ♭6'], 6: ['Major sixth', 'M6 · 6'], bb7: ['Diminished seventh', 'd7 · 𝄫7'], b7: ['Minor seventh', 'm7 · ♭7'], 7: ['Major seventh', 'M7 · 7'], 8: ['Perfect octave', 'P8 · 8'],
    b9: ['Minor ninth', '♭9'], 9: ['Major ninth', '9'], '#9': ['Augmented ninth', '♯9'], 11: ['Perfect eleventh', '11'], '#11': ['Augmented eleventh', '♯11'], b13: ['Minor thirteenth', '♭13'], 13: ['Major thirteenth', '13'],
  },
  CONS: { perf: 'perfect consonance', imperf: 'imperfect consonance', ctx: 'depends on context', diss: 'dissonance' },
  CHN: {
    '': 'Major triad', m: 'Minor triad', '+': 'Augmented triad', '°': 'Diminished triad', sus4: 'Suspended (sus)', 6: 'Major sixth', '6/9': 'Six-nine',
    m6: 'Minor sixth', maj7: 'Major seventh', 'm(maj7)': 'Minor-major seventh', m7: 'Minor seventh', 'm7♭5': 'Half-diminished', '°7': 'Diminished seventh',
    7: 'Dominant seventh', '7sus4': 'Dominant sus', 'maj7♯5': 'Major seventh ♯5', '7♯5': 'Dominant ♯5', maj9: 'Major ninth', 'maj7♯11': 'Lydian major',
    maj13: 'Major thirteenth', m9: 'Minor ninth', m11: 'Minor eleventh', 'm6/9': 'Minor six-nine', 'm9♭5': 'Half-diminished ninth', 9: 'Dominant ninth',
    13: 'Dominant thirteenth', '7♭9': 'Dominant ♭9', '7♯9': 'Dominant ♯9', '13♭9': 'Thirteenth ♭9', '7♯11': 'Lydian dominant',
    '7♭13': 'Dominant ♭13', '7alt': 'Altered dominant', '9sus4': 'Ninth sus', '7sus4♭9': 'Phrygian sus',
  },
  SCN: {
    ionian: 'Ionian (major)', dorian: 'Dorian', phrygian: 'Phrygian', lydian: 'Lydian', mixolydian: 'Mixolydian', aeolian: 'Aeolian (natural minor)', locrian: 'Locrian',
    melmin: 'Melodic minor (jazz)', dorb2: 'Dorian ♭2', lydaug: 'Lydian augmented', lyddom: 'Lydian dominant', mixob13: 'Mixolydian ♭13', locnat2: 'Locrian ♮2', altered: 'Altered (super-Locrian)',
    harmmin: 'Harmonic minor', locnat6: 'Locrian ♮6', ion5: 'Ionian ♯5', dor4: 'Dorian ♯4', phrdom: 'Phrygian dominant (Mixolydian ♭9 ♭13)', lyd2: 'Lydian ♯2', ultraloc: 'Ultra-Locrian',
    dimwh: 'Diminished whole–half', dimhw: 'Diminished half–whole', whole: 'Whole tone',
    pentmaj: 'Major pentatonic', pentmin: 'Minor pentatonic', bluesmin: 'Blues (minor)', bluesmaj: 'Major blues', kumoi: 'Kumoi', insen: 'In-sen', hirajoshi: 'Hirajoshi',
    bebopdom: 'Bebop dominant', bebopmaj: 'Bebop major', bebopdor: 'Bebop Dorian',
    dblharm: 'Double harmonic', hungmin: 'Hungarian minor', hungmaj: 'Hungarian major', gypsy: 'Gypsy', neapmin: 'Neapolitan minor', neapmaj: 'Neapolitan major', enigma: 'Enigmatic',
    persian: 'Persian', oriental: 'Oriental', arabian: 'Arabian', lydmin: 'Lydian minor', leadwt: 'Leading whole tone', spanish8: 'Spanish eight-note', balinese: 'Balinese (pelog)',
    iwato: 'Iwato', egyptian: 'Egyptian', chinese: 'Chinese', mongol: 'Mongolian',
  },
  SG: { maj: 'Modes of major', mel: 'Modes of melodic minor', harm: 'Modes of harmonic minor', sym: 'Symmetric', pent: 'Pentatonics and blues', bebop: 'Bebop', world: 'World scales' },
  TERMS: {
    interval: ['Interval', 'the distance between two notes: number of letters (name) and semitones (quality).', 'iv'],
    tritone: ['Tritone', 'an interval of three whole tones (6 semitones): halves the octave; the “engine” of the dominant.', 'iv'],
    inversion: ['Inversion', 'an interval or chord whose lowest note is moved up an octave.', 'chords'],
    consonance: ['Consonance and dissonance', 'stable and tense interval sounds; in jazz dissonance is colour.', 'iv'],
    triad: ['Triad', 'a three-note chord in thirds: major, minor, diminished, augmented.', 'chords'],
    seventh: ['Seventh chord', 'a four-note chord in thirds; the five basic ones are maj7, m7, 7, m7♭5, °7.', 'chords'],
    sus: ['Sus chord', 'a chord whose 3rd is replaced by the 4th (sus4) or 2nd (sus2).', 'chords'],
    tension: ['Tension', 'a note above the 7th — 9, 11, 13 and their alterations; gives the chord colour.', 'chords'],
    altered: ['Altered dominant', 'a dominant with ♭9/♯9 and ♭5/♯5 (♭13): the strongest pull to resolve.', 'chords'],
    ust: ['Upper structure', 'a triad over the dominant’s tritone that adds three tensions at once.', 'chords'],
    slash: ['Slash chord', 'a chord over a given bass note, written with a slash (C/E).', 'chords'],
    poly: ['Polychord', 'two chords at once, one above the other (written as a fraction).', 'chords'],
    scale: ['Scale', 'a set of notes for a melody over a chord; in jazz each chord has its scale.', 'scales'],
    mode: ['Mode', 'a scale started from another degree of the same collection: Dorian, Lydian and so on.', 'scales'],
    chartone: ['Characteristic degree', 'the note that identifies a mode (Dorian — 6, Lydian — ♯4…).', 'scales'],
    melmin: ['Melodic minor', 'minor with a major 6th and 7th; in jazz the same up and down.', 'scales'],
    harmmin: ['Harmonic minor', 'minor with a major 7th; its 5th mode serves the dominant in minor.', 'scales'],
    dimscale: ['Diminished scale', 'an eight-note whole–half scale; only three different ones exist.', 'scales'],
    wholetone: ['Whole-tone scale', 'six notes a whole step apart; fits 7♯5.', 'scales'],
    pentatonic: ['Pentatonic', 'a five-note scale without half steps (major and minor).', 'scales'],
    blues: ['Blues scale', 'the minor pentatonic with ♭5.', 'scales'],
    bebop: ['Bebop scale', 'a seven-note scale with one added chromatic note: chord tones fall on strong beats.', 'scales'],
    roman: ['Roman numerals', 'writing a chord as a degree of the key: ii–V–I in any key.', 'key'],
    function: ['Function', 'the role of a chord: tonic (rest), subdominant (motion), dominant (tension).', 'key'],
    tonic: ['Tonic', 'the chord of rest: I (and its substitutes iii, vi).', 'key'],
    dominant: ['Dominant', 'the chord of tension: V7, pulls to the tonic.', 'key'],
    cadence: ['Cadence', 'a harmonic formula that ends a phrase.', 'key'],
    circle: ['Circle of fifths', 'keys arranged a fifth apart; jazz roots usually move down by fifths.', 'key'],
    iivi: ['ii–V–I', 'the main jazz progression: subdominant → dominant → tonic.', 'iivi'],
    guide: ['Guide tones', '3 and 7 — the notes that define a chord and lead to the next one.', 'iivi'],
    turnaround: ['Turnaround', 'chords at the end of a section leading back to its start.', 'iivi'],
    secdom: ['Secondary dominant', 'V7 of any chord in the key except the tonic: V7/ii, V7/V…', 'ana'],
    backcycle: ['Backcycling', 'a chain of dominants worked backwards from the goal: each is the dominant of the next.', 'ana'],
    relii: ['Related ii', 'the minor seventh before a dominant in a ii–V pair.', 'ana'],
    voicing: ['Voicing', 'which chord notes are played and in what order.', 'voice'],
    shell: ['Shell', 'root + 3 + 7 (or 1 + 7 + 3) — the minimal chord.', 'voice'],
    rootless: ['Rootless', 'a voicing without the root (the bass plays it): type A 3–5–7–9, type B 7–9–3–5.', 'voice'],
    drop2: ['Drop 2', 'a close voicing with the second voice from the top dropped an octave.', 'voice'],
    quartal: ['Quartal chord', 'a chord built in fourths; sounds open and modern.', 'voice'],
    cluster: ['Cluster', 'a dense chord with seconds.', 'voice'],
    modulation: ['Modulation', 'moving to another key and establishing it.', 'mod'],
    pivot: ['Pivot chord', 'a chord shared by two keys through which a modulation goes.', 'mod'],
    backdoor: ['Backdoor', '♭VII7 (or iv–♭VII7) resolving to I: arriving “through the back door”.', 'mod'],
    interchange: ['Modal interchange', 'a chord borrowed from the parallel key or another mode on the same tonic.', 'mod'],
    picardy: ['Picardy third', 'a major tonic at the end of a minor piece.', 'mod'],
    reharm: ['Reharmonization', 'new chords under the same melody.', 'reharm'],
    tritsub: ['Tritone substitute', 'a dominant replaced by the dominant a tritone away (G7 → D♭7).', 'reharm'],
    dimsub: ['Diminished substitute', '°7 instead of 7♭9 and back; four dominants share one °7.', 'reharm'],
    passdim: ['Passing °7', 'a diminished seventh between chords a whole step apart.', 'reharm'],
    sidestep: ['Side-step', 'a temporary shift by a half step and back.', 'reharm'],
    cesh: ['Chromatic line', 'a chromatic line inside one chord: 1–7–♭7–6 or 5–♯5–6–♭7.', 'reharm'],
    coltrane: ['Coltrane changes', 'a path through three tonics a major third apart.', 'reharm'],
    comping: ['Comping', 'playing chords with a rhythm that answers the soloist.', 'comp'],
    avoid: ['Avoid note', 'a scale note that clashes with the chord on a strong beat (usually a half step above a chord tone).', 'comp'],
    form: ['Form', 'the plan of a piece: sections and their repeats.', 'forms'],
    aaba: ['AABA', 'a 32-bar song form: three similar sections and a contrasting bridge.', 'forms'],
    bridge: ['Bridge', 'the contrasting B section of an AABA form.', 'forms'],
    bluesform: ['Blues', 'a 12-bar form of three four-bar phrases.', 'forms'],
    rhythmch: ['Rhythm changes', '32-bar AABA: I–vi–ii–V turnarounds in A and a chain of dominants in the bridge.', 'forms'],
    modaltune: ['Modal tune', 'harmony changes rarely: one mode for 8–16 bars.', 'forms'],
    constant: ['Constant structure', 'one chord quality moved in parallel.', 'arr'],
    pedal: ['Pedal point', 'a sustained bass under changing harmony.', 'arr'],
    ostinato: ['Ostinato', 'a repeated figure in the bass or the accompaniment.', 'arr'],
    enclosure: ['Enclosure', 'approaching a target note from above and below.', 'impro'],
    generalize: ['Harmonic generalization', 'playing one scale over a group of chords: ii–V as one V7.', 'impro'],
    stride: ['Stride', 'a piano accompaniment of “bass — chord — bass — chord”.', 'trad'],
  },
  CH: [
{ id: 'iv', t: 'Intervals', s: 'The building blocks of harmony', h: `
<p>An [[interval|interval]] is the distance between two notes. It is measured with two numbers: how many <b>letters</b> (degrees) it spans and how many <b>semitones</b> it contains. The first gives the name (second, third, fourth…), the second the quality (minor, major, perfect, augmented, diminished). That is why C–E♯ and C–F are different intervals although they are the same key on the keyboard: the first is an augmented third, the second a perfect fourth.</p>
<p>In jazz intervals are usually named as degrees above the chord root: ♭3, ♯11, ♭13. It is the same language: “♭9” is a minor second an octave up, “13” is a major sixth an octave up.</p>
${lab('iv')}
<h3>All intervals up to the thirteenth</h3>
<p>Intervals wider than an octave are <b>compound</b>: a ninth is a second plus an octave, an eleventh is a fourth plus an octave, a thirteenth is a sixth plus an octave. They give chords their [[tension|tensions]] — 9, 11, 13.</p>
${lab('ivtable')}
<h3>Inverting an interval</h3>
<p>Move the lower note up an octave and the interval is inverted. The names always add up to 9 (third ↔ sixth, second ↔ seventh, fourth ↔ fifth), the quality flips: major ↔ minor, augmented ↔ diminished, perfect stays perfect. The semitones add up to 12.</p>
${key('The [[tritone|tritone]] (6 semitones) halves the octave and stays a tritone when inverted. It is the engine of the dominant and the basis of the tritone substitute.')}
<h3>Consonance and dissonance</h3>
<p>[[consonance|Perfect consonances]] are the unison, octave, fifth and fourth; imperfect ones are thirds and sixths; dissonances are seconds, sevenths and the tritone. In jazz a dissonance is not a mistake but a colour: the major seventh in maj7, the minor ninth in 7♭9. What matters is where it sits and where it resolves.</p>
${tip('Sing an interval before playing it. The most useful ones for jazz are thirds and sevenths: [[guide|guide tones]] are made of them.')}
` },
{ id: 'chords', t: 'Chords', s: 'From the triad to the thirteenth', h: `
<p>A jazz chord is built in thirds from the root: 1–3–5–7, then 9, 11, 13. The lower four notes define the <b>quality</b>, the upper ones the <b>colour</b>. Almost all standard harmony comes down to five [[seventh|seventh chords]]: maj7, m7, 7, m7♭5 and °7.</p>
<h3>Triads</h3>
<p>[[triad|Triads]]: major (M3 + m3), minor (m3 + M3), diminished (m3 + m3) and augmented (M3 + M3). Apart from them are [[sus|sus chords]], where the 3rd is replaced by a 4th or a 2nd: they sound open and lean neither to major nor minor.</p>
<h3>Inversions</h3>
<p>In root position the root is at the bottom. In the [[inversion|first inversion]] the 3rd is at the bottom, in the second the 5th, in the third (for seventh chords) the 7th. Inversions keep voices moving smoothly and shape bass lines.</p>
${lab('chord')}
<h3>Seven seventh chords</h3>
<p>Compare them on one root. One note changes — and with it the character: maj7 → 7 (the 7th drops), 7 → m7 (the 3rd drops), m7 → m7♭5 (the 5th drops), m7♭5 → °7 (the 7th drops another half step).</p>
${lab('seventh')}
${key('The 3rd and 7th decide what chord it is. The 5th can be left out almost always (except ♭5 and ♯5), the root — whenever the bass plays it.')}
<h3>Sixth chords</h3>
<p>C6 (1–3–5–6) and Cm6 (1–♭3–5–6) are tonics often used instead of maj7 and m7, especially when the melody is on the root: a major seventh under a root in the melody makes a harsh minor second. 6/9 is the same sixth chord with a ninth — the calmest major sound.</p>
<h3>Tensions</h3>
<p>The 9th, 11th and 13th add colour. Not all are available: a tension a half step above a chord tone (except ♭9 on a dominant) clashes with it. So 11 over a major 3rd (F over E in Cmaj7) sounds wrong, and major chords take ♯11 instead.</p>
${lab('tens')}
<p>The <b>dominant</b> is the most flexible chord: it takes natural tensions (9, 13) or altered ones (♭9, ♯9, ♯11, ♭13). ♭9/♯9 with ♭13 gives the [[altered|altered dominant]] — 7alt, the chord with the strongest pull to resolve.</p>
<h3>Upper structures</h3>
<p>An easy way to get a rich dominant: the left hand holds 1–3–♭7, the right hand plays an ordinary triad. The triad on top adds three tensions at once — an [[ust|upper structure]]. Pick any of the 24 triads and hear what it does over the dominant. Red cells are triads with the 11th or the major 7th: they clash with the dominant.</p>
${lab('ust')}
${tip('The most common upper structures over G7: A (9, ♯11, 13), E♭ (♭13, 1, ♯9 — altered colour), E (13, ♭9, 3), D♭ (♭5, ♭7, ♭9). As degrees: II, ♭VI, VI, ♭V.')}
<h3>Slash chords and polychords</h3>
<p>A slash (C/E, D/C) means a [[slash|chord over a bass note]]. A fraction with a horizontal line is a [[poly|polychord]]: two chords at once. A common example is a dominant sus written as a triad over a bass — F/G = G9sus4.</p>
` },
{ id: 'scales', t: 'Scales and modes', s: 'Major, melodic and harmonic minor, symmetric scales', h: `
<p>A [[scale|scale]] is the set of notes a melody over a chord is made from. The jazz approach is simple: <b>each chord has a scale</b> that contains all its notes and suitable tensions. There are many scales, but they come from three parents — major, melodic minor and harmonic minor — plus a few symmetric ones.</p>
<h3>Modes of major</h3>
<p>Play the notes of C major from D to D and you get the Dorian [[mode|mode]], from E — Phrygian, and so on. Same notes, new centre — new character. It is easier to think of a mode as major or minor with one changed degree: Dorian is minor with a major 6th, Lydian is major with ♯4, Mixolydian is major with ♭7.</p>
${lab('scale')}
<h3>The brightness ladder</h3>
<p>Arrange the seven modes on one root by brightness: from Lydian to Locrian each next mode lowers exactly one degree. Tap the steps of the ladder and hear the light leave one note at a time.</p>
${lab('bright')}
${key('A mode is recognised by its [[chartone|characteristic degree]]: Dorian — 6, Phrygian — ♭2, Lydian — ♯4, Mixolydian — ♭7, Aeolian — ♭6, Locrian — ♭5. Stress it in the melody and the mode will be heard.')}
<h3>Melodic minor and its modes</h3>
<p>Jazz [[melmin|melodic minor]] is the same up and down: minor with a major 6th and a major 7th. Its modes give sounds that major does not have: <b>Lydian dominant</b> (4th mode — for 7♯11 and tritone substitutes), <b>altered</b> (7th mode — for 7alt), <b>Locrian ♮2</b> (6th mode — for m7♭5), <b>Lydian augmented</b> (3rd mode — for maj7♯5).</p>
<h3>Harmonic minor</h3>
<p>[[harmmin|Harmonic minor]] is minor with a major 7th. Its fifth mode — <b>Phrygian dominant</b> (Mixolydian ♭9 ♭13) — is the main scale of the dominant in minor: G7♭9 in C minor.</p>
<h3>Symmetric scales</h3>
<p>The [[dimscale|diminished scale]] alternates whole and half steps. Shift its start and you get only three different ones, each fitting four °7 chords and four 7♭9 dominants at once. The [[wholetone|whole-tone scale]] has six notes a whole step apart; there are only two of them, and they fit 7♯5.</p>
${lab('dimeq')}
<h3>Pentatonics and the blues scale</h3>
<p>A [[pentatonic|pentatonic]] has five notes without half steps: major (1 2 3 5 6) and minor (1 ♭3 4 5 ♭7) are the same scale from different notes. The [[blues|blues scale]] is the minor pentatonic with an added ♭5. Japanese modes Kumoi, In-sen and Hirajoshi are pentatonics with half steps; they sound modern over m6, sus and maj7♯11.</p>
<h3>Bebop scales</h3>
<p>A [[bebop|bebop scale]] is a seven-note scale plus one chromatic note. Moving in eighths from a chord tone puts chord tones on the strong beats. Bebop dominant is Mixolydian with a major 7th; bebop major is major with ♯5; bebop Dorian is Dorian with a major 3rd.</p>
${tip('Learn a scale through its chord: chord in the left hand, scale in the right, starting not only from the root but from every chord tone. The diagram above has an “Over the chord” button.')}
<h3>All scales</h3>
<p>The full list: modes of major, melodic and harmonic minor, symmetric scales, pentatonics, bebop and world scales — Hungarian, Gypsy, Persian, Arabian, Balinese and more.</p>
${lab('refsc')}
` },
{ id: 'key', t: 'Keys and functions', s: 'Degrees, Roman numerals, cadences, the circle of fifths', h: `
<p>Build a seventh chord on every degree of the scale and you get the family of chords of the key. In major: Imaj7, iim7, iiim7, IVmaj7, V7, vim7, viiø. The degrees are written in [[roman|Roman numerals]]: upper case for major chords, lower case for minor ones. So a progression is written independently of the key: “ii–V–I” in any of the twelve.</p>
${lab('key')}
<h3>Three functions</h3>
<p>Chords fall into three groups by role — [[function|functions]]: [[tonic|tonic]] (rest: I, iii, vi), subdominant (moving away: ii, IV) and [[dominant|dominant]] (tension that wants resolution: V, vii). Chords of one group can replace each other — the basis of diatonic substitution.</p>
${key('Almost any jazz progression alternates “subdominant → dominant → tonic”. ii–V–I is its densest form.')}
<h3>Minor</h3>
<p>Minor in jazz blends three scales: natural, harmonic and melodic minor. The tonic is usually m6 or m(maj7), ii is m7♭5, V is 7♭9 or 7alt. Switch the diagram to harmonic and melodic minor to see where these chords come from.</p>
<h3>Cadences</h3>
<p>A [[cadence|cadence]] closes a phrase. The authentic one (V–I) is the main one. The plagal (IV–I) is the “amen”. The deceptive (V–vi) fools the ear: a substitute sounds instead of the tonic. A half cadence stops on V.</p>
<h3>The circle of fifths</h3>
<p>On the [[circle|circle of fifths]] keys sit a fifth apart, and neighbours differ by one accidental. What matters for jazz: roots usually move <b>counter-clockwise</b> — down a fifth: D → G → C → F.</p>
${lab('circle')}
` },
{ id: 'iivi', t: 'ii–V–I', s: 'The main progression of jazz', h: `
<p>[[iivi|ii–V–I]] is the frame of a huge part of the standards. Roots go down by fifths, functions go S → D → T. Hear, play and improvise on ii–V–I in every key, and half the work is done.</p>
<h3>Guide tones</h3>
<p>The 3rd and 7th of each chord in ii–V–I connect by step: the 7th of ii becomes the 3rd of V (a half step lower), the 7th of V becomes the 3rd of I. These are [[guide|guide tones]]: two lines take turns while the hand barely moves. It is the main voice-leading mechanism in jazz.</p>
${lab('guide')}
${tip('Play 3 and 7 with the left hand all around the circle without looking at the keys. Then add the root in the bass. Then the same with the right hand over the bass.')}
<h3>ii–V–I in every key</h3>
${lab('iivitable')}
<h3>Turnarounds</h3>
<p>At the end of a section the harmony returns to the start — a [[turnaround|turnaround]]. The basic I–vi–ii–V becomes dozens of variants: vi turns into VI7 (a secondary dominant), I into iii, dominants into tritone substitutes.</p>
${lab('turn')}
<h3>Chains of ii–Vs</h3>
<p>A ii–V does not have to resolve: right after the dominant a new ii–V from another key begins. Most often the chain moves down by whole or half steps, and guide tones lead the ear.</p>
${lab('chain')}
<h3>Incomplete ii–Vs</h3>
<p>Sometimes only the ii or only the V of the goal is played. It is still motion towards the goal and is marked the same way in analysis — with an arrow or a bracket.</p>
` },
{ id: 'ana', t: 'Analysis', s: 'Arrows, brackets, secondary dominants', h: `
<p>Analysis means reading harmony like a language. The symbols: a <b>solid arrow</b> is a dominant resolving down a fifth; a <b>dashed one</b> resolves down a half step (tritone substitute); a <b>bracket</b> under two chords is a ii–V. Under each chord goes its role: a degree or V7/x (“dominant of x”). Type in a progression and the diagram marks it up.</p>
${lab('ana')}
<h3>Secondary dominants</h3>
<p>Every chord of the key except viiø can have its own dominant — a [[secdom|secondary dominant]]: V7/ii, V7/iii, V7/IV, V7/V, V7/vi. It differs from the chord on the same degree by one note — a raised 3rd (or ♭7 for V7/IV). In major: VI7 → ii, VII7 → iii, I7 → IV, II7 → V, III7 → vi.</p>
<h3>Backcycling</h3>
<p>A goal can be prepared by a chain of dominants worked backwards — [[backcycle|backcycling]]: E7 → A7 → D7 → G7 → C. Denser still, with [[relii|related ii]] chords before each dominant: Bm7 E7 | Em7 A7 | Am7 D7 | Dm7 G7.</p>
<h3>Contiguous dominants</h3>
<p>Two dominants in a row without a fifth move (A♭7 → G7) read as a tritone substitute (A♭7 = SubV7/C) or as a side-step.</p>
<h3>°7 as a dominant</h3>
<p>A diminished seventh a half step below the goal is a rootless 7♭9 dominant: C♯°7 → Dm7 = A7♭9 → Dm7. Analysis writes “°7 → ii”.</p>
${key('Look first for ii–V pairs (brackets), then dominants (arrows), then the tonic. A chord with no arrow and outside the key is borrowing or a new key.')}
` },
{ id: 'voice', t: 'Voicings', s: 'Shells, rootless, drop 2, fourths', h: `
<p>A [[voicing|voicing]] is which chord notes you play and in what order. A good voicing sounds full, stays out of the bass and soloist’s way and moves smoothly to the next one.</p>
<h3>Shells</h3>
<p>[[shell|Shell]]: root + 3 + 7 or root + 7 + 3. The minimal chord that clearly shows the quality. The two forms alternate in ii–V–I so that 3 and 7 move by step.</p>
<h3>Rootless voicings</h3>
<p>With a bassist the root is not needed. Four-note [[rootless|rootless]] voicings are the basis of piano comping: <b>type A</b> (3–5–7–9 bottom to top) and <b>type B</b> (7–9–3–5). In ii–V–I they alternate — A–B–A or B–A–B — and each voice moves no more than a whole step.</p>
${lab('voice')}
${key('Voice leading: common notes stay, the rest move to the nearest note of the next chord. The 7th falling a half step to the 3rd is the key move of every ii–V.')}
<h3>Range</h3>
<p>A left-hand chord sounds clear roughly from D below middle C to the G above it. Lower is mud (especially thirds), higher steps into the soloist’s register.</p>
<h3>Drop 2 and drop 2-4</h3>
<p>Take a close four-note chord and drop the second voice from the top an octave — that is [[drop2|drop 2]]: wider, it sounds like a sax section. Drop 2-4 drops the second and fourth voices. These voicings suit guitarists and two-handed piano.</p>
<h3>Quartal voicings</h3>
<p>A [[quartal|quartal chord]] sounds open and modern. A well-known modal example is four fourths with a major third on top over a minor root. Quartal chords are ambiguous: one voicing fits several chords.</p>
<h3>Clusters and fragments</h3>
<p>A [[cluster|cluster]] is a dense chord with seconds (9 next to 3, 13 next to ♭7). A fragment is two or three notes of a full voicing, usually 3–7 plus one tension: at fast tempos that is enough.</p>
${tip('Type A around the circle of fifths, then type B. After a week, the minor ii–V–i. The goal is not to think of notes but to see the chord shape under the hand.')}
` },
{ id: 'mod', t: 'Modulation and borrowing', s: 'Moving between keys, mixing modes', h: `
<p>A [[modulation|modulation]] moves to another key and establishes it. A <b>tonicization</b> is a short visit after which the harmony returns. In jazz the line is blurry: a one-bar ii–V into a new key is already a tonicization.</p>
<h3>Kinds of modulation</h3>
<p><b>Direct</b> — no preparation: the new key simply starts (often at the start of a section). <b>Prepared</b> — through a ii–V of the new key or a °7. <b>Through a [[pivot|pivot chord]]</b> — a chord of both keys is reinterpreted: Am7 is vi in C and ii in G. <b>Transitional</b> — a short chain after which the key changes for good.</p>
<h3>Backdoor</h3>
<p>Instead of V7–I comes ♭VII7–I (B♭7 → C) or iv–♭VII7–I (Fm7 B♭7 → Cmaj7) — the [[backdoor|backdoor]], borrowed from the parallel minor: a soft, warm resolution.</p>
<h3>Modal interchange</h3>
<p>In major you can take chords of the parallel minor and other modes on the same tonic: iv, ♭VI, ♭VII, ♭III, iiø — that is [[interchange|modal interchange]]. The melody usually suggests the moment: a ♭6 or ♭3 in the melody is the cue.</p>
${lab('mi')}
<h3>Picardy third</h3>
<p>The [[picardy|Picardy third]] is a minor piece ending on a major tonic. In jazz it is a common final gesture.</p>
` },
{ id: 'reharm', t: 'Reharmonization', s: 'Substitutes, passing chords, Coltrane changes', h: `
<p>[[reharm|Reharmonization]] puts new chords under the same melody. The main rule: <b>the melody must stay a chord tone or an available tension</b>. If a melody note becomes an avoid note, the substitute does not work.</p>
<h3>Diatonic substitution</h3>
<p>Chords of one function replace each other: I ↔ iii ↔ vi, ii ↔ IV. Cmaj7 → Em7 — three common notes.</p>
<h3>Tritone substitute</h3>
<p>The [[tritsub|tritone substitute]] replaces a dominant with the dominant a tritone away, G7 → D♭7. The shared tritone (B–F / C♭–F) stays, both pull to C, and the bass falls a half step instead of leaping a fifth.</p>
${lab('tritone')}
<h3>Diminished substitute</h3>
<p>Any °7 is a rootless 7♭9 dominant on four different roots. So G7♭9 can be replaced by B♭7♭9, D♭7♭9 or E7♭9 — they share the same diminished chord on top. That is the [[dimsub|diminished substitute]].</p>
${lab('dimsub')}
<h3>Before and after</h3>
<p>Compare the original progression and the reharmonization by ear. Each example is one device.</p>
${lab('reharm')}
<h3>Passing and auxiliary °7</h3>
<p>A [[passdim|passing °7]] sits between chords a whole step apart: Cmaj7 C♯°7 Dm7. An <b>auxiliary</b> one sits on the same root between two identical chords: Cmaj7 C°7 Cmaj7 — it brings a long tonic to life.</p>
<h3>Side-step</h3>
<p>A [[sidestep|side-step]] moves a chord or a ii–V a half step up or down and back: a brief step outside the key.</p>
<h3>Chromatic line</h3>
<p>Inside a long chord one voice moves by half steps — a [[cesh|chromatic line]]: in minor 1 → 7 → ♭7 → 6 (Cm → Cm(maj7) → Cm7 → Cm6), in major 5 → ♯5 → 6 → ♭7.</p>
<h3>Coltrane changes</h3>
<p>The octave is split into three major thirds, and ii–V–I becomes a path through three tonics, each with its own dominant — [[coltrane|Coltrane changes]]. It sounds like a kaleidoscope turning fast.</p>
${lab('coltrane')}
<h3>A dominant can resolve anywhere</h3>
<p>The expectation of V7 resolving is so strong that an unexpected chord sounds like an event, not a mistake. Hear different paths.</p>
${lab('v7res')}
${tip('Reharmonize one tune with one device at a time: first only tritone substitutes, then only secondary dominants. Keep what supports the melody.')}
` },
{ id: 'comp', t: 'Comping', s: 'Rhythm, register, a conversation with the soloist', h: `
<p>[[comping|Comping]] answers the soloist; it is not a background. A pianist or guitarist chooses <b>what</b> to play (voicings), <b>where</b> (register) and <b>when</b> (rhythm). Rhythm matters most.</p>
<h3>Principles</h3>
<p>Leave space: short chords, rests, repeated rhythmic figures. Do not double the soloist’s melody. Anticipate: a chord an eighth before the strong beat creates motion. Listen to the drummer: comping hits complement the drum pattern.</p>
<h3>Rhythmic figures</h3>
<p>Choose a figure or tap the cells to make your own. A ii–V–I plays with a walking bass.</p>
${lab('comp')}
<h3>Avoid notes</h3>
<p>An [[avoid|avoid note]] is a scale note that clashes with the chord on a strong beat.</p>
${lab('avoid')}
${key('The faster the tempo, the fewer notes: at fast tempos 3 and 7 are enough. In a ballad — full voicings and arpeggios.')}
` },
{ id: 'forms', t: 'Forms', s: 'Blues, AABA, rhythm changes, modal tunes', h: `
<p>[[form|Form]] is the plan of a piece: its sections and how they repeat. Improvisation follows the same form — the chorus — so it has to be known by heart.</p>
<h3>Song forms</h3>
<p>Most standards are 32 bars: [[aaba|AABA]] (the [[bridge|bridge]] B contrasts and usually moves to another key) or ABAC. Less often — AB, ABA and forms with irregular section lengths.</p>
${lab('aaba')}
<h3>Blues</h3>
<p>The [[bluesform|blues]] is 12 bars, three phrases of four. The basic form uses three dominants I7, IV7, V7. Jazz blues adds ii–Vs, secondary dominants and °7; the bebop version descending ii–V chains; the minor blues sits on i, iv and ♭VI7–V7. Press Play — the bars light up as they sound.</p>
${lab('form')}
<h3>Rhythm changes</h3>
<p>[[rhythmch|Rhythm changes]] is the second most popular form after the blues: a 32-bar AABA. The A section has quick I–vi–ii–V turnarounds moving to IV; the bridge is a chain of dominants around the circle of fifths, two bars each: III7–VI7–II7–V7. The last two forms in the diagram above show it.</p>
<h3>Modal tunes</h3>
<p>In a [[modaltune|modal tune]] the harmony changes rarely — one mode for 8–16 bars. The improviser creates the motion: with quartal chords, side-steps, pentatonics.</p>
<h3>Polytonality</h3>
<p>Two tonal centres at once: for example, a D triad over a C chord. In small doses these are upper structures.</p>
` },
{ id: 'arr', t: 'Arranging', s: 'Constant structures, pedal point, ostinato', h: `
<p>A [[constant|constant structure]] is one chord quality (often maj7 or m11) moved in parallel to different roots. The harmony stops being functional and becomes colour.</p>
<p>A [[pedal|pedal point]] is a sustained bass (usually the tonic or dominant) under changing chords. It creates tension and unity at once — a typical device for intros and endings.</p>
<p>An [[ostinato|ostinato]] is a repeated figure in the bass or accompaniment. In Latin styles it is the basis of the groove.</p>
<h3>New harmony for a melody</h3>
<p>Five rules. (1) Find the important melody notes — long ones and those on strong beats. (2) For each, choose chords where it is a chord tone or an available tension. (3) Connect the chords so the bass moves meaningfully: by fifths, steps, chromatics. (4) Keep the function at cadences. (5) Do not change everything at once: one new phrase against familiar harmony sounds stronger.</p>
${tip('Take a slow melody and write three chords over every long note: a diatonic one, a secondary dominant and a borrowed one. Play them and choose the best for each spot.')}
` },
{ id: 'impro', t: 'Improvisation', s: 'Scales for chords, pentatonics, approaches', h: `
<p>Improvisation rests on three pillars: <b>the ear</b> (what you want to hear), <b>harmony</b> (what is sounding now) and <b>vocabulary</b> (phrases and devices in the fingers). Theory supplies material, but recordings are the main teacher.</p>
<h3>A scale for a chord</h3>
<p>Type any chord — the diagram finds the scales that contain all its notes. The most natural choices come first.</p>
${lab('cscale')}
<h3>Harmonic generalization</h3>
<p>On fast changes you do not have to play every chord: a ii–V can be heard as one V7, and a whole ii–V–I as one key. This is [[generalize|harmonic generalization]]: it frees the ear for the melody.</p>
<h3>Pentatonics over a chord</h3>
<p>Several [[pentatonic|pentatonics]] fit one chord, each with its own set of tensions: over Cmaj7 the pentatonic on D gives 9, 3, ♯11, 13, 7 — a Lydian colour.</p>
${lab('penta')}
<h3>Approaching a target note</h3>
<p>An [[enclosure|enclosure]] is a way to aim at a chord tone: approach it from above and below, diatonically or chromatically, so the target lands on a strong beat.</p>
${lab('encl')}
<h3>Patterns and symmetry</h3>
<p>Sequences (a motif from different degrees), symmetric figures on the diminished and whole-tone scales, triads moving in half steps — ways to step outside the key and come back logically.</p>
<h3>Upper triads</h3>
<p>Over a chord you can play a triad of its upper notes: over Cmaj7 — G (5–7–9) and D (9–♯11–13), over Dm7 — F and C, over G7alt — E♭ and D♭. A melody from a triad sounds clear and still brings tensions.</p>
${key('Chord tones on strong beats, passing notes on weak ones. Aim at 3 and 7 on the chord change — and the line spells out the harmony even without accompaniment.')}
${tip('Improvise on one ii–V–I with a limit: only eighths, only chord tones, only phrases starting on beat two. A limit grows vocabulary faster than freedom.')}
` },
{ id: 'trad', t: 'Traditional jazz', s: 'New Orleans, ragtime, early blues', h: `
<p>Early jazz rests on simple functional harmony: triads and dominant sevenths, secondary dominants around the circle of fifths (I–VI7–II7–V7–I), °7 as passing chords.</p>
<h3>Forms</h3>
<p>Ragtime and marches are multi-section forms (AABBACCDD) of 16 bars, often modulating to the subdominant key in the trio. Early blues is 12 bars, but with simpler harmony and freedom in length.</p>
<h3>Accompaniment and ensemble</h3>
<p>The rhythm section plays “in four” or “in two” (bass on 1 and 3), the piano plays [[stride|stride]]: bass — chord — bass — chord. The ensemble improvises collectively: the trumpet leads the melody, the clarinet decorates above, the trombone answers below.</p>
<h3>Ten guidelines</h3>
<p>(1) Triads and sixth chords instead of sevenths on the tonic. (2) Dominants are plain 7ths, without alterations. (3) Secondary dominants around the circle. (4) °7 as a passing chord. (5) Bass on roots and fifths. (6) Melody from arpeggios and pentatonics. (7) Blue notes (♭3, ♭7) as colour. (8) Breaks — the band stops for a short solo. (9) Swung eighths, but light. (10) The band listens: nobody plays all the time.</p>
` },
{ id: 'practice', t: 'Practice', s: 'How to practise, all the exercises, training', h: `
<p>Theory becomes music only through the instrument and the ear. A few rules: <b>all 12 keys</b>, not only the comfortable ones; <b>slowly and correctly</b>, then faster; <b>tunes</b> are the main material (every exercise is for a specific tune); <b>listen</b> to recordings every day.</p>
<h3>The exercises</h3>
<p>Everything that has to be done with the hands. There is no need to track progress — what counts is time at the instrument.</p>
<ol class="bexl">
<li><b>Intervals.</b> Sing and play all intervals up and down from one note, then from each of the twelve.</li>
<li><b>Seventh chords.</b> The five basic seventh chords on every root, in root position and inversions.</li>
<li><b>Harmonization.</b> Seventh chords of major, harmonic and melodic minor in every key.</li>
<li><b>Modes.</b> The seven modes on one root along the brightness ladder; stress the characteristic degree.</li>
<li><b>Guide tones.</b> 3 and 7 around the circle of fifths: dominants, minor, major.</li>
<li><b>ii–V–I.</b> Shells, then rootless (A/B) — around the circle and down by whole steps; major and minor.</li>
<li><b>Turnarounds.</b> All the I–vi–ii–V variants in three keys.</li>
<li><b>Analysis.</b> Three tunes: arrows, brackets, degrees — in pencil over the chords.</li>
<li><b>Voicings.</b> Drop 2 and quartal voicings on ii–V–I.</li>
<li><b>Reharmonization.</b> One tune — five versions, one device each.</li>
<li><b>Comping.</b> A blues in F with three different rhythmic figures.</li>
<li><b>Scale for a chord.</b> For every chord of a tune — its scale, from different chord tones.</li>
<li><b>Pentatonics.</b> All suitable pentatonics over maj7, m7 and 7alt.</li>
<li><b>Approaches.</b> Enclosures of 3 and 7 of every chord in ii–V–I.</li>
<li><b>Ear.</b> The training below — a few minutes before playing.</li>
</ol>
<h3>Training</h3>
<p>Questions are chosen at random from the selected types. The score counts only this round — no streaks or rankings.</p>
${lab('ex')}
<h3>A plan for the week</h3>
${lab('plan')}
` },
{ id: 'ref', t: 'Reference', s: 'Chords, scales, tensions, terms', h: `
<h3>Chords</h3>
${lab('refch')}
<h3>Scales</h3>
${lab('refsc')}
<h3>Available tensions</h3>
${lab('tens')}
<h3>Avoid notes</h3>
${lab('avoid')}
<h3>Terms</h3>
${lab('gloss')}
` },
  ],
};
