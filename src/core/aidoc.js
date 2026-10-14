// Инструкция для нейросети: как собрать файл для Melete — песни, сборники цитат, профиль. Человек копирует её
// (Профиль → «Инструкция для нейросети») и отдаёт любому чат-боту вместе со своей просьбой; готовый файл принимается
// кнопкой «Загрузить файл». Язык — язык интерфейса (ru, uz, en). Те же тексты — docs/ai-format.md, ai-format.uz.md,
// ai-format.en.md (тест сверяет). Формат — src/core/share.js.
import { INSTRUMENTS, LEVELS } from './profile.js';

const KEYS = 'C, C♯ (C#), D♭ (Db), D, E♭ (Eb), E, F, F♯ (F#), G♭ (Gb), G, A♭ (Ab), A, B♭ (Bb), B';
const KEYS_TXT = KEYS + '; минор — с «m» на конце: Am, C#m, Ebm';

// Заголовок примера (по нему тест находит пример и проверяет, что он принимается)
export const AI_EXAMPLE = { ru: 'Пример полного файла', uz: 'Toʻliq fayl namunasi', en: 'Full file example' };

export function aiDoc(lang = 'ru') {
  return lang === 'en' ? docEn() : lang === 'uz' ? docUz() : docRu();
}

function docRu() {
  return `# Melete: как собрать файл для приложения

Этот текст — инструкция для нейросети (ИИ-ассистента). Человек хочет загрузить в приложение Melete (практика музыканта)
свои песни, сборник цитат или настройки профиля. Задача — собрать по его просьбе ОДИН файл JSON по правилам ниже.

## Как ответить

1. Уточнить у человека то, чего не хватает (какие песни, какой сборник, какой инструмент), — коротко.
2. Выдать файл целиком одним блоком кода \`\`\`json … \`\`\` и предложить сохранить его как \`имя.melete.json\`.
3. Отвечать человеку на его языке. Тексты внутри файла — на языке, который он выбрал.
4. Человек загрузит файл в Melete: «Профиль → Загрузить файл». Приложение покажет, что в файле, и спросит, что принять.

## Общие правила файла

- Кодировка UTF-8, строгий JSON: без комментариев, без лишних запятых, ключи в двойных кавычках.
- Обязательные поля верхнего уровня: \`"format": "melete"\` и \`"v": 1\`.
- Дальше — любые из разделов: \`songs\` (песни), \`quotes\` (сборники цитат), \`profile\` (профиль). Можно один, можно все.
- \`title\` — название файла для человека (например, «Репетиция 12 мая», «Цитаты о труде»).
- Неизвестные поля приложение пропускает. Лучше их не добавлять.

## Чего в файле быть не может

Время занятий, часы, статистика, сессии, опыт до приложения, звания, камень, выученность песен — всё это приложение
считает само по реальным занятиям. Через файл это **не меняется**: такие поля игнорируются. Не нужно их добавлять
и не нужно обещать человеку, что так можно.

## songs — песни

Массив песен. Поля:

| Поле | Тип | Что это |
|---|---|---|
| \`title\` | строка, обязательно | Название (до 120 символов) |
| \`artist\` | строка | Исполнитель или автор |
| \`genre\` | строка | Жанр одним-двумя словами: «Рок», «Поклонение», «Джаз» |
| \`key\` | строка | Тональность: ${KEYS_TXT} |
| \`targetBpm\` | число 20–400 | Темп песни (целевой), удары в минуту |
| \`metro\` | объект | Размер для метронома: \`{"num": 6, "den": 8, "bpm": 72}\`; num 1–16, den 2/4/8/16 |
| \`notes\` | строка | Текст с аккордами, структура, заметки (до 20 000 символов) |
| \`ref\` | строка | Необязательный постоянный id песни (чтобы повторный файл обновлял ту же песню) |

Как писать \`notes\`:
- Части песни — отдельной строкой: «Куплет 1», «Припев», «Бридж», «Проигрыш», «Кода».
- Между частями — пустая строка (в JSON — \`\\n\\n\`), переносы строк — \`\\n\`.
- Аккорды — в квадратных скобках прямо в тексте, перед слогом: \`[Am]Тихо [F]ночь [C]над го[G]родом\`.
  Или строка аккордов над строкой текста — тоже понятно человеку.
- Можно добавить строку «Схема: Куплет – Припев – Куплет – Припев – Бридж – Припев ×2» и аппликатуры.

Честность:
- **Не выдумывать** тональность, темп и аккорды. Если нет уверенности — поле не заполнять или написать в notes «проверить».
- Тексты песен, защищённые авторским правом, не воспроизводить целиком по памяти. Можно: структуру, аккорды,
  первые строки для узнавания, текст, который прислал сам человек, и песни в общественном достоянии.

## quotes — сборники цитат

Свой набор слов для маскота Мелеты: одна цитата в день на главной и в напоминаниях. Массив сборников
(или один объект). Сборник:

\`\`\`json
{ "title": "Труд и мастерство", "items": [ { "text": "…", "by": "Автор", "src": "Книга, год" } ] }
\`\`\`

- \`title\` — до 60 символов; сборник с тем же названием при повторной загрузке заменяется.
- \`items\` — до 1000 цитат: \`text\` (обязательно, до 500 символов), \`by\` (автор), \`src\` (источник).
- Реальные цитаты — только точные, с автором и источником (книга, письмо, интервью, год). Если цитата
  приписывается без надёжного источника — не включать или написать в \`src\` «приписывается». Не выдумывать слова
  реальных людей. Шутки и свои афоризмы — можно, без \`by\` или с \`"by": "Цитатник"\`.
- Стихи Библии — с точной ссылкой в \`by\` («Кол 3:23») и переводом в \`src\` («Синодальный перевод»).
- Тексты — без грубости и оскорблений; без прямого обращения «ты/вы» в своих текстах, если человек не просит иначе.

## profile — профиль

\`\`\`json
{ "name": "Алекс", "instruments": ["guitar", "vocal"], "level": "amateur", "days": [1,1,1,1,1,0,0], "goalMin": 300 }
\`\`\`

- \`name\` — имя, до 40 символов.
- \`instruments\` — из списка: ${INSTRUMENTS.join(', ')} (guitar — акустическая, egtr — электрогитара, uke — укулеле,
  dbass — контрабас, mando — мандолина, other — другое).
- \`level\` — одно из: ${LEVELS.join(', ')} (новичок, любитель, продвинутый, профи).
- \`days\` — 7 чисел, понедельник…воскресенье: 1 — день практики, 0 — отдых.
- \`goalMin\` — цель на неделю в минутах, 30–3000 (например, 300 = 5 часов в неделю). Это цель, а не учёт времени.

## ${AI_EXAMPLE.ru}

\`\`\`json
{
  "format": "melete",
  "v": 1,
  "title": "Репетиция и цитаты",
  "songs": [
    {
      "title": "Amazing Grace",
      "artist": "John Newton",
      "genre": "Гимн",
      "key": "G",
      "targetBpm": 80,
      "metro": { "num": 3, "den": 4, "bpm": 80 },
      "notes": "Куплет 1\\n[G]Amazing [G7]grace, how [C]sweet the [G]sound\\n\\nСхема: Куплет ×4"
    }
  ],
  "quotes": [
    {
      "title": "Труд и мастерство",
      "items": [
        { "text": "Вдохновение это такая гостья, которая не любит посещать ленивых.", "by": "П. И. Чайковский", "src": "Письмо Н. Ф. фон Мекк, 24 июня 1878" }
      ]
    }
  ],
  "profile": { "instruments": ["guitar"], "level": "amateur", "days": [1, 1, 1, 1, 1, 0, 0], "goalMin": 300 }
}
\`\`\`

## Проверка перед ответом

- [ ] Есть \`"format": "melete"\` и \`"v": 1\`, JSON без ошибок.
- [ ] У каждой песни есть \`title\`; тональности и темп — из списка и только если известны.
- [ ] Цитаты точные, с автором и источником; сомнительные — помечены или убраны.
- [ ] Нет полей про часы, занятия, статистику — их всё равно нельзя изменить.
- [ ] Файл выдан целиком, одним блоком, с предложением сохранить как \`*.melete.json\`.
`;
}

