// Слова маскота: зов к практике (уведомления, главная). Две категории:
// 1) Писание — труд для Бога и мастерство. Русский — Синодальный перевод дословно (как в модуле Библии,
//    public/bible/synodal), английский — King James Version (общественное достояние); узбекский — русский текст.
// 2) Музыканты — только хорошо задокументированные эпизоды, с источником (src). Без выдуманных цифр:
//    ходячие истории вроде «играл по N часов в день» не берём, если нет надёжного источника.
// Тексты — без прямого обращения на «ты/вы» (правило проекта).

export const SCRIPTURE = [
  { ref: 'Кол 3:23', refEn: 'Col 3:23', ru: 'И все, что делаете, делайте от души, как для Господа, а не для человеков', en: 'And whatsoever ye do, do it heartily, as to the Lord, and not unto men' },
  { ref: 'Еккл 9:10', refEn: 'Eccl 9:10', ru: 'Все, что может рука твоя делать, по силам делай', en: 'Whatsoever thy hand findeth to do, do it with thy might' },
  { ref: 'Пс 32:3', refEn: 'Ps 33:3', ru: 'Пойте Ему новую песнь; пойте Ему стройно, с восклицанием', en: 'Sing unto him a new song; play skilfully with a loud noise' },
  { ref: 'Притч 22:29', refEn: 'Prov 22:29', ru: 'Видел ли ты человека проворного в своем деле? Он будет стоять перед царями', en: 'Seest thou a man diligent in his business? he shall stand before kings' },
  { ref: '1 Пар 15:22', refEn: '1 Chr 15:22', ru: 'А Хенания, начальник левитов, был учитель пения, потому что был искусен в нем', en: 'And Chenaniah, chief of the Levites, was for song: he instructed about the song, because he was skilful' },
  { ref: '1 Пар 25:7', refEn: '1 Chr 25:7', ru: 'И было число их с братьями их, обученными петь пред Господом, всех знающих сие дело, двести восемьдесят восемь', en: 'So the number of them, with their brethren that were instructed in the songs of the Lord, even all that were cunning, was two hundred fourscore and eight' },
  { ref: 'Рим 12:11', refEn: 'Rom 12:11', ru: 'В усердии не ослабевайте; духом пламенейте; Господу служите', en: 'Not slothful in business; fervent in spirit; serving the Lord' },
  { ref: '1 Кор 10:31', refEn: '1 Cor 10:31', ru: 'Итак, едите ли, пьете ли или иное что делаете, все делайте в славу Божию', en: 'Whether therefore ye eat, or drink, or whatsoever ye do, do all to the glory of God' },
  { ref: 'Притч 13:4', refEn: 'Prov 13:4', ru: 'Душа ленивого желает, но тщетно; а душа прилежных насытится', en: 'The soul of the sluggard desireth, and hath nothing: but the soul of the diligent shall be made fat' },
  { ref: 'Гал 6:9', refEn: 'Gal 6:9', ru: 'Делая добро, да не унываем, ибо в свое время пожнем, если не ослабеем', en: 'And let us not be weary in well doing: for in due season we shall reap, if we faint not' },
  { ref: '1 Кор 9:24', refEn: '1 Cor 9:24', ru: 'Так бегите, чтобы получить', en: 'So run, that ye may obtain' },
  { ref: 'Пс 56:9', refEn: 'Ps 57:8', ru: 'Воспрянь, слава моя, воспрянь, псалтирь и гусли! Я встану рано', en: 'Awake up, my glory; awake, psaltery and harp: I myself will awake early' },
  { ref: 'Пс 46:8', refEn: 'Ps 47:7', ru: 'Ибо Бог — Царь всей земли; пойте все разумно', en: 'For God is the King of all the earth: sing ye praises with understanding' },
  { ref: 'Пс 89:17', refEn: 'Ps 90:17', ru: 'И в деле рук наших споспешествуй нам', en: 'And establish thou the work of our hands upon us' },
];

