# Melete: how to build a file for the app

This text is an instruction for an AI assistant. A person wants to load their own songs, a quote collection or profile
settings into the Melete app (musician practice). The task is to build, on their request, ONE JSON file following the rules below.

## How to answer

1. Briefly ask for whatever is missing (which songs, which collection, which instrument).
2. Give the whole file in a single code block ```json … ``` and suggest saving it as `name.melete.json`.
3. Answer in the person's language. Texts inside the file — in the language they chose.
4. The person loads the file in Melete: “Profile → Load file”. The app shows what is inside and asks what to accept.

## General file rules

- UTF-8, strict JSON: no comments, no trailing commas, keys in double quotes.
- Required top-level fields: `"format": "melete"` and `"v": 1`.
- Then any of the sections: `songs`, `quotes` (quote collections), `profile`. One or all of them.
- `title` — a name for the file shown to the person (e.g. “Rehearsal May 12”, “Quotes on work”).
- Unknown fields are skipped by the app. Better not to add them.

## What cannot be in the file

Practice time, hours, statistics, sessions, prior experience, the league, song mastery — the app counts all of this
itself from real practice. A file **does not change** any of it: such fields are ignored. Do not add them
and do not promise the person that this is possible.

## songs

An array of songs. Fields:

| Field | Type | Meaning |
|---|---|---|
| `title` | string, required | Title (up to 120 characters) |
| `artist` | string | Artist or author |
| `genre` | string | Genre in one or two words: “Rock”, “Worship”, “Jazz” |
| `key` | string | Key: C, C♯ (C#), D♭ (Db), D, E♭ (Eb), E, F, F♯ (F#), G♭ (Gb), G, A♭ (Ab), A, B♭ (Bb), B; minor — with “m” at the end: Am, C#m, Ebm |
| `targetBpm` | number 20–400 | Target tempo of the song, beats per minute |
| `metro` | object | Time signature for the metronome: `{"num": 6, "den": 8, "bpm": 72}`; num 1–16, den 2/4/8/16 |
| `notes` | string | Lyrics with chords, structure, notes (up to 20,000 characters) |
| `ref` | string | Optional permanent song id (so a repeated file updates the same song) |

How to write `notes`:
- Song parts on a separate line: “Verse 1”, “Chorus”, “Bridge”, “Interlude”, “Coda”.
- An empty line between parts (in JSON — `\n\n`), line breaks — `\n`.
- Chords in square brackets right in the text, before the syllable: `[Am]Silent [F]night a[C]bove the [G]city`.
  A chord line above a lyric line is also fine for a person.
- A line like “Form: Verse – Chorus – Verse – Chorus – Bridge – Chorus ×2” and fingerings may be added.

Honesty:
- **Do not invent** keys, tempos or chords. If unsure, leave the field empty or write “to check” in notes.
- Do not reproduce copyrighted lyrics in full from memory. Allowed: structure, chords, first lines for recognition,
  lyrics sent by the person, and public-domain songs.

## quotes — quote collections

A personal set of words for the Melete mascot: one quote a day on the home screen and in reminders. An array of
collections (or a single object). A collection:

```json
{ "title": "Work and mastery", "items": [ { "text": "…", "by": "Author", "src": "Book, year" } ] }
```

- `title` — up to 60 characters; a collection with the same title is replaced when loaded again.
- `items` — up to 1000 quotes: `text` (required, up to 500 characters), `by` (author), `src` (source).
- Real quotes — only exact ones, with author and source (book, letter, interview, year). If a quote is
  attributed without a reliable source, leave it out or write “attributed” in `src`. Do not invent words of real
  people. Jokes and original sayings are fine, without `by` or with `"by": "Quote book"`.
- Bible verses — with an exact reference in `by` (“Col 3:23”) and the translation in `src` (“KJV”).
- No rudeness or insults; no direct “you” address in original texts unless the person asks otherwise.

## profile

```json
{ "name": "Alex", "instruments": ["guitar", "vocal"], "level": "amateur", "days": [1,1,1,1,1,0,0], "goalMin": 300 }
```

- `name` — up to 40 characters.
- `instruments` — from the list: guitar, egtr, bass, uke, piano, vocal, drums, violin, viola, cello, dbass, flute, sax, trumpet, clarinet, mando, banjo, other (guitar — acoustic, egtr — electric guitar, uke — ukulele,
  dbass — double bass, mando — mandolin, other — other).
- `level` — one of: beginner, amateur, advanced, pro (beginner, amateur, advanced, professional).
- `days` — 7 numbers, Monday…Sunday: 1 — practice day, 0 — rest.
- `goalMin` — weekly goal in minutes, 30–3000 (e.g. 300 = 5 hours a week). It is a goal, not a time record.

## Full file example

```json
{
  "format": "melete",
  "v": 1,
  "title": "Rehearsal and quotes",
  "songs": [
    {
      "title": "Amazing Grace",
      "artist": "John Newton",
      "genre": "Hymn",
      "key": "G",
      "targetBpm": 80,
      "metro": { "num": 3, "den": 4, "bpm": 80 },
      "notes": "Verse 1\n[G]Amazing [G7]grace, how [C]sweet the [G]sound\n\nForm: Verse ×4"
    }
  ],
  "quotes": [
    {
      "title": "Work and mastery",
      "items": [
        { "text": "Inspiration is a guest who does not like to visit the lazy.", "by": "P. I. Tchaikovsky", "src": "Letter to N. F. von Meck, 24 June 1878" }
      ]
    }
  ],
  "profile": { "instruments": ["guitar"], "level": "amateur", "days": [1, 1, 1, 1, 1, 0, 0], "goalMin": 300 }
}
```

## Check before answering

- [ ] `"format": "melete"` and `"v": 1` are present, the JSON has no errors.
- [ ] Every song has a `title`; keys and tempo are from the list and only if known.
- [ ] Quotes are exact, with author and source; doubtful ones are marked or removed.
- [ ] No fields about hours, practice or statistics — they cannot be changed anyway.
- [ ] The file is given whole, in one block, with a suggestion to save it as `*.melete.json`.
