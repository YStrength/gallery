document.addEventListener('DOMContentLoaded', () => {
    // 状态
    let currentAlbumImages = [];
    let currentPage = 1;
    let itemsPerPage = 5; // 默认 5
    const state = { lightboxOpen: false };

    // DOM
    const sidebarContainer = document.getElementById('sidebar-container');
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    const navPanel = document.getElementById('navigation-panel');
    const contentPanel = document.getElementById('content-panel');
    const currentAlbumInfo = document.getElementById('current-album-info');

    const itemsPerPageSelect = document.getElementById('items-per-page');
    const segButtons = [...document.querySelectorAll('.seg-btn')];

    const galleryView = {
        controls: document.getElementById('gallery-controls'),
        welcome: document.getElementById('welcome-message'),
        container: document.getElementById('gallery-container'),
        pagination: document.getElementById('pagination-container'),
    };

    const lightboxOverlay = document.getElementById('lightbox-overlay');
    const lightboxCloseBtn = document.getElementById('lightbox-close');

    // 主题切换
    const themeDots = document.querySelectorAll('.theme-dot');
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('gallery-theme', theme);
        themeDots.forEach(btn => btn.classList.toggle('active', btn.dataset.theme === theme));
        // 更新浏览器地址栏主题色（支持的环境）
        const themeMeta = document.querySelector('meta[name="theme-color"]');
        if (themeMeta) {
            const styles = getComputedStyle(document.documentElement);
            themeMeta.setAttribute('content', styles.getPropertyValue('--header').trim() || '#2c3e50');
        }
    }
    function initTheme() {
        const saved = localStorage.getItem('gallery-theme') || 'classic';
        applyTheme(saved);
    }

    // 导航构建
    function renderNavigation() {
        navPanel.innerHTML = '';
        const categories = Object.keys(galleryData).sort();
        categories.forEach(categoryName => {
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'nav-category';

            const titleDiv = document.createElement('div');
            titleDiv.className = 'category-title';
            titleDiv.textContent = categoryName;
            titleDiv.setAttribute('role', 'button');
            titleDiv.setAttribute('aria-expanded', 'false');
            titleDiv.onclick = () => toggleCategory(categoryDiv, titleDiv);

            const albumList = document.createElement('ul');
            albumList.className = 'album-list';

            const albumNames = Object.keys(galleryData[categoryName]).sort();
            albumNames.forEach(albumName => {
                const li = document.createElement('li');
                li.textContent = albumName;
                li.dataset.category = categoryName;
                li.dataset.album = albumName;

                const count = (galleryData[categoryName][albumName] || []).length;
                const badge = document.createElement('span');
                badge.className = 'album-count';
                badge.textContent = count;
                li.appendChild(badge);

                li.onclick = (e) => {
                    e.stopPropagation();
                    loadAlbum(categoryName, albumName, li);
                };
                albumList.appendChild(li);
            });

            categoryDiv.appendChild(titleDiv);
            categoryDiv.appendChild(albumList);
            navPanel.appendChild(categoryDiv);
        });
    }

    function toggleCategory(categoryDiv, titleDiv) {
        const active = categoryDiv.classList.contains('active');
        document.querySelectorAll('.nav-category.active').forEach(el => {
            el.classList.remove('active');
            const t = el.querySelector('.category-title');
            if (t) t.setAttribute('aria-expanded', 'false');
        });
        if (!active) {
            categoryDiv.classList.add('active');
            if (titleDiv) titleDiv.setAttribute('aria-expanded', 'true');
        }
    }

    function setSegActive(value) {
        segButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.items === value));
    }

    function loadAlbum(categoryName, albumName, clickedLi) {
        currentAlbumImages = galleryData[categoryName][albumName] || [];
        currentPage = 1;

        galleryView.welcome.classList.add('hidden');
        galleryView.controls.classList.remove('hidden');
        currentAlbumInfo.textContent = `${categoryName} / ${albumName}`;

        document.querySelectorAll('.album-list li.active').forEach(el => el.classList.remove('active'));
        clickedLi.classList.add('active');
        clickedLi.setAttribute('aria-current', 'true');

        renderGallery();

        sidebarContainer.classList.add('collapsed');
        toggleBtn.textContent = '☰';
    }

    function renderGallery() {
        galleryView.container.innerHTML = '';
        const total = currentAlbumImages.length;
        const pageSize = itemsPerPage === Infinity ? total : itemsPerPage;

        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const paginated = currentAlbumImages.slice(startIndex, endIndex);

        paginated.forEach(image => {
            const wrapper = document.createElement('div');
            wrapper.className = 'image-wrapper';

            const img = document.createElement('img');
            img.src = image.src;
            img.alt = image.alt || '';
            img.loading = 'lazy';
            img.decoding = 'async';

            // skeleton 状态：加载后去掉骨架动画
            const onLoaded = () => img.classList.add('image-loaded');
            if ('decode' in img) {
                img.decode().then(onLoaded).catch(() => img.complete && onLoaded());
            } else {
                img.addEventListener('load', onLoaded, { once: true });
            }

            // 点击进入灯箱
            img.addEventListener('click', () => openLightbox(image.src));

            const previewBtn = document.createElement('button');
            previewBtn.textContent = '全屏预览';
            previewBtn.className = 'preview-btn';
            previewBtn.setAttribute('aria-label', '全屏预览');
            previewBtn.onclick = (e) => { e.stopPropagation(); openLightbox(image.src); };

            wrapper.appendChild(img);
            wrapper.appendChild(previewBtn);
            galleryView.container.appendChild(wrapper);
        });

        setupPagination(total, pageSize);
    }

    function setupPagination(total, pageSize) {
        galleryView.pagination.innerHTML = '';
        if (total === 0) return;
        if (total <= pageSize || pageSize === 0) return;

        const pageCount = Math.max(1, Math.ceil(total / pageSize));
        const createBtn = (text, onClick, isDisabled = false, isActive = false) => {
            const btn = document.createElement('button');
            btn.textContent = text;
            btn.className = 'pagination-btn';
            btn.disabled = isDisabled;
            if (isActive) btn.classList.add('active');
            btn.onclick = onClick;
            return btn;
        };
        const goto = (p) => {
            currentPage = p;
            renderGallery();
            contentPanel.scrollTo({ top: 0, behavior: 'smooth' });
        };

        galleryView.pagination.appendChild(createBtn('上一页', () => goto(currentPage - 1), currentPage === 1));
        for (let i = 1; i <= pageCount; i++) {
            galleryView.pagination.appendChild(createBtn(String(i), () => goto(i), false, i === currentPage));
        }
        galleryView.pagination.appendChild(createBtn('下一页', () => goto(currentPage + 1), currentPage === pageCount));
    }

    // ===== 灯箱：默认适屏，围绕点击点缩放 =====
    function openLightbox(src) {
        state.lightboxOpen = true;
        document.body.classList.add('lightbox-open');
        lightboxOverlay.classList.add('visible');

        // 清空旧图像
        lightboxOverlay.querySelectorAll('img').forEach(n => n.remove());

        const img = new Image();
        img.alt = '';
        img.decoding = 'async';
        img.src = src;

        const show = () => {
            lightboxOverlay.appendChild(img);
            setupLightboxInteraction(img);
        };
        if ('decode' in img) {
            img.decode().then(show).catch(() => img.complete ? show() : img.addEventListener('load', show, { once:true }));
        } else {
            img.addEventListener('load', show, { once:true });
        }

        // 背景交互
        lightboxOverlay.onclick = (e) => { if (e.target === lightboxOverlay) closeLightbox(); };
        lightboxOverlay.ondblclick = (e) => { if (e.target === lightboxOverlay) closeLightbox(); };
    }

    function closeLightbox() {
        state.lightboxOpen = false;
        document.body.classList.remove('lightbox-open');
        lightboxOverlay.classList.remove('visible');
        setTimeout(() => { lightboxOverlay.querySelectorAll('img').forEach(n => n.remove()); }, 200);
    }

    function setupLightboxInteraction(img) {
        let matrix = [1,0,0,1,0,0]; // a b c d tx ty
        let isDragging = false, isPinching = false;
        let last = { x:0, y:0, dist:0 };
        let lastTap = { time:0, x:0, y:0 };
        let fitScale = 1;

        const overlayRect = () => lightboxOverlay.getBoundingClientRect();
        const toOverlayPoint = (cx, cy) => {
            const r = overlayRect();
            return { x: cx - r.left, y: cy - r.top };
        };

        function computeFit() {
            const vw = lightboxOverlay.clientWidth;
            const vh = lightboxOverlay.clientHeight;
            fitScale = Math.min(vw / img.naturalWidth, vh / img.naturalHeight) * 0.95;
        }
        function centerWithScale(scale) {
            const vw = lightboxOverlay.clientWidth, vh = lightboxOverlay.clientHeight;
            matrix[0] = matrix[3] = scale;
            matrix[4] = (vw - img.naturalWidth * scale) / 2;
            matrix[5] = (vh - img.naturalHeight * scale) / 2;
            applyTransform(false);
        }
        function applyTransform(withTransition = true) {
            img.style.transform = `matrix(${matrix.join(',')})`;
            img.style.transition = withTransition && !isDragging && !isPinching ? 'transform .25s ease' : 'none';
            img.style.opacity = '1'; // 首次呈现
        }
        function getDistance(t1, t2){ return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY); }
        function getMidpoint(t1, t2){
            const r = overlayRect();
            return { x: ((t1.clientX + t2.clientX)/2) - r.left, y: ((t1.clientY + t2.clientY)/2) - r.top };
        }
        function zoom(scaleRatio, center, withTransition = false){
            const current = matrix[0];
            let next = current * scaleRatio;
            next = Math.max(0.2, Math.min(next, 8));
            const actual = next / current;
            if (actual === 1) return;
            const newTx = center.x - (center.x - matrix[4]) * actual;
            const newTy = center.y - (center.y - matrix[5]) * actual;
            matrix[0] = matrix[3] = next;
            matrix[4] = newTx; matrix[5] = newTy;
            applyTransform(withTransition);
        }
        function toggleByPoint(clientEvt){
            const p = toOverlayPoint(clientEvt.clientX, clientEvt.clientY);
            const current = matrix[0];
            const target = Math.abs(current - 1.0) < 0.05 ? fitScale : 1.0;
            zoom(target/current, p, true);
        }

        // 初始化适屏
        computeFit();
        centerWithScale(fitScale);

        function onPointerDown(e){
            e.preventDefault();
            const isTouch = !!e.touches;
            const p0 = isTouch ? e.touches[0] : e;
            const p = toOverlayPoint(p0.clientX, p0.clientY);

            isDragging = true; img.classList.add('grabbing');
            last.x = p.x; last.y = p.y;

            if (isTouch) {
                const now = Date.now();
                if (now - lastTap.time < 300 && Math.hypot(p0.clientX - lastTap.x, p0.clientY - lastTap.y) < 30 && e.touches.length === 1) {
                    toggleByPoint(p0);
                }
                lastTap.time = now; lastTap.x = p0.clientX; lastTap.y = p0.clientY;

                if (e.touches.length === 2) {
                    isPinching = true;
                    last.dist = getDistance(e.touches[0], e.touches[1]);
                }
            }
        }
        function onPointerMove(e){
            if (!isDragging) return;
            e.preventDefault();

            if (isPinching && e.touches && e.touches.length === 2) {
                const newDist = getDistance(e.touches[0], e.touches[1]);
                const ratio = newDist / (last.dist || newDist);
                last.dist = newDist;
                const mid = getMidpoint(e.touches[0], e.touches[1]);
                zoom(ratio, mid);
            } else if (!isPinching) {
                const p0 = e.touches ? e.touches[0] : e;
                const p = toOverlayPoint(p0.clientX, p0.clientY);
                const dx = p.x - last.x; const dy = p.y - last.y;
                matrix[4] += dx; matrix[5] += dy;
                last.x = p.x; last.y = p.y;
                applyTransform(false);
            }
        }
        function onPointerUp(e){
            isDragging = false; img.classList.remove('grabbing');
            if (!e.touches || e.touches.length < 2) isPinching = false;
        }

        // PC 双击 / 滚轮
        img.addEventListener('dblclick', (e) => { e.preventDefault(); e.stopPropagation(); toggleByPoint(e); });
        img.addEventListener('wheel', (e) => {
            e.preventDefault();
            const ratio = e.deltaY < 0 ? 1.12 : 1/1.12;
            const p = toOverlayPoint(e.clientX, e.clientY);
            zoom(ratio, p);
        }, { passive:false });

        // 触摸/鼠标拖拽
        img.addEventListener('mousedown', onPointerDown);
        img.addEventListener('touchstart', onPointerDown, { passive:false });
        window.addEventListener('mousemove', onPointerMove, { passive:false });
        window.addEventListener('touchmove', onPointerMove, { passive:false });
        window.addEventListener('mouseup', onPointerUp);
        window.addEventListener('touchend', onPointerUp);

        // 尺寸变化：接近适屏时保持适屏
        const onResize = () => {
            const nearFit = Math.abs(matrix[0] - fitScale) < 0.05;
            computeFit();
            if (nearFit) centerWithScale(fitScale);
        };
        window.addEventListener('resize', onResize, { passive:true });

        // 关闭时清理
        const cleanup = () => {
            window.removeEventListener('mousemove', onPointerMove);
            window.removeEventListener('touchmove', onPointerMove);
            window.removeEventListener('mouseup', onPointerUp);
            window.removeEventListener('touchend', onPointerUp);
            window.removeEventListener('resize', onResize);
        };
        const obs = new MutationObserver(() => {
            if (!lightboxOverlay.classList.contains('visible')) { cleanup(); obs.disconnect(); }
        });
        obs.observe(lightboxOverlay, { attributes:true, attributeFilter:['class'] });
    }

    // 事件与初始化
    function setupEventListeners() {
        toggleBtn.addEventListener('click', () => {
            const isCollapsed = sidebarContainer.classList.toggle('collapsed');
            toggleBtn.textContent = isCollapsed ? '☰' : '✕';
        });

        // 分段按钮联动
        segButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const value = btn.dataset.items;
                setSegActive(value);
                itemsPerPageSelect.value = value;
                itemsPerPage = (value === 'all') ? Infinity : parseInt(value, 10);
                currentPage = 1;
                renderGallery();
            });
        });

        // 下拉框联动
        itemsPerPageSelect.addEventListener('change', (e) => {
            const v = e.target.value;
            itemsPerPage = (v === 'all') ? Infinity : parseInt(v, 10);
            currentPage = 1;
            setSegActive(v);
            renderGallery();
        });

        // 主题
        themeDots.forEach(btn => btn.addEventListener('click', () => applyTheme(btn.dataset.theme)));

        // 灯箱关闭
        lightboxCloseBtn.addEventListener('click', closeLightbox);
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.lightboxOpen) closeLightbox(); });
    }

    function init() {
        initTheme();
        itemsPerPageSelect.value = '5';
        setSegActive('5');
        renderNavigation();
        sidebarContainer.classList.add('collapsed');
    }

    setupEventListeners();
    init();
});
