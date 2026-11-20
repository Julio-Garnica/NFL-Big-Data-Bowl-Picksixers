# Publicar cada cambio en GitHub

Repositorio: https://github.com/Julio-Garnica/NFL-Big-Data-Bowl-Picksixers (rama `main`, remoto `origin`).

Después de cada cambio que se haga al proyecto, y una vez verificado (build o pruebas relevantes en verde):
1. `git add -A` y revisar `git status` para confirmar que solo entra lo esperado.
2. Commit con un mensaje breve en español que describa el cambio.
3. `git push origin main`.

Reglas:
- Nunca subir `data/`, `.env`, credenciales ni archivos grandes (ya están en `.gitignore`).
- Nunca usar `git push --force` ni reescribir historia. Si el push es rechazado porque el remoto tiene cambios nuevos, hacer `git pull --rebase` y, si hay conflictos, preguntar al usuario.
- Si el cambio no compila o las pruebas fallan, no hacer push: avisar al usuario.
- Informar al usuario el hash del commit subido.
