document.addEventListener('DOMContentLoaded', () => {
  // ========== 状态 ==========
  let currentAlbumImages = [];
  let currentPage = 1;
  let itemsPerPage = 5; // 5 | 11 | 21 | Infinity
  let sortMode = 'model';
  let currentCategoryName = '';
  let currentAlbumName = '';

  const state = {
    lightboxOpen: false,
    lbIndex: 0,
    lbController: null,
    preloadedIdx: new Set(),
    thumbObserver: null,
    winStart: 0,
    winEnd: 0,
    swReady: false,
    swReg: null,
    offlineMap: loadOfflineMap(), // albumKey -> {status:'in-progress'|'done', done, total, cat, album, ts}
    threshold: loadThreshold()    // 超过仅提醒，不强制清理
  };

  // 会话级图片内存缓存
  const imageCache = new Map(); // src -> Promise<HTMLImageElement>

  // ========== DOM ==========
  const sidebarContainer = document.getElementById('sidebar-container');
  const toggleBtn = document.getElementById('sidebar-toggle-btn');
  const currentAlbumInfo = document.getElementById('current-album-info');
  const navPanel = document.getElementById('navigation-panel');
  const contentPanel = document.getElementById('content-panel');

  const perpageSeg = document.getElementById('perpage-seg');
  const perpageSelect = document.getElementById('items-per-page');
  const sortSeg = document.getElementById('sortmode-seg');

  const galleryView = {
    welcome: document.getElementById('welcome-message'),
    container: document.getElementById('gallery-container'),
    pagination: document.getElementById('pagination-container'),
  };

  const lightboxOverlay = document.getElementById('lightbox-overlay');
  const lightboxStage = document.getElementById('lightbox-stage');
  const lightboxCloseBtn = document.getElementById('lightbox-close');
  const lbPrev = document.getElementById('lb-prev');
  const lbNext = document.getElementById('lb-next');
  const lbCounter = document.getElementById('lightbox-counter');
  const fitToggle = document.getElementById('fit-toggle');
  const infoToggle = document.getElementById('info-toggle');
  const thumbStrip = document.getElementById('thumb-strip');

  const infoPopover = document.getElementById('info-popover');
  const infoResEl = document.getElementById('img-resolution');
  const infoPosEl = document.getElementById('img-position');
  const infoPathEl = document.getElementById('img-path');
  const copyImgLinkBtn = document.getElementById('copy-img-link');
  const copyAlbumLinkBtn = document.getElementById('copy-album-link');

  const offlineAlbumBtn = document.getElementById('offline-album-btn');
  const offlineManagerBtn = document.getElementById('offline-manager-btn');
  const offlineMgrOverlay = document.getElementById('offline-manager-overlay');
  const offlineMgrClose = document.getElementById('offline-manager-close');
  const offlineListInprog = document.getElementById('offline-list-inprogress');
  const offlineListDone = document.getElementById('offline-list-done');

  const cacheStatsText = document.getElementById('cache-stats-text');
  const thresholdWarning = document.getElementById('threshold-warning');
  const thresholdInput = document.getElementById('threshold-input');
  const thresholdSaveBtn = document.getElementById('threshold-save');
  const cacheRefreshBtn = document.getElementById('cache-refresh');

  const toastEl = document.getElementById('toast');

  // 主题
  document.querySelectorAll('.theme-dot').forEach(b => b.addEventListener('click', () => applyTheme(b.dataset.theme)));
  function applyTheme(theme){ document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('gallery-theme', theme); document.querySelectorAll('.theme-dot').forEach(btn => btn.classList.toggle('active', btn.dataset.theme === theme)); }
  (function initTheme(){ applyTheme(localStorage.getItem('gallery-theme') || 'classic'); })();

  // ========== 工具 ==========
  const BLANK_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
  const extractIssueNo = (name) => { const m = (name || '').match(/(?:No|NO)\.(\d+)/); return m ? parseInt(m[1],10) : NaN; };
  function getAllAlbumsFlat(){ const ret=[]; const categories=Object.keys(galleryData||{}).sort(); categories.forEach(c=>{const albums=galleryData[c]||{}; Object.keys(albums).forEach(a=>ret.push({category:c,album:a,no:extractIssueNo(a)}));}); return ret; }
  const albumKey = (cat, album) => `${cat}::${album}`;
  const getAlbumCount = (cat, album) => ((galleryData?.[cat]?.[album])||[]).length;
  const getAlbumUrls = (cat, album) => ((galleryData?.[cat]?.[album])||[]).map(x=>x.src).filter(Boolean);

  function loadOfflineMap(){
    try{ return JSON.parse(localStorage.getItem('offline-albums')||'{}'); }catch(e){ return {}; }
  }
  function saveOfflineMap(){
    try{ localStorage.setItem('offline-albums', JSON.stringify(state.offlineMap)); }catch(e){}
  }
  function loadThreshold(){
    const v = parseInt(localStorage.getItem('offline-threshold')||'', 10);
    return Number.isFinite(v) && v>0 ? v : 1500;
  }
  function saveThreshold(v){
    state.threshold = v;
    localStorage.setItem('offline-threshold', String(v));
  }

  function showToast(msg, ms=1800){
    toastEl.textContent = msg;
    toastEl.classList.add('visible');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(()=>toastEl.classList.remove('visible'), ms);
  }

  // 预加载半径：由分页数决定
  function preloadRadius(){
    if (!isFinite(itemsPerPage)) return Infinity;
    if (itemsPerPage === 5) return 2;
    if (itemsPerPage === 11) return 4;
    if (itemsPerPage === 21) return 10;
    return Math.max(2, Math.floor((itemsPerPage - 1) / 2));
  }
  function computeWindow(center){
    const r = preloadRadius();
    const start = isFinite(r) ? Math.max(0, center - r) : 0;
    const end = isFinite(r) ? Math.min(currentAlbumImages.length - 1, center + r) : (currentAlbumImages.length - 1);
    return { start, end };
  }
  function setWindowAround(center){
    const w = computeWindow(center);
    state.winStart = w.start;
    state.winEnd = w.end;
  }
  function ensureWindowOnIndex(){
    if (state.lbIndex < state.winStart || state.lbIndex > state.winEnd) {
      setWindowAround(state.lbIndex);
      buildThumbStrip();
    }
  }

  // 内存缓存/预取
  function cacheFetch(src, priority='low'){
    if (imageCache.has(src)) return imageCache.get(src);
    const img = new Image();
    img.decoding = 'async';
    try { img.fetchPriority = priority; } catch(e){}
    const p = new Promise((resolve)=>{ img.onload=()=>resolve(img); img.onerror=()=>resolve(img); });
    img.src = src;
    imageCache.set(src, p);
    return p;
  }

  // ========== 导航 ==========
  function renderNavigation(){
    navPanel.innerHTML = '';

    const attachBadges = (li, cat, album, displayTitle) => {
      li.classList.remove('active');
      li.dataset.cat = cat;
      li.dataset.album = album;
      li.dataset.key = albumKey(cat, album);

      const left = document.createElement('span');
      left.className = 'album-title';
      left.textContent = displayTitle;

      const right = document.createElement('span');
      right.className = 'li-right';
      const count = document.createElement('span'); count.className='badge badge-count';
      count.textContent = String(getAlbumCount(cat, album));
      const status = document.createElement('span'); status.className='badge badge-status'; status.textContent = '';
      right.appendChild(count); right.appendChild(status);

      li.innerHTML=''; li.appendChild(left); li.appendChild(right);

      updateAlbumStatusBadge(li.dataset.key);
    };

    if (sortMode === 'model') {
      const cats = Object.keys(galleryData||{}).sort();
      cats.forEach(categoryName=>{
        const categoryDiv = document.createElement('div');
        categoryDiv.className='nav-category';
        const titleDiv = document.createElement('div');
        titleDiv.className='category-title';
        titleDiv.textContent=categoryName;
        titleDiv.onclick = () => toggleCategory(categoryDiv);

        const ul = document.createElement('ul'); ul.className='album-list';
        const albumNames = Object.keys(galleryData[categoryName]||{}).sort();
        albumNames.forEach(albumName=>{
          const li = document.createElement('li');
          li.onclick = (e)=>{ e.stopPropagation(); loadAlbum(categoryName, albumName, li); };
          attachBadges(li, categoryName, albumName, albumName);
          ul.appendChild(li);
        });

        categoryDiv.appendChild(titleDiv); categoryDiv.appendChild(ul); navPanel.appendChild(categoryDiv);
      });
    } else {
      const list = getAllAlbumsFlat().sort((a,b)=>{
        const na=isNaN(a.no)?-Infinity:a.no, nb=isNaN(b.no)?-Infinity:b.no;
        return sortMode==='noAsc'? na-nb : nb-na;
      });
      const categoryDiv = document.createElement('div'); categoryDiv.className='nav-category active';
      const titleDiv = document.createElement('div'); titleDiv.className='category-title'; titleDiv.textContent='按刊数';
      const ul = document.createElement('ul'); ul.className='album-list';
      list.forEach(item=>{
        const li=document.createElement('li');
        li.onclick=(e)=>{ e.stopPropagation(); loadAlbum(item.category, item.album, li); };
        const display = (isNaN(item.no)?'—':`No.${item.no}`) + ` • ${item.category} / ${item.album}`;
        attachBadges(li, item.category, item.album, display);
        ul.appendChild(li);
      });
      categoryDiv.appendChild(titleDiv); categoryDiv.appendChild(ul); navPanel.appendChild(categoryDiv);
    }

    // 高亮当前相册（若存在）
    if (currentCategoryName && currentAlbumName) {
      const key = albumKey(currentCategoryName, currentAlbumName);
      const li = navPanel.querySelector(`li[data-key="${cssEscape(key)}"]`);
      if (li) li.classList.add('active');
    }
  }

  function toggleCategory(categoryDiv){
    if (!categoryDiv.classList.contains('active')) document.querySelectorAll('.nav-category.active').forEach(el=>el.classList.remove('active'));
    categoryDiv.classList.toggle('active');
  }

  function updateAlbumStatusBadge(key){
    const lis = navPanel.querySelectorAll(`li[data-key="${cssEscape(key)}"]`);
    const rec = state.offlineMap[key];
    lis.forEach(li=>{
      const badge = li.querySelector('.badge-status');
      if(!badge) return;
      if(!rec){ badge.textContent=''; badge.className='badge badge-status'; return; }
      if(rec.status === 'in-progress'){
        badge.textContent = `离线中 ${rec.done}/${rec.total}`;
        badge.className = 'badge badge-status progress';
      }else if(rec.status === 'done'){
        badge.textContent = '已离线';
        badge.className = 'badge badge-status done';
      }else{
        badge.textContent=''; badge.className='badge badge-status';
      }
    });
  }

  function cssEscape(s){ return String(s).replace(/["\\]/g, '\\$&'); }

  // ========== 相册与画廊 ==========
  function loadAlbum(categoryName, albumName, clickedLi){
    currentCategoryName = categoryName;
    currentAlbumName = albumName;
    currentAlbumImages = (galleryData[categoryName]||{})[albumName]||[];
    currentPage = 1;
    galleryView.welcome.classList.add('hidden');
    currentAlbumInfo.textContent = `${categoryName} / ${albumName}`;
    document.querySelectorAll('.album-list li.active').forEach(el=>el.classList.remove('active'));
    if (clickedLi) clickedLi.classList.add('active');
    renderGallery();
    sidebarContainer.classList.add('collapsed'); toggleBtn.textContent='☰';

    updateOfflineButtonState();
  }

  function renderGallery(){
    galleryView.container.innerHTML='';
    const total = currentAlbumImages.length;
    const pageSize = isFinite(itemsPerPage) ? itemsPerPage : total;
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(total, startIndex + pageSize);
    const paginated = currentAlbumImages.slice(startIndex, endIndex);

    paginated.forEach((image, i)=>{
      const wrapper = document.createElement('div'); wrapper.className='image-wrapper';
      const img = document.createElement('img');
      img.src=image.src; img.alt=image.alt||''; img.loading='lazy'; img.decoding='async';
      img.addEventListener('click', ()=>openLightboxAt(startIndex + i));
      const btn=document.createElement('button'); btn.className='preview-btn'; btn.textContent='全屏预览';
      btn.onclick=(e)=>{ e.stopPropagation(); openLightboxAt(startIndex + i); };
      wrapper.appendChild(img); wrapper.appendChild(btn); galleryView.container.appendChild(wrapper);
    });

    setupPagination(total, pageSize);
  }

  function setupPagination(total, pageSize){
    galleryView.pagination.innerHTML='';
    if (pageSize >= total) return;
    const pageCount = Math.ceil(total / pageSize);
    const mk=(t,cb,dis=false,act=false)=>{ const b=document.createElement('button'); b.textContent=t; b.className='pagination-btn'; b.disabled=dis; if(act)b.classList.add('active'); b.onclick=cb; return b; };
    const go=(p)=>{ currentPage=p; renderGallery(); contentPanel.scrollTo({top:0,behavior:'smooth'}); };
    galleryView.pagination.appendChild(mk('上一页',()=>go(currentPage-1),currentPage===1));
    for(let i=1;i<=pageCount;i++) galleryView.pagination.appendChild(mk(String(i),()=>go(i),false,i===currentPage));
    galleryView.pagination.appendChild(mk('下一页',()=>go(currentPage+1),currentPage===pageCount));
  }

  // ========== 灯箱 ==========
  function openLightboxAt(index){
    if(!currentAlbumImages.length) return;
    state.lbIndex = Math.max(0, Math.min(index, currentAlbumImages.length-1));
    state.lightboxOpen = true;
    state.preloadedIdx.clear();

    document.body.classList.add('lightbox-open');
    lightboxOverlay.classList.add('visible');

    setWindowAround(state.lbIndex);
    buildThumbStrip();
    renderLightboxImage();
    updateCounter();

    lightboxCloseBtn.onclick = closeLightbox;
    lbPrev.onclick = ()=> showPrev();
    lbNext.onclick = ()=> showNext();
    document.addEventListener('keydown', keydownHandler);

    infoPopover.classList.add('hidden');

    if (!isFinite(itemsPerPage)) preloadAllInBackground();
  }

  function closeLightbox(){
    state.lightboxOpen=false;
    document.body.classList.remove('lightbox-open');
    lightboxOverlay.classList.remove('visible');
    if(state.lbController?.cleanup) state.lbController.cleanup();
    lightboxStage.innerHTML='';
    if(state.thumbObserver){ state.thumbObserver.disconnect(); state.thumbObserver=null; }
    thumbStrip.innerHTML='';
    document.removeEventListener('keydown', keydownHandler);
    infoPopover.classList.add('hidden');
  }

  function keydownHandler(e){
    if(!state.lightboxOpen) return;
    if(e.key==='Escape') closeLightbox();
    if(e.key==='ArrowLeft') showPrev();
    if(e.key==='ArrowRight') showNext();
  }

  function showPrev(){ if(state.lbIndex<=0) return; state.lbIndex--; updateCounter(); ensureWindowOnIndex(); renderLightboxImage(true); }
  function showNext(){ if(state.lbIndex>=currentAlbumImages.length-1) return; state.lbIndex++; updateCounter(); ensureWindowOnIndex(); renderLightboxImage(true); }
  function updateCounter(){ lbCounter.textContent = `${state.lbIndex + 1} / ${currentAlbumImages.length}`; }

  async function renderLightboxImage(fromNav=false){
    if(state.lbController?.cleanup) state.lbController.cleanup();
    lightboxStage.innerHTML='';

    const src = currentAlbumImages[state.lbIndex].src;

    await cacheFetch(src, 'high');

    const img = new Image();
    img.decoding='async';
    img.src = src;

    const mount = ()=>{
      lightboxStage.appendChild(img);
      state.lbController = setupLightboxInteraction(img, {
        onPrev: showPrev,
        onNext: showNext,
        onClose: closeLightbox
      });

      fitToggle.onclick = ()=>{
        const nearFit = state.lbController.isNearFit();
        if(nearFit) state.lbController.gotoOriginal();
        else state.lbController.gotoFit();
        fitToggle.textContent = nearFit ? '适屏' : '原始';
      };
      fitToggle.textContent='原始';

      markActiveThumb();
      if(fromNav) scrollActiveThumbIntoView();

      updateInfoPanel(img);

      postSWMessage('CACHE_URL', { url: src });

      const r = preloadRadius();
      if (isFinite(r)) preloadNeighbors(state.lbIndex, r);
    };

    if('decode' in img){
      img.decode().then(mount).catch(()=> (img.complete ? mount() : img.addEventListener('load', mount, {once:true})));
    }else{
      img.addEventListener('load', mount, {once:true});
    }
  }

  function preloadNeighbors(centerIndex, radius){
    const total = currentAlbumImages.length;
    for(let i=centerIndex-radius; i<=centerIndex+radius; i++){
      if(i<0 || i>=total || i===centerIndex) continue;
      if(state.preloadedIdx.has(i)) continue;
      state.preloadedIdx.add(i);
      cacheFetch(currentAlbumImages[i].src, 'low');
    }
  }

  function preloadAllInBackground(){
    const all = currentAlbumImages.map(x=>x.src);
    let i = 0;
    const idle = window.requestIdleCallback || ((cb)=>setTimeout(()=>cb({timeRemaining:()=>20}), 200));
    function loop(){
      idle((deadline)=>{
        while(deadline.timeRemaining()>5 && i<all.length){
          cacheFetch(all[i++],'low');
        }
        if(i<all.length) setTimeout(loop, 80);
      });
    }
    loop();
  }

  // ========== 缩略图条 ==========
  function buildThumbStrip(){
    if(state.thumbObserver){ state.thumbObserver.disconnect(); state.thumbObserver=null; }
    thumbStrip.innerHTML='';

    const frag = document.createDocumentFragment();
    for(let i=state.winStart; i<=state.winEnd; i++){
      const t = new Image();
      t.className = 'thumb' + (i===state.lbIndex?' active':'');
      t.alt=''; t.loading='lazy'; t.fetchPriority='low';
      t.dataset.idx = String(i);
      t.dataset.src = currentAlbumImages[i].src;
      t.src = BLANK_GIF;
      t.onclick = ()=>{ state.lbIndex = i; updateCounter(); ensureWindowOnIndex(); renderLightboxImage(true); };
      frag.appendChild(t);
    }
    thumbStrip.appendChild(frag);

    state.thumbObserver = new IntersectionObserver((entries)=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          const el = entry.target;
          if(el.dataset.src && el.src !== el.dataset.src) el.src = el.dataset.src;
          state.thumbObserver.unobserve(el);
        }
      });
    }, {root: thumbStrip, rootMargin:'200px 200px', threshold:0.01});

    thumbStrip.querySelectorAll('.thumb').forEach(t=>state.thumbObserver.observe(t));
    requestAnimationFrame(()=>scrollActiveThumbIntoView());
  }
  function markActiveThumb(){
    thumbStrip.querySelectorAll('.thumb').forEach(el=>{
      el.classList.toggle('active', Number(el.dataset.idx) === state.lbIndex);
    });
  }
  function scrollActiveThumbIntoView(){
    const active = thumbStrip.querySelector(`.thumb[data-idx="${state.lbIndex}"]`);
    if(active) active.scrollIntoView({inline:'center', block:'nearest', behavior:'smooth'});
  }

  // ========== 信息面板 ==========
  function buildAlbumLink(idx){
    const url = new URL(window.location.href);
    url.searchParams.set('cat', currentCategoryName);
    url.searchParams.set('album', currentAlbumName);
    url.searchParams.set('idx', String(idx));
    return url.toString();
  }
  function updateInfoPanel(imgEl){
    const w = imgEl.naturalWidth || 0;
    const h = imgEl.naturalHeight || 0;
    infoResEl.textContent = w && h ? `${w} × ${h}` : '-';
    infoPosEl.textContent = `${state.lbIndex + 1} / ${currentAlbumImages.length}`;
    infoPathEl.textContent = `${currentCategoryName} / ${currentAlbumName}`;

    copyImgLinkBtn.onclick = async ()=>{
      const src = currentAlbumImages[state.lbIndex]?.src || '';
      if(!src) return;
      try{ await navigator.clipboard.writeText(src); showToast('图片链接已复制'); }catch{ fallbackCopy(src); }
    };
    copyAlbumLinkBtn.onclick = async ()=>{
      const link = buildAlbumLink(state.lbIndex);
      try{ await navigator.clipboard.writeText(link); showToast('相册链接已复制'); }catch{ fallbackCopy(link); }
    };
  }
  function fallbackCopy(text){
    const ta=document.createElement('textarea'); ta.value=text; ta.style.position='fixed'; ta.style.left='-9999px'; document.body.appendChild(ta); ta.select();
    try{ document.execCommand('copy'); showToast('已复制'); }catch{}
    ta.remove();
  }
  infoToggle.addEventListener('click', ()=>{ infoPopover.classList.toggle('hidden'); });

  // ========== 灯箱交互（含轻扫） ==========
  function setupLightboxInteraction(img, hooks){
    let matrix=[1,0,0,1,0,0], isDragging=false, isPinching=false;
    let last={x:0,y:0,dist:0,tapTime:0,tapX:0,tapY:0}, fitScale=1;
    const swipe={tracking:false,axis:null,sx:0,sy:0,triggered:false};

    function toLocal(x,y){ const r=lightboxStage.getBoundingClientRect(); return {x:x-r.left,y:y-r.top}; }
    function computeFit(){ const vw=lightboxStage.clientWidth, vh=lightboxStage.clientHeight; fitScale=Math.min(vw/img.naturalWidth, vh/img.naturalHeight)*0.95; }
    function centerWithScale(s,tran=false){ const vw=lightboxStage.clientWidth,vh=lightboxStage.clientHeight; matrix[0]=matrix[3]=s; matrix[4]=(vw-img.naturalWidth*s)/2; matrix[5]=(vh-img.naturalHeight*s)/2; apply(tran); }
    function apply(tran=true){ img.style.transform=`matrix(${matrix.join(',')})`; img.style.transition= tran && !isDragging && !isPinching ? 'transform .28s cubic-bezier(.12,.9,.39,1)' : 'none'; img.style.opacity='1'; }
    function zoom(r,center,tran=false){ const cur=matrix[0]; let ns=Math.max(0.2,Math.min(cur*r,8)); const ar=ns/cur; if(ar===1) return; const ntx=center.x-(center.x-matrix[4])*ar; const nty=center.y-(center.y-matrix[5])*ar; matrix[0]=matrix[3]=ns; matrix[4]=ntx; matrix[5]=nty; apply(tran); }
    function clamp(){ const vw=lightboxStage.clientWidth,vh=lightboxStage.clientHeight,w=img.naturalWidth*matrix[0],h=img.naturalHeight*matrix[0],sl=50,snap=20; let minTx,maxTx,minTy,maxTy; if(w>vw){minTx=vw-w-sl;maxTx=sl;} else {const cx=(vw-w)/2; minTx=cx-snap;maxTx=cx+snap;} if(h>vh){minTy=vh-h-sl;maxTy=sl;} else {const cy=(vh-h)/2; minTy=cy-snap;maxTy=cy+snap;} matrix[4]=Math.min(maxTx,Math.max(minTx,matrix[4])); matrix[5]=Math.min(maxTy,Math.max(minTy,matrix[5])); apply(true); }
    function dbl(e){ const p=toLocal(e.clientX,e.clientY); const near=Math.abs(matrix[0]-1)<0.05; zoom((near?fitScale:1)/matrix[0],p,true); setTimeout(clamp,10); }

    computeFit(); centerWithScale(fitScale);

    function down(e){
      e.preventDefault();
      const t=!!e.touches, p0=t?e.touches[0]:e, p=toLocal(p0.clientX,p0.clientY);
      isDragging=true; img.classList.add('grabbing'); last.x=p.x; last.y=p.y;

      if(t && e.touches.length===1){ swipe.tracking=true; swipe.axis=null; swipe.sx=p0.clientX; swipe.sy=p0.clientY; swipe.triggered=false; }

      if(t){
        const now=Date.now();
        if(now-last.tapTime<300 && Math.hypot(p0.clientX-last.tapX,p0.clientY-last.tapY)<30 && e.touches.length===1){ dbl(p0); }
        last.tapTime=now; last.tapX=p0.clientX; last.tapY=p0.clientY;

        if(e.touches.length===2){ isPinching=true; last.dist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY); }
      }
    }
    function move(e){
      if(!isDragging) return;
      e.preventDefault();

      if(isPinching && e.touches && e.touches.length===2){
        const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
        const r=d/(last.dist||d); last.dist=d;
        const rct=lightboxStage.getBoundingClientRect();
        const mid={x:((e.touches[0].clientX+e.touches[1].clientX)/2)-rct.left,y:((e.touches[0].clientY+e.touches[1].clientY)/2)-rct.top};
        zoom(r,mid);
        return;
      }

      if(e.touches && e.touches.length===1 && swipe.tracking){
        const p0=e.touches[0];
        const dx=p0.clientX - swipe.sx;
        const dy=p0.clientY - swipe.sy;
        const nearFit = Math.abs(matrix[0]-fitScale) < 0.06;

        if(!swipe.axis && Math.hypot(dx,dy)>12){
          swipe.axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
        }
        if(nearFit && swipe.axis==='h'){
          if(Math.abs(dx)>48 && !swipe.triggered){
            swipe.triggered=true;
            if(dx>0) hooks.onPrev?.(); else hooks.onNext?.();
          }
          return;
        }
        if(nearFit && swipe.axis==='v'){
          if(Math.abs(dy)>60 && !swipe.triggered){
            swipe.triggered=true;
            hooks.onClose?.();
          }
          return;
        }
      }

      const p0=e.touches?e.touches[0]:e, p=toLocal(p0.clientX,p0.clientY);
      matrix[4]+=p.x-last.x; matrix[5]+=p.y-last.y; last.x=p.x; last.y=p.y; apply(false);
    }
    function up(e){
      isDragging=false; img.classList.remove('grabbing');
      if(!e.touches || e.touches.length<2) isPinching=false;
      swipe.tracking=false; swipe.axis=null; swipe.triggered=false;
      clamp();
    }

    img.addEventListener('dblclick',(e)=>{ e.preventDefault(); e.stopPropagation(); dbl(e); });
    let wt=null; img.addEventListener('wheel',(e)=>{ e.preventDefault(); const r=e.deltaY<0?1.12:1/1.12; const p=toLocal(e.clientX,e.clientY); zoom(r,p); clearTimeout(wt); wt=setTimeout(clamp,120); },{passive:false});

    img.addEventListener('mousedown',down); img.addEventListener('touchstart',down,{passive:false});
    window.addEventListener('mousemove',move,{passive:false}); window.addEventListener('touchmove',move,{passive:false});
    window.addEventListener('mouseup',up); window.addEventListener('touchend',up);

    const onResize=()=>{ const near=Math.abs(matrix[0]-fitScale)<0.05; const old=fitScale; computeFit(); if(near || Math.abs(old-fitScale)>0.02) centerWithScale(fitScale,true); else clamp(); };
    window.addEventListener('resize',onResize);

    return {
      isNearFit:()=>Math.abs(matrix[0]-fitScale)<0.05,
      gotoFit:()=>centerWithScale(fitScale,true),
      gotoOriginal:()=>{ centerWithScale(1,true); clamp(); },
      cleanup:()=>{ window.removeEventListener('mousemove',move); window.removeEventListener('touchmove',move); window.removeEventListener('mouseup',up); window.removeEventListener('touchend',up); window.removeEventListener('resize',onResize); }
    };
  }

  // ========== 离线：按钮、管理、SW ==========
  function updateOfflineButtonState(){
    const key = albumKey(currentCategoryName, currentAlbumName);
    const imgs = currentAlbumImages||[];
    const hasAlbum = imgs.length>0;
    const rec = state.offlineMap[key];
    offlineAlbumBtn.disabled = !hasAlbum || (rec && (rec.status==='done' || rec.status==='in-progress'));
    if(rec && rec.status==='in-progress'){
      offlineAlbumBtn.textContent = `缓存中 ${rec.done}/${rec.total}`;
    }else if(rec && rec.status==='done'){
      offlineAlbumBtn.textContent = '已离线';
    }else{
      offlineAlbumBtn.textContent = '离线当前相册';
    }
  }

  offlineAlbumBtn.addEventListener('click', async ()=>{
    const urls = (currentAlbumImages||[]).map(it=>it.src).filter(Boolean);
    if(!urls.length){ showToast('当前相册为空'); return; }
    if(!state.swReady){ showToast('离线功能不可用'); return; }
    const key = albumKey(currentCategoryName, currentAlbumName);
    state.offlineMap[key] = { status:'in-progress', done:0, total:urls.length, cat:currentCategoryName, album:currentAlbumName, ts:Date.now() };
    saveOfflineMap();
    updateAlbumStatusBadge(key);
    renderOfflineManagerLists();
    updateOfflineButtonState();
    postSWMessage('CACHE_ALBUM', { urls, albumKey: key });
  });

  offlineManagerBtn.addEventListener('click', async ()=>{
    thresholdInput.value = String(state.threshold);
    renderOfflineManagerLists();
    await updateCacheStatsUI();
    offlineMgrOverlay.classList.remove('hidden');
  });
  offlineMgrClose.addEventListener('click', ()=> offlineMgrOverlay.classList.add('hidden'));
  offlineMgrOverlay.addEventListener('click', (e)=>{ if(e.target===offlineMgrOverlay) offlineMgrOverlay.classList.add('hidden'); });

  thresholdSaveBtn.addEventListener('click', async ()=>{
    const v = parseInt(thresholdInput.value, 10);
    if(!Number.isFinite(v) || v<=0){ showToast('请输入有效的阈值'); return; }
    saveThreshold(v);
    await updateCacheStatsUI();
    showToast('阈值已保存');
  });
  cacheRefreshBtn.addEventListener('click', async ()=>{ await updateCacheStatsUI(); });

  async function updateCacheStatsUI(){
    try{
      const cache = await caches.open('img-v1');
      const keys = await cache.keys();
      const count = keys.length;
      cacheStatsText.textContent = `已缓存图片：${count} 张`;
      if (count > state.threshold){
        thresholdWarning.classList.remove('hidden');
      }else{
        thresholdWarning.classList.add('hidden');
      }
    }catch(e){
      cacheStatsText.textContent = '已缓存图片：—';
      thresholdWarning.classList.add('hidden');
    }
  }

  function renderOfflineManagerLists(){
    offlineListInprog.innerHTML=''; offlineListDone.innerHTML='';
    const entries = Object.entries(state.offlineMap||{});
    const inprog = entries.filter(([k,v])=>v.status==='in-progress');
    const done = entries.filter(([k,v])=>v.status==='done').sort((a,b)=> (b[1].ts||0)-(a[1].ts||0));

    inprog.forEach(([key,rec])=>{
      const item = document.createElement('div'); item.className='offline-item';
      const meta = document.createElement('div'); meta.className='meta';
      const title = document.createElement('div'); title.className='title'; title.textContent = `${rec.cat} / ${rec.album}`;
      const sub = document.createElement('div'); sub.className='sub'; sub.textContent = `离线中 ${rec.done}/${rec.total}`;
      meta.appendChild(title); meta.appendChild(sub);

      const prog = document.createElement('div'); prog.className='progress';
      const bar = document.createElement('span'); bar.style.width = `${Math.round((rec.done/rec.total)*100)}%`;
      prog.appendChild(bar);

      item.appendChild(meta); item.appendChild(prog);
      offlineListInprog.appendChild(item);
    });

    done.forEach(([key,rec])=>{
      const item = document.createElement('div'); item.className='offline-item';
      const meta = document.createElement('div'); meta.className='meta';
      const title = document.createElement('div'); title.className='title'; title.textContent = `${rec.cat} / ${rec.album}`;
      const sub = document.createElement('div'); sub.className='sub'; sub.textContent = '已离线';
      meta.appendChild(title); meta.appendChild(sub);

      const actions = document.createElement('div'); actions.className='offline-actions';
      const openBtn = document.createElement('button'); openBtn.className='mini-btn'; openBtn.textContent='打开';
      openBtn.onclick = ()=>{
        loadAlbum(rec.cat, rec.album, findNavLi(rec.cat, rec.album));
        offlineMgrOverlay.classList.add('hidden');
      };
      const purgeBtn = document.createElement('button'); purgeBtn.className='mini-btn danger'; purgeBtn.textContent='清除缓存';
      purgeBtn.onclick = ()=> purgeAlbumByKey(key, purgeBtn);
      actions.appendChild(openBtn); actions.appendChild(purgeBtn);

      item.appendChild(meta); item.appendChild(actions);
      offlineListDone.appendChild(item);
    });
  }

  function findNavLi(cat, album){
    const key = albumKey(cat, album);
    return navPanel.querySelector(`li[data-key="${cssEscape(key)}"]`);
  }

  async function purgeAlbumByKey(key, btnEl){
    const rec = state.offlineMap[key];
    if(!rec){ showToast('记录不存在'); return; }
    const urls = getAlbumUrls(rec.cat, rec.album);
    if(!urls.length){ showToast('无法定位该相册图片'); return; }
    if(!state.swReady){ showToast('离线功能不可用'); return; }
    if(btnEl){ btnEl.disabled = true; btnEl.textContent='清除中...'; }

    postSWMessage('PURGE_ALBUM', { urls, albumKey: key });
  }

  // SW 注册与消息
  async function registerServiceWorker(){
    if(!('serviceWorker' in navigator)) return;
    try{
      const reg = await navigator.serviceWorker.register('service-worker.js');
      state.swReg = reg;
      await navigator.serviceWorker.ready;
      state.swReady = true;

      // 发送 SW 设置：关闭自动裁剪（仅提醒）
      postSWMessage('UPDATE_SETTINGS', { trimEnabled: false, maxEntries: state.threshold });

      navigator.serviceWorker.addEventListener('message', async (event)=>{
        const {type, data} = event.data || {};
        if(type === 'CACHE_PROGRESS'){
          const { done, total, albumKey: key } = data||{};
          if(!key) return;
          const rec = state.offlineMap[key] || (state.offlineMap[key]={ status:'in-progress', done:0, total:total||0 });
          rec.status='in-progress'; rec.done=done; if(total) rec.total=total;
          saveOfflineMap();
          updateAlbumStatusBadge(key);
          renderOfflineManagerLists();
          if (key === albumKey(currentCategoryName, currentAlbumName)) updateOfflineButtonState();
        }else if(type === 'CACHE_DONE'){
          const { albumKey: key, total } = data||{};
          if(!key) return;
          const rec = state.offlineMap[key] || (state.offlineMap[key]={});
          rec.status='done'; rec.done=total; rec.total=total; rec.ts=Date.now();
          saveOfflineMap();
          updateAlbumStatusBadge(key);
          renderOfflineManagerLists();
          if (key === albumKey(currentCategoryName, currentAlbumName)) updateOfflineButtonState();
          await updateCacheStatsUI();
          showToast('相册已缓存，可离线查看');
        }else if(type === 'PURGE_DONE'){
          const { albumKey: key, removed } = data||{};
          if(!key) return;
          delete state.offlineMap[key];
          saveOfflineMap();
          updateAlbumStatusBadge(key);
          renderOfflineManagerLists();
          await updateCacheStatsUI();
          if (key === albumKey(currentCategoryName, currentAlbumName)) updateOfflineButtonState();
          showToast(`已清除缓存 ${removed||0} 项`);
        }
      });
    }catch(e){
      // 忽略
    }
  }
  function postSWMessage(type, data){
    if(!state.swReady) return;
    if(navigator.serviceWorker.controller){
      navigator.serviceWorker.controller.postMessage({ type, data });
    }else{
      navigator.serviceWorker.ready.then(()=> navigator.serviceWorker.controller?.postMessage({type,data})).catch(()=>{});
    }
  }

  // ========== 事件 ==========
  toggleBtn.addEventListener('click',()=>{ const isCollapsed=sidebarContainer.classList.toggle('collapsed'); toggleBtn.textContent = isCollapsed ? '☰' : '✕'; });

  perpageSeg.addEventListener('click',(e)=>{
    const btn=e.target.closest('.seg-btn'); if(!btn) return;
    perpageSeg.querySelectorAll('.seg-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const v=btn.dataset.value;
    itemsPerPage = (v==='all') ? Infinity : parseInt(v,10);
    perpageSelect.value = v;
    currentPage=1; renderGallery();
  });
  perpageSelect.addEventListener('change',(e)=>{
    const v=e.target.value;
    perpageSeg.querySelectorAll('.seg-btn').forEach(b=>b.classList.toggle('active', b.dataset.value===v));
    itemsPerPage = (v==='all') ? Infinity : parseInt(v,10);
    currentPage=1; renderGallery();
  });

  sortSeg.addEventListener('click',(e)=>{
    const btn=e.target.closest('.seg-btn'); if(!btn) return;
    sortSeg.querySelectorAll('.seg-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    sortMode = btn.dataset.mode;
    renderNavigation();
  });

  const bgClose=(e)=>{ if(e.target===lightboxOverlay || e.target===lightboxStage) closeLightbox(); };
  lightboxOverlay.addEventListener('click',bgClose);
  lightboxOverlay.addEventListener('dblclick',bgClose);

  // ========== 初始化 ==========
  (function init(){
    perpageSeg.querySelector('[data-value="5"]').classList.add('active');
    perpageSelect.value='5';
    renderNavigation();
    sidebarContainer.classList.add('collapsed');
    updateOfflineButtonState();
    registerServiceWorker();
  })();
});
