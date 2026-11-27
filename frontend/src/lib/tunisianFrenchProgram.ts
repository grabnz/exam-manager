// Official Tunisian Primary School French Curriculum (Ministère de l'Éducation — Tunisie)
// Levels: 3ème, 4ème, 5ème, 6ème année de l'enseignement de base

export interface FrenchModuleInfo {
  num: number
  trimester: 1 | 2 | 3
  title: string
  theme: string
  langue: string[]
  keywords: string[] // French keywords for ARASAAC school illustrations
}

export const TUNISIAN_FRENCH_PROGRAM: Record<string, FrenchModuleInfo[]> = {
  '3ème année': [
    { num: 1, trimester: 1, title: 'La famille et les amis', theme: 'Se présenter, saluer, présenter sa famille', langue: ['c’est / voici', 'un / une', 'son [a] [i]'], keywords: ['famille', 'ami', 'maison'] },
    { num: 2, trimester: 1, title: 'À l’école', theme: 'La classe, les fournitures, les activités scolaires', langue: ['le / la / les', 'verbe avoir au présent', 'son [l] [m]'], keywords: ['école', 'cartable', 'cahier', 'élève'] },
    { num: 3, trimester: 1, title: 'La maison et le quartier', theme: 'Les pièces de la maison, les voisins', langue: ['dans / sur / sous', 'verbe être au présent'], keywords: ['maison', 'chambre', 'jardin'] },
    { num: 4, trimester: 2, title: 'La santé et la propreté', theme: 'Hygiène, repas équilibrés, le médecin', langue: ['il faut + infinitif', 'verbes en -er au présent'], keywords: ['brosse à dents', 'médecin', 'pomme', 'laver'] },
    { num: 5, trimester: 2, title: 'Les animaux', theme: 'Animaux domestiques et sauvages', langue: ['le pluriel en -s', 'grand / petit'], keywords: ['chat', 'chien', 'oiseau', 'mouton'] },
    { num: 6, trimester: 2, title: 'Les métiers', theme: 'Les professions autour de nous', langue: ['masculin / féminin', 'phrase simple'], keywords: ['boulanger', 'médecin', 'pompier', 'maîtresse'] },
    { num: 7, trimester: 3, title: 'Les loisirs et les jeux', theme: 'Jeux, sport, temps libre', langue: ['aimer / jouer au présent', 'forme négative ne...pas'], keywords: ['ballon', 'vélo', 'jouer', 'parc'] },
    { num: 8, trimester: 3, title: 'Les fêtes et les vacances', theme: 'Fêtes familiales, plage, voyages', langue: ['futur proche (aller + inf.)', 'révision générale'], keywords: ['plage', 'fête', 'cadeau', 'soleil'] },
  ],
  '4ème année': [
    { num: 1, trimester: 1, title: 'Vive l’école !', theme: 'Rentrée scolaire, vie en classe, amitié', langue: ['La phrase (majuscule/point)', 'Verbes être & avoir au présent', 'a / à'], keywords: ['école', 'classe', 'élève', 'maîtresse'] },
    { num: 2, trimester: 1, title: 'Bienvenue chez les Dupré (La famille)', theme: 'Entraide familiale, maison, quotidien', langue: ['Groupe nominal sujet (GNS)', 'Présent des verbes en -er', 'et / est'], keywords: ['famille', 'maison', 'cuisine', 'parents'] },
    { num: 3, trimester: 1, title: 'Soyons propres et en bonne santé', theme: 'Hygiène, alimentation, sport', langue: ['Forme affirmative / négative', 'Verbe aller au présent', 'son / sont'], keywords: ['santé', 'sport', 'légumes', 'médecin'] },
    { num: 4, trimester: 2, title: 'Protégeons la nature et les animaux', theme: 'Environnement, jardinage, animaux', langue: ['Genre et nombre du nom', 'Verbes finir / choisir au présent', 'on / ont'], keywords: ['jardin', 'arbre', 'oiseau', 'arroser'] },
    { num: 5, trimester: 2, title: 'Découvrons les métiers', theme: 'Artisans, travail, solidarité', langue: ['L’adjectif qualificatif', 'Futur simple (1er groupe)', 'ce / se'], keywords: ['boulanger', 'fermier', 'travail', 'outils'] },
    { num: 6, trimester: 2, title: 'En route pour l’aventure (Voyages)', theme: 'Transports, ville et campagne', langue: ['Compléments de lieu et de temps', 'Passé composé avec avoir'], keywords: ['train', 'bus', 'voyage', 'campagne'] },
    { num: 7, trimester: 3, title: 'Loisirs, contes et spectacles', theme: 'Lecture, théâtre, jeux collectifs', langue: ['Pronoms personnels sujets', 'Verbes faire et dire', 'Accord sujet-verbe'], keywords: ['livre', 'théâtre', 'musique', 'ballon'] },
    { num: 8, trimester: 3, title: 'Fêtes et vacances d’été', theme: 'Célébrations, mer, préparation à la 5ème', langue: ['Révision présent / futur / passé composé', 'Connecteurs du récit'], keywords: ['plage', 'vacances', 'gâteau', 'soleil'] },
  ],
  '5ème année': [
    { num: 1, trimester: 1, title: 'Rendons notre environnement plus agréable', theme: 'Propreté de l’école, plantation, écologie', langue: ['Types de phrases', 'Présent (1er & 2ème groupes)', 'a / à · ou / où'], keywords: ['environnement', 'arbre', 'poubelle', 'jardin'] },
    { num: 2, trimester: 1, title: 'Apprenons à vivre ensemble', theme: 'Tolérance, amitié, solidarité, droits de l’enfant', langue: ['GNS et GV', 'Verbes pronominaux / 3ème groupe', 'son / sont · et / est'], keywords: ['amitié', 'partager', 'enfants', 'paix'] },
    { num: 3, trimester: 1, title: 'Aidons et respectons les autres', theme: 'Entraide, personnes âgées, civisme', langue: ['Complément d’objet direct (COD)', 'Passé composé (avoir & être)', 'Accord du participe passé'], keywords: ['aider', 'grand-mère', 'famille', 'solidarité'] },
    { num: 4, trimester: 2, title: 'Découvrons les secrets d’une bonne santé', theme: 'Alimentation, sport, prévention', langue: ['L’impératif présent', 'Adjectif épithète et attribut', 'ces / ses'], keywords: ['santé', 'sport', 'fruits', 'médecin'] },
    { num: 5, trimester: 2, title: 'Organisons notre vie entre travail et loisirs', theme: 'Gestion du temps, lecture, activités', langue: ['Compléments circonstanciels (temps/lieu/manière)', 'Imparfait de l’indicatif'], keywords: ['horloge', 'livre', 'sport', 'musique'] },
    { num: 6, trimester: 2, title: 'Découvrons d’autres pays', theme: 'Voyages, cultures du monde, correspondance', langue: ['Futur simple (tous groupes)', 'Pronoms compléments (le, la, les)', 'ce / se'], keywords: ['avion', 'carte', 'voyage', 'valise'] },
    { num: 7, trimester: 3, title: 'Réalisons un projet sur les médias et l’ordinateur', theme: 'Informatique, presse, communication', langue: ['Phrase complexe (et, mais, parce que)', 'Verbes prendre, mettre, voir'], keywords: ['ordinateur', 'journal', 'téléphone', 'écrire'] },
    { num: 8, trimester: 3, title: 'Utilisons l’ordinateur et préparons la 6ème', theme: 'Bilan des compétences, récit complet', langue: ['Synthèse des temps du récit', 'Orthographe grammaticale'], keywords: ['ordinateur', 'école', 'diplôme', 'vacances'] },
  ],
  '6ème année': [
    { num: 1, trimester: 1, title: 'Travailler pour s’épanouir', theme: 'Métiers, goût de l’effort, réussite', langue: ['Constituants de la phrase', 'Présent de l’indicatif (3 groupes)', 'a/à · est/et'], keywords: ['travail', 'école', 'métier', 'étudier'] },
    { num: 2, trimester: 1, title: 'Communiquer avec les autres', theme: 'Dialogue, lettre, courriel, amitié', langue: ['Discours direct (ponctuation)', 'Passé composé & accord', 'on / ont'], keywords: ['lettre', 'parler', 'ordinateur', 'ami'] },
    { num: 3, trimester: 1, title: 'Accepter les autres', theme: 'Différence, respect, vivre-ensemble', langue: ['Expansion du GN (adjectif, complément du nom)', 'Imparfait vs Passé composé'], keywords: ['enfants', 'main', 'partager', 'paix'] },
    { num: 4, trimester: 2, title: 'Sauver la nature', theme: 'Protection de la planète, eau, forêts', langue: ['Impératif & expression du conseil', 'Cause et conséquence (car, parce que, donc)'], keywords: ['terre', 'eau', 'forêt', 'recycler'] },
    { num: 5, trimester: 2, title: 'S’informer et découvrir la science', theme: 'Inventions, expériences, curiosité', langue: ['Futur simple & futur proche', 'Pronoms relatifs (qui / que)'], keywords: ['science', 'fusée', 'microscope', 'livre'] },
    { num: 6, trimester: 2, title: 'Être en forme et mieux se porter', theme: 'Santé, sport, hygiène de vie', langue: ['Compléments essentiels et circonstanciels', 'Conditionnel de politesse', 'tout / tous / toute'], keywords: ['sport', 'courir', 'fruits', 'santé'] },
    { num: 7, trimester: 3, title: 'Profiter de son temps libre', theme: 'Culture, cinéma, lecture, voyages', langue: ['Phrase active / passive', 'Accord sujet-verbe complexe'], keywords: ['cinéma', 'musée', 'plage', 'livre'] },
    { num: 8, trimester: 3, title: 'Préparation au concours de 6ème année', theme: 'Épreuves types complètes (Lecture, Langue, Production)', langue: ['Révision complète du cycle primaire', 'Production écrite : récit + dialogue + description'], keywords: ['examen', 'diplôme', 'école', 'réussir'] },
  ],
}

export function getModulesForLevel(level: string): FrenchModuleInfo[] {
  return TUNISIAN_FRENCH_PROGRAM[level] ?? TUNISIAN_FRENCH_PROGRAM['4ème année']
}

export function getModuleInfo(level: string, moduleNum: number): FrenchModuleInfo | null {
  if (!moduleNum) return null
  return getModulesForLevel(level).find(m => m.num === moduleNum) ?? null
}
