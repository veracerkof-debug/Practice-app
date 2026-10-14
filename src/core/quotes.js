// Слова маскота: зов к практике (уведомления, главная). Категории (полный сбор с источниками — docs/quotes.md):
// 1) Писание — труд для Бога и мастерство. Русский — Синодальный перевод дословно (как в модуле Библии,
//    public/bible/synodal), английский — King James Version (общественное достояние); узбекский — русский текст.
// 2) Музыканты — только хорошо задокументированные эпизоды, с источником (src). Без выдуманных цифр:
//    ходячие истории вроде «играл по N часов в день» не берём, если нет надёжного источника.
// 3) Слова людей (SAYINGS) — проверенные цитаты с автором и источником.
// Свои тексты (зовы) — без прямого обращения на «ты/вы» (правило проекта); в цитатах оно остаётся как у автора.

export const SCRIPTURE = [
  // at — книга, глава, стих в public/bible/synodal (по нему тест сверяет русский текст дословно)
  { at: 'COL 3 23', ref: 'Кол 3:23', refEn: 'Col 3:23', ru: 'И все, что делаете, делайте от души, как для Господа, а не для человеков', en: 'And whatsoever ye do, do it heartily, as to the Lord, and not unto men' },
  { at: 'ECC 9 10', ref: 'Еккл 9:10', refEn: 'Eccl 9:10', ru: 'Все, что может рука твоя делать, по силам делай', en: 'Whatsoever thy hand findeth to do, do it with thy might' },
  { at: 'PSA 32 3', ref: 'Пс 32:3', refEn: 'Ps 33:3', ru: 'Пойте Ему новую песнь; пойте Ему стройно, с восклицанием', en: 'Sing unto him a new song; play skilfully with a loud noise' },
  { at: 'PRO 22 29', ref: 'Притч 22:29', refEn: 'Prov 22:29', ru: 'Видел ли ты человека проворного в своем деле? Он будет стоять перед царями', en: 'Seest thou a man diligent in his business? he shall stand before kings' },
  { at: '1CH 15 22', ref: '1 Пар 15:22', refEn: '1 Chr 15:22', ru: 'А Хенания, начальник левитов, был учитель пения, потому что был искусен в нем', en: 'And Chenaniah, chief of the Levites, was for song: he instructed about the song, because he was skilful' },
  { at: '1CH 25 7', ref: '1 Пар 25:7', refEn: '1 Chr 25:7', ru: 'И было число их с братьями их, обученными петь пред Господом, всех знающих сие дело, двести восемьдесят восемь', en: 'So the number of them, with their brethren that were instructed in the songs of the Lord, even all that were cunning, was two hundred fourscore and eight' },
  { at: 'ROM 12 11', ref: 'Рим 12:11', refEn: 'Rom 12:11', ru: 'В усердии не ослабевайте; духом пламенейте; Господу служите', en: 'Not slothful in business; fervent in spirit; serving the Lord' },
  { at: '1CO 10 31', ref: '1 Кор 10:31', refEn: '1 Cor 10:31', ru: 'Итак, едите ли, пьете ли или иное что делаете, все делайте в славу Божию', en: 'Whether therefore ye eat, or drink, or whatsoever ye do, do all to the glory of God' },
  { at: 'PRO 13 4', ref: 'Притч 13:4', refEn: 'Prov 13:4', ru: 'Душа ленивого желает, но тщетно; а душа прилежных насытится', en: 'The soul of the sluggard desireth, and hath nothing: but the soul of the diligent shall be made fat' },
  { at: 'GAL 6 9', ref: 'Гал 6:9', refEn: 'Gal 6:9', ru: 'Делая добро, да не унываем, ибо в свое время пожнем, если не ослабеем', en: 'And let us not be weary in well doing: for in due season we shall reap, if we faint not' },
  { at: '1CO 9 24', ref: '1 Кор 9:24', refEn: '1 Cor 9:24', ru: 'Так бегите, чтобы получить', en: 'So run, that ye may obtain' },
  { at: 'PSA 56 9', ref: 'Пс 56:9', refEn: 'Ps 57:8', ru: 'Воспрянь, слава моя, воспрянь, псалтирь и гусли! Я встану рано', en: 'Awake up, my glory; awake, psaltery and harp: I myself will awake early' },
  { at: 'PSA 46 8', ref: 'Пс 46:8', refEn: 'Ps 47:7', ru: 'Ибо Бог — Царь всей земли; пойте все разумно', en: 'For God is the King of all the earth: sing ye praises with understanding' },
  { at: 'PSA 89 17', ref: 'Пс 89:17', refEn: 'Ps 90:17', ru: 'И в деле рук наших споспешествуй нам', en: 'And establish thou the work of our hands upon us' },
  { at: '1TI 4 15', ref: '1 Тим 4:15', refEn: '1 Tim 4:15', ru: 'О сем заботься, в сем пребывай, дабы успех твой для всех был очевиден', en: 'Meditate upon these things; give thyself wholly to them; that thy profiting may appear to all' },
  { at: '2TI 2 15', ref: '2 Тим 2:15', refEn: '2 Tim 2:15', ru: 'Старайся представить себя Богу достойным, делателем неукоризненным', en: 'Study to shew thyself approved unto God, a workman that needeth not to be ashamed' },
  { at: '2TI 1 6', ref: '2 Тим 1:6', refEn: '2 Tim 1:6', ru: 'Возгревать дар Божий, который в тебе', en: 'Stir up the gift of God, which is in thee' },
  { at: 'PRO 12 24', ref: 'Притч 12:24', refEn: 'Prov 12:24', ru: 'Рука прилежных будет господствовать, а ленивая будет под данью', en: 'The hand of the diligent shall bear rule: but the slothful shall be under tribute' },
  { at: 'PRO 14 23', ref: 'Притч 14:23', refEn: 'Prov 14:23', ru: 'От всякого труда есть прибыль, а от пустословия только ущерб', en: 'In all labour there is profit: but the talk of the lips tendeth only to penury' },
  { at: 'ECC 10 10', ref: 'Еккл 10:10', refEn: 'Eccl 10:10', ru: 'Если притупится топор, и если лезвие его не будет отточено, то надобно будет напрягать силы; мудрость умеет это исправить', en: 'If the iron be blunt, and he do not whet the edge, then must he put to more strength: but wisdom is profitable to direct' },
  { at: 'ECC 11 6', ref: 'Еккл 11:6', refEn: 'Eccl 11:6', ru: 'Утром сей семя твое, и вечером не давай отдыха руке твоей', en: 'In the morning sow thy seed, and in the evening withhold not thine hand' },
  { at: '1SA 16 18', ref: '1 Цар 16:18', refEn: '1 Sam 16:18', ru: 'Вот, я видел у Иессея Вифлеемлянина сына, умеющего играть', en: 'Behold, I have seen a son of Jesse the Bethlehemite, that is cunning in playing' },
  { at: 'PHI 3 13', ref: 'Флп 3:13–14', refEn: 'Phil 3:13–14', ru: 'Забывая заднее и простираясь вперед, стремлюсь к цели', en: 'Forgetting those things which are behind, and reaching forth unto those things which are before, I press toward the mark' },
  { at: 'HEB 12 1', ref: 'Евр 12:1', refEn: 'Heb 12:1', ru: 'С терпением будем проходить предстоящее нам поприще', en: 'Let us run with patience the race that is set before us' },
  { at: '1CO 14 15', ref: '1 Кор 14:15', refEn: '1 Cor 14:15', ru: 'Буду петь духом, буду петь и умом', en: 'I will sing with the spirit, and I will sing with the understanding also' },
  { at: '1CO 15 58', ref: '1 Кор 15:58', refEn: '1 Cor 15:58', ru: 'Всегда преуспевайте в деле Господнем, зная, что труд ваш не тщетен пред Господом', en: 'Always abounding in the work of the Lord, forasmuch as ye know that your labour is not in vain in the Lord' },
  { at: 'LUK 16 10', ref: 'Лк 16:10', refEn: 'Luke 16:10', ru: 'Верный в малом и во многом верен', en: 'He that is faithful in that which is least is faithful also in much' },
  { at: 'PSA 91 2', ref: 'Пс 91:2', refEn: 'Ps 92:1', ru: 'Благо есть славить Господа и петь имени Твоему, Всевышний', en: 'It is a good thing to give thanks unto the Lord, and to sing praises unto thy name, O most High' },
  { at: 'PSA 103 33', ref: 'Пс 103:33', refEn: 'Ps 104:33', ru: 'Буду петь Господу во всю жизнь мою, буду петь Богу моему, доколе есмь', en: 'I will sing unto the Lord as long as I live: I will sing praise to my God while I have my being' },
  { at: 'PSA 150 6', ref: 'Пс 150:6', refEn: 'Ps 150:6', ru: 'Все дышащее да хвалит Господа! Аллилуия', en: 'Let every thing that hath breath praise the Lord. Praise ye the Lord' },
  { at: '2CH 5 13', ref: '2 Пар 5:13', refEn: '2 Chr 5:13', ru: 'И были, как один, трубящие и поющие, издавая один голос к восхвалению и славословию Господа', en: 'The trumpeters and singers were as one, to make one sound to be heard in praising and thanking the Lord' },
  { at: 'COL 3 16', ref: 'Кол 3:16', refEn: 'Col 3:16', ru: 'Научайте и вразумляйте друг друга псалмами, славословием и духовными песнями', en: 'Teaching and admonishing one another in psalms and hymns and spiritual songs' },
  { at: 'ISA 40 31', ref: 'Ис 40:31', refEn: 'Isa 40:31', ru: 'А надеющиеся на Господа обновятся в силе: поднимут крылья, как орлы, потекут — и не устанут, пойдут — и не утомятся', en: 'They that wait upon the Lord shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint' },
];

