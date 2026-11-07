# card_games (MTG) notes
(Open the DB read-only with python `sqlite3.connect('file:db.sqlite?immutable=1',uri=True)`; plain open errors.)

## Tables & joins
- cards (56822 printings; `name` NOT unique: Forest x693; uuid unique). number is TEXT ('74s'); convertedManaCost REAL; flavorName = promotional name.
- foreign_data (uuid, language, name, text, flavorText, type): card translations. `cards.uuid = foreign_data.uuid`.
- legalities (uuid, format, status). `cards.uuid = legalities.uuid` (~8 rows/card).
- rulings (uuid, date, text). `cards.uuid = rulings.uuid`.
- sets (id, code, name, block, type, baseSetSize, totalSetSize, releaseDate, mcmName, mtgoCode, parentCode, isOnlineOnly, isNonFoilOnly, isFoilOnly, isForeignOnly). `cards.setCode = sets.code`.
- set_translations (id, setCode, language, translation). `sets.code = set_translations.setCode`. "set name in other language X" = translation.
- Reference SQL style: aliases T1/T2/T3, INNER JOIN. "card(s)" usually -> cards.name or id (if question says "ID" return id). Set "unique id" = sets.id.

## Coded values (exact case!)
- legalities.status: 'Legal','Banned','Restricted' (capitalized). format lowercase: brawl, commander, duel, future, gladiator, historic, legacy, modern, oldschool, pauper, penny, pioneer, premodern, standard, vintage.
- rarity: common, uncommon, rare, mythic. borderColor: black, white, borderless, gold, silver.
- availability: comma list e.g. 'mtgo,paper', 'arena,mtgo,paper'; "only X" -> `availability = 'X'`; "both arena and mtgo" -> LIKE '%arena,mtgo%'.
- Languages (both foreign_data & set_translations): 'Chinese Simplified','Chinese Traditional','French','German','Italian','Japanese','Korean','Portuguese (Brazil)','Russian','Spanish'; foreign_data also 'Phyrexian' etc.
- Flags are 0/1 ints: isTextless=1 means NO text box (has text box = isTextless=0); isPromo, isReprint, isOversized, isFullArt, isStorySpotlight, isOnlineOnly, hasContentWarning (=1 "sensitive content").
- side IS NULL = card without multiple faces (else 'a'..'e').
- frameVersion text '1993','1997','2003','2015','future' (ref sometimes compares to int 2015—works fine via affinity).
- power/toughness TEXT; "unknown power" = power IS NULL OR power LIKE '%*%'. toughness = 99 works.
- types single value like 'Creature','Artifact','Artifact,Creature'; supertypes 'Legendary','Basic'; colors 'B','G,W' (NULL = colorless). frameEffects e.g. 'legendary'; promoTypes e.g. 'arenaleague'; duelDeck 'a'/'b'; watermark lowercase ('abzan').
- sets.type lowercase: expansion, core, promo, commander, duel_deck, masters...; mtgoCode NULL (never '') when not on MTGO; set_translations.translation can be NULL (use IS NOT NULL for "has translation").
- Dates: sets.releaseDate & rulings.date 'YYYY-MM-DD'; cards.originalReleaseDate 'YYYY/M/D'.
- Apostrophes: 'Ancestor''s Chosen'. No trailing spaces found. "EDHRec rank higher than N" -> edhrecRank > N literally.

## Output conventions
- Percentages: `CAST(SUM(CASE WHEN cond THEN 1 ELSE 0 END) AS REAL) * 100 / COUNT(id)` (x100, no ROUND).
  Denominator = rows after the WHERE filter of the "among" group; e.g. "percentage of X among Y" -> WHERE Y, cond X.
- Set-level percentages over sets having a translation: `FROM sets WHERE code IN (SELECT setCode FROM set_translations WHERE language='...')`.
- Counts: COUNT(T1.id) usually; COUNT(DISTINCT T1.id) when joining legalities/rulings could duplicate and the question is "how many cards". Plain COUNT(id) on single-table.
- Max/min: ORDER BY col DESC LIMIT 1 (not ties-aware). "Top three ... alphabetical" -> ORDER BY name LIMIT 3.
- DISTINCT used for single-attribute lookups like status/borderColor of a named card ("What is the status of card X" -> SELECT DISTINCT T2.status) and lists of names via joins; plain list otherwise. Return only the asked columns, in question order.
- Set by name: join sets ON sets.code = cards.setCode WHERE sets.name = 'Coldsnap'. Set code directly: cards.setCode='10E'.
