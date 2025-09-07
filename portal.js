document.addEventListener('DOMContentLoaded', function() {
    // --- 状态管理 (不变) ---
    let currentAlbumImages = [];
    let currentPage = 1;
    let itemsPerPage = 10;

    // --- DOM 元素 (不变) ---
    const sidebarContainer = document.getElementById('sidebar-container');
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    const currentAlbumInfo = document.getElementById('current-album-info');
    const navPanel = document.getElementById('navigation-panel');
    const contentPanel = document.getElementById('content-panel');
    const galleryView = { /* ... */ };
    const itemsPerPageSelect = document.getElementById('items-per-page');
    const lightboxOverlay = document.getElementById('lightbox-overlay');
    // (为了简洁，省略了未修改的DOM元素获取代码)
    galleryView.controls = document.getElementById('gallery-controls');
    galleryView.welcome = document.getElementById('welcome-message');
    galleryView.container = document.getElementById('gallery-container');
    galleryView.pagination = document.getElementById('pagination-container');


    // --- 导航/手风琴逻辑 (不变) ---
    function renderNavigation() { /* ... */ }
    function toggleCategory(categoryDiv) { /* ... */ }
    // (为了简洁，省略了未修改的导航函数代码)
    function renderNavigation() { navPanel.innerHTML = ''; const categories = Object.keys(galleryData).sort(); categories.forEach(categoryName => { const categoryDiv = document.createElement('div'); categoryDiv.className = 'nav-category'; const titleDiv = document.createElement('div'); titleDiv.className = 'category-title'; titleDiv.textContent = categoryName; titleDiv.onclick = () => toggleCategory(categoryDiv); const albumList = document.createElement('ul'); albumList.className = 'album-list'; const albums = galleryData[categoryName]; const albumNames = Object.keys(albums).sort(); albumNames.forEach(albumName => { const li = document.createElement('li'); li.textContent = albumName; li.dataset.category = categoryName; li.dataset.album = albumName; li.onclick = (e) => { e.stopPropagation(); loadAlbum(categoryName, albumName, li); }; albumList.appendChild(li); }); categoryDiv.appendChild(titleDiv); categoryDiv.appendChild(albumList); navPanel.appendChild(categoryDiv); }); }
    function toggleCategory(categoryDiv) { if (!categoryDiv.classList.contains('active')) { document.querySelectorAll('.nav-category.active').forEach(el => { el.classList.remove('active'); }); } categoryDiv.classList.toggle('active'); }


    // --- 内容加载逻辑 (不变) ---
    function loadAlbum(categoryName, albumName, clickedLi) { /* ... */ }
    // (为了简洁，省略了未修改的内容加载函数代码)
    function loadAlbum(categoryName, albumName, clickedLi) { currentAlbumImages = galleryData[categoryName][albumName]; currentPage = 1; galleryView.welcome.classList.add('hidden'); galleryView.controls.classList.remove('hidden'); currentAlbumInfo.textContent = `${categoryName} / ${albumName}`; document.querySelectorAll('.album-list li.active').forEach(el => el.classList.remove('active')); clickedLi.classList.add('active'); renderGallery(); sidebarContainer.classList.add('collapsed'); toggleBtn.textContent = '☰'; }


    // --- 图片画廊渲染 (不变) ---
    function renderGallery() { /* ... */ }
    function setupPagination() { /* ... */ }
    // (为了简洁，省略了未修改的画廊渲染函数代码)
    function renderGallery() { galleryView.container.innerHTML = ''; const startIndex = (currentPage - 1) * itemsPerPage; const endIndex = startIndex + itemsPerPage; const paginatedImages = currentAlbumImages.slice(startIndex, endIndex); paginatedImages.forEach(image => { const wrapper = document.createElement('div'); wrapper.className = 'image-wrapper'; const img = document.createElement('img'); img.src = image.src; img.alt = image.alt; const previewBtn = document.createElement('button'); previewBtn.textContent = '全屏预览'; previewBtn.className = 'preview-btn'; previewBtn.onclick = () => openLightbox(image.src); wrapper.appendChild(img); wrapper.appendChild(previewBtn); galleryView.container.appendChild(wrapper); }); setupPagination(); }
    function setupPagination() { galleryView.pagination.innerHTML = ''; if (currentAlbumImages.length <= itemsPerPage) return; const pageCount = Math.ceil(currentAlbumImages.length / itemsPerPage); const createBtn = (text, onClick, isDisabled = false, isActive = false) => { const btn = document.createElement('button'); btn.textContent = text; btn.className = 'pagination-btn'; btn.disabled = isDisabled; if (isActive) btn.classList.add('active'); btn.onclick = onClick; return btn; }; const handlePageChange = (newPage) => { currentPage = newPage; renderGallery(); contentPanel.scrollTo(0, 0); }; galleryView.pagination.appendChild(createBtn('上一页', () => handlePageChange(currentPage - 1), currentPage === 1)); for (let i = 1; i <= pageCount; i++) { galleryView.pagination.appendChild(createBtn(i, () => handlePageChange(i), false, i === currentPage)); } galleryView.pagination.appendChild(createBtn('下一页', () => handlePageChange(currentPage + 1), currentPage === pageCount)); }


    // --- 灯箱逻辑 (关键修改点) ---
    function openLightbox(src) {
        document.body.classList.add('lightbox-open');
        lightboxOverlay.innerHTML = '';
        const img = document.createElement('img');
        img.src = src;
        img.style.position = 'absolute'; // 确保 position 是 absolute
        
        img.onload = () => {
            // 不再设置 top/left，完全交由 transform 控制
            lightboxOverlay.appendChild(img);
            lightboxOverlay.classList.add('visible');
            setupLightboxInteraction(img); // 调用全新的交互函数
        };

        // 关闭事件 (不变)
        lightboxOverlay.addEventListener('dblclick', closeLightbox);
        lightboxOverlay.addEventListener('click', (e) => {
            if (e.target === lightboxOverlay) {
                closeLightbox();
            }
        });
    }

    function closeLightbox() {
        document.body.classList.remove('lightbox-open');
        lightboxOverlay.classList.remove('visible');
        lightboxOverlay.removeEventListener('dblclick', closeLightbox);
        lightboxOverlay.removeEventListener('click', closeLightbox);
        setTimeout(() => { lightboxOverlay.innerHTML = ''; }, 300);
    }
    
    /**
     * 功能重构：设置灯箱内的交互，支持单指平移和双指缩放
     * @param {HTMLElement} img - 灯箱中的图片元素
     */
    function setupLightboxInteraction(img) {
        let scale = 1, translateX = 0, translateY = 0;
        let startDistance = 0, startScale = 1;
        let startX = 0, startY = 0, startTranslateX = 0, startTranslateY = 0;

        // 将图片初始居中
        translateX = (window.innerWidth - img.width) / 2;
        translateY = (window.innerHeight - img.height) / 2;
        applyTransform();

        function getDistance(touches) {
            return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
        }

        function applyTransform() {
            img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
        }

        function onInteractionStart(e) {
            e.preventDefault();
            window.addEventListener('mousemove', onInteractionMove);
            window.addEventListener('touchmove', onInteractionMove, { passive: false });
            window.addEventListener('mouseup', onInteractionEnd);
            window.addEventListener('touchend', onInteractionEnd);

            if (e.touches && e.touches.length === 2) { // 双指缩放
                img.classList.add('grabbing');
                startDistance = getDistance(e.touches);
                startScale = scale;
            } else { // 单指平移
                img.classList.add('grabbing');
                const point = e.touches ? e.touches[0] : e;
                startX = point.clientX;
                startY = point.clientY;
                startTranslateX = translateX;
                startTranslateY = translateY;
            }
        }

        function onInteractionMove(e) {
            e.preventDefault();
            if (e.touches && e.touches.length === 2) { // 双指缩放
                const currentDistance = getDistance(e.touches);
                const newScale = startScale * (currentDistance / startDistance);
                // 限制缩放范围
                scale = Math.max(0.5, Math.min(newScale, 5)); 
                applyTransform();
            } else if (!e.touches || e.touches.length === 1) { // 单指平移
                const point = e.touches ? e.touches[0] : e;
                const dx = point.clientX - startX;
                const dy = point.clientY - startY;
                translateX = startTranslateX + dx;
                translateY = startTranslateY + dy;
                applyTransform();
            }
        }

        function onInteractionEnd(e) {
            img.classList.remove('grabbing');
            window.removeEventListener('mousemove', onInteractionMove);
            window.removeEventListener('touchmove', onInteractionMove);
            window.removeEventListener('mouseup', onInteractionEnd);
            window.removeEventListener('touchend', onInteractionEnd);

            // 如果从双指变为单指，则重置为平移的起始状态
            if (e.touches && e.touches.length === 1) {
                const point = e.touches[0];
                startX = point.clientX;
                startY = point.clientY;
                startTranslateX = translateX;
                startTranslateY = translateY;
            }
        }

        img.addEventListener('mousedown', onInteractionStart);
        img.addEventListener('touchstart', onInteractionStart, { passive: false });
    }

    // --- 事件监听 (不变) ---
    toggleBtn.addEventListener('click', () => {
        const isCollapsed = sidebarContainer.classList.toggle('collapsed');
        toggleBtn.textContent = isCollapsed ? '☰' : '✕';
    });
    itemsPerPageSelect.addEventListener('change', (e) => {
        itemsPerPage = parseInt(e.target.value, 10);
        currentPage = 1;
        renderGallery();
    });

    // --- 初始化 (不变) ---
    function init() {
        renderNavigation();
        sidebarContainer.classList.add('collapsed');
    }

    init();
});
