document.addEventListener('DOMContentLoaded', function() {
    // --- 状态管理 ---
    let currentAlbumImages = [];
    let currentPage = 1;
    let itemsPerPage = 5;

    // --- DOM 元素 ---
    const sidebarContainer = document.getElementById('sidebar-container');
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    const currentAlbumInfo = document.getElementById('current-album-info');
    const navPanel = document.getElementById('navigation-panel');
    const contentPanel = document.getElementById('content-panel');
    const galleryView = {
        controls: document.getElementById('gallery-controls'),
        welcome: document.getElementById('welcome-message'),
        container: document.getElementById('gallery-container'),
        pagination: document.getElementById('pagination-container')
    };
    const itemsPerPageSelect = document.getElementById('items-per-page');
    const lightboxOverlay = document.getElementById('lightbox-overlay');

    // --- 导航/手风琴逻辑 (渲染部分不变) ---
    function renderNavigation() {
        navPanel.innerHTML = '';
        const categories = Object.keys(galleryData).sort();
        
        categories.forEach(categoryName => {
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'nav-category';
            const titleDiv = document.createElement('div');
            titleDiv.className = 'category-title';
            titleDiv.textContent = categoryName;
            titleDiv.onclick = () => toggleCategory(categoryDiv);
            const albumList = document.createElement('ul');
            albumList.className = 'album-list';
            const albums = galleryData[categoryName];
            const albumNames = Object.keys(albums).sort();
            albumNames.forEach(albumName => {
                const li = document.createElement('li');
                li.textContent = albumName;
                li.dataset.category = categoryName;
                li.dataset.album = albumName;
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
    
    function toggleCategory(categoryDiv) {
        if (!categoryDiv.classList.contains('active')) {
            document.querySelectorAll('.nav-category.active').forEach(el => {
                el.classList.remove('active');
            });
        }
        categoryDiv.classList.toggle('active');
    }

    // --- 内容加载逻辑 ---
    function loadAlbum(categoryName, albumName, clickedLi) {
        currentAlbumImages = galleryData[categoryName][albumName];
        currentPage = 1;

        galleryView.welcome.classList.add('hidden');
        galleryView.controls.classList.remove('hidden');
        currentAlbumInfo.textContent = `${categoryName} / ${albumName}`;
        
        document.querySelectorAll('.album-list li.active').forEach(el => el.classList.remove('active'));
        clickedLi.classList.add('active');

        renderGallery();
        // 点击相册后，自动隐藏侧边栏
        sidebarContainer.classList.add('collapsed');
        toggleBtn.textContent = '☰';
    }

    // --- 图片画廊渲染 (不变) ---
    function renderGallery() {
        galleryView.container.innerHTML = '';
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const paginatedImages = currentAlbumImages.slice(startIndex, endIndex);
        paginatedImages.forEach(image => {
            const wrapper = document.createElement('div');
            wrapper.className = 'image-wrapper';
            const img = document.createElement('img');
            img.src = image.src;
            img.alt = image.alt;
            const previewBtn = document.createElement('button');
            previewBtn.textContent = '全屏预览';
            previewBtn.className = 'preview-btn';
            previewBtn.onclick = () => openLightbox(image.src);
            wrapper.appendChild(img);
            wrapper.appendChild(previewBtn);
            galleryView.container.appendChild(wrapper);
        });
        setupPagination();
    }

    function setupPagination() {
        galleryView.pagination.innerHTML = '';
        if (currentAlbumImages.length <= itemsPerPage) return;
        const pageCount = Math.ceil(currentAlbumImages.length / itemsPerPage);
        const createBtn = (text, onClick, isDisabled = false, isActive = false) => {
            const btn = document.createElement('button'); btn.textContent = text; btn.className = 'pagination-btn'; btn.disabled = isDisabled; if (isActive) btn.classList.add('active'); btn.onclick = onClick; return btn;
        };
        const handlePageChange = (newPage) => { currentPage = newPage; renderGallery(); contentPanel.scrollTo(0, 0); };
        galleryView.pagination.appendChild(createBtn('上一页', () => handlePageChange(currentPage - 1), currentPage === 1));
        for (let i = 1; i <= pageCount; i++) {
            galleryView.pagination.appendChild(createBtn(i, () => handlePageChange(i), false, i === currentPage));
        }
        galleryView.pagination.appendChild(createBtn('下一页', () => handlePageChange(currentPage + 1), currentPage === pageCount));
    }

    // --- 灯箱逻辑 (不变) ---
    function openLightbox(src) { document.body.classList.add('lightbox-open'); lightboxOverlay.innerHTML = ''; const img = document.createElement('img'); img.src = src; img.onload = () => { const initialTop = (window.innerHeight - img.height) / 2; const initialLeft = (window.innerWidth - img.width) / 2; img.style.top = `${initialTop}px`; img.style.left = `${initialLeft}px`; lightboxOverlay.appendChild(img); lightboxOverlay.classList.add('visible'); makeImageDraggableInLightbox(img); }; lightboxOverlay.addEventListener('dblclick', closeLightbox); }
    function closeLightbox() { document.body.classList.remove('lightbox-open'); lightboxOverlay.classList.remove('visible'); setTimeout(() => { lightboxOverlay.innerHTML = ''; }, 300); }
    function makeImageDraggableInLightbox(img) { let isDragging = false, startPos = { x: 0, y: 0 }, startImgPos = { left: 0, top: 0 }; const onMouseDown = (e) => { e.preventDefault(); isDragging = true; img.classList.add('grabbing'); startPos = { x: e.clientX, y: e.clientY }; startImgPos = { left: img.offsetLeft, top: img.offsetTop }; window.addEventListener('mousemove', onMouseMove); window.addEventListener('mouseup', onMouseUp); }; const onMouseMove = (e) => { if (!isDragging) return; const dx = e.clientX - startPos.x; const dy = e.clientY - startPos.y; img.style.left = `${startImgPos.left + dx}px`; img.style.top = `${startImgPos.top + dy}px`; }; const onMouseUp = () => { isDragging = false; img.classList.remove('grabbing'); window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); }; img.addEventListener('mousedown', onMouseDown); }

    // --- 事件监听 ---
    toggleBtn.addEventListener('click', () => {
        const isCollapsed = sidebarContainer.classList.toggle('collapsed');
        toggleBtn.textContent = isCollapsed ? '☰' : '✕';
    });
    
    itemsPerPageSelect.addEventListener('change', (e) => {
        itemsPerPage = parseInt(e.target.value, 10);
        currentPage = 1;
        renderGallery();
    });

    // --- 初始化 ---
    function init() {
        renderNavigation();
        // 默认收起侧边栏
        sidebarContainer.classList.add('collapsed');
    }

    init();
});
