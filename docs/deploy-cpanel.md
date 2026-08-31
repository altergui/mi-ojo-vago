# Deploy al hosting del consultorio (cPanel)

Staging vive en `https://dresiribarren.com.ar/mi-ojo-vago_stg/`. Lo publica el
job `deploy-hosting-stg` de `.github/workflows/deploy.yml` en cada push a un
PR abierto (o manual, `workflow_dispatch`).

Producción (`/mi-ojo-vago/`) todavía **no** está migrada: esa URL sigue siendo
la página de WordPress con los links a los juegos de 2022 bajo `/games/`. El
job `deploy-hosting-prod` ya existe y deploya en cada push a `main`, pero está
**dormido a propósito**: sube el build a un directorio que hoy ninguna URL
alcanza (ver "Cómo está armado" más abajo). El cutover final es descomentar
un bloque de `.htaccess` — ver la sección de cutover al final.

## Restricciones del hosting

Condicionan casi todas las decisiones de abajo, así que conviene tenerlas a mano:

- **No hay acceso shell.** Ni SSH, ni rsync, ni el Git Version Control de cPanel (avisa
  que el administrador tiene que habilitar shell access). El deploy va por **FTPS**.
- **No hay API tokens de cPanel** (`security/api_tokens` da 404), así que el CI no puede
  purgar el caché. Se resuelve excluyendo la ruta del caché (paso 2).
- **El dominio corre PHP 7.4** (`ea-php74___lsphp`), aunque el default del sistema sea
  8.3. `public/sync.php` está escrito para 7.4 — no usar sintaxis de 8.x.
- **Solo se permite 1 cuenta FTP** en el plan — por eso prod y staging comparten una
  sola cuenta, chrooteada a un directorio contenedor y no a cada entorno por separado.
- El stack es nginx (caché) → LiteSpeed → lsphp, así que `.htaccess` **sí** se respeta.
- **El File Manager de este cPanel no tiene opción de crear symlinks**, y sin
  shell no hay `ln -s`.
- **`mod_rewrite` no puede apuntar afuera del docroot.** Un `RewriteRule` cuya
  sustitución empieza con `/` se interpreta como una URL (relativa a
  `public_html`), no como una ruta de filesystem — así que no hay forma de sustituir
  por un path absoluto para servir contenido fuera de `public_html` sin symlink.
  Probado en carne propia: la primera versión de este layout ponía todo fuera del
  docroot y el rewrite nunca disparaba (caía siempre al 404 de WordPress). Por
  eso el layout de abajo vive **adentro** de `public_html`.

## Cómo está armado

`mi-ojo-vago-app/` vive **dentro de `public_html`** (no se puede hacer de otra
forma sin symlinks, ver arriba). Cada entorno tiene su `html/` (lo que sube el
CI) y su `db/` (storage de sync) como hermanos:

```
public_html/mi-ojo-vago-app/     <- chroot de la ÚNICA cuenta FTP
  .htaccess                       <- bloquea acceso directo a stg/db y prod/db
  stg/
    html/        <- deploy-hosting-stg,  server-dir ./stg/html/
    db/
  prod/
    html/        <- deploy-hosting-prod, server-dir ./prod/html/ (dormido hasta el cutover)
    db/
```

`mi-ojo-vago-app/.htaccess` (nuevo, fuera del repo — nada del deploy lo toca
nunca):

```apache
RewriteEngine On
RewriteRule ^(stg|prod)/db(/|$) - [F,L]
```

`public_html/.htaccess` (raíz, agregado **antes** de `# BEGIN WordPress` —
ese bloque lo regenera WordPress y pisaría cualquier regla puesta adentro o
después) mapea la URL pública al contenido real con rewrite interno (sin
`R=`, la URL no cambia en el browser), esta vez con una ruta **relativa**
(mismo docroot, no cruza afuera de `public_html`):

```apache
RewriteRule ^mi-ojo-vago_stg/(.*)$ /mi-ojo-vago-app/stg/html/$1 [L]
RewriteRule ^mi-ojo-vago_stg/?$ /mi-ojo-vago-app/stg/html/ [L]

# Cutover de prod — comentado hasta descomentarlo (ver sección de cutover):
# RewriteRule ^mi-ojo-vago/(.*)$ /mi-ojo-vago-app/prod/html/$1 [L]
# RewriteRule ^mi-ojo-vago/?$ /mi-ojo-vago-app/prod/html/ [L]
# ... (redirects de las 10 URLs legacy + /my-lazy-eye/, ver sección de cutover)
```

