const UI = {
    async renderList() {
        const list = document.getElementById('showList');
        const shows = await DB.getAllShows();
        list.innerHTML = '';

        if (!shows || shows.length === 0) {
            list.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:#666;">No shows yet. Click + Add.</div>`;
            return;
        }

        shows.sort((a,b) => (b.updated || 0) - (a.updated || 0));

        shows.forEach(show => {
            const card = document.createElement('div');
            card.className = 'card';
            
            // Poster Logic
            const imgHtml = show.poster 
                ? `<div class="poster-slot"><img src="${show.poster}" alt="${show.title}"></div>` 
                : `<div class="poster-slot"><div class="poster-placeholder">${show.title.substring(0,2).toUpperCase()}</div></div>`;

            // Status Logic (API vs Manual)
            let statusBadge = '';
            let ratingBadge = '';
            
            if (show.tmdbId) {
                // API Mode Badges
                const statusClass = show.status === "Ended" ? "ended" : "returning";
                statusBadge = `<div class="status-badge ${statusClass}">${show.status || 'Unknown'}</div>`;
                if(show.rating) ratingBadge = `<div class="rating-badge">★ ${show.rating}</div>`;
            } else {
                // Manual Mode Badge
                statusBadge = `<div class="status-badge manual">Manual</div>`;
            }

            card.innerHTML = `
                ${imgHtml}
                <div class="card-content">
                    <div class="card-title">${show.title}</div>
                    <div class="meta-row">
                         ${ratingBadge}
                    </div>
                    <div class="card-stats">
                        <span>S${show.season}</span>
                        <span>E${show.episode}</span>
                        ${show.totalSeasons ? `<span style="opacity:0.5">/ ${show.totalSeasons}</span>` : ''}
                    </div>
                    ${statusBadge}
                </div>
                <div class="card-actions">
                    <button onclick="app.quickUpdate(${show.id}, 0, 1)">+Ep</button>
                    <button onclick="app.quickUpdate(${show.id}, 1, 0)">+Sz</button>
                    <button onclick="app.openEdit(${show.id})">✎</button>
                    <button class="danger" onclick="app.deleteShow(${show.id})">×</button>
                </div>
            `;
            list.appendChild(card);
        });
    },

    // DYNAMIC MODAL RENDERER
    async renderModalContent(editId = null) {
        const body = document.getElementById('modalBody');
        const titleHeader = document.getElementById('modalTitle');
        const hasKey = API.hasKey();

        let html = `<input type="hidden" id="showId">`;

        // 1. Title / Search Area
        if (hasKey && !editId) {
            // API ADD MODE
            titleHeader.innerText = "Search Show";
            html += `
                <div class="form-group">
                    <label>Search TMDB</label>
                    <input type="text" id="apiSearch" placeholder="Type show name..." autocomplete="off">
                    <div id="searchResults" class="hidden"></div>
                </div>
                <input type="hidden" id="title">
                <input type="hidden" id="tmdbId">
                <input type="hidden" id="apiPoster">
                <input type="hidden" id="apiStatus">
                <input type="hidden" id="apiRating">
                <input type="hidden" id="apiTotalSeasons">
            `;
        } else {
            // MANUAL MODE OR EDIT MODE
            titleHeader.innerText = editId ? "Edit Show" : "Add Show (Manual)";
            html += `
                <div class="form-group">
                    <label>Title</label>
                    <input type="text" id="title" placeholder="Show Title">
                </div>
            `;
        }

        // 2. Common Inputs (Season/Ep)
        html += `
            <div class="row">
                <div class="form-group">
                    <label>Season</label>
                    <input type="number" id="season" value="1" min="1">
                </div>
                <div class="form-group">
                    <label>Episode</label>
                    <input type="number" id="episode" value="1" min="1">
                </div>
            </div>
        `;

        // 3. Manual Extras (Only if not using API)
        if (!hasKey) {
            html += `
                <div class="form-group">
                    <label>Total Seasons (Opt)</label>
                    <input type="number" id="totalSeasons">
                </div>
                <div class="form-group">
                    <label>Poster (Opt)</label>
                    <input type="file" id="poster" accept="image/*">
                </div>
            `;
        }

        // 4. Buttons
        html += `
            <div class="modal-actions">
                <button class="secondary" onclick="app.closeModal()">Cancel</button>
                <button onclick="app.saveShow()">Save</button>
            </div>
        `;

        body.innerHTML = html;

        // Attach Search Listener if API mode
        if (hasKey && !editId) {
            const searchInput = document.getElementById('apiSearch');
            searchInput.addEventListener('input', debounce((e) => UI.handleSearch(e.target.value), 500));
        }
    },

    async handleSearch(query) {
        const resultsDiv = document.getElementById('searchResults');
        if (query.length < 2) {
            resultsDiv.classList.add('hidden');
            return;
        }

        const results = await API.search(query);
        
        if (results.length === 0) {
            resultsDiv.innerHTML = '<div style="padding:10px; color:#aaa;">No results found.</div>';
        } else {
            resultsDiv.innerHTML = results.map(show => `
                <div class="search-item" onclick="app.selectApiShow('${show.id}')">
                    <img src="${show.poster_path ? 'https://image.tmdb.org/t/p/w92' + show.poster_path : 'icon.svg'}">
                    <div class="search-info">
                        <div class="search-title">${show.name}</div>
                        <div class="search-year">${show.first_air_date ? show.first_air_date.substring(0,4) : ''}</div>
                    </div>
                </div>
            `).join('');
        }
        resultsDiv.classList.remove('hidden');
    },

    fillForm(data) {
        setValue('showId', data.id);
        setValue('title', data.title);
        setValue('season', data.season);
        setValue('episode', data.episode);
        if(document.getElementById('totalSeasons')) setValue('totalSeasons', data.totalSeasons);
    }
};

// Utilities
function setValue(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}