// Слова людей — только проверенные по первоисточнику или надёжному изданию (src). Перевод на русский с английского
// и на английский с русского — свой (tr: true). set — набор (QSETS ниже), выбирается в «Функциях».
// Сомнительные и приписываемые — не здесь, а в docs/quotes.md с пометкой.
export const SAYINGS = [
  { set: 'classic', who: 'И. С. Бах', whoEn: 'J. S. Bach', tr: true,
    ru: 'Мне пришлось усердно трудиться; кто будет так же усерден, достигнет того же.',
    en: 'I was made to work; if you are equally industrious you will be equally successful.',
    src: 'J. N. Forkel, Ueber J. S. Bachs Leben, Kunst und Kunstwerke (1802), гл. VIII; англ. пер. C. S. Terry (1920)' },
  { set: 'faith', who: 'И. С. Бах', whoEn: 'J. S. Bach', tr: true,
    ru: 'Конечная цель и смысл генерал-баса — только слава Божия и отрада души.',
    en: 'The ultimate end and aim of thorough-bass should only be the glory of God and recreation of the mind.',
    src: 'Правила генерал-баса для учеников (1738), список Й. П. Кельнера; Spitta, т. III' },
  { set: 'classic', who: 'Чайковский', whoEn: 'Tchaikovsky', tr: true,
    ru: 'Вдохновение это такая гостья, которая не любит посещать ленивых.',
    en: 'Inspiration is a guest who does not like to visit the lazy.',
    src: 'Письмо Н. Ф. фон Мекк, Каменка, 24 июня 1878 (№ 163)' },
  { set: 'classic', who: 'Пабло Казальс', whoEn: 'Pablo Casals', tr: true,
    ru: 'На вопрос, зачем он в восемьдесят с лишним лет занимается по четыре-пять часов в день: «Потому что, мне кажется, я делаю успехи».',
    en: 'Asked why, in his eighties, he still practised four or five hours a day: “Because I think I am making progress.”',
    src: 'Фильм R. Snyder «A Day in the Life of Pablo Casals» (1958) по колонке L. Lyons; Quote Investigator, 2014' },
  { set: 'faith', who: 'Брат Лаврентий', whoEn: 'Brother Lawrence', tr: true,
    ru: 'Не должно уставать делать малые дела из любви к Богу: Он смотрит не на величину дела, а на любовь, с которой оно сделано.',
    en: 'We ought not weary of doing little things for the love of God, who regards not the greatness of the work, but the love with which it is performed.',
    src: 'Brother Lawrence, The Practice of the Presence of God (XVII в.), Беседа 4' },
  { set: 'faith', who: 'К. С. Льюис', whoEn: 'C. S. Lewis', tr: true,
    ru: 'Труд Бетховена и труд уборщицы становятся духовными при одном и том же условии — если они принесены Богу, сделаны смиренно, «как для Господа».',
    en: 'The work of a Beethoven, and the work of a charwoman, become spiritual on precisely the same condition, that of being offered to God, of being done humbly “as to the Lord”.',
    src: 'C. S. Lewis, «Learning in War-Time», проповедь, Оксфорд, 22 октября 1939 (The Weight of Glory)' },
  { set: 'faith', who: 'Августин', whoEn: 'Augustine', tr: true,
    ru: 'Как я плакал над Твоими гимнами и песнями, глубоко тронутый голосами Твоей сладкозвучной Церкви!',
    en: 'How did I weep, in Thy Hymns and Canticles, touched to the quick by the voices of Thy sweet-attuned Church!',
    src: 'Августин, Исповедь, кн. IX, 6; англ. пер. E. B. Pusey' },
  { set: 'faith', who: 'Мартин Лютер', whoEn: 'Martin Luther', tr: true,
    ru: 'После Слова Божия музыка заслуживает высшей похвалы.',
    en: 'Next to the Word of God, music deserves the highest praise.',
    src: 'Предисловие к Symphoniae iucundae Г. Рау (1538); Luther’s Works, т. 53, с. 321–323' },
  { set: 'faith', who: 'Джон Уэсли', whoEn: 'John Wesley', tr: true,
    ru: 'Пойте бодро и смело. Остерегайтесь петь так, будто вы полумертвы или полусонны: поднимите голос с силой.',
    en: 'Sing lustily and with a good courage. Beware of singing as if you were half dead, or half asleep; but lift up your voice with strength.',
    src: 'J. Wesley, «Directions for Singing», Select Hymns (1761), п. IV' },
  { set: 'classic', who: 'Суворов', whoEn: 'Suvorov', tr: true,
    ru: 'Легко в ученье — тяжело в походе; тяжело в ученье — легко в походе.',
    en: 'Easy in training, hard on the march; hard in training, easy on the march.',
    src: 'А. В. Суворов, «Наука побеждать» (1795–1796)' },
  { set: 'classic', who: 'Русская пословица', whoEn: 'Russian proverb', tr: true,
    ru: 'Терпение и труд всё перетрут.',
    en: 'Patience and work grind everything down.',
    src: 'В. И. Даль, Пословицы русского народа (1862)' },
];