**Base path por entorno.** `vite.config.ts` lee `VITE_BASE`. Las rutas a `public/assets`
son literales de runtime que Vite no reescribe, así que pasan por `asset()`
(`src/assets.ts`), que las resuelve contra `import.meta.env.BASE_URL`. Sin `VITE_BASE` el
build queda en la raíz, que es lo que siguen usando los Workers de Cloudflare.

**Versión.** `vite.config.ts` también define `__APP_VERSION__` en build time
(`v${package.json version} (SHA corto de git)`), visible en el footer de la
app en los 3 targets de deploy sin wiring extra por workflow.

**Sync.** `public/sync.php` es el port a PHP del Worker de `worker/src/index.ts`: mismo
contrato (GET/PUT de un blob JSON con clave de 64 hex, tope 50KB, TTL 360 días). Vive en
`public/` para viajar dentro de `dist/`, o sea que el endpoint queda versionado junto a
la app que sirve.

El storage (`storage_dir()` en `sync.php`) es siempre el directorio `db/`
hermano de donde vive el propio `sync.php` (`dirname(__DIR__) . '/db'` —
nada de contar niveles ni sufijos, a diferencia del esquema viejo). Como
`html/` y `db/` son hermanos dentro de `mi-ojo-vago-app/{stg,prod}/`, y ese
directorio vive adentro de `public_html`, `db/` **sí** es técnicamente
alcanzable por URL — por eso lo protege el `.htaccess` de arriba, con
`[F]` (403), en vez de la garantía más fuerte de estar físicamente afuera del
docroot que sí tiene, por ejemplo, `sync-data-mi-ojo-vago-dev` (el storage del
esquema viejo, todavía sin usar/migrar).

Como app y endpoint comparten origen, **no hay CORS**. `public/.htaccess` (el
que viaja dentro de `dist/`) mapea `<base>/sync/<key>` a `sync.php?code=<key>`,
con lo cual `src/sync/client.ts` no necesita saber nada de PHP: alcanza con
`VITE_SYNC_URL=/mi-ojo-vago_stg` (o `/mi-ojo-vago` en prod).

Una divergencia deliberada con el Worker: el rewrite es `^sync/([0-9a-f]{64})$`,
así que una clave malformada nunca llega al PHP y el server devuelve **404**, donde el
Worker devolvía 400. Se prefiere el filtro estricto — en un hosting compartido, que
basura arbitraria no invoque PHP vale más que replicar un código de error que el cliente
nunca produce (`src/sync/client.ts` solo manda hashes de 64 hex). La validación en
`sync.php` se mantiene igual, para el caso de que alguien llame al script directo.

El Worker de Cloudflare sigue intacto y atendiendo a los deploys de Cloudflare.

## Puesta a punto (una sola vez, en el cPanel)

1. **Cuenta FTP dedicada** — cPanel → *Cuentas FTP* → Añadir:
   - Directorio: `/home/dresiribarrencom/public_html/mi-ojo-vago-app`
   - Con cuota. **No usar la cuenta principal**: queda chrooteada al directorio del
     deploy, así que el blast radius de esas credenciales es ese directorio y nada más
     — no puede tocar WordPress ni nada fuera de `mi-ojo-vago-app/`.

2. **Excluir la ruta del caché** — cPanel → *HTTP Performance* → *Cache* →
   *Crear exclusión*, dominio `dresiribarren.com.ar`, ruta `/mi-ojo-vago_stg`
   (y, al hacer el cutover de prod, otra para `/mi-ojo-vago`).

   Sin esto el pipeline no sirve: los estáticos vuelven con `max-age=604800`, así que un
   deploy tardaría hasta 7 días en verse. Los assets van con hash en el nombre, así que
   perder el caché de proxy para esta ruta no cuesta nada.

3. **Secrets en GitHub** — Settings → Secrets and variables → Actions:
   `CPANEL_FTP_HOST`, `CPANEL_FTP_USER`, `CPANEL_FTP_PASSWORD` (de la cuenta
   de arriba). Como vars (no son secretas, ya públicas en la página vieja):
   `VITE_DONATION_EMAIL`, `VITE_DONATION_PHONE`.

