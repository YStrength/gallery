document.addEventListener('DOMContentLoaded', function() {
    // --- 状态管理 & DOM 元素 (不变) ---
    let currentAlbumImages = [], currentPage = 1, itemsPerPage = 5;
    const sidebarContainer = document.getElementById('sidebar-container'),
          toggleBtn = document.getElementById('sidebar-toggle-btn'),
          currentAlbumInfo = document.getElementById('current-album-info'),
          navPanel = document.getElementById('navigation-panel'),
          contentPanel = document.getElementById('content-panel'),
          galleryView = { /* ... */ },
          itemsPerPageSelect = document.getElementById('items-per-page'),
          lightboxOverlay = document.getElementById('lightbox-overlay');
    galleryView.controls = document.getElementById('gallery-controls');
    galleryView.welcome = document.getElementById('welcome-message');
    galleryView.container = document.getElementById('gallery-container');
    galleryView.pagination = document.getElementById('pagination-container');

    // --- 导航 & 内容加载 & 画廊渲染 (不变) ---
    function renderNavigation() { /* ... */ }
    function toggleCategory(categoryDiv) { /* ... */ }
    function loadAlbum(categoryName, albumName, clickedLi) { /* ... */ }
    function renderGallery() { /* ... */ }
    function setupPagination() { /* ... */ }
    function renderNavigation() { navPanel.innerHTML = ''; const categories = Object.keys(galleryData).sort(); categories.forEach(categoryName => { const categoryDiv = document.createElement('div'); categoryDiv.className = 'nav-category'; const titleDiv = document.createElement('div'); titleDiv.className = 'category-title'; titleDiv.textContent = categoryName; titleDiv.onclick = () => toggleCategory(categoryDiv); const albumList = document.createElement('ul'); albumList.className = 'album-list'; const albums = galleryData[categoryName]; const albumNames = Object.keys(albums).sort(); albumNames.forEach(albumName => { const li = document.createElement('li'); li.textContent = albumName; li.dataset.category = categoryName; li.dataset.album = albumName; li.onclick = (e) => { e.stopPropagation(); loadAlbum(categoryName, albumName, li); }; albumList.appendChild(li); }); categoryDiv.appendChild(titleDiv); categoryDiv.appendChild(albumList); navPanel.appendChild(categoryDiv); }); }
    function toggleCategory(categoryDiv) { if (!categoryDiv.classList.contains('active')) { document.querySelectorAll('.nav-category.active').forEach(el => { el.classList.remove('active'); }); } categoryDiv.classList.toggle('active'); }
    function loadAlbum(categoryName, albumName, clickedLi) { currentAlbumImages = galleryData[categoryName][albumName]; currentPage = 1; galleryView.welcome.classList.add('hidden'); galleryView.controls.classList.remove('hidden'); currentAlbumInfo.textContent = `${categoryName} / ${albumName}`; document.querySelectorAll('.album-list li.active').forEach(el => el.classList.remove('active')); clickedLi.classList.add('active'); renderGallery(); sidebarContainer.classList.add('collapsed'); toggleBtn.textContent = '☰'; }
    function renderGallery() { galleryView.container.innerHTML = ''; const startIndex = (currentPage - 1) * itemsPerPage; const endIndex = startIndex + itemsPerPage; const paginatedImages = currentAlbumImages.slice(startIndex, endIndex); paginatedImages.forEach(image => { const wrapper = document.createElement('div'); wrapper.className = 'image-wrapper'; const img = document.createElement('img'); img.src = image.src; img.alt = image.alt; const previewBtn = document.createElement('button'); previewBtn.textContent = '全屏预览'; previewBtn.className = 'preview-btn'; previewBtn.onclick = () => openLightbox(image.src); wrapper.appendChild(img); wrapper.appendChild(previewBtn); galleryView.container.appendChild(wrapper); }); setupPagination(); }
    function setupPagination() { galleryView.pagination.innerHTML = ''; if (currentAlbumImages.length <= itemsPerPage) return; const pageCount = Math.ceil(currentAlbumImages.length / itemsPerPage); const createBtn = (text, onClick, isDisabled = false, isActive = false) => { const btn = document.createElement('button'); btn.textContent = text; btn.className = 'pagination-btn'; btn.disabled = isDisabled; if (isActive) btn.classList.add('active'); btn.onclick = onClick; return btn; }; const handlePageChange = (newPage) => { currentPage = newPage; renderGallery(); contentPanel.scrollTo(0, 0); }; galleryView.pagination.appendChild(createBtn('上一页', () => handlePageChange(currentPage - 1), currentPage === 1)); for (let i = 1; i <= pageCount; i++) { galleryView.pagination.appendChild(createBtn(i, () => handlePageChange(i), false, i === currentPage)); } galleryView.pagination.appendChild(createBtn('下一页', () => handlePageChange(currentPage + 1), currentPage === pageCount)); }


    // --- 灯箱逻辑 ---
    function openLightbox(src) {
        document.body.classList.add('lightbox-open');
        lightboxOverlay.innerHTML = '';
        const img = document.createElement('img');
        img.src = src;
        img.style.position = 'absolute';
        
        img.onload = () => {
            lightboxOverlay.appendChild(img);
            lightboxOverlay.classList.add('visible');
            setupLightboxInteraction(img);
        };

        lightboxOverlay.addEventListener('click', (e) => {
            if (e.target === lightboxOverlay) closeLightbox();
        });
        lightboxOverlay.addEventListener('dblclick', (e) => {
            if (e.target === lightboxOverlay) closeLightbox();
        });
    }
    
    function closeLightbox() {
        document.body.classList.remove('lightbox-open');
        lightboxOverlay.classList.remove('visible');
        setTimeout(() => { lightboxOverlay.innerHTML = ''; }, 300);
    }

    /**
     * 最终版：统一处理PC和移动端交互
     */
    function setupLightboxInteraction(img) {
        let matrix = [1, 0, 0, 1, 0, 0];
        let lastTouch = { x: 0, y: 0, time: 0, distance: 0 };
        let isDragging = false, isPinching = false;

        const fitScale = Math.min(window.innerWidth / img.naturalWidth, window.innerHeight / img.naturalHeight) * 0.95;
        matrix[0] = matrix[3] = fitScale;
        matrix[4] = (window.innerWidth - img.naturalWidth * fitScale) / 2;
        matrix[5] = (window.innerHeight - img.naturalHeight * fitScale) / 2;
        applyTransform(false);

        function applyTransform(useTransition = true) {
            img.style.transform = `matrix(${matrix.join(',')})`;
            img.style.transition = useTransition && !isDragging && !isPinching ? 'transform 0.3s ease' : 'none';
        }

        function getDistance(p1, p2) { return Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY); }
        function getMidpoint(p1, p2) { return { x: (p1.clientX + p2.clientX) / 2, y: (p1.clientY + p2.clientY) / 2 }; }

        function onPointerDown(e) {
            e.preventDefault();
            isDragging = true;
            const point = e.touches ? e.touches[0] : e;
            lastTouch.x = point.clientX;
            lastTouch.y = point.clientY;
            
            if (e.touches) {
                const now = Date.now();
                if (now - lastTouch.time < 300) { handleDoubleClick(e.touches[0]); }
                lastTouch.time = now;
            }

            if (e.touches && e.touches.length === 2) {
                isPinching = true;
                lastTouch.distance = getDistance(e.touches[0], e.touches[1]);
            }
        }

        function onPointerMove(e) {
            if (!isDragging) return;
            e.preventDefault();

            if (isPinching && e.touches && e.touches.length === 2) {
                const newDist = getDistance(e.touches[0], e.touches[1]);
                const scaleRatio = newDist / lastTouch.distance;
                lastTouch.distance = newDist;
                const midpoint = getMidpoint(e.touches[0], e.touches[1]);
                zoom(scaleRatio, midpoint);
            } else if (!isPinching) {
                const point = e.touches ? e.touches[0] : e;
                const dx = point.clientX - lastTouch.x;
                const dy = point.clientY - lastTouch.y;
                matrix[4] += dx;
                matrix[5] += dy;
                lastTouch.x = point.clientX;
                lastTouch.y = point.clientY;
                applyTransform(false);
            }
        }

        function onPointerUp(e) {
            isDragging = false;
            if (e.touches && e.touches.length < 2) isPinching = false;
            if (!e.touches || e.touches.length === 0) isPinching = false;
        }

        function handleDoubleClick(point) {
            let currentScale = matrix[0];
            let nextScale = (Math.abs(currentScale - 1.0) < 0.05) ? fitScale : 1.0;
            const scaleRatio = nextScale / currentScale;
            zoom(scaleRatio, { x: point.clientX, y: point.clientY }, true);
        }
        
        function zoom(scaleRatio, center, useTransition = false) {
            const currentScale = matrix[0];
            let newScale = currentScale * scaleRatio;
            newScale = Math.max(0.2, Math.min(newScale, 8)); // 放大倍数上限提高到8倍
            scaleRatio = newScale / currentScale;
            if (scaleRatio === 1) return;
            const newTx = center.x - (center.x - matrix[4]) * scaleRatio;
            const newTy = center.y - (center.y - matrix[5]) * scaleRatio;
            matrix[0] = newScale;
            matrix[3] = newScale;
            matrix[4] = newTx;
            matrix[5] = newTy;
            applyTransform(useTransition);
        }

        // --- 统一事件监听 ---
        // 移动端触摸 & PC鼠标拖动
        img.addEventListener('mousedown', onPointerDown);
        img.addEventListener('touchstart', onPointerDown, { passive: false });
        window.addEventListener('mousemove', onPointerMove, { passive: false });
        window.addEventListener('touchmove', onPointerMove, { passive: false });
        window.addEventListener('mouseup', onPointerUp);
        window.addEventListener('touchend', onPointerUp);

        // --- PC Interaction: Double-click to Zoom ---
        img.addEventListener('dblclick', function(e) {
            e.preventDefault();
            e.stopPropagation(); // 防止事件冒泡到背景层关闭预览
            handleDoubleClick(e); // 复用双击处理逻辑
        });

        // --- PC Interaction: Mouse Wheel Zoom ---
        img.addEventListener('wheel', function(e) {
            e.preventDefault();
            const scaleRatio = e.deltaY < 0 ? 1.1 : 1 / 1.1; // 每次缩放10%
            zoom(scaleRatio, { x: e.clientX, y: e.clientY });
        }, { passive: false });
    }

    // --- 事件监听 & 初始化 ---
    function setupEventListeners() {
        toggleBtn.addEventListener('click', () => {
            const isCollapsed = sidebarContainer.classList.toggle('collapsed');
            toggleBtn.textContent = isCollapsed ? '☰' : '✕';
        });
        
        itemsPerPageSelect.addEventListener('change', (e) => {
            itemsPerPage = parseInt(e.target.value, 10);
            currentPage = 1;
            renderGallery();
        });
    }

    function init() {
        itemsPerPageSelect.value = itemsPerPage;
        renderNavigation();
        sidebarContainer.classList.add('collapsed');
    }

    setupEventListeners();
    init();
});