// Музыканты: факт и короткий вопрос-призыв. src — откуда (для проверки и будущих правок)
export const MUSICIANS = [
  { set: 'classic', ru: 'В 1705 году юный Бах прошёл пешком около 400 километров из Арнштадта в Любек, чтобы послушать органиста Букстехуде. Сегодняшние полчаса за инструментом — ближе.',
    en: 'In 1705 the young Bach walked some 400 km from Arnstadt to Lübeck to hear the organist Buxtehude. Today’s half hour at the instrument is much closer.',
    src: 'Некролог Баха (1754); Ch. Wolff, Johann Sebastian Bach: The Learned Musician (2000)' },
  { set: 'classic', ru: 'Девятую симфонию Бетховен закончил, почти полностью потеряв слух. Что мешает сегодня?',
    en: 'Beethoven completed his Ninth Symphony when almost completely deaf. What stands in the way today?',
    src: 'Премьера 7 мая 1824, Вена; J. Swafford, Beethoven: Anguish and Triumph (2014)' },
  { set: 'rock', ru: 'После пожара 1928 года у Джанго Рейнхардта на левой руке работали только два пальца. Он придумал свою технику и стал легендой джазовой гитары.',
    en: 'After a 1928 fire Django Reinhardt could use only two fingers of his left hand. He invented his own technique and became a jazz guitar legend.',
    src: 'M. Dregni, Django: The Life and Music of a Gypsy Legend (2004)' },
  { set: 'rock', ru: 'Тони Айомми лишился кончиков двух пальцев на заводе, сделал себе напёрстки — и сыграл риффы, с которых начался хеви-метал.',
    en: 'Tony Iommi lost the tips of two fingers in a factory accident, made himself thimbles — and played the riffs that started heavy metal.',
    src: 'T. Iommi, Iron Man: My Journey Through Heaven and Hell with Black Sabbath (2011)' },
  { set: 'rock', ru: 'Барабанщик Рик Аллен потерял руку в 1984 году и вернулся на сцену с той же группой, научившись играть заново.',
    en: 'Drummer Rick Allen lost an arm in 1984 and returned to the stage with the same band, having learned to play again.',
    src: 'Def Leppard; многочисленные интервью, в т. ч. Rolling Stone' },
  { set: 'rock', ru: 'В Гамбурге в 1960–1962 годах «Битлз» играли ночами по многу часов подряд — сотни выступлений до первой пластинки.',
    en: 'In Hamburg in 1960–62 the Beatles played night after night for hours on end — hundreds of shows before their first record.',
    src: 'M. Lewisohn, The Beatles: All These Years, vol. 1 — Tune In (2013)' },
  { set: 'classic', ru: 'Пабло Казальс начинал каждое утро с Баха за роялем — и так всю жизнь, до девяноста с лишним лет.',
    en: 'Pablo Casals began every morning with Bach at the piano — all his life, into his nineties.',
    src: 'P. Casals, Joys and Sorrows (1970), в записи А. Кана' },
  { set: 'rock', ru: 'По воспоминаниям друзей, Джими Хендрикс почти не расставался с гитарой — играл дома, в дороге, за разговором.',
    en: 'Friends recalled that Jimi Hendrix was hardly ever without his guitar — at home, on the road, mid-conversation.',
    src: 'C. R. Cross, Room Full of Mirrors (2005)' },
  { set: 'rock', ru: 'Рэй Чарльз ослеп в семь лет и выучил ноты шрифтом Брайля: читал рукой, играл другой, потом соединял.',
    en: 'Ray Charles went blind at seven and learned music in Braille: reading with one hand, playing with the other, then putting it together.',
    src: 'R. Charles, D. Ritz, Brother Ray (1978)' },
  { set: 'classic', ru: 'Услышав Паганини в 1832 году, Лист засел за упражнения и писал, что работает над техникой по многу часов в день.',
    en: 'After hearing Paganini in 1832, Liszt threw himself into exercises and wrote of working on technique for hours every day.',
    src: 'Письмо Листа П. Вольфу, май 1832; A. Walker, Franz Liszt: The Virtuoso Years (1983)' },

  // рок и джаз (проверено: биографии, интервью, журналы)
  { set: 'rock', ru: 'В 1948 году Лес Пол разбил руку в аварии. Он попросил хирургов срастить её под углом, чтобы держать гитару, — и через полтора года снова играл.',
    en: 'In 1948 Les Paul shattered his arm in a car crash. He asked the surgeons to set it at an angle so he could hold a guitar — and was playing again within about a year and a half.',
    src: 'Biography.com; UPI, 2001 (интервью); воспоминания Дж. Уолша, Guitar Player' },
  { set: 'rock', ru: 'Свою гитару «Red Special» Брайан Мэй подростком собирал вместе с отцом почти два года — гриф выточили из старой каминной полки.',
    en: 'As a teenager Brian May spent about two years building his Red Special guitar with his father — the neck was carved from an old fireplace mantel.',
    src: 'B. May, S. Bradley, Brian May’s Red Special (2014); Guitar Player' },
  { set: 'rock', ru: 'В 1990 году Стив Вай расписал для журнала Guitar World свои занятия: гаммы, аккорды, слух, чтение с листа, теория — по часам, день за днём.',
    en: 'In 1990 Steve Vai laid out his practice routine for Guitar World: scales, chords, ear training, sight-reading, theory — hour by hour, day after day.',
    src: 'Guitar World, январь 1990 (D. Whitehill); Hal Leonard, Steve Vai’s Guitar Workout' },
  // христианские авторы и исполнители
  { set: 'faith', ru: 'Фанни Кросби ослепла в младенчестве и написала слова тысяч гимнов — столько, что издатели просили её подписываться десятками псевдонимов.',
    en: 'Fanny Crosby lost her sight as a baby and wrote the words of thousands of hymns — so many that publishers asked her to use dozens of pen names.',
    src: 'F. Crosby, Memories of Eighty Years (1906); Britannica; Hymnology Archive' },
  { set: 'faith', ru: 'В 1873 году Горацио Спаффорд потерял четырёх дочерей при крушении парохода — и, проплывая то место, написал «It Is Well with My Soul» («Мир с моей душой»).',
    en: 'In 1873 Horatio Spafford lost his four daughters in a shipwreck — and, sailing past the place, wrote “It Is Well with My Soul”.',
    src: 'Wikipedia: Horatio Spafford; Library of Congress, American Colony in Jerusalem collection' },
  { set: 'faith', ru: 'Джон Ньютон, бывший капитан невольничьего судна, стал пастором и написал «Amazing Grace» — гимн впервые напечатан в «Olney Hymns» в 1779 году.',
    en: 'John Newton, once captain of a slave ship, became a pastor and wrote “Amazing Grace” — first printed in Olney Hymns in 1779.',
    src: 'Olney Hymns (1779); J. Newton, An Authentic Narrative (1764)' },
  { set: 'faith', ru: 'Рич Маллинз отдавал доходы от концертов и альбомов на благотворительность, оставляя себе зарплату обычного рабочего.',
    en: 'Rich Mullins gave the income from his concerts and albums to charity, keeping only an ordinary worker’s wage.',
    src: 'J. Smith, Rich Mullins: An Arrow Pointing to Heaven (2000); Christianity Today' },
];

