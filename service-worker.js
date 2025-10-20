/* PWA 缓存：核心 + 图片；支持相册离线、最近浏览、预加载入账、任务取消、专辑清除、全清、可选裁剪(默认关闭) */
const CORE_CACHE = 'core-v1';
const IMG_CACHE = 'img-v1';

const CORE_ASSETS = [
  './',
  './index.html',
  './portal.css',
  './portal.js',
  './gallery-data.js',
  './manifest.webmanifest'
];

// 运行时设置（页面通过 postMessage 下发）
const SW_SETTINGS = {
  trimEnabled: false,
  maxEntries: 120
};

// 取消标记表
const cancelSet = new Set();

self.addEventListener('install', (event) => {
  event.waitUntil((async ()=>{
    const cache = await caches.open(CORE_CACHE);
    await cache.addAll(CORE_ASSETS.map(u=>new Request(u, {cache:'reload'})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.map(k=>{
      if(![CORE_CACHE, IMG_CACHE].includes(k)) return caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;

  if (req.destination === 'image') {
    event.respondWith((async ()=>{
      const cache = await caches.open(IMG_CACHE);
      const hit = await cache.match(req, {ignoreSearch:false});
      if (hit) return hit;
      try{
        const resp = await fetch(req, {credentials:'omit'});
        cache.put(req, resp.clone());
        if (SW_SETTINGS.trimEnabled) await trimCache(IMG_CACHE, SW_SETTINGS.maxEntries);
        return resp;
      }catch(e){
        return (await caches.match(req)) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async ()=>{
    try{
      const net = await fetch(req);
      const cache = await caches.open(CORE_CACHE);
      if (url.origin === location.origin) cache.put(req, net.clone());
      return net;
    }catch(e){
      const hit = await caches.match(req);
      if (hit) return hit;
      if (req.mode === 'navigate') return (await caches.match('./')) || Response.error();
      return Response.error();
    }
  })());
});

self.addEventListener('message', (event)=>{
  const { type, data } = event.data || {};
  if (type === 'CACHE_ALBUM') {
    const urls = (data?.urls)||[];
    const albumKey = data?.albumKey || '';
    event.waitUntil(cacheAlbum(urls, event.source, albumKey));
  } else if (type === 'CACHE_URL') {
    const url = data?.url;
    const albumKey = data?.albumKey || '';
    if (url) event.waitUntil(cacheOnePlus(url, event.source, albumKey));
  } else if (type === 'CANCEL_ALBUM') {
    const albumKey = data?.albumKey || '';
    if (albumKey) cancelSet.add(albumKey);
  } else if (type === 'PURGE_ALBUM') {
    const urls = (data?.urls)||[];
    const albumKey = data?.albumKey || '';
    event.waitUntil(purgeAlbum(urls, event.source, albumKey));
  } else if (type === 'PURGE_ALL') {
    event.waitUntil(purgeAll(event.source));
  } else if (type === 'UPDATE_SETTINGS') {
    if (typeof data?.trimEnabled === 'boolean') SW_SETTINGS.trimEnabled = data.trimEnabled;
    if (Number.isFinite(data?.maxEntries)) SW_SETTINGS.maxEntries = data.maxEntries|0;
  }
});

async function cacheOnePlus(url, source, albumKey){
  try{
    const cache = await caches.open(IMG_CACHE);
    const req = new Request(url, {mode:'no-cors', credentials:'omit'});
    const hit = await cache.match(req);
    if (!hit) {
      const resp = await fetch(req);
      await cache.put(req, resp);
      if (SW_SETTINGS.trimEnabled) await trimCache(IMG_CACHE, SW_SETTINGS.maxEntries);
      source?.postMessage({ type:'CACHE_ONE', data:{ albumKey, added:true } });
    } else {
      source?.postMessage({ type:'CACHE_ONE', data:{ albumKey, added:false } });
    }
  }catch(e){
    // ignore
  }
}

async function cacheAlbum(urls, source, albumKey){
  const total = urls.length;
  const cache = await caches.open(IMG_CACHE);
  let done = 0;
  for (const url of urls) {
    if (albumKey && cancelSet.has(albumKey)) break;
    try{
      const req = new Request(url, {mode:'no-cors', credentials:'omit'});
      const hit = await cache.match(req);
      if (!hit) {
        const resp = await fetch(req);
        await cache.put(req, resp);
      }
    }catch(e){
      // ignore each
    }
    done++;
    source?.postMessage({ type:'CACHE_PROGRESS', data:{ done, total, albumKey } });
  }
  if (albumKey && cancelSet.has(albumKey)) {
    cancelSet.delete(albumKey);
    source?.postMessage({ type:'CACHE_CANCELLED', data:{ albumKey, done } });
    return;
  }
  if (SW_SETTINGS.trimEnabled) await trimCache(IMG_CACHE, SW_SETTINGS.maxEntries);
  source?.postMessage({ type:'CACHE_DONE', data:{ albumKey, total } });
}

async function purgeAlbum(urls, source, albumKey){
  const cache = await caches.open(IMG_CACHE);
  const keys = await cache.keys();
  const targets = new Set(urls);
  let removed = 0;
  for (const req of keys){
    if (targets.has(req.url)) {
      const ok = await cache.delete(req);
      if (ok) removed++;
    }
  }
  source?.postMessage({ type:'PURGE_DONE', data:{ albumKey, removed } });
}

async function purgeAll(source){
  const cache = await caches.open(IMG_CACHE);
  const keys = await cache.keys();
  const count = keys.length;
  await caches.delete(IMG_CACHE);
  await caches.open(IMG_CACHE); // recreate
  source?.postMessage({ type:'PURGE_ALL_DONE', data:{ removed: count } });
}

async function trimCache(cacheName, max){
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  const delCount = keys.length - max;
  for (let i=0;i<delCount;i++){
    await cache.delete(keys[i]);
  }
}
