# PickSixers: decisiones bajo presión

**Pregunta:** cuando la defensa presiona al QB, ¿tomó la mejor decisión? Y si no, ¿qué probabilidad había de que la jugada saliera mejor con la decisión que recomiendan los datos?

Datos: NFL Big Data Bowl 2023 (temporada 2021, semanas 1-8), PFF y tracking. Fotos (nfl.com) y logos (ESPN) vía nflverse.

## Tour
Al abrir la app se ofrece un tour narrado (cerca de 1 minuto): el head coach de los Steelers explica el método, revisa una jugada real, responde la pregunta y saca una regla para el plan de juego. Usa la voz del navegador (Web Speech API); el botón **Tour** del header lo repite.

## Ejecutar
```powershell
.\iniciar.cmd          # compila el dashboard si hace falta y abre la app en http://localhost:8000
```
Desarrollo por separado: `.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload` y, en `dashboard`, `npm run dev`
(Node está en `.hackathon\.tools\node`).

Archivos precalculados (de solo lectura para el servidor):
- `backend/derived/dropbacks.csv.gz`: `.\.venv\Scripts\python.exe -m backend.features`
- `backend/derived/headshots.csv`, `backend/derived/teams.csv` y `dashboard/public/teams/*.png`: `.\.venv\Scripts\python.exe -m backend.assets`

## Cómo se responde la pregunta
1. **Qué pasó.** Una fila por dropback: situación, rushers, cobertura, presión (hurry, hit o sack de PFF), decisión del QB y resultado.
2. **Calificación.** Cada jugada es *exitosa* (40 % de la distancia en 1.er down, 60 % en 2.º, 100 % en 3.º/4.º, sin INT), *negativa* (sack, INT o pérdida) o *neutra*.
3. **Comparación.** Se buscan jugadas parecidas con el mismo estado de presión, con pesos de similitud por down, distancia, zona roja, cobertura y rushers. Con ellas se estima P(exitosa) y P(negativa) para cada decisión: pase corto, profundo, tirar el balón y scramble.
4. **Certificación.** La recomendación es la opción con mayor `P(exitosa) − P(negativa)`. P(mejor) es la probabilidad de que esa opción hubiera dado un nivel mejor que el real, con un intervalo de Wilson al 90 %. Solo se afirma "habría salido mejor" si todo el intervalo supera 50 %.

## Estructura
- `backend/features.py`: tabla de dropbacks (plays + PFF + tracking).
- `backend/review.py`: calificación, similitud y revisión de cada jugada.
- `backend/model.py`: modelo de presión (logística), simulador y perfiles de QBs, equipos y defensivos.
- `dashboard/src`: Inicio, Revisión de jugadas, Simulador, Defensas, Quarterbacks, Jugadores. Las definiciones de los iconos "i" están en `glossary.tsx`.

## Límites
- **Sesgo de selección:** los QBs eligen según lo que ven. Por eso el scramble solo se recomienda a QBs corredores (≥ 6 % de scrambles) y bajo presión.
- "Tirar el balón" se marca solo cuando la descripción lo dice; en la revisión se trata como resultado fijo (neutra).
- Rushers y cobertura se conocen después del snap; en el simulador son "lo que espero de la defensa".
- Las jugadas parecidas no son independientes: la muestra efectiva se limita a 400 para el intervalo.
