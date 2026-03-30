-- Seed intro_script from Dubbadhu S2-S5 Scripts.docx
-- Requires: sql/add_lesson_series_intro_script.sql applied first.
-- Series ids assumed: series2 … series5 (see docs/admin-lesson-editing-spec.md).
-- Note: this Word file only contains Series 2–5; there is no script text for series6–series25 here.

update public.lesson_series
  set intro_script = $s2_docx$
AFAAN OROMOO: SERIES 2 — INTRODUCTIONS (First Meeting)

CHALTU
Akkam!
DURESA
Akkam! Baga nagaan dhufte!
CHALTU
Baga nagaan na eegde! Maqaan koo Caaltuu jedhama. Maqaan kee eenyu?
DURESA
Maqaan koo Dureessaa jedhama. Akkam jirta, Caaltuu?
CHALTU
Nagaa, galata Rabbii. Akkam jirta ati?
DURESA
Anis naguma.
CHALTU
Eessaa dhufte?
DURESA
Ani Finfinnee irraan dhufe. Ati hoo?
CHALTU
Ani Shashamannee irraan dhufe. Eessa jiraatta?
DURESA
Finfinnee jiraadha. Ati hoo?
CHALTU
Ani Shashamannee jiraadha.
DURESA
Baay'ee gaari dha! Nagaatti, Caaltuu!
CHALTU
Nagaatti, Dureessaa! Guyyaa gaarii!
DURESA
Afaan Oromo dubbadhu! (Turn to camera)
CHALTU
Afaan Oromo dubbadhu! (Turn to camera)
$s2_docx$
  where id = 'series2';

update public.lesson_series
  set intro_script = $s3_docx$
AFAAN OROMOO: SERIES 3 — FAMILY (Second Meeting)

CHALTU
Dureessaa! Baga argine!
DURESA
Caaltuu! Akkam jirta?
CHALTU
Naguma, galatoomi. Maatiin kee akkam jiru?
DURESA
Maatiin koo nagaa jiru, galatoomi. Abbaan kee akkam jira?
CHALTU
Abbaan koo nagaan jira. Haati kee akkam jirti?
DURESA
Haati koo nagaa jirti, galatoomi. Obboleettii qabdaa?
CHALTU
Eeyyee, obboleettii lama nan qaba. Ati hoo? Obboleessa qabdaa?
DURESA
Eeyyee, obboleessa lamaa fi obboleettii tokko nan qaba.
CHALTU
Baay'ee gaarii dha! Obboleessonni kee eessa jiraatu?
DURESA
Finfinnee jiraatu. Obboleessonni kee hoo?
CHALTU
Isaanis Shashamannee jiraatu.
DURESA
Umriin kee meeqa?
CHALTU
Umriin koo digdamii shan. Ati hoo?
DURESA
Umriin koo digdamii saddeet.
CHALTU
Baay'ee gaarii dha! Nagaatti, Dureessaa!
DURESA
Nagaatti, Caaltuu! Guyyaa gaarii!
DURESA
Afaan Oromo dubbadhu! (Turn to camera)
CHALTU
Afaan Oromo dubbadhu! (Turn to camera)
$s3_docx$
  where id = 'series3';

update public.lesson_series
  set intro_script = $s4_docx$
AFAAN OROMOO: SERIES 4 — MEETING SOMEONE NEW (First Meeting)

MILKII
(Walking outside, morning)
MILKII
Akkam oolte, Eebbaa?
EEBBAA
Akkam oolte, Milkii! Nagaa dha?
MILKII
Nagaa, Galata Rabbii. Akkam jirta?
EEBBAA
Anis naguma. Eessaa deemta?
MILKII
Mana barumsaa deemaan jira. Ati hoo?
EEBBAA
Ani gara hojiin deema. Barumsi akkam?
MILKII
Barumsi gaarii dha.
EEBBAA
Baay'ee gaari dha! Maal hojjetta, Milkii?
MILKII
Ani barataa dha. Yuunivarisiitiin baradha. Ati hoo?
EEBBAA
Ani barsiisaa dha. Mana barumsaa keessattiin barsiisa.
MILKII
Baay'ee gaari dha! Hojiin akkam?
EEBBAA
Hojiin gaari dha, galatoomi.
MILKII
Nagaatti, Eebbaa!
EEBBAA
Nagaatti, Milkii! Guyyaa gaarii!
MILKII
Afaan Oromoo dubbadhu! (Turn to camera)
EEBBAA
Afaan Oromoo dubbadhu! (Turn to camera)
$s4_docx$
  where id = 'series4';

update public.lesson_series
  set intro_script = $s5_docx$
AFAAN OROMOO: SERIES 5 — MAKING PLANS (Second Meeting)

EEBBAA
Milkii! Baga wal argine!
MILKII
Eebbaa! Akkam jirta?
EEBBAA
Naguma, galatoomi. Maatiin kee akkam jiru?
MILKII
Maatiin koo nagaa jiru, galatoomi. Maatiin kee hoo?
EEBBAA
Maatiin koo nagaa jiru, galatoomi.
MILKII
Yeroo yoom qabda, Eebbaa?
EEBBAA
Yeroo Galgala nan qaba. Maaliif?
MILKII
Galgala wal haa arginu!
EEBBAA
Tole! Galgala wal argina.
MILKII
Gaarii dha. Nagaatti, Eebbaa!
EEBBAA
Nagaatti, Milkii! Guyyaa gaarii!
MILKII
Afaan Oromoo dubbadhu! (Turn to camera)
EEBBAA
Afaan Oromoo dubbadhu! (Turn to camera)
$s5_docx$
  where id = 'series5';