4. **Cron del TTL** — cPanel → *Tareas cron*, una vez por día por entorno:
   ```
   /usr/local/bin/ea-php74 /home/dresiribarrencom/public_html/mi-ojo-vago-app/stg/html/sync.php --gc >/dev/null 2>&1
   /usr/local/bin/ea-php74 /home/dresiribarrencom/public_html/mi-ojo-vago-app/prod/html/sync.php --gc >/dev/null 2>&1
   ```
   Reemplaza el `expirationTtl` que el Worker recibía gratis de KV.

## Verificación post-deploy (staging)

```bash
BASE=https://dresiribarren.com.ar/mi-ojo-vago_stg

# La app carga:
curl -s $BASE/ | grep -q 'id="root"' && echo "app OK"

# La versión vive en el JS bundle, no en index.html:
JS=$(curl -s $BASE/ | grep -oE '/mi-ojo-vago_stg/assets/index-[A-Za-z0-9_-]+\.js' | head -1)
curl -s "https://dresiribarren.com.ar$JS" | grep -oE 'v[0-9.]+ \([0-9a-f]+\)'

# El caché no pega el index, y staging no se indexa:
curl -sI $BASE/ | grep -i 'cache-control\|x-cache\|robots'

# Round-trip del sync:
C=$(printf 'test' | sha256sum | cut -d' ' -f1)
curl -s -X PUT -H 'Content-Type: application/json' -d '{"v":1}' $BASE/sync/$C
curl -s $BASE/sync/$C                                              # {"v":1}

# Rechazos esperados:
curl -s -o /dev/null -w '%{http_code}\n' $BASE/sync/nope           # 404 (ver nota)
curl -s -o /dev/null -w '%{http_code}\n' https://dresiribarren.com.ar/mi-ojo-vago-app/stg/db/  # 403

# Y nada de lo que ya existía se movió:
curl -s -o /dev/null -w '%{http_code}\n' https://dresiribarren.com.ar/mi-ojo-vago/                 # 200 (WP)
curl -s -o /dev/null -w '%{http_code}\n' https://dresiribarren.com.ar/games/amblyotris/index_es.html  # 200
```

Después, con el browser: cargar en mobile (375px) y confirmar que **suenan** los cuatro
juegos — es la prueba real de que los `soundBasePath` quedaron bien, porque un
`soundBasePath` roto no rompe ni el build ni los tests, solo deja el juego mudo. Probar
también `?lang=en`/`?lang=es` en un par de rutas nuevas.

## Rollback

Sin shell no hay symlink-swap. El rollback es re-correr el workflow desde un commit
anterior (`workflow_dispatch`), o sacar la regla de rewrite correspondiente del
`.htaccess` raíz, más el backup de JetBackup.

## Cutover a producción

Con staging verificado, descomentar el bloque de prod en `public_html/.htaccess`
(ya escrito completo, ver "Cómo está armado" arriba: el rewrite de
`/mi-ojo-vago/` y los 10 redirects 301 de las URLs legacy + `/my-lazy-eye/`,
con soporte de `?lang=` ya implementado en `src/i18n.tsx`/`App.tsx`), sumar
la exclusión de caché y el cron de `/mi-ojo-vago` de arriba, y correr la
verificación equivalente contra `https://dresiribarren.com.ar/mi-ojo-vago`
más un `curl -sI ... | grep -i location` por cada una de las 10 URLs legacy y
`/my-lazy-eye/`.

Pendiente, sin bloquear el cutover:

- Despublicar la página de WordPress (ID 362) — prolijidad, no hace falta:
  el rewrite de `/mi-ojo-vago/` la tapa por completo apenas se activa.
- Migrar los 9 blobs válidos del KV de Cloudflare (`wrangler kv key get` →
  `PUT` a `sync.php`) para que un código de sync generado en
  `mi-ojo-vago.guidev.org` también sirva en `dresiribarren.com.ar/mi-ojo-vago`.
  Fuera de alcance de este release — los 3 códigos cortos
  (`25-102-412`, `56-194-651`, `80-156-669`) se descartan igual: el Worker ya
  los rechaza.
- Borrar `sync-data-mi-ojo-vago-dev/` (storage huérfano del esquema viejo,
  fuera de `public_html`, sin datos valiosos) y el directorio físico viejo
  `public_html/mi-ojo-vago-dev/`.