// Цитатник Мелеты (мемный набор): свои шуточные «пацанские» афоризмы о практике — не приписываются реальным людям
export const MEME = [
  ['Метроном не торопится. Метроном ждёт.', 'The metronome is never in a hurry. The metronome waits.'],
  ['Если долго смотреть на гитару, гитара не настроится.', 'Stare at a guitar long enough and it still won’t tune itself.'],
  ['Работа не волк. Работа — это гаммы.', 'Work is not a wolf. Work is scales.'],
  ['Барре не выбирают. Барре проходят.', 'Nobody chooses the barre chord. The barre chord is survived.'],
  ['Аккорд фа не берётся с первого раза. Его берут характером.', 'An F chord is never taken on the first try. It is taken by character.'],
  ['Мозоли — это медали, которые выдают каждый день.', 'Calluses are medals handed out daily.'],
  ['Сначала человек играет гаммы. Потом гаммы играют человеком.', 'First a man plays scales. Then the scales play the man.'],
  ['Настоящий музыкант не ищет вдохновение. Он настраивает гитару.', 'A real musician doesn’t look for inspiration. He tunes the guitar.'],
  ['Кто не считает до четырёх, тот вступает не вовремя. В музыке как в жизни.', 'Whoever can’t count to four comes in at the wrong time. In music as in life.'],
  ['Не бывает плохих инструментов. Бывают ненастроенные.', 'There are no bad instruments. Only untuned ones.'],
  ['Пятнадцать минут каждый день сильнее трёх часов в субботу. Камень подтвердит.', 'Fifteen minutes a day beats three hours on Saturday. The stone will confirm.'],
  ['Быстро — это медленно, но без перерывов.', 'Fast is just slow without the breaks.'],
  ['Пауза — тоже музыка. Но только если её досчитать.', 'A rest is music too. But only if it’s counted.'],
  ['Струна рвётся у того, кто играет. У того, кто не играет, рвётся мечта.', 'Strings break for those who play. For those who don’t, dreams do.'],
  ['Потом позанимаюсь — сказал он. И не позанимался.', '“I’ll practise later,” he said. And he didn’t.'],
  ['Метроном — не враг. Враг — это «завтра начну».', 'The metronome is not the enemy. The enemy is “I’ll start tomorrow”.'],
  ['Тишина после чисто взятой ноты громче аплодисментов.', 'The silence after a clean note is louder than applause.'],
  ['Медленно и чисто — это тоже скорость. Просто пока что.', 'Slow and clean is speed too. Just not yet.'],
  ['Сосед стучит по батарее — значит, ритм услышан.', 'The neighbour is banging on the pipes — so the rhythm got through.'],
  ['Каждый день без практики кто-то другой учит это соло.', 'Every day without practice, someone else is learning that solo.'],
];

