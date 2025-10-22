/* PWA 缓存：核心 + 图片；支持相册离线、预加载入账、任务取消、专辑清除、全清、可选裁剪(默认关闭)
   修复点：
   - 进度分 processed(处理进度) 与 addedTotal(新增数)
   - 维护 per-album 已新增计数，达到 total 时主动发 CACHE_DONE
   - CANCEL 返回 processed 与 addedTotal
*/
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

const SW_SETTINGS = {
  trimEnabled: false,
  maxEntries: 120
};

// 运行数据
const cancelSet = new Set();                  // 被取消的 albumKey
const albumAdded = new Map();                 // albumKey -> 已新增(去重)数量
const albumTotals = new Map();                // albumKey -> total
const albumDoneSet = new Set();               // 已宣布 done 的 albumKey

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
    const key = data?.albumKey || '';
    event.waitUntil(cacheAlbum(urls, event.source, key));
  } else if (type === 'CACHE_URL') {
    const url = data?.url;
    const key = data?.albumKey || '';
    const total = data?.total;
    if (Number.isFinite(total)) albumTotals.set(key, total);
    if (url) event.waitUntil(cacheOnePlus(url, event.source, key));
  } else if (type === 'CANCEL_ALBUM') {
    const key = data?.albumKey || '';
    if (key) cancelSet.add(key);
  } else if (type === 'PURGE_ALBUM') {
    const urls = (data?.urls)||[];
    const key = data?.albumKey || '';
    event.waitUntil(purgeAlbum(urls, event.source, key));
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
      if (albumKey){
        const cur = (albumAdded.get(albumKey)||0) + 1;
        albumAdded.set(albumKey, cur);
        maybeAnnounceDone(source, albumKey);
      }
      if (SW_SETTINGS.trimEnabled) await trimCache(IMG_CACHE, SW_SETTINGS.maxEntries);
      source?.postMessage({ type:'CACHE_ONE', data:{ albumKey, added:true, total: albumTotals.get(albumKey) } });
    } else {
      source?.postMessage({ type:'CACHE_ONE', data:{ albumKey, added:false, total: albumTotals.get(albumKey) } });
    }
  }catch(e){
    // ignore
  }
}

async function cacheAlbum(urls, source, albumKey){
  const total = urls.length;
  albumTotals.set(albumKey, total);
  let processed = 0;
  for (const url of urls) {
    if (albumKey && cancelSet.has(albumKey)) break;
    try{
      const cache = await caches.open(IMG_CACHE);
      const req = new Request(url, {mode:'no-cors', credentials:'omit'});
      const hit = await cache.match(req);
      if (!hit) {
        const resp = await fetch(req);
        await cache.put(req, resp);
        // 仅新增时累计 added
        const cur = (albumAdded.get(albumKey)||0) + 1;
        albumAdded.set(albumKey, cur);
      }
    }catch(e){
      // ignore each
    }
    processed++;
    source?.postMessage({ type:'CACHE_PROGRESS', data:{ processed, addedTotal:(albumAdded.get(albumKey)||0), total, albumKey } });
  }
  if (albumKey && cancelSet.has(albumKey)) {
    cancelSet.delete(albumKey);
    source?.postMessage({ type:'CACHE_CANCELLED', data:{ albumKey, processed, addedTotal:(albumAdded.get(albumKey)||0), total } });
    return;
  }
  if (SW_SETTINGS.trimEnabled) await trimCache(IMG_CACHE, SW_SETTINGS.maxEntries);
  albumTotals.set(albumKey, total);
  maybeAnnounceDone(source, albumKey, true);
}

function maybeAnnounceDone(source, albumKey, force=false){
  const total = albumTotals.get(albumKey);
  const added = albumAdded.get(albumKey)||0;
  if (total && added >= total && !albumDoneSet.has(albumKey)){
    albumDoneSet.add(albumKey);
    source?.postMessage({ type:'CACHE_DONE', data:{ albumKey, total, addedTotal: added } });
  }else if(force){
    // 主动结束也发 DONE
    source?.postMessage({ type:'CACHE_DONE', data:{ albumKey, total, addedTotal: added } });
  }
}

async function purgeAlbum(urls, source, albumKey){
  const cache = await caches.open(IMG_CACHE);
  let removed = 0;
  // 删除目标
  for (const url of urls){
    const ok = await cache.delete(new Request(url, {mode:'no-cors', credentials:'omit'}));
    if (ok) removed++;
  }
  // 重算该相册已缓存条目（以防外部重复 URL）
  let remain = 0;
  for (const url of urls){
    const hit = await cache.match(new Request(url, {mode:'no-cors', credentials:'omit'}));
    if (hit) remain++;
  }
  if (remain===0){
    albumAdded.delete(albumKey);
    albumTotals.delete(albumKey);
    albumDoneSet.delete(albumKey);
  }else{
    albumAdded.set(albumKey, remain);
    albumDoneSet.delete(albumKey);
  }
  source?.postMessage({ type:'PURGE_DONE', data:{ albumKey, removed } });
}

async function purgeAll(source){
  await caches.delete(IMG_CACHE);
  await caches.open(IMG_CACHE); // recreate
  cancelSet.clear();
  albumAdded.clear();
  albumTotals.clear();
  albumDoneSet.clear();
  source?.postMessage({ type:'PURGE_ALL_DONE', data:{ removed: 0 } });
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
