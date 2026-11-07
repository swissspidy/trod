# european_football_2 notes

## Tables & joins
- Player(id, player_api_id, player_name, player_fifa_api_id, birthday, height REAL cm 157-208, weight lbs 117-243). 11060 rows; names NOT unique (e.g. 'Adriano' x4).
- Player_Attributes: many rows per player (time series). Join `Player.player_api_id = Player_Attributes.player_api_id`.
- Team(id, team_api_id, team_fifa_api_id, team_long_name, team_short_name e.g. 'CLB'). Team_Attributes: several dated rows per team; join on team_api_id.
- League(id, country_id, name); League.id = Country.id for every league. Names: 'Belgium Jupiler League','England Premier League','France Ligue 1','Germany 1. Bundesliga','Italy Serie A','Netherlands Eredivisie','Poland Ekstraklasa','Portugal Liga ZON Sagres','Scotland Premier League','Spain LIGA BBVA','Switzerland Super League'. Country.name = 'Belgium','England',...
- Match: league_id -> League.id, country_id -> Country.id, home/away_team_api_id -> Team.team_api_id, home_player_1..11 / away_player_1..11 -> Player.player_api_id. goal/shoton/card etc. are XML text.
- Seasons: '2008/2009' .. '2015/2016'. "2010 season" was interpreted as '2009/2010'. "2015-2016 season" -> '2015/2016'.

## Formats
- All dates TEXT 'YYYY-MM-DD 00:00:00' (birthday, PA.date, TA.date, Match.date). Use `SUBSTR(date,1,10)='2010-02-22'` or `date LIKE '2010-02-22%'`; month `SUBSTR(date,1,7)='2009-04'`; year `STRFTIME('%Y',date)='2011'` or SUBSTR(date,1,4). Year ranges: `STRFTIME('%Y',date) >= '2010' AND ... <= '2015'`.
- Team_Attributes dates only: 2010-02-22, 2011-02-22, 2012-02-22, 2013-09-20, 2014-09-19, 2015-09-10.
- No trailing spaces in names. Lowercase: preferred_foot 'left'/'right'; work rates 'high'/'medium'/'low' (plus junk values, NULLs).
- Class columns (capitalized): buildUpPlaySpeedClass Slow/Balanced/Fast; buildUpPlayDribblingClass Little/Normal/Lots; buildUpPlayPassingClass Short/Mixed/Long; chanceCreationPassingClass Safe/Normal/Risky; chanceCreationCrossing/ShootingClass Little/Normal/Lots; defencePressureClass Deep/Medium/High; defenceAggressionClass Contain/Press/Double; defenceTeamWidthClass Narrow/Normal/Wide; positioning classes Organised/'Free Form'; defenceDefenderLineClass Cover/'Offside Trap'. buildUpPlayDribbling numeric mostly NULL.
- attacking_work_rate 'low' = stays in position when team attacks. Older = smaller birthday (ORDER BY birthday ASC).
- "overall strength" = overall_rating; "header finishing" = heading_accuracy; "speed attacks put together" = buildUpPlaySpeed.

## Output conventions (reference SQL style)
- Superlative "which player/the X with highest ..." -> `ORDER BY col DESC LIMIT 1` over joined attribute rows (no tie handling). "List all ... with highest" -> `WHERE col = (SELECT MAX(col) FROM ...)` with DISTINCT names.
- Return only asked column(s).
- Listing players/teams via attribute filters -> `SELECT DISTINCT t1.player_name` / `DISTINCT t1.team_short_name` (attribute rows duplicate). Asking a class/value of one team/player over all dates -> SELECT DISTINCT class.
- Counting players over attribute join -> `COUNT(DISTINCT t1.id)`; counting matches -> `COUNT(t2.id)`. But a pure Player_Attributes count used `COUNT(player_api_id)` (rows, not distinct).
- Averages: `CAST(SUM(x) AS REAL) / COUNT(t2.id)` over all attribute rows (not per player). Percent: `CAST(COUNT(CASE WHEN cond THEN t1.id END) AS REAL) * 100 / COUNT(t1.id)`.
- Sum of a skill for a player = SUM over all their PA rows.
- Value on a specific date: filter PA/TA by SUBSTR(date,1,10).
- League by name: `League t1 JOIN Match t2 ON t1.id=t2.league_id WHERE t1.name=...`; by country: `Country JOIN Match ON Country.id=Match.country_id`.
- Top-N leagues/teams: `GROUP BY name ORDER BY COUNT(t2.id) DESC LIMIT N`. Away wins: `away_team_goal - home_team_goal > 0`, GROUP BY away_team_api_id, join Team for team_long_name.
- "born after 1990s" was `birthday > '1990'` (string compare). Age now: `DATETIME() - birthday` style (integer year diff).
