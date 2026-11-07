# formula_1 notes (Ergast 1950–2017)

## Tables / joins
- races(raceId, year, round, circuitId, name, date 'YYYY-MM-DD', time 'HH:MM:SS' mostly NULL, url) → circuits(circuitId, circuitRef, name, location, country, lat, lng, alt[all NULL], url); → seasons(year,url).
- results(raceId, driverId, constructorId, number, grid, position, positionText, positionOrder, points, laps, time, milliseconds, fastestLap, rank, fastestLapTime, fastestLapSpeed, statusId→status.status).
- driverStandings / constructorStandings (raceId, driverId|constructorId, points, position, positionText, wins): cumulative season standings AFTER each race. constructorResults(raceId, constructorId, points, status).
- qualifying(raceId, driverId, constructorId, number, position, q1,q2,q3); lapTimes(raceId, driverId, lap, position, time, milliseconds); pitStops(raceId, driverId, stop, lap, time=clock time of day, duration TEXT seconds, milliseconds). pitStops only raceId 841–982 (2011+).
- Race identified by `races.name = 'X Grand Prix' AND races.year = N` (name+year unique). "race No. N" = raceId N.
- Driver by `forename='Lewis' AND surname='Hamilton'` (Hamilton/Schumacher/Senna/Villeneuve surnames shared by 2 drivers). Full name = forename, surname as two columns.
- Country is in circuits.country ('UK','USA','UAE','Korea'...); nationality (adjective: 'British','American','German','Japanese') in drivers/constructors.

## Value conventions
- "finished the race" = results.time IS NOT NULL; "did not finish" = time IS NULL (not statusId). results.time: winner '1:34:50.616', others '+5.478'.
- Finishing position = results.position (NULL if not classified); "final rank" = positionOrder; results.rank = fastest-lap rank. "ranked 2" → rank = 2.
- Status by text: JOIN status, `status = 'Puncture'`, 'Finished', 'Accident', 'Disqualified', '+1 Lap'...
- Driver wins/points often from driverStandings (SUM(wins), AVG(points); "drivers in race X" = COUNT(driverId) FROM driverStandings). Race positions → results. Constructor points per race → constructorResults (SUM for totals); "constructor highest point / 0 points at race" → constructorStandings.
- Fastest lap speed = results.fastestLapSpeed TEXT '218.300', sorted raw: `ORDER BY fastestLapSpeed DESC LIMIT 1`.
- Fastest lap time = results.fastestLapTime TEXT 'M:SS.mmm': `WHERE fastestLapTime IS NOT NULL ORDER BY fastestLapTime ASC LIMIT 1`.
- Lap times: lapTimes.milliseconds for best/avg ("best lap" = MIN(milliseconds)); lapTimes.time text.
- Pit stop time = pitStops.duration (TEXT; 132 rows are 'M:SS.mmm'); reference "longest" uses `ORDER BY duration DESC LIMIT 1`; averages use AVG(milliseconds).
- q1/q2/q3 'M:SS.mmm', NULL when not reached (q2 also has some ''). "finished 0:01:54 in Q3" → `q3 LIKE '1:54%'`; same pattern for lapTimes.time LIKE '1:27%'. Best qualifying time: ORDER BY q2 ASC LIMIT 1.
- Dates: year via STRFTIME('%Y', dob) compared to string: `STRFTIME('%Y', dob) > '1975'`. Oldest = ORDER BY dob ASC (one dob NULL → add `dob IS NOT NULL`); youngest = dob DESC. Date literals 'YYYY-MM-DD' (question "2015/11/29" → '2015-11-29').
- "location" of circuit = circuits.location; coordinates = lat, lng; url = "website/introduction/more info".

## Output shape
- Only asked columns, question order; top-1 → ORDER BY ... LIMIT 1 (no ties). DISTINCT when listing circuit url / race names per country / years from joins; single-race lists no DISTINCT.
- Counts: COUNT(T2.driverId) over join rows, no DISTINCT.
- Percent: `CAST(COUNT(CASE WHEN cond THEN x END) AS REAL) * 100 / COUNT(x)` or `CAST(SUM(IIF(cond,1,0)) AS REAL)*100/COUNT(*)`. Difference % : (a - b) * 100 / a with SUM(IIF(raceId=..., col, 0)).
- "Most X" grouped: GROUP BY entity ORDER BY COUNT/SUM DESC LIMIT 1, and SELECT the aggregate too if asked ("list the score, name...").
- Time text→seconds: SUBSTR(t,1,INSTR(t,':')-1)*60 + secs + ms/1000.

## Traps
- NULLs by era: fastestLap* only 2004+, lapTimes 1996+, q-times 1994+. 6 late-2017 races have no results.