function docEn() {
  return `# Melete: how to build a file for the app

This text is an instruction for an AI assistant. A person wants to load their own songs, a quote collection or profile
settings into the Melete app (musician practice). The task is to build, on their request, ONE JSON file following the rules below.

## How to answer

1. Briefly ask for whatever is missing (which songs, which collection, which instrument).
2. Give the whole file in a single code block \`\`\`json … \`\`\` and suggest saving it as \`name.melete.json\`.
3. Answer in the person's language. Texts inside the file — in the language they chose.
4. The person loads the file in Melete: “Profile → Load file”. The app shows what is inside and asks what to accept.

## General file rules

- UTF-8, strict JSON: no comments, no trailing commas, keys in double quotes.
- Required top-level fields: \`"format": "melete"\` and \`"v": 1\`.
- Then any of the sections: \`songs\`, \`quotes\` (quote collections), \`profile\`. One or all of them.
- \`title\` — a name for the file shown to the person (e.g. “Rehearsal May 12”, “Quotes on work”).
- Unknown fields are skipped by the app. Better not to add them.

## What cannot be in the file

Practice time, hours, statistics, sessions, prior experience, ranks, the stone, song mastery — the app counts all of this
itself from real practice. A file **does not change** any of it: such fields are ignored. Do not add them
and do not promise the person that this is possible.

## songs

An array of songs. Fields:

| Field | Type | Meaning |
|---|---|---|
| \`title\` | string, required | Title (up to 120 characters) |
| \`artist\` | string | Artist or author |
| \`genre\` | string | Genre in one or two words: “Rock”, “Worship”, “Jazz” |
| \`key\` | string | Key: ${KEYS}; minor — with “m” at the end: Am, C#m, Ebm |
| \`targetBpm\` | number 20–400 | Target tempo of the song, beats per minute |
| \`metro\` | object | Time signature for the metronome: \`{"num": 6, "den": 8, "bpm": 72}\`; num 1–16, den 2/4/8/16 |
| \`notes\` | string | Lyrics with chords, structure, notes (up to 20,000 characters) |
| \`ref\` | string | Optional permanent song id (so a repeated file updates the same song) |

How to write \`notes\`:
- Song parts on a separate line: “Verse 1”, “Chorus”, “Bridge”, “Interlude”, “Coda”.
- An empty line between parts (in JSON — \`\\n\\n\`), line breaks — \`\\n\`.
- Chords in square brackets right in the text, before the syllable: \`[Am]Silent [F]night a[C]bove the [G]city\`.
  A chord line above a lyric line is also fine for a person.
- A line like “Form: Verse – Chorus – Verse – Chorus – Bridge – Chorus ×2” and fingerings may be added.

Honesty:
- **Do not invent** keys, tempos or chords. If unsure, leave the field empty or write “to check” in notes.
- Do not reproduce copyrighted lyrics in full from memory. Allowed: structure, chords, first lines for recognition,
  lyrics sent by the person, and public-domain songs.

## quotes — quote collections

A personal set of words for the Melete mascot: one quote a day on the home screen and in reminders. An array of
collections (or a single object). A collection:

\`\`\`json
{ "title": "Work and mastery", "items": [ { "text": "…", "by": "Author", "src": "Book, year" } ] }
\`\`\`

- \`title\` — up to 60 characters; a collection with the same title is replaced when loaded again.
- \`items\` — up to 1000 quotes: \`text\` (required, up to 500 characters), \`by\` (author), \`src\` (source).
- Real quotes — only exact ones, with author and source (book, letter, interview, year). If a quote is
  attributed without a reliable source, leave it out or write “attributed” in \`src\`. Do not invent words of real
  people. Jokes and original sayings are fine, without \`by\` or with \`"by": "Quote book"\`.
- Bible verses — with an exact reference in \`by\` (“Col 3:23”) and the translation in \`src\` (“KJV”).
- No rudeness or insults; no direct “you” address in original texts unless the person asks otherwise.

## profile

\`\`\`json
{ "name": "Alex", "instruments": ["guitar", "vocal"], "level": "amateur", "days": [1,1,1,1,1,0,0], "goalMin": 300 }
\`\`\`

- \`name\` — up to 40 characters.
- \`instruments\` — from the list: ${INSTRUMENTS.join(', ')} (guitar — acoustic, egtr — electric guitar, uke — ukulele,
  dbass — double bass, mando — mandolin, other — other).
- \`level\` — one of: ${LEVELS.join(', ')} (beginner, amateur, advanced, professional).
- \`days\` — 7 numbers, Monday…Sunday: 1 — practice day, 0 — rest.
- \`goalMin\` — weekly goal in minutes, 30–3000 (e.g. 300 = 5 hours a week). It is a goal, not a time record.

## ${AI_EXAMPLE.en}

\`\`\`json
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
      "notes": "Verse 1\\n[G]Amazing [G7]grace, how [C]sweet the [G]sound\\n\\nForm: Verse ×4"
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
\`\`\`

## Check before answering

- [ ] \`"format": "melete"\` and \`"v": 1\` are present, the JSON has no errors.
- [ ] Every song has a \`title\`; keys and tempo are from the list and only if known.
- [ ] Quotes are exact, with author and source; doubtful ones are marked or removed.
- [ ] No fields about hours, practice or statistics — they cannot be changed anyway.
- [ ] The file is given whole, in one block, with a suggestion to save it as \`*.melete.json\`.
`;
}