// Музыканты: факт и короткий вопрос-призыв. src — откуда (для проверки и будущих правок)
export const MUSICIANS = [
  { ru: 'В 1705 году юный Бах прошёл пешком около 400 километров из Арнштадта в Любек, чтобы послушать органиста Букстехуде. Сегодняшние полчаса за инструментом — ближе.',
    en: 'In 1705 the young Bach walked some 400 km from Arnstadt to Lübeck to hear the organist Buxtehude. Today’s half hour at the instrument is much closer.',
    src: 'Некролог Баха (1754); Ch. Wolff, Johann Sebastian Bach: The Learned Musician (2000)' },
  { ru: 'Девятую симфонию Бетховен закончил, почти полностью потеряв слух. Что мешает сегодня?',
    en: 'Beethoven completed his Ninth Symphony when almost completely deaf. What stands in the way today?',
    src: 'Премьера 7 мая 1824, Вена; J. Swafford, Beethoven: Anguish and Triumph (2014)' },
  { ru: 'После пожара 1928 года у Джанго Рейнхардта на левой руке работали только два пальца. Он придумал свою технику и стал легендой джазовой гитары.',
    en: 'After a 1928 fire Django Reinhardt could use only two fingers of his left hand. He invented his own technique and became a jazz guitar legend.',
    src: 'M. Dregni, Django: The Life and Music of a Gypsy Legend (2004)' },
  { ru: 'Тони Айомми лишился кончиков двух пальцев на заводе, сделал себе напёрстки — и сыграл риффы, с которых начался хеви-метал.',
    en: 'Tony Iommi lost the tips of two fingers in a factory accident, made himself thimbles — and played the riffs that started heavy metal.',
    src: 'T. Iommi, Iron Man: My Journey Through Heaven and Hell with Black Sabbath (2011)' },
  { ru: 'Барабанщик Рик Аллен потерял руку в 1984 году и вернулся на сцену с той же группой, научившись играть заново.',
    en: 'Drummer Rick Allen lost an arm in 1984 and returned to the stage with the same band, having learned to play again.',
    src: 'Def Leppard; многочисленные интервью, в т. ч. Rolling Stone' },
  { ru: 'В Гамбурге в 1960–1962 годах «Битлз» играли ночами по многу часов подряд — сотни выступлений до первой пластинки.',
    en: 'In Hamburg in 1960–62 the Beatles played night after night for hours on end — hundreds of shows before their first record.',
    src: 'M. Lewisohn, The Beatles: All These Years, vol. 1 — Tune In (2013)' },
  { ru: 'Пабло Казальс начинал каждое утро с Баха за роялем — и так всю жизнь, до девяноста с лишним лет.',
    en: 'Pablo Casals began every morning with Bach at the piano — all his life, into his nineties.',
    src: 'P. Casals, Joys and Sorrows (1970), в записи А. Кана' },
  { ru: 'По воспоминаниям друзей, Джими Хендрикс почти не расставался с гитарой — играл дома, в дороге, за разговором.',
    en: 'Friends recalled that Jimi Hendrix was hardly ever without his guitar — at home, on the road, mid-conversation.',
    src: 'C. R. Cross, Room Full of Mirrors (2005)' },
  { ru: 'Рэй Чарльз ослеп в семь лет и выучил ноты шрифтом Брайля: читал рукой, играл другой, потом соединял.',
    en: 'Ray Charles went blind at seven and learned music in Braille: reading with one hand, playing with the other, then putting it together.',
    src: 'R. Charles, D. Ritz, Brother Ray (1978)' },
  { ru: 'Услышав Паганини в 1832 году, Лист засел за упражнения и писал, что работает над техникой по многу часов в день.',
    en: 'After hearing Paganini in 1832, Liszt threw himself into exercises and wrote of working on technique for hours every day.',
    src: 'Письмо Листа П. Вольфу, май 1832; A. Walker, Franz Liszt: The Virtuoso Years (1983)' },
];

// Короткие зовы — заголовки уведомлений (маскот)
export const CALLS = {
  ru: ['Время для практики', 'Инструмент ждёт', 'Пятнадцать минут сегодня — уже шаг', 'Сегодняшний час ещё впереди', 'Пора к инструменту'],
  uz: ["Mashq vaqti", "Cholg'u kutmoqda", "Bugun o'n besh daqiqa — bu ham qadam", "Bugungi soat hali oldinda", "Cholg'u yoniga vaqt"],
  en: ['Time to practise', 'The instrument is waiting', 'Fifteen minutes today is a step', 'Today’s hour is still ahead', 'Time to pick it up'],
};

// i-я цитата (по кругу, писание и музыканты по очереди) на языке lang → { text, ref? }.
// Стихи — только в церковном режиме (scripture = settings.church), иначе — только музыканты
export function quoteAt(i, lang = 'ru', scripture = true) {
  const all = [];
  for (let k = 0; k < Math.max(SCRIPTURE.length, MUSICIANS.length); k++) {
    if (scripture && SCRIPTURE[k]) all.push({ s: SCRIPTURE[k] });
    if (MUSICIANS[k]) all.push({ m: MUSICIANS[k] });
  }
  const q = all[((i % all.length) + all.length) % all.length];
  if (q.s) return lang === 'en' ? { text: q.s.en, ref: q.s.refEn } : { text: q.s.ru, ref: q.s.ref };
  return { text: lang === 'en' ? q.m.en : q.m.ru };
}

// Номер дня (для «одна цитата в день, не повторяется неделями»)
export const dayIndex = (ts = Date.now()) => Math.floor((ts - new Date(ts).getTimezoneOffset() * 60000) / 86400000);

// Текст уведомления: заголовок — зов маскота, текст — цитата
export function notifyText(i, at, lang = 'ru', scripture = true) {
  const calls = CALLS[lang] || CALLS.ru, d = dayIndex(at), q = quoteAt(d * 3 + i, lang, scripture);
  return { title: calls[(d + i) % calls.length], body: q.text + (q.ref ? ' — ' + q.ref : '') };
}
