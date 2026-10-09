const VERSION='1.2.0';
const CACHE=`public-cosme-notebook-v${VERSION}`;
const ASSETS=['./','./style.css','./manifest.webmanifest','./js/app.js','./js/store.js','./js/domain.js','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png','./icons/maskable-192.png','./icons/maskable-512.png',...['exam','rules','schedule','chapters','comparisons','analysis','memorize'].map(n=>`./data/${n}.json`)];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('public-cosme-notebook-v')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
// Match without opening a cache: an old worker finishing a request during
// activation must not recreate a cache that the new worker just deleted.
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 event.respondWith((async()=>{
  const request=event.request.mode==='navigate'?new URL('./',self.registration.scope).href:event.request;
  const cached=await caches.match(request,{cacheName:CACHE,ignoreSearch:true});
  return cached||fetch(event.request);
 })());
});