function docUz() {
  return `# Melete: ilova uchun fayl tuzish

Bu matn — sunʼiy intellekt (AI yordamchi) uchun yoʻriqnoma. Inson Melete ilovasiga (musiqachi mashqi) oʻz qoʻshiqlarini,
iqtiboslar toʻplamini yoki profil sozlamalarini yuklamoqchi. Vazifa — uning soʻroviga koʻra quyidagi qoidalar boʻyicha BITTA JSON fayl tuzish.

## Qanday javob berish kerak

1. Yetishmayotgan narsani qisqa soʻrab olish (qaysi qoʻshiqlar, qaysi toʻplam, qaysi cholgʻu).
2. Faylni toʻliq, bitta \`\`\`json … \`\`\` kod blokida berish va uni \`nom.melete.json\` deb saqlashni taklif qilish.
3. Insonga uning tilida javob berish. Fayl ichidagi matnlar — u tanlagan tilda.
4. Inson faylni Melete'da yuklaydi: «Profil → Faylni yuklash». Ilova fayl ichidagini koʻrsatadi va nimani qabul qilishni soʻraydi.

## Faylning umumiy qoidalari

- UTF-8, qatʼiy JSON: izohlarsiz, ortiqcha vergullarsiz, kalitlar qoʻsh qoʻshtirnoqda.
- Yuqori darajadagi majburiy maydonlar: \`"format": "melete"\` va \`"v": 1\`.
- Soʻng istalgan boʻlimlar: \`songs\` (qoʻshiqlar), \`quotes\` (iqtiboslar toʻplamlari), \`profile\` (profil). Bittasi yoki hammasi.
- \`title\` — inson uchun fayl nomi (masalan, «12-may repetitsiyasi», «Mehnat haqida iqtiboslar»).
- Notanish maydonlarni ilova oʻtkazib yuboradi. Ularni qoʻshmagan maʼqul.

## Faylda nima boʻlishi mumkin emas

Mashq vaqti, soatlar, statistika, sessiyalar, ilovagacha boʻlgan tajriba, unvonlar, tosh, qoʻshiqlarning oʻzlashtirilgani —
bularning hammasini ilova haqiqiy mashqlar boʻyicha oʻzi hisoblaydi. Fayl orqali bular **oʻzgarmaydi**: bunday maydonlar
eʼtiborga olinmaydi. Ularni qoʻshish va insonga bu mumkin deb vaʼda berish shart emas.

## songs — qoʻshiqlar

Qoʻshiqlar massivi. Maydonlar:

| Maydon | Turi | Bu nima |
|---|---|---|
| \`title\` | satr, majburiy | Nomi (120 belgigacha) |
| \`artist\` | satr | Ijrochi yoki muallif |
| \`genre\` | satr | Janr bir-ikki soʻzda: «Rok», «Sajda», «Jaz» |
| \`key\` | satr | Tonallik: ${KEYS}; minor — oxirida «m» bilan: Am, C#m, Ebm |
| \`targetBpm\` | son 20–400 | Qoʻshiqning maqsadli tempi, daqiqasiga zarb |
| \`metro\` | obyekt | Metronom uchun oʻlcham: \`{"num": 6, "den": 8, "bpm": 72}\`; num 1–16, den 2/4/8/16 |
| \`notes\` | satr | Akkordli matn, tuzilma, eslatmalar (20 000 belgigacha) |
| \`ref\` | satr | Qoʻshiqning ixtiyoriy doimiy id'si (takroriy fayl oʻsha qoʻshiqni yangilashi uchun) |

\`notes\`ni qanday yozish kerak:
- Qoʻshiq qismlari — alohida satrda: «1-band», «Naqarot», «Koʻprik», «Proigrish», «Koda».
- Qismlar orasida — boʻsh satr (JSON'da — \`\\n\\n\`), satr koʻchirish — \`\\n\`.
- Akkordlar — kvadrat qavslarda, matn ichida, boʻgʻin oldidan: \`[Am]Jim[F]jit [C]tun shahar [G]uzra\`.
  Matn satri ustidagi akkordlar satri ham inson uchun tushunarli.
- «Sxema: Band – Naqarot – Band – Naqarot – Koʻprik – Naqarot ×2» satri va applikaturalarni qoʻshish mumkin.

Halollik:
- Tonallik, temp va akkordlarni **toʻqib chiqarmaslik**. Ishonch boʻlmasa — maydonni toʻldirmaslik yoki notes'da «tekshirish kerak» deb yozish.
- Mualliflik huquqi bilan himoyalangan qoʻshiq matnlarini xotiradan toʻliq keltirmaslik. Mumkin: tuzilma, akkordlar,
  tanib olish uchun birinchi satrlar, insonning oʻzi yuborgan matn va jamoat mulki boʻlgan qoʻshiqlar.

## quotes — iqtiboslar toʻplamlari

Meleta maskoti uchun oʻz soʻzlar toʻplami: bosh sahifada va eslatmalarda kuniga bitta iqtibos. Toʻplamlar massivi
(yoki bitta obyekt). Toʻplam:

\`\`\`json
{ "title": "Mehnat va mahorat", "items": [ { "text": "…", "by": "Muallif", "src": "Kitob, yil" } ] }
\`\`\`

- \`title\` — 60 belgigacha; xuddi shu nomli toʻplam qayta yuklanganda almashtiriladi.
- \`items\` — 1000 tagacha iqtibos: \`text\` (majburiy, 500 belgigacha), \`by\` (muallif), \`src\` (manba).
- Haqiqiy iqtiboslar — faqat aniq, muallif va manba bilan (kitob, xat, intervyu, yil). Agar iqtibos ishonchli
  manbasiz kimgadir nisbat berilsa — kiritmaslik yoki \`src\`'da «nisbat beriladi» deb yozish. Haqiqiy odamlarning
  soʻzlarini toʻqib chiqarmaslik. Hazillar va oʻz hikmatli soʻzlari — mumkin, \`by\`siz yoki \`"by": "Hikmatlar"\` bilan.
- Bibliya oyatlari — \`by\`da aniq havola («Kolosaliklar 3:23») va \`src\`da tarjima nomi («Muqaddas Kitob») bilan.
- Matnlar — qoʻpollik va haqoratsiz; inson boshqacha soʻramasa, oʻz matnlarida «sen/siz» deb toʻgʻridan-toʻgʻri murojaatsiz.

## profile — profil

\`\`\`json
{ "name": "Aziz", "instruments": ["guitar", "vocal"], "level": "amateur", "days": [1,1,1,1,1,0,0], "goalMin": 300 }
\`\`\`

- \`name\` — ism, 40 belgigacha.
- \`instruments\` — roʻyxatdan: ${INSTRUMENTS.join(', ')} (guitar — akustik gitara, egtr — elektrogitara, uke — ukulele,
  dbass — kontrabas, mando — mandolina, other — boshqa).
- \`level\` — quyidagilardan biri: ${LEVELS.join(', ')} (boshlovchi, havaskor, ilgʻor, professional).
- \`days\` — 7 ta son, dushanba…yakshanba: 1 — mashq kuni, 0 — dam olish.
- \`goalMin\` — haftalik maqsad daqiqalarda, 30–3000 (masalan, 300 = haftasiga 5 soat). Bu maqsad, vaqt hisobi emas.

## ${AI_EXAMPLE.uz}

\`\`\`json
{
  "format": "melete",
  "v": 1,
  "title": "Repetitsiya va iqtiboslar",
  "songs": [
    {
      "title": "Amazing Grace",
      "artist": "John Newton",
      "genre": "Madhiya",
      "key": "G",
      "targetBpm": 80,
      "metro": { "num": 3, "den": 4, "bpm": 80 },
      "notes": "1-band\\n[G]Amazing [G7]grace, how [C]sweet the [G]sound\\n\\nSxema: Band ×4"
    }
  ],
  "quotes": [
    {
      "title": "Mehnat va mahorat",
      "items": [
        { "text": "Ilhom shunday mehmonki, dangasalarnikiga kelishni yoqtirmaydi.", "by": "P. I. Chaykovskiy", "src": "N. F. fon Mekkka xat, 1878-yil 24-iyun" }
      ]
    }
  ],
  "profile": { "instruments": ["guitar"], "level": "amateur", "days": [1, 1, 1, 1, 1, 0, 0], "goalMin": 300 }
}
\`\`\`

## Javobdan oldin tekshirish

- [ ] \`"format": "melete"\` va \`"v": 1\` bor, JSON xatosiz.
- [ ] Har bir qoʻshiqda \`title\` bor; tonallik va temp — roʻyxatdan va faqat maʼlum boʻlsa.
- [ ] Iqtiboslar aniq, muallif va manba bilan; shubhalilari belgilangan yoki olib tashlangan.
- [ ] Soatlar, mashqlar, statistika haqidagi maydonlar yoʻq — ularni baribir oʻzgartirib boʻlmaydi.
- [ ] Fayl toʻliq, bitta blokda, \`*.melete.json\` deb saqlash taklifi bilan berilgan.
`;
}
