/**
 * mi-ojo-vago-dev.guidev.org is retired — this Worker only exists to bounce
 * any remaining links/bookmarks to the production site. Temporary (302) so
 * it stays easy to repoint or remove later without baking a permanent
 * redirect into caches/search engines.
 */
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = new URL(url.pathname + url.search, 'https://mi-ojo-vago.guidev.org');
    return Response.redirect(target.toString(), 302);
  },
};
