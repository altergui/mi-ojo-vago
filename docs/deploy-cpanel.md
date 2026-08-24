# Deploy al hosting del consultorio (cPanel)

Staging vive en `https://dresiribarren.com.ar/mi-ojo-vago-dev/`, servido desde
`public_html/mi-ojo-vago-dev/` en la cuenta cPanel `dresiribarrencom`. Lo publica el job
`deploy-hosting-dev` de `.github/workflows/deploy.yml` en cada push a un PR abierto.

Producción (`/mi-ojo-vago/`) todavía **no** está migrada: esa URL sigue siendo la página
de WordPress con los links a los juegos de 2022 bajo `/games/`.

## Restricciones del hosting

Condicionan casi todas las decisiones de abajo, así que conviene tenerlas a mano:

- **No hay acceso shell.** Ni SSH, ni rsync, ni el Git Version Control de cPanel (avisa
  que el administrador tiene que habilitar shell access). El deploy va por **FTPS**.
- **No hay API tokens de cPanel** (`security/api_tokens` da 404), así que el CI no puede
  purgar el caché. Se resuelve excluyendo la ruta del caché (paso 3).
- **El dominio corre PHP 7.4** (`ea-php74___lsphp`), aunque el default del sistema sea
  8.3. `public/sync.php` está escrito para 7.4 — no usar sintaxis de 8.x.
- **Solo se permite 1 cuenta FTP** en el plan.
- El stack es nginx (caché) → LiteSpeed → lsphp, así que `.htaccess` **sí** se respeta.

## Puesta a punto (una sola vez, en el cPanel)

1. **Cuenta FTP dedicada** — cPanel → *Cuentas FTP* → Añadir:
   - Directorio: `/home/dresiribarrencom/public_html/mi-ojo-vago-dev`
   - Con cuota. **No usar la cuenta principal**: queda chrooteada al directorio del
     deploy, así que el blast radius de esas credenciales es ese directorio y nada más.

2. **Excluir la ruta del caché** — cPanel → *HTTP Performance* → *Cache* →
   *Crear exclusión*, dominio `dresiribarren.com.ar`, ruta `/mi-ojo-vago-dev`.

   Sin esto el pipeline no sirve: los estáticos vuelven con `max-age=604800`, así que un
   deploy tardaría hasta 7 días en verse. Los assets van con hash en el nombre, así que
   perder el caché de proxy para esta ruta no cuesta nada.

3. **Secrets en GitHub** — Settings → Secrets and variables → Actions:
   `CPANEL_FTP_HOST`, `CPANEL_FTP_USER`, `CPANEL_FTP_PASSWORD`.

4. **Cron del TTL** — cPanel → *Tareas cron*, una vez por día:
   ```
   /usr/local/bin/ea-php74 /home/dresiribarrencom/public_html/mi-ojo-vago-dev/sync.php --gc >/dev/null 2>&1
   ```
   Reemplaza el `expirationTtl` que el Worker recibía gratis de KV.

## Cómo está armado

**Base path por entorno.** `vite.config.ts` lee `VITE_BASE`. Las rutas a `public/assets`
son literales de runtime que Vite no reescribe, así que pasan por `asset()`
(`src/assets.ts`), que las resuelve contra `import.meta.env.BASE_URL`. Sin `VITE_BASE` el
build queda en la raíz, que es lo que siguen usando los Workers de Cloudflare.

**Sync.** `public/sync.php` es el port a PHP del Worker de `worker/src/index.ts`: mismo
contrato (GET/PUT de un blob JSON con clave de 64 hex, tope 50KB, TTL 360 días). Vive en
`public/` para viajar dentro de `dist/`, o sea que el endpoint queda versionado junto a
la app que sirve.

El storage se deriva del propio directorio de deploy:

```
public_html/mi-ojo-vago-dev  ->  ~/sync-data-mi-ojo-vago-dev
public_html/mi-ojo-vago      ->  ~/sync-data-mi-ojo-vago
```