// Короткие зовы — заголовки уведомлений (маскот)
export const CALLS = {
  ru: ['Время для практики', 'Инструмент ждёт', 'Пятнадцать минут сегодня — уже шаг', 'Сегодняшний час ещё впереди', 'Пора к инструменту'],
  uz: ["Mashq vaqti", "Cholg'u kutmoqda", "Bugun o'n besh daqiqa — bu ham qadam", "Bugungi soat hali oldinda", "Cholg'u yoniga vaqt"],
  en: ['Time to practise', 'The instrument is waiting', 'Fifteen minutes today is a step', 'Today’s hour is still ahead', 'Time to pick it up'],
};

// Наборы цитат (выбор человека в «Функциях»): рок и джаз, классика, Библия, христианские авторы, цитатник
export const QSETS = ['rock', 'classic', 'bible', 'faith', 'meme'];
// По умолчанию: классика и рок; в церковном режиме — ещё Библия и христианские авторы
// Свои сборники (settings.quoteBooks, из файла .melete / от нейросети) — наборы 'own:<id>'
const ownIds = (settings) => (settings.quoteBooks || []).map((b) => 'own:' + b.id);
export const setsOf = (settings = {}) => {
  const ok = [...QSETS, ...ownIds(settings)];
  const v = Array.isArray(settings.qsets) ? settings.qsets.filter((k) => ok.includes(k)) : null;
  return v && v.length ? v : settings.church ? ['bible', 'faith', 'classic', 'rock'] : ['classic', 'rock'];
};

