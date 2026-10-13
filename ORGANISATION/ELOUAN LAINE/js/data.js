/* ELOUAN LAINE — Studio : données de référence (matières, sport, contenus). */
(function () {
  const ELA = (window.ELA = window.ELA || {});

  ELA.data = {};

  /* ---------- Matières (ordre donné par Elouan) ---------- */
  ELA.data.subjects = [
    { id: 'immuno', name: 'Immunologie', short: 'Immuno', color: '#f27a8a', target: 2 },
    { id: 'geo2', name: 'GEO 2', short: 'GEO 2', color: '#a189f5', target: 2 },
    { id: 'biovege', name: 'Bio Végétale', short: 'Bio Vég.', color: '#8ad66b', target: 2 },
    { id: 'geo1', name: 'GEO 1', short: 'GEO 1', color: '#5fb2f5', target: 2 },
    { id: 'microbio', name: 'Microbiologie', short: 'Microbio', color: '#e8c15a', target: 2 },
    { id: 'biostat', name: 'Biostatistiques', short: 'Biostat', color: '#d9905b', target: 2 },
    { id: 'ecoappli', name: 'Eco Appliqué', short: 'Eco Appli', color: '#4fd6a0', target: 2 },
    { id: 'biochim', name: 'Biochimie métabolique', short: 'Biochimie', color: '#45cbd6', target: 2 },
    { id: 'bioanim', name: 'Bio animale', short: 'Bio Anim.', color: '#e47fd4', target: 2 },
    { id: 'anglais', name: 'Anglais', short: 'Anglais', color: '#c9cdd6', target: 1 },
  ];

  /* Mots-clés (sans accents, minuscules) → matière. Premier qui correspond gagne. */
  ELA.data.subjectRules = [
    [/microbio/, 'microbio'],
    [/immuno/, 'immuno'],
    [/metabol|biochim/, 'biochim'],
    [/vegetal/, 'biovege'],
    [/animal/, 'bioanim'],
    [/biostat|statisti/, 'biostat'],
    [/ecolog|eco\s*appli|economi/, 'ecoappli'],
    [/anglais|english/, 'anglais'],
    [/geo\s*2/, 'geo2'],
    [/geo\s*1|geomorph|geo/, 'geo1'],
  ];

  /* ---------- Types d'événements ---------- */
  ELA.data.kinds = {
    course: { label: 'Cours', icon: 'cap', color: '#9aa3b5' },
    study: { label: 'Révision', icon: 'book', color: '#c9cdd6' },
    sport: { label: 'Sport', icon: 'ball', color: '#ff7a3d' },
    routine: { label: 'Routine', icon: 'clock', color: '#8a8494' },
    rdv: { label: 'Rendez-vous', icon: 'users', color: '#ffd166' },
    event: { label: 'Événement', icon: 'star', color: '#c47ef0' },
    task: { label: 'Tâche', icon: 'check', color: '#f4f1ea' },
  };

  ELA.data.routines = {
    toilette: { label: 'Toilette', icon: 'drop' },
    breakfast: { label: 'Petit-déj', icon: 'utensils' },
    lunch: { label: 'Déjeuner', icon: 'utensils' },
    dinner: { label: 'Dîner', icon: 'utensils' },
    other: { label: 'Routine', icon: 'clock' },
  };

  /* ---------- Sport ---------- */
  ELA.data.sports = {
    team: { label: 'Basket univ', long: 'Entraînement basket univ', color: '#ff7a3d', icon: 'ball' },
    solo: { label: 'Basket solo', long: 'Basket solo', color: '#ffa95c', icon: 'ball' },
    push: { label: 'Push', long: 'Salle · Push', color: '#ececf0', icon: 'dumbbell' },
    pull: { label: 'Pull', long: 'Salle · Pull', color: '#ececf0', icon: 'dumbbell' },
    legsA: { label: 'Legs A', long: 'Salle · Legs A (force)', color: '#ececf0', icon: 'dumbbell' },
    legsB: { label: 'Legs B', long: 'Salle · Legs B (explosivité)', color: '#ececf0', icon: 'dumbbell' },
    footing: { label: 'Footing', long: 'Footing 1 h', color: '#b9e05a', icon: 'run' },
    tomholland: { label: 'Tom Holland', long: 'Tom Holland challenge', color: '#ff5a6e', icon: 'flame' },
    other: { label: 'Sport', long: 'Sport', color: '#ff7a3d', icon: 'ball' },
  };

  /* Programme : adapté au basket (genoux, chevilles, détente, gainage). */
  ELA.data.programs = {
    push: {
      title: 'Push',
      focus: 'Pecs · épaules · triceps',
      note: 'Garde 1 à 2 reps en réserve sur les gros mouvements : tes épaules servent aussi au tir.',
      items: [
        ['Développé couché haltères', '4 × 6-8', '2 min'],
        ['Développé militaire debout', '3 × 6-8', '2 min'],
        ['Développé incliné haltères', '3 × 8-10', '90 s'],
        ['Élévations latérales', '3 × 12-15', '60 s'],
        ['Dips (lestés si > 12)', '3 × 8-12', '90 s'],
        ['Extension triceps à la poulie', '3 × 10-12', '60 s'],
        ['Pallof press (anti-rotation)', '3 × 10 / côté', '45 s'],
      ],
    },
    pull: {
      title: 'Pull',
      focus: 'Dos · biceps · grip',
      note: 'Le dos tient ta posture en défense et au rebond. Face pulls à chaque séance.',
      items: [
        ['Tractions pronation', '4 × 6-8', '2 min'],
        ['Rowing barre', '4 × 6-8', '2 min'],
        ['Tirage horizontal unilatéral', '3 × 10 / côté', '90 s'],
        ['Face pulls', '3 × 15', '60 s'],
        ['Curl incliné haltères', '3 × 10-12', '60 s'],
        ['Curl marteau', '2 × 12', '60 s'],
        ['Farmer carry', '3 × 30 m', '60 s'],
      ],
    },
    legsA: {
      title: 'Legs A',
      focus: 'Force · prévention genoux / chevilles',
      note: 'Séance lourde : jamais la veille d’un entraînement si possible. Nordic et tibias = prévention blessures.',
      items: [
        ['Squat arrière (ou trap bar deadlift)', '4 × 5', '2-3 min'],
        ['Soulevé de terre roumain', '3 × 6-8', '2 min'],
        ['Fentes bulgares', '3 × 8 / jambe', '90 s'],
        ['Nordic curl (ischios)', '3 × 5', '90 s'],
        ['Mollets debout lourds', '4 × 10', '60 s'],
        ['Tibialis raises', '3 × 15', '45 s'],
        ['Copenhagen plank (adducteurs)', '3 × 20 s / côté', '45 s'],
      ],
    },
    legsB: {
      title: 'Legs B',
      focus: 'Explosivité · détente · appuis basket',
      note: 'Qualité avant volume : repos complet entre les sauts, atterrissages silencieux. Stoppe si la vitesse baisse.',
      items: [
        ['Box jumps (atterrissage contrôlé)', '4 × 4', '90 s'],
        ['Squat jump léger (barre ou haltères)', '4 × 3', '90 s'],
        ['Skater jumps (bonds latéraux)', '3 × 6 / côté', '60 s'],
        ['Step-up explosif', '3 × 6 / jambe', '60 s'],
        ['Hip thrust', '3 × 8', '90 s'],
        ['Pogo jumps + mollet excentrique unilatéral', '3 × 20 s', '60 s'],
        ['Dead bug / gainage latéral', '3 × 30 s', '30 s'],
      ],
    },
    solo: {
      title: 'Basket solo',
      focus: 'Shoot · handles · finitions',
      note: 'Compte tes paniers : note ton % sur les 50 catch & shoot pour suivre ta progression.',
      items: [
        ['Échauffement + mobilité chevilles / hanches', '8 min', ''],
        ['Ball handling (2 ballons, crossovers, entre les jambes)', '10 min', ''],
        ['Finitions : Mikan, reverse, euro step, main faible', '10 min', ''],
        ['Catch & shoot : 5 spots × 10 tirs', '15 min', ''],
        ['Pull-up jumper après dribble', '10 min', ''],
        ['Lancers francs sous fatigue (2 × 10 après sprints)', '7 min', ''],
      ],
    },
    footing: {
      title: 'Footing',
      focus: 'Endurance fondamentale (zone 2)',
      note: 'Allure où tu peux parler. Ça construit le cardio pour tenir 40 min de match sans brûler tes jambes.',
      items: [
        ['Échauffement marche rapide + gammes', '5 min', ''],
        ['Course allure facile', '50 min', ''],
        ['Lignes droites progressives', '5 × 80 m', 'retour marché'],
      ],
    },
    tomholland: {
      title: 'Tom Holland challenge',
      focus: '5 tractions · 10 pompes · 15 squats',
      note: 'Enchaîne le maximum de tours en 20 min (format « Cindy »). Note ton nombre de tours pour battre ton record.',
      items: [
        ['Tractions', '5', ''],
        ['Pompes', '10', ''],
        ['Squats au poids du corps', '15', ''],
        ['Répète sans pause', '20 min', 'max de tours'],
      ],
    },
    team: {
      title: 'Basket univ',
      focus: 'Entraînement d’équipe',
      note: 'Hydrate-toi avant (500 ml dans l’heure) et mange dans les 45 min après.',
      items: [],
    },
  };

  /* ---------- Exemple : emploi du temps semaine 42 (capture ADE du 12 au 17 oct. 2026) ----------
     Tous les créneaux visibles sur la capture, y compris ceux des autres groupes,
     pour montrer le filtre (Groupe C · BOE · TD Gr2 · CM). */
  ELA.data.exampleWeek = [
    { date: '2026-10-12', start: '10:15', end: '12:15', title: 'Biologie Végétale', groups: 'ST-L2 - SCIENCES DE LA VIE', type: 'CM', teacher: 'M. Knigge Andreas Thomas', room: 'B201 ST' },
    { date: '2026-10-12', start: '13:30', end: '15:30', title: 'Métabolisme', groups: 'TD Gr2 (BOE + LAS) - L2 SV', type: 'TD', teacher: 'M. Sarafian Tristan', room: 'B203 ST' },
    { date: '2026-10-12', start: '15:45', end: '17:45', title: 'Métabolisme', groups: 'Gr 1 (BMC) - L2 SV', type: 'TD', teacher: 'M. Sarafian Tristan', room: 'B203 ST' },
    { date: '2026-10-13', start: '09:00', end: '11:00', title: 'Géomorphologie', groups: 'Gr BOE - L2 SV', type: 'CM', teacher: 'M. Cuvilliez Antoine', room: 'B213 ST' },
    { date: '2026-10-13', start: '11:00', end: '12:00', title: 'Géomorphologie', groups: 'Gr BOE - L2 SV', type: 'TD', teacher: 'M. Cuvilliez Antoine', room: 'B213 ST' },
    { date: '2026-10-13', start: '13:30', end: '15:30', title: 'Métabolisme', groups: 'TD Gr2 (BOE + LAS) - L2 SV', type: 'TD', teacher: 'M. Sarafian Tristan', room: 'B203 ST' },
    { date: '2026-10-13', start: '15:45', end: '17:45', title: 'Métabolisme', groups: 'Gr 1 (BMC) - L2 SV', type: 'TD', teacher: 'M. Sarafian Tristan', room: 'B203 ST' },
    { date: '2026-10-14', start: '10:15', end: '12:15', title: 'Biostatistiques', groups: 'ST-L2 - SCIENCES DE LA VIE', type: 'CM', teacher: 'Mme Wey Sylviane', room: 'MAZELINE amphi ST' },
    { date: '2026-10-15', start: '08:00', end: '10:00', title: 'Microbiologie - Immunologie', groups: 'TD Gr2 (BOE + LAS) - L2 SV', type: 'TD', teacher: 'Mme Rocher Beatrice', room: 'B213 ST' },
    { date: '2026-10-15', start: '10:15', end: '12:15', title: 'Biologie Animale', groups: 'ST-L2 - SCIENCES DE LA VIE', type: 'CM', teacher: 'Mme Letendre Julie', room: 'MAZELINE amphi ST' },
    { date: '2026-10-15', start: '13:00', end: '16:00', title: 'Biologie Animale', groups: 'TP GrC - L2 SV', type: 'TP', teacher: 'Mme Letendre Julie', room: 'BIO-A205 TP ST' },
    { date: '2026-10-15', start: '16:00', end: '19:00', title: 'Biologie Animale', groups: 'TP GrD - L2 SV', type: 'TP', teacher: 'Mme Letendre Julie', room: 'BIO-A205 TP ST' },
    { date: '2026-10-16', start: '08:00', end: '10:00', title: 'Microbiologie - Immunologie', groups: 'Gr 1 (BMC) - L2 SV', type: 'TD', teacher: 'Mme Rocher Beatrice', room: 'B213 ST' },
    { date: '2026-10-16', start: '10:15', end: '12:15', title: 'Microbiologie - Immunologie', groups: 'Gr 1 (BMC) - L2 SV', type: 'TD', teacher: 'Mme Rocher Beatrice', room: 'B213 ST' },
    { date: '2026-10-16', start: '13:00', end: '16:00', title: 'Biologie Animale', groups: 'TP GrA - L2 SV', type: 'TP', teacher: 'Mme Letendre Julie', room: 'BIO-A205 TP ST' },
    { date: '2026-10-16', start: '16:00', end: '19:00', title: 'Biologie Animale', groups: 'TP GrB - L2 SV', type: 'TP', teacher: 'Mme Letendre Julie', room: 'BIO-A205 TP ST' },
  ];

  /* ---------- Images ---------- */
  ELA.data.images = {
    roar: { src: 'assets/img/ant-roar.jpg', alt: 'Anthony Edwards qui crie, maillot noir Timberwolves' },
    wolves5: { src: 'assets/img/ant-wolves-5.jpg', alt: 'Joueur des Wolves n°5 en noir et blanc' },
    antman: { src: 'assets/img/antman-dunk.jpg', alt: 'Affiche ANTMAN : dunk au-dessus d’un défenseur du Jazz' },
    celebration: { src: 'assets/img/wolves-8-celebration.jpg', alt: 'Joueur des Wolves n°8 qui célèbre un tir à trois points devant le banc' },
  };

  /* ---------- Citations ---------- */
  ELA.data.quotes = [
    { t: 'Repose-toi à la fin, pas au milieu.', a: 'Kobe Bryant' },
    { t: 'Essayer d’être meilleur aujourd’hui qu’hier. C’est ça, la Mamba Mentality.', a: 'Kobe Bryant' },
    { t: 'J’ai raté plus de 9 000 tirs dans ma carrière. J’ai échoué encore et encore. C’est pour ça que je réussis.', a: 'Michael Jordan' },
    { t: 'Gagne comme un boss, perds comme un boss.', a: 'Anthony Edwards' },
    { t: 'N’abandonne pas. N’abandonne jamais.', a: 'Jim Valvano' },
    { t: 'Si tu veux changer le monde, commence par faire ton lit.', a: 'Amiral William H. McRaven' },
    { t: 'Souffre maintenant, et vis le reste de ta vie en champion.', a: 'Muhammad Ali' },
    { t: 'Reste affamé, reste fou.', a: 'Steve Jobs' },
    { t: 'La discipline, c’est choisir entre ce que tu veux maintenant et ce que tu veux le plus.', a: '' },
    { t: 'Les jambes se construisent les jours où tu n’en as pas envie.', a: '' },
    { t: 'Un chapitre relu ce soir, c’est une heure gagnée la veille du partiel.', a: '' },
  ];

  /* ---------- Vidéos (identifiants YouTube vérifiés, ou recherches) ---------- */
  ELA.data.videoCats = [
    ['all', 'Tout'],
    ['basket', 'Basket'],
    ['mental', 'Mental'],
    ['discipline', 'Discipline'],
    ['etudes', 'Études'],
    ['mine', 'Mes vidéos'],
  ];
  ELA.data.videos = [
    { id: 'v-better', yt: 'C9I-W1eTCbk', title: 'Better', by: 'Nike · hommage à Kobe Bryant, voix de Kendrick Lamar', cat: 'basket' },
    { id: 'v-mamba', q: 'Kobe Bryant Mamba Mentality interview', title: 'Mamba Mentality', by: 'Interviews de Kobe Bryant', cat: 'basket' },
    { id: 'v-ant', q: 'Anthony Edwards best plays mixtape', title: 'Anthony Edwards, les moments forts', by: 'Recherche YouTube', cat: 'basket' },
    { id: 'v-mj', q: 'Michael Jordan The Last Dance best moments', title: 'Jordan, The Last Dance', by: 'Recherche YouTube', cat: 'basket' },
    { id: 'v-valvano', yt: 'HuoVM9nm42E', title: 'Don’t give up, don’t ever give up', by: 'Jim Valvano · ESPYs 1993', cat: 'mental' },
    { id: 'v-et', yt: 'lsSC2vx7zFQ', title: 'How bad do you want it?', by: 'Eric Thomas', cat: 'mental' },
    { id: 'v-fall', yt: 'mgmVOuLgFB0', title: 'Why do we fall?', by: 'Mateusz M', cat: 'mental' },
    { id: 'v-dream', yt: 'g-jwWYX7Jlo', title: 'Dream', by: 'Mateusz M', cat: 'mental' },
    { id: 'v-bed', yt: 'pxBQLFLei70', title: 'Make your bed', by: 'Amiral William H. McRaven · Université du Texas, 2014', cat: 'discipline' },
    { id: 'v-goggins', q: 'David Goggins discipline speech', title: 'David Goggins, discipline', by: 'Recherche YouTube', cat: 'discipline' },
    { id: 'v-jobs', yt: 'UF8uR6Z6KLc', title: 'Discours de Stanford', by: 'Steve Jobs · 2005', cat: 'etudes' },
    { id: 'v-fr', q: 'motivation révisions étudiant discipline', title: 'Motivation pour réviser (FR)', by: 'Recherche YouTube', cat: 'etudes' },
  ];

  /* ---------- Albums pour la salle ----------
     g : rapfr · rapus · uk · rock · electro · ost   |   e : énergie 1-5   |   k : titre à lancer */
  ELA.data.genres = [
    ['all', 'Tout'],
    ['rapfr', 'Rap FR'],
    ['rapus', 'Rap US'],
    ['uk', 'UK & Afro'],
    ['rock', 'Rock & Metal'],
    ['electro', 'Électro'],
    ['ost', 'BO & classiques'],
  ];
  ELA.data.albums = [
    ['Booba', 'Ouest Side', 2006, 'rapfr', 5, 'Garde la pêche', 'Instrus lourdes et froides : parfait pour les séries de force.'],
    ['Booba', 'Temps mort', 2002, 'rapfr', 4, '', 'Le classique. Flow posé, idéal pour l’échauffement.'],
    ['Kaaris', 'Or Noir', 2013, 'rapfr', 5, 'Zoo', 'La trap la plus brute du rap français. Pour les dernières séries.'],
    ['PNL', 'Dans la légende', 2016, 'rapfr', 3, 'DA', 'Ambiance planante pour le footing en zone 2.'],
    ['SCH', 'JVLIVS', 2018, 'rapfr', 4, 'Otto', 'Album-film sombre, se tient d’un bout à l’autre d’une séance.'],
    ['Damso', 'Ipséité', 2017, 'rapfr', 4, 'Macarena', 'Variété de tempos : du push lourd aux étirements.'],
    ['Nekfeu', 'Feu', 2015, 'rapfr', 3, 'On verra', 'Plus pour les révisions que pour la barre, mais ça motive.'],
    ['Gazo', 'KMT', 2022, 'rapfr', 5, 'Die', 'Drill sombre et percutante pour les intervalles.'],
    ['Niska', 'Commando', 2017, 'rapfr', 5, 'Réseaux', 'Énergie pure, idéal pour les sauts de la Legs B.'],
    ['Tiakola', 'Mélo', 2022, 'rapfr', 3, 'Meuda', 'Mélodique et léger : récup active, gainage.'],
    ['IAM', 'L’École du micro d’argent', 1997, 'rapfr', 3, 'Demain c’est loin', 'Old school marseillais, pour un footing long.'],
    ['Suprême NTM', 'Paris sous les bombes', 1995, 'rapfr', 4, 'La fièvre', 'Boom bap rageur pour les tractions.'],
    ['Alpha Wann', 'UMLA', 2018, 'rapfr', 4, '', 'Technique et nerveux, pour rester concentré.'],
    ['Kery James', 'Mouhammad Alix', 2016, 'rapfr', 4, '', 'Textes qui donnent envie de se dépasser.'],
    ['Freeze Corleone', 'LMF', 2020, 'rapfr', 4, '', 'Prods hypnotiques pour une séance en mode tunnel.'],
    ['Laylow', 'Trinity', 2020, 'rapfr', 3, '', 'Univers futuriste, bon pour le cardio régulier.'],
    ['Hamza', 'Paradise', 2019, 'rapfr', 3, '', 'Vibes chaudes pour l’échauffement et le retour au calme.'],
    ['Werenoi', 'Carré', 2023, 'rapfr', 4, '', 'Efficace et carré, comme son nom.'],
    ['Rohff', 'La fierté des nôtres', 2004, 'rapfr', 5, 'Qui est l’exemple ?', 'Classique énergique du rap français des années 2000.'],
    ['Kalash Criminel', 'La fosse aux lions', 2018, 'rapfr', 5, '', 'Agressif à souhait pour le dernier exercice.'],

    ['Kanye West', 'Graduation', 2007, 'rapus', 5, 'Stronger', 'Le titre dit tout. Hymnes de stade.'],
    ['Kanye West', 'My Beautiful Dark Twisted Fantasy', 2010, 'rapus', 4, 'POWER', 'Grandiose, pour les séances de PR.'],
    ['Kanye West', 'Donda', 2021, 'rapus', 4, 'Off the Grid', 'Long album, une séance complète.'],
    ['Travis Scott', 'Astroworld', 2018, 'rapus', 5, 'SICKO MODE', 'Montées d’adrénaline en série.'],
    ['Travis Scott', 'Utopia', 2023, 'rapus', 5, 'FE!N', 'Basses énormes pour les sauts et les sprints.'],
    ['Kendrick Lamar', 'DAMN.', 2017, 'rapus', 4, 'DNA.', 'Intense et précis. Idéal pour le push.'],
    ['Kendrick Lamar', 'GNX', 2024, 'rapus', 4, 'squabble up', 'West coast nerveux, parfait en salle.'],
    ['J. Cole', '2014 Forest Hills Drive', 2014, 'rapus', 3, 'No Role Modelz', 'Pour le tir solo : rythme régulier, concentration.'],
    ['Eminem', 'The Eminem Show', 2002, 'rapus', 5, 'Till I Collapse', 'LE morceau de salle. Pas besoin d’expliquer.'],
    ['Eminem', 'Recovery', 2010, 'rapus', 5, 'Not Afraid', 'Album de reconquête, mental de compétiteur.'],
    ['DMX', 'It’s Dark and Hell Is Hot', 1998, 'rapus', 5, 'Ruff Ryders’ Anthem', 'Aboiements et rage : séries lourdes garanties.'],
    ['50 Cent', 'Get Rich or Die Tryin’', 2003, 'rapus', 4, 'Many Men', 'Classique de vestiaire.'],
    ['Future', 'DS2', 2015, 'rapus', 4, 'Where Ya At', 'Trap hypnotique pour enchaîner sans réfléchir.'],
    ['Metro Boomin', 'Heroes & Villains', 2022, 'rapus', 4, 'Superhero (Heroes & Villains)', 'Prods cinématiques, ambiance boss de fin.'],
    ['21 Savage', 'i am > i was', 2018, 'rapus', 4, 'a lot', 'Calme et menaçant, pour rester focus.'],
    ['Playboi Carti', 'Whole Lotta Red', 2020, 'rapus', 5, 'Stop Breathing', 'Chaos punk-trap pour les finishers.'],
    ['Pop Smoke', 'Shoot for the Stars, Aim for the Moon', 2020, 'rapus', 4, 'For the Night', 'Drill de Brooklyn, voix grave qui pousse.'],
    ['Lil Wayne', 'Tha Carter III', 2008, 'rapus', 4, 'A Milli', 'Classique pour l’échauffement.'],
    ['Run the Jewels', 'Run the Jewels 2', 2014, 'rapus', 5, 'Oh My Darling Don’t Cry', 'Duo coup de poing, pas une seconde de répit.'],
    ['Nas', 'Illmatic', 1994, 'rapus', 3, 'N.Y. State of Mind', 'Le boom bap parfait pour les gammes de tir.'],
    ['Mobb Deep', 'The Infamous', 1995, 'rapus', 4, 'Shook Ones, Pt. II', 'Sombre et lourd, pour le dos et les tractions.'],
    ['Wu-Tang Clan', 'Enter the Wu-Tang (36 Chambers)', 1993, 'rapus', 4, 'C.R.E.A.M.', 'Brut, old school, efficace.'],
    ['A$AP Rocky', 'Long. Live. A$AP', 2013, 'rapus', 4, 'Goldie', 'Énergie Harlem pour la salle.'],
    ['Denzel Curry', 'TA13OO', 2018, 'rapus', 5, 'Black Balloons', 'Passe du calme à la rage : comme une bonne séance.'],
    ['Freddie Gibbs & Madlib', 'Piñata', 2014, 'rapus', 3, '', 'Groove soul pour le shooting tranquille.'],

    ['Central Cee', '23', 2022, 'uk', 4, 'Doja', 'Drill UK rapide et courte. Pour un footing tempo.'],
    ['Central Cee', 'Can’t Rush Greatness', 2025, 'uk', 3, '', 'Le titre résume ta saison.'],
    ['Skepta', 'Konnichiwa', 2016, 'uk', 5, 'Shutdown', 'Grime survolté pour les sprints.'],
    ['Stormzy', 'Gang Signs & Prayer', 2017, 'uk', 4, 'Big for Your Boots', 'Puissant, parfait pour le squat.'],
    ['Dave', 'Psychodrama', 2019, 'uk', 3, 'Black', 'Introspectif, pour la récup et les étirements.'],
    ['Burna Boy', 'African Giant', 2019, 'uk', 3, 'Anybody', 'Afrobeats solaire pour l’échauffement.'],

    ['Rage Against the Machine', 'Rage Against the Machine', 1992, 'rock', 5, 'Killing in the Name', 'Riffs de guerre. Le meilleur carburant pour le soulevé de terre.'],
    ['Linkin Park', 'Hybrid Theory', 2000, 'rock', 5, 'One Step Closer', 'Nu metal explosif, nostalgie garantie.'],
    ['Linkin Park', 'Meteora', 2003, 'rock', 5, 'Faint', 'Suite parfaite d’Hybrid Theory.'],
    ['Metallica', 'Master of Puppets', 1986, 'rock', 5, 'Battery', 'Thrash rapide pour les séries courtes et lourdes.'],
    ['AC/DC', 'Back in Black', 1980, 'rock', 4, 'Shoot to Thrill', 'Rock qui fait taper du pied entre les séries.'],
    ['Queens of the Stone Age', 'Songs for the Deaf', 2002, 'rock', 4, 'No One Knows', 'Riffs hypnotiques pour le footing.'],
    ['System of a Down', 'Toxicity', 2001, 'rock', 5, 'Chop Suey!', 'Folie pure pour les finishers.'],
    ['Arctic Monkeys', 'AM', 2013, 'rock', 3, 'R U Mine?', 'Groove lourd pour les accessoires.'],
    ['Royal Blood', 'Royal Blood', 2014, 'rock', 4, 'Figure It Out', 'Basse-batterie massive, aucun temps mort.'],
    ['Slipknot', 'Iowa', 2001, 'rock', 5, 'My Plague', 'Extrême. Réservé aux records.'],
    ['Gojira', 'Magma', 2016, 'rock', 4, 'Stranded', 'Metal français de classe mondiale.'],
    ['Deftones', 'White Pony', 2000, 'rock', 4, 'Change (In the House of Flies)', 'Lourd et aérien à la fois.'],
    ['Foo Fighters', 'The Colour and the Shape', 1997, 'rock', 4, 'Monkey Wrench', 'Énergie rock positive pour le cardio.'],
    ['Muse', 'Absolution', 2003, 'rock', 4, 'Hysteria', 'Ligne de basse culte, montées épiques.'],

    ['Daft Punk', 'Discovery', 2001, 'electro', 4, 'Harder, Better, Faster, Stronger', 'Le titre est un programme d’entraînement.'],
    ['Daft Punk', 'Homework', 1997, 'electro', 4, 'Da Funk', 'House filtrée pour un footing régulier.'],
    ['Justice', '† (Cross)', 2007, 'electro', 5, 'Genesis', 'Électro saturée, très française, très intense.'],
    ['Kavinsky', 'OutRun', 2013, 'electro', 3, 'Nightcall', 'Synthwave pour un footing de nuit.'],
    ['The Prodigy', 'The Fat of the Land', 1997, 'electro', 5, 'Breathe', 'Big beat agressif, idéal pour les intervalles.'],
    ['Gesaffelstein', 'Aleph', 2013, 'electro', 4, 'Pursuit', 'Techno sombre pour une séance en mode machine.'],
    ['Fred again..', 'Actual Life 3 (January 1 - September 9 2022)', 2022, 'electro', 3, 'Delilah (pull me out of this)', 'Montées euphoriques pour la fin de séance.'],
    ['Skrillex', 'Quest for Fire', 2023, 'electro', 5, 'Rumble', 'Drops massifs pour les sauts.'],
    ['The Chemical Brothers', 'Dig Your Own Hole', 1997, 'electro', 4, 'Block Rockin’ Beats', 'Rythmique implacable.'],
    ['Kaytranada', '99.9%', 2016, 'electro', 3, 'Glowed Up', 'Groove pour le travail de handles.'],

    ['Hans Zimmer', 'Interstellar (bande originale)', 2014, 'ost', 3, 'No Time for Caution', 'Pour réviser concentré, ou pour les dernières reps.'],
    ['Hans Zimmer & James Newton Howard', 'The Dark Knight (bande originale)', 2008, 'ost', 4, 'Why So Serious?', 'Tension qui monte, parfait avant un match.'],
    ['Daft Punk', 'TRON: Legacy (bande originale)', 2010, 'ost', 4, 'Derezzed', 'Électro-orchestral, ultra motivant.'],
    ['Vince DiCola', 'Rocky IV (bande originale)', 1985, 'ost', 5, 'Training Montage', 'Le montage d’entraînement ultime.'],
    ['Ludwig Göransson', 'Creed (bande originale)', 2015, 'ost', 4, '', 'Orchestre + hip-hop : la bande-son des combattants.'],
    ['Survivor', 'Eye of the Tiger', 1982, 'ost', 5, 'Eye of the Tiger', 'Cliché ? Oui. Efficace ? Toujours.'],
    ['Michael Jackson', 'Bad', 1987, 'ost', 4, 'Bad', 'Funk-pop qui fait bouger, pour l’échauffement.'],
  ].map(function (r, i) {
    return { id: 'al' + i, artist: r[0], title: r[1], year: r[2], genre: r[3], energy: r[4], track: r[5], why: r[6] };
  });
})();
