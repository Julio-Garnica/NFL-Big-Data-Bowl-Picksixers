# PickSixers: decisiones bajo presión

- **Autor:** Julio Garnica
- **Equipo:** PickSixers
- **Facultad:** Facultad de Ciencias UNAM

## La pregunta
Cuando la defensa presiona al QB, ¿Tomó la mejor decisión? Y si no, ¿Qué probabilidad había de que la jugada saliera mejor con la decisión que recomiendan los datos?

## Cómo se responde la pregunta
1. **Qué pasó.** Una fila por dropback: situación, rushers, cobertura, presión (hurry, hit o sack de PFF), decisión del QB y resultado.
2. **Calificación.** Cada jugada es *exitosa* (40 % de la distancia en 1.er down, 60 % en 2.º, 100 % en 3.º/4.º, sin INT), *negativa* (sack, INT o pérdida) o *neutra*.
3. **Comparación.** Se buscan jugadas parecidas con el mismo estado de presión, con pesos de similitud por down, distancia, zona roja, cobertura y rushers. Con ellas se estima P(exitosa) y P(negativa) para cada decisión: pase corto, profundo, tirar el balón y scramble.
4. **Certificación.** La recomendación es la opción con mayor `P(exitosa) − P(negativa)`. P(mejor) es la probabilidad de que esa opción hubiera dado un nivel mejor que el real, con un intervalo de Wilson al 90 %. Solo se afirma "habría salido mejor" si todo el intervalo supera 50 %.

## Limitaciones
- **Sesgo de selección:** los QBs eligen según lo que ven. Por eso el scramble solo se recomienda a QBs corredores (≥ 6 % de scrambles) y bajo presión.
- "Tirar el balón" se marca solo cuando la descripción lo dice; en la revisión se trata como resultado fijo (neutra).
- Rushers y cobertura se conocen después del snap; en el simulador son "lo que espero de la defensa".
- Las jugadas parecidas no son independientes: la muestra efectiva se limita a 400 para el intervalo.