// Цитаты выбранных наборов по кругу — вперемешку, чтобы подряд не шли из одного набора
function pool(sets, books) {
  const lists = sets.map((k) =>
    k.startsWith('own:') ? ((books.find((b) => 'own:' + b.id === k) || {}).items || []).map((o) => ({ o })) :
    k === 'bible' ? SCRIPTURE.map((s) => ({ s })) :
    k === 'meme' ? MEME.map((x) => ({ x })) :
    [...MUSICIANS.filter((m) => m.set === k).map((m) => ({ m })), ...SAYINGS.filter((w) => w.set === k).map((w) => ({ w }))]);
  const all = [], n = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < n; i++) lists.forEach((l) => { if (l[i]) all.push(l[i]); });
  return all;
}
const POOLS = {};

// i-я цитата на языке lang из наборов sets (массив; true/false — как раньше: церковный режим или нет) → { text, ref? }.
// books — свои сборники (settings.quoteBooks)
export function quoteAt(i, lang = 'ru', sets = true, books = []) {
  if (!Array.isArray(sets)) sets = setsOf({ church: !!sets });
  const key = sets.join(',') + '|' + books.map((b) => b.id + ':' + b.items.length).join(','), all = POOLS[key] || (POOLS[key] = pool(sets, books));
  if (!all.length) return { text: '' };
  const q = all[((i % all.length) + all.length) % all.length];
  if (q.s) return lang === 'en' ? { text: q.s.en, ref: q.s.refEn } : { text: q.s.ru, ref: q.s.ref };
  if (q.w) return lang === 'en' ? { text: q.w.en, ref: q.w.whoEn } : { text: q.w.ru, ref: q.w.who };
  if (q.o) return { text: q.o.text, ref: q.o.by };
  if (q.x) return { text: lang === 'en' ? q.x[1] : q.x[0], ref: lang === 'en' ? 'Melete’s book of wisdom' : 'Цитатник Мелеты' };
  return { text: lang === 'en' ? q.m.en : q.m.ru };
}

// Номер дня (для «одна цитата в день, не повторяется неделями»)
export const dayIndex = (ts = Date.now()) => Math.floor((ts - new Date(ts).getTimezoneOffset() * 60000) / 86400000);

// Текст уведомления: заголовок — зов маскота, текст — цитата (напоминания по характеру — src/core/remindtexts.js)
export function notifyText(i, at, lang = 'ru', sets = true, books = []) {
  const calls = CALLS[lang] || CALLS.ru, d = dayIndex(at), q = quoteAt(d * 3 + i, lang, sets, books);
  return { title: calls[(d + i) % calls.length], body: q.text + (q.ref ? ' — ' + q.ref : '') };
}