Queda **fuera del docroot** (ningún sync de deploy puede borrarlo, y no es accesible por
web) y cada entorno tiene sus datos sin configurar nada. Las escrituras son
`tempnam()` + `rename()`, así que un GET concurrente nunca ve un blob a medio escribir.

Como app y endpoint comparten origen, **no hay CORS**. `public/.htaccess` mapea
`<base>/sync/<key>` a `sync.php?code=<key>`, con lo cual `src/sync/client.ts` no necesita
saber nada de PHP: alcanza con `VITE_SYNC_URL=/mi-ojo-vago-dev`.

Una divergencia deliberada con el Worker: el rewrite es `^sync/([0-9a-f]{64})$`,
así que una clave malformada nunca llega al PHP y el server devuelve **404**, donde el
Worker devolvía 400. Se prefiere el filtro estricto — en un hosting compartido, que
basura arbitraria no invoque PHP vale más que replicar un código de error que el cliente
nunca produce (`src/sync/client.ts` solo manda hashes de 64 hex). La validación en
`sync.php` se mantiene igual, para el caso de que alguien llame al script directo.

El Worker de Cloudflare sigue intacto y atendiendo a los deploys de Cloudflare.

## Verificación post-deploy

```bash
BASE=https://dresiribarren.com.ar/mi-ojo-vago-dev

# La app carga:
curl -s $BASE/ | grep -q 'id="root"' && echo "app OK"

# El caché no pega el index, y staging no se indexa:
curl -sI $BASE/ | grep -i 'cache-control\|x-cache\|robots'

# Round-trip del sync:
C=$(printf 'test' | sha256sum | cut -d' ' -f1)
curl -s -X PUT -H 'Content-Type: application/json' -d '{"v":1}' $BASE/sync/$C
curl -s $BASE/sync/$C                                              # {"v":1}

# Rechazos esperados:
curl -s -o /dev/null -w '%{http_code}\n' $BASE/sync/nope           # 404 (ver nota)
curl -s -o /dev/null -w '%{http_code}\n' $BASE/.ftp-deploy-sync-state.json  # 403
curl -s -o /dev/null -w '%{http_code}\n' https://dresiribarren.com.ar/sync-data-mi-ojo-vago-dev/  # 404

# Y nada de lo que ya existía se movió:
curl -s -o /dev/null -w '%{http_code}\n' https://dresiribarren.com.ar/mi-ojo-vago/                 # 200 (WP)
curl -s -o /dev/null -w '%{http_code}\n' https://dresiribarren.com.ar/games/amblyotris/index_es.html  # 200
```

Después, con el browser: cargar en mobile (375px) y confirmar que **suenan** los cuatro
juegos — es la prueba real de que los `soundBasePath` quedaron bien, porque un
`soundBasePath` roto no rompe ni el build ni los tests, solo deja el juego mudo.

## Rollback

Sin shell no hay symlink-swap. El rollback es re-correr el workflow desde un commit
anterior (`workflow_dispatch`), más el backup de JetBackup.

## Pendiente para el cutover a producción

- **Solo hay 1 cuenta FTP y va a estar apuntando a `mi-ojo-vago-dev`.** Para deployar
  prod hay que decidir entre cambiarle el directorio a `public_html` y usar `server-dir`
  por entorno (cubre ambos, pero le da escritura sobre todo WordPress), o recrearla
  apuntando a `mi-ojo-vago` y rotar los secrets.
- Redirects de las 10 deep URLs legacy en `public_html/games/.htaccess`, con soporte de
  `?lang=` en `src/i18n.tsx` (hoy el idioma sale solo de `localStorage`) para que las
  variantes `_en` caigan en inglés.
- Despublicar la página de WP (ID 362) y reapuntar los links de `/my-lazy-eye/`.
- Migrar los 9 blobs válidos del KV (`wrangler kv key get` → `PUT`). Los 3 códigos cortos
  (`25-102-412`, `56-194-651`, `80-156-669`) se descartan: el Worker ya los rechaza.
- Decidir si los `VITE_DONATION_*` (hoy solo en `.env.local`, gitignoreado, o sea que
  ningún deploy los tiene) pasan a ser secrets del CI.
