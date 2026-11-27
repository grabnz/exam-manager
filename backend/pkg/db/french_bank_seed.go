package db

import (
	"gorm.io/gorm"
)

// StarterFrenchQuestionBank returns a rich, authentic set of Tunisian primary school
// French exercise blocks covering 3ème–6ème année (Lecture, Langue, Production Écrite).
// Deterministic IDs guarantee idempotent upserts without duplicates.
func StarterFrenchQuestionBank() []QuestionBlock {
	return []QuestionBlock{
		// ── 4ème année — Module 2 : Bienvenue chez les Dupré (La famille) ─────────
		{
			ID: "starter-fr-4e-m2-comp", Section: "lecture", BlockType: "reading_comprehension",
			Level: "4ème année", SubjectCode: "francais", Trimester: 1, ModuleNum: 2,
			Criterion: "C1", Points: 6, Difficulty: "easy", Topic: "Chez la famille Dupré (Texte + Questions)",
			ContentJSON: `{"title":"Un dimanche en famille","text":"C'est dimanche matin chez la famille Dupré. Dans la cuisine, maman prépare des crêpes chaudes pour le petit-déjeuner. Papa met la table dans le salon. Bruno aide sa petite sœur Nadine à ranger ses cahiers. Toute la famille est heureuse de passer cette belle journée ensemble.","source":"Module 2 — 4ème année","image_url":"/illustrations/famille.jpg","numbered_lines":true,"questions":[{"prompt":"Où se passe la scène ?","criterion":"C2","points":2,"lines":1,"answer":"Chez la famille Dupré (dans la maison)."},{"prompt":"Que fait maman dans la cuisine ?","criterion":"C2","points":2,"lines":2,"answer":"Maman prépare des crêpes chaudes pour le petit-déjeuner."},{"prompt":"Pourquoi toute la famille est-elle heureuse ? Je relève la phrase du texte.","criterion":"C4","points":2,"lines":2,"answer":"Toute la famille est heureuse de passer cette belle journée ensemble."}]}`,
		},
		{
			ID: "starter-fr-4e-m2-jardin-txt", Section: "lecture", BlockType: "reading_text",
			Level: "4ème année", SubjectCode: "francais", Trimester: 1, ModuleNum: 2,
			Criterion: "C1", Points: 0, Difficulty: "easy", Topic: "Le jardin de l'école",
			ContentJSON: `{"title":"Le jardin de l'école","text":"Ce matin, les élèves de la quatrième année descendent dans la cour avec leur maîtresse. Sami apporte un petit arrosoir bleu et Lina plante des fleurs jaunes près du mur. Tous les enfants sont heureux car le jardin devient propre et coloré.","source":"Texte adapté — 4ème année","image_url":"/illustrations/jardin.jpg","numbered_lines":true}`,
		},
		{
			ID: "starter-fr-4e-m2-mcq", Section: "lecture", BlockType: "mcq",
			Level: "4ème année", SubjectCode: "francais", Trimester: 1, ModuleNum: 2,
			Criterion: "C2", Points: 2, Difficulty: "easy", Topic: "Compréhension globale — QCM",
			ContentJSON: `{"prompt":"Je coche la bonne réponse : Où vont les élèves ce matin ?","options":["À la bibliothèque","Dans la cour pour jardiner","Au stade"],"answer_index":1}`,
		},
		{
			ID: "starter-fr-4e-m2-tf", Section: "lecture", BlockType: "true_false",
			Level: "4ème année", SubjectCode: "francais", Trimester: 1, ModuleNum: 2,
			Criterion: "C2", Points: 3, Difficulty: "easy", Topic: "Vrai ou Faux — Compréhension fine",
			ContentJSON: `{"prompt":"J'écris « Vrai » ou « Faux » devant chaque phrase :","items":[{"statement":"Sami apporte un arrosoir rouge.","answer":false},{"statement":"Lina plante des fleurs jaunes.","answer":true},{"statement":"Les enfants sont contents de leur travail.","answer":true}]}`,
		},
		{
			ID: "starter-fr-4e-m2-open", Section: "lecture", BlockType: "open_question",
			Level: "4ème année", SubjectCode: "francais", Trimester: 1, ModuleNum: 2,
			Criterion: "C4", Points: 2, Difficulty: "medium", Topic: "Justification à partir du texte",
			ContentJSON: `{"prompt":"Pourquoi les enfants sont-ils heureux ? Je relève la phrase du texte.","lines":2,"answer":"Tous les enfants sont heureux car le jardin devient propre et coloré."}`,
		},
		{
			ID: "starter-fr-4e-m2-cloze-aa", Section: "langue", BlockType: "fill_blanks",
			Level: "4ème année", SubjectCode: "francais", Trimester: 1, ModuleNum: 2,
			Criterion: "C5", Points: 3, Difficulty: "medium", Topic: "Orthographe : Homophones a / à",
			ContentJSON: `{"prompt":"Je complète les phrases par « a » ou « à » :","word_bank":["a","à"],"sentences":["Sami [a] un joli cartable.","Lina va [à] l'école chaque matin.","La maîtresse [a] préparé un jeu [à] la récréation."]}`,
		},
		{
			ID: "starter-fr-4e-m2-cloze-etest", Section: "langue", BlockType: "fill_blanks",
			Level: "4ème année", SubjectCode: "francais", Trimester: 1, ModuleNum: 2,
			Criterion: "C5", Points: 3, Difficulty: "medium", Topic: "Orthographe : Homophones et / est",
			ContentJSON: `{"prompt":"Je complète les phrases par « et » ou « est » :","word_bank":["et","est"],"sentences":["Le jardin [est] grand [et] fleuri.","Mon ami [est] gentil [et] sérieux.","Bruno [est] dans la cour avec Nadine [et] Sami."]}`,
		},
		{
			ID: "starter-fr-4e-m2-table-pres", Section: "langue", BlockType: "table_fill",
			Level: "4ème année", SubjectCode: "francais", Trimester: 1, ModuleNum: 2,
			Criterion: "C5", Points: 3, Difficulty: "medium", Topic: "Conjugaison : Tableau présent (1er groupe)",
			ContentJSON: `{"prompt":"Je complète le tableau de conjugaison au présent :","headers":["Verbe (Infinitif)","Je / J'","Nous","Ils / Elles"],"rows":[["chanter","[chante]","[chantons]","[chantent]"],["ranger","[range]","[rangeons]","[rangent]"],["préparer","[prépare]","[préparons]","[préparent]"]]}`,
		},
		{
			ID: "starter-fr-4e-m2-scramble", Section: "langue", BlockType: "scramble",
			Level: "4ème année", SubjectCode: "francais", Trimester: 1, ModuleNum: 2,
			Criterion: "C3", Points: 2, Difficulty: "easy", Topic: "Grammaire : Ordre de la phrase (GNS + GV)",
			ContentJSON: `{"prompt":"Je remets les mots en ordre pour former une phrase correcte :","chunks":["les fleurs","arrose","Le petit garçon","du jardin."],"answer":"Le petit garçon arrose les fleurs du jardin."}`,
		},
		{
			ID: "starter-fr-4e-m2-prod", Section: "production", BlockType: "production_ecrite",
			Level: "4ème année", SubjectCode: "francais", Trimester: 1, ModuleNum: 2,
			Criterion: "C1", Points: 6, Difficulty: "medium", Topic: "Production Écrite : Une journée en famille / à l'école",
			ContentJSON: `{"prompt":"Observe l'image et écris un petit paragraphe (4 à 5 phrases) pour raconter comment les enfants aident leur famille ou décorent la cour de l'école.","lines":6,"toolbox":{"nouns":["la famille","la cour","les élèves","les fleurs","la maîtresse"],"verbs":["aider","nettoyer","planter","arroser","être heureux"],"connectors":["D'abord,","Ensuite,","Puis,","Enfin,"]},"panels":["/illustrations/jardin.jpg","/illustrations/famille.jpg"],"model_answer":"D'abord, les élèves ramassent les papiers dans la cour. Ensuite, Sami et Lina plantent de jolies fleurs. Puis, ils arrosent les plantes avec de l'eau fraîche. Enfin, la maîtresse félicite tous les enfants."}`,
		},

		// ── 4ème année — Trimestre 2 & 3 (Modules 3–6) ────────────────────────────
		{
			ID: "starter-fr-4e-t2-matching", Section: "langue", BlockType: "matching",
			Level: "4ème année", SubjectCode: "francais", Trimester: 2, ModuleNum: 3,
			Criterion: "C5", Points: 2, Difficulty: "easy", Topic: "Conjugaison : Relier sujet et verbe",
			ContentJSON: `{"prompt":"Je relie chaque sujet au verbe qui convient :","pairs":[{"left":"Je","right":"mange une pomme."},{"left":"Nous","right":"jouons dans la cour."},{"left":"Les filles","right":"lisent une histoire."}]}`,
		},
		{
			ID: "starter-fr-4e-t2-transf", Section: "langue", BlockType: "transformation",
			Level: "4ème année", SubjectCode: "francais", Trimester: 2, ModuleNum: 4,
			Criterion: "C5", Points: 3, Difficulty: "medium", Topic: "Grammaire : Transformation au pluriel",
			ContentJSON: `{"prompt":"Je réécris les phrases au pluriel :","items":[{"source":"Le petit oiseau chante sur la branche.","lines":2,"answer":"Les petits oiseaux chantent sur la branche."},{"source":"L'élève prépare son cahier propre.","lines":2,"answer":"Les élèves préparent leurs cahiers propres."}]}`,
		},

		// ── 3ème année — Modules 1–4 ──────────────────────────────────────────────
		{
			ID: "starter-fr-3e-m1-comp", Section: "lecture", BlockType: "reading_comprehension",
			Level: "3ème année", SubjectCode: "francais", Trimester: 1, ModuleNum: 1,
			Criterion: "C1", Points: 6, Difficulty: "easy", Topic: "La rentrée à l'école (3ème année)",
			ContentJSON: `{"title":"Bonjour l'école !","text":"C'est la rentrée. Amine met son beau cartable bleu. Il entre dans la cour de l'école et dit bonjour à sa maîtresse et à son amie Nadia. Les enfants sont très contents de retrouver leur classe.","source":"Module 1 — 3ème année","image_url":"/illustrations/ecole.jpg","numbered_lines":true,"questions":[{"prompt":"Comment s'appelle le garçon ?","criterion":"C2","points":2,"lines":1,"answer":"Il s'appelle Amine."},{"prompt":"De quelle couleur est son cartable ?","criterion":"C2","points":2,"lines":1,"answer":"Son cartable est bleu."},{"prompt":"À qui Amine dit-il bonjour ?","criterion":"C2","points":2,"lines":2,"answer":"Il dit bonjour à sa maîtresse et à son amie Nadia."}]}`,
		},
		{
			ID: "starter-fr-3e-m1-cloze", Section: "langue", BlockType: "fill_blanks",
			Level: "3ème année", SubjectCode: "francais", Trimester: 1, ModuleNum: 1,
			Criterion: "C5", Points: 4, Difficulty: "easy", Topic: "Déterminants un / une / des",
			ContentJSON: `{"prompt":"Je complète par « un », « une » ou « des » :","word_bank":["un","une","des"],"sentences":["Amine porte [un] cartable neuf.","Nadia ouvre [une] trousse rose.","Dans la cour, il y a [des] élèves souriants."]}`,
		},
		{
			ID: "starter-fr-3e-m1-scramble", Section: "langue", BlockType: "scramble",
			Level: "3ème année", SubjectCode: "francais", Trimester: 1, ModuleNum: 2,
			Criterion: "C3", Points: 4, Difficulty: "easy", Topic: "Construire une phrase simple",
			ContentJSON: `{"prompt":"Je remets les étiquettes en ordre pour écrire une phrase :","chunks":["lit","Nadia","un joli livre","en classe."],"answer":"Nadia lit un joli livre en classe."}`,
		},
		{
			ID: "starter-fr-3e-m1-prod", Section: "production", BlockType: "production_ecrite",
			Level: "3ème année", SubjectCode: "francais", Trimester: 1, ModuleNum: 1,
			Criterion: "C1", Points: 6, Difficulty: "easy", Topic: "Produire 3 phrases sur la rentrée",
			ContentJSON: `{"prompt":"Observe l'image et écris 3 phrases simples pour présenter Amine et son école.","lines":5,"toolbox":{"nouns":["Amine","le cartable","la cour","la maîtresse","les amis"],"verbs":["aller","porter","saluer","jouer"],"connectors":["Aujourd'hui,","Puis,","Enfin,"]},"panels":["/illustrations/ecole.jpg"],"model_answer":"Aujourd'hui, Amine va à l'école avec son cartable. Puis, il salue la maîtresse dans la cour. Enfin, il joue avec ses amis."}`,
		},

		// ── 5ème année — Modules 1–6 ──────────────────────────────────────────────
		{
			ID: "starter-fr-5e-m1-comp", Section: "lecture", BlockType: "reading_comprehension",
			Level: "5ème année", SubjectCode: "francais", Trimester: 1, ModuleNum: 1,
			Criterion: "C1", Points: 7, Difficulty: "medium", Topic: "L'oiseau blessé — Solidarité (5ème année)",
			ContentJSON: `{"title":"Le petit oiseau du jardin","text":"Un après-midi d'automne, Youssef entend un petit bruit sous l'olivier du jardin. Il s'approche doucement et découvre un jeune rouge-gorge qui a mal à l'aile. Sans hésiter, Youssef prend l'oiseau avec précaution, lui donne un peu d'eau fraîche et demande l'aide de son père pour le soigner. Trois jours plus tard, l'oiseau guéri s'envole joyeusement vers le ciel bleu.","source":"Module 1 — 5ème année","image_url":"/illustrations/oiseau.jpg","numbered_lines":true,"questions":[{"prompt":"Où Youssef trouve-t-il le petit oiseau ?","criterion":"C2","points":2,"lines":1,"answer":"Sous l'olivier du jardin."},{"prompt":"Que fait Youssef pour aider l'oiseau ?","criterion":"C2","points":2,"lines":2,"answer":"Il le prend avec précaution, lui donne de l'eau fraîche et demande l'aide de son père."},{"prompt":"Qu'est-ce qui montre que Youssef est un enfant généreux ? Je justifie ma réponse.","criterion":"C4","points":3,"lines":2,"answer":"Il n'hésite pas à soigner l'oiseau blessé pendant trois jours jusqu'à sa guérison."}]}`,
		},
		{
			ID: "starter-fr-5e-m2-table", Section: "langue", BlockType: "table_fill",
			Level: "5ème année", SubjectCode: "francais", Trimester: 1, ModuleNum: 2,
			Criterion: "C5", Points: 4, Difficulty: "medium", Topic: "Conjugaison : Présent & Futur simple",
			ContentJSON: `{"prompt":"Je complète le tableau en conjuguant les verbes au présent puis au futur :","headers":["Infinitif","Présent (Nous)","Futur (Vous)"],"rows":[["finir","[finissons]","[finirez]"],["prendre","[prenons]","[prendrez]"],["être","[sommes]","[serez]"]]}`,
		},
		{
			ID: "starter-fr-5e-m2-transf", Section: "langue", BlockType: "transformation",
			Level: "5ème année", SubjectCode: "francais", Trimester: 1, ModuleNum: 2,
			Criterion: "C5", Points: 3, Difficulty: "medium", Topic: "Grammaire : Forme négative",
			ContentJSON: `{"prompt":"Je mets les phrases suivantes à la forme négative (ne ... pas) :","items":[{"source":"Les enfants jettent les déchets dans le parc.","lines":2,"answer":"Les enfants ne jettent pas les déchets dans le parc."},{"source":"Youssef oublie de donner de l'eau à l'oiseau.","lines":2,"answer":"Youssef n'oublie pas de donner de l'eau à l'oiseau."}]}`,
		},
		{
			ID: "starter-fr-5e-m1-prod", Section: "production", BlockType: "production_ecrite",
			Level: "5ème année", SubjectCode: "francais", Trimester: 1, ModuleNum: 1,
			Criterion: "C1", Points: 6, Difficulty: "medium", Topic: "Récit d'entraide (5ème année)",
			ContentJSON: `{"prompt":"En rentrant de l'école, tu trouves un petit animal blessé (chaton ou oiseau). Raconte en 6 à 7 lignes ce que tu as fait pour le sauver et ce que tu as ressenti.","lines":7,"toolbox":{"nouns":["un animal blessé","le jardin","un panier","la tendresse","la joie"],"verbs":["découvrir","soigner","nourrir","protéger","remercier"],"connectors":["Un jour,","Tout à coup,","Aussitôt,","Quelques jours plus tard,","Finalement,"]},"panels":["/illustrations/oiseau.jpg"],"model_answer":"Un jour, en rentrant de l'école, j'ai découvert un petit oiseau blessé près du mur. Aussitôt, je l'ai posé délicatement dans un panier doux. À la maison, maman m'a aidé à nettoyer son aile et à lui donner de l'eau. Quelques jours plus tard, il a retrouvé ses forces et s'est envolé. J'étais très fier de l'avoir sauvé."}`,
		},

		// ── 6ème année — Préparation Concours / Modules 1–6 ───────────────────────
		{
			ID: "starter-fr-6e-m1-comp", Section: "lecture", BlockType: "reading_comprehension",
			Level: "6ème année", SubjectCode: "francais", Trimester: 1, ModuleNum: 1,
			Criterion: "C1", Points: 7, Difficulty: "hard", Topic: "Le plaisir de lire et le sport (6ème année)",
			ContentJSON: `{"title":"Un esprit sain dans un corps sain","text":"Chaque samedi matin, Salma partage son temps libre entre deux passions. Tôt le matin, elle retrouve ses camarades au parc municipal pour disputer un match de football amical. L'après-midi, après un bon déjeuner en famille, elle s'installe à son bureau pour lire des romans d'aventures. Selon elle, le sport donne de l'énergie et la lecture ouvre les portes de l'imagination.","source":"Module 2 — 6ème année","image_url":"/illustrations/sport.jpg","numbered_lines":true,"questions":[{"prompt":"Quelles sont les deux passions de Salma ?","criterion":"C2","points":2,"lines":1,"answer":"Le sport (football) et la lecture."},{"prompt":"Quand pratique-t-elle chacune de ces activités ?","criterion":"C2","points":2,"lines":2,"answer":"Elle joue au football le samedi matin et lit des romans l'après-midi."},{"prompt":"Es-tu d'accord avec l'avis de Salma sur le sport et la lecture ? Explique en deux phrases.","criterion":"C6","points":3,"lines":3,"answer":"Oui, le sport maintient une bonne santé et la lecture enrichit le vocabulaire et l'imagination."}]}`,
		},
		{
			ID: "starter-fr-6e-m2-cloze", Section: "langue", BlockType: "fill_blanks",
			Level: "6ème année", SubjectCode: "francais", Trimester: 1, ModuleNum: 2,
			Criterion: "C5", Points: 4, Difficulty: "hard", Topic: "Orthographe : son/sont & on/ont",
			ContentJSON: `{"prompt":"Je complète les phrases par « son / sont » ou « on / ont » :","word_bank":["son","sont","on","ont"],"sentences":["Les joueurs [sont] prêts et [ont] salué l'arbitre.","Salma range [son] roman avant que [on] passe à table.","Mes amis [sont] arrivés tôt et [ont] apporté un ballon."]}`,
		},
		{
			ID: "starter-fr-6e-m2-transf", Section: "langue", BlockType: "transformation",
			Level: "6ème année", SubjectCode: "francais", Trimester: 2, ModuleNum: 3,
			Criterion: "C5", Points: 3, Difficulty: "hard", Topic: "Conjugaison : Passage au passé composé",
			ContentJSON: `{"prompt":"Je réécris les phrases suivantes au passé composé :","items":[{"source":"Salma choisit un roman passionnant à la bibliothèque.","lines":2,"answer":"Salma a choisi un roman passionnant à la bibliothèque."},{"source":"Les élèves vont au parc et jouent ensemble.","lines":2,"answer":"Les élèves sont allés au parc et ont joué ensemble."}]}`,
		},
		{
			ID: "starter-fr-6e-m1-prod", Section: "production", BlockType: "production_ecrite",
			Level: "6ème année", SubjectCode: "francais", Trimester: 1, ModuleNum: 2,
			Criterion: "C1", Points: 6, Difficulty: "hard", Topic: "Production Écrite : Mes loisirs préférés (6ème année)",
			ContentJSON: `{"prompt":"Ton correspondant étranger te demande comment tu occupes ton temps libre le week-end. Écris-lui un texte de 8 à 10 lignes pour présenter tes loisirs préférés et expliquer pourquoi tu les aimes.","lines":8,"toolbox":{"nouns":["le temps libre","une passion","la bibliothèque","le stade","mes camarades"],"verbs":["pratiquer","découvrir","partager","se détendre","enrichir"],"connectors":["D'une part,","D'autre part,","De plus,","En effet,","En conclusion,"]},"panels":["/illustrations/sport.jpg","/illustrations/lecture.jpg"],"model_answer":"Pendant le week-end, j'aime organiser mon temps libre entre le sport et la lecture. D'une part, le samedi matin, je retrouve mes camarades au stade pour jouer au football et garder une bonne forme physique. D'autre part, le dimanche après-midi, je m'installe au calme pour lire des livres d'aventures qui enrichissent mon vocabulaire. En conclusion, ces deux activités m'aident à grandir et à être heureux."}`,
		},
	}
}

// EnsureFrenchQuestionBank idempotently inserts any missing starter French
// question blocks (identified by deterministic ID). Safe to call on startup
// and on demand if production DB was ever partially migrated.
func EnsureFrenchQuestionBank(conn *gorm.DB) error {
	starters := StarterFrenchQuestionBank()
	for i := range starters {
		var existing QuestionBlock
		if err := conn.Select("id").Where("id = ?", starters[i].ID).First(&existing).Error; err == nil {
			continue
		}
		if err := conn.Create(&starters[i]).Error; err != nil {
			return err
		}
	}
	return nil
}
