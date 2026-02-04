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
            
            const imgHtml = show.poster 
                ? `<div class="poster-slot"><img src="${show.poster}" alt="${show.title}"></div>` 
                : `<div class="poster-slot"><div class="poster-placeholder">${show.title.substring(0,2).toUpperCase()}</div></div>`;

            let bottomSection = '';
            let badges = '';
            let clickAction = '';

            if (show.tmdbId) {
                // API MODE
                clickAction = `onclick="app.openChecklist(${show.id})"`;

                if (!show.seasonData || !Array.isArray(show.seasonData)) {
                    badges = `<div class="rating-badge">S${show.season}</div>`;
                    bottomSection = `<div class="card-api-hint" style="color:var(--warning); font-weight:bold;">⚠ Tap to Sync</div>`;
                } else {
                    const currentSeasonData = show.seasonData.find(s => s.number === show.season);
                    const totalEps = currentSeasonData ? currentSeasonData.episodes : '?';
                    let progressPct = 0;
                    if (typeof totalEps === 'number') progressPct = (show.episode / totalEps) * 100;

                    let statusTag = '';
                    if (show.episode >= totalEps && typeof totalEps === 'number') {
                        statusTag = `<span class="tag-finished">FINISHED</span>`;
                    } else {
                        statusTag = `<span class="tag-progress">${show.episode} / ${totalEps}</span>`;
                    }

                    badges = `<div class="rating-badge">S${show.season}</div> ${statusTag}`;
                    bottomSection = `
                        <div class="progress-container"><div class="progress-bar" style="width: ${Math.min(progressPct, 100)}%"></div></div>
                        <div class="card-api-hint">Tap to track</div>
                    `;
                }
            } else {
                // MANUAL MODE
                clickAction = ''; 
                badges = `<div class="status-badge manual">Manual</div>`;
                bottomSection = `
                    <div class="card-stats"><span>S${show.season}</span><span>E${show.episode}</span></div>
                    <div class="card-actions">
                        <button onclick="app.quickUpdate(${show.id}, 0, 1)">+Ep</button>
                        <button onclick="app.quickUpdate(${show.id}, 1, 0)">+Sz</button>
                        <button onclick="app.openEdit(${show.id})">✎</button>
                        <button class="danger" onclick="app.deleteShow(${show.id})">×</button>
                    </div>
                `;
            }

            card.innerHTML = `
                <div class="card-click-wrapper" ${clickAction}>
                    ${imgHtml}
                    <div class="card-content">
                        <div class="card-title">${show.title}</div>
                        <div class="meta-row">${badges}</div>
                        ${bottomSection}
                    </div>
                </div>
            `;
            list.appendChild(card);
        });
    },

    // --- NEW LIST VIEW (Accordion) ---
    async renderChecklist(show) {
        const body = document.getElementById('modalBody');
        const title = document.getElementById('modalTitle');
        title.innerText = show.title;

        const seasons = show.seasonData || [];
        let html = `<div class="season-list">`;

        for (const s of seasons) {
            const isPast = s.number < show.season;
            const isCurrent = s.number === show.season;
            const isFuture = s.number > show.season;
            
            // Auto-expand current season
            const isOpen = isCurrent; 
            const stateClass = isOpen ? 'open' : 'closed';
            
            // Status Text
            let statusText = "";
            if (isPast) statusText = "Completed";
            else if (isCurrent) statusText = `${show.episode} / ${s.episodes}`;
            else statusText = `${s.episodes} Episodes`;

            html += `
                <div class="season-group ${stateClass}" id="season-group-${s.number}">
                    <div class="season-header" onclick="app.toggleSeason(${show.id}, ${s.number})">
                        <div class="season-title">Season ${s.number}</div>
                        <div class="season-meta">${statusText}</div>
                    </div>
                    <div class="season-episodes" id="ep-list-${s.number}">
                        ${isOpen ? await UI.buildEpisodeList(show, s.number) : ''}
                    </div>
                </div>
            `;
        }
        html += `</div>`;
        
        // Settings / Delete footer
        html += `
            <div class="modal-actions" style="margin-top:20px; border-top:1px solid #333; padding-top:15px;">
                 <button class="secondary" onclick="app.closeModal()">Close</button>
                 <button class="danger" onclick="app.deleteShow(${show.id})">Delete Show</button>
            </div>
        `;

        body.innerHTML = html;
    },

    // Helper to generate the episode rows
    async buildEpisodeList(show, seasonNum) {
        // 1. Try to get episode names from cache or API
        let episodes = [];
        
        // Check if we have cached details for this season in the show object
        if (show.seasonDetailCache && show.seasonDetailCache[seasonNum]) {
            episodes = show.seasonDetailCache[seasonNum];
        } else {
            // Fetch from API
            episodes = await API.getSeasonDetails(show.tmdbId, seasonNum);
            if (episodes) {
                // Save to cache to avoid refetching
                await app.cacheSeasonDetails(show.id, seasonNum, episodes);
            }
        }

        // Fallback if API fails or no key: generate dummy list
        if (!episodes || episodes.length === 0) {
            const count = show.seasonData.find(s => s.number === seasonNum)?.episodes || 10;
            episodes = Array.from({length: count}, (_, i) => ({
                episode_number: i + 1,
                name: `Episode ${i + 1}`
            }));
        }

        let html = '';
        const currentEp = show.episode;
        const currentSz = show.season;

        episodes.forEach(ep => {
            const epNum = ep.episode_number;
            
            // Logic: Is this checked?
            // If season is past, ALL are checked.
            // If season is current, check if epNum <= currentEp.
            // If season is future, NONE checked.
            let isChecked = false;
            if (seasonNum < currentSz) isChecked = true;
            else if (seasonNum === currentSz && epNum <= currentEp) isChecked = true;

            const checkState = isChecked ? 'checked' : '';
            const activeClass = (seasonNum === currentSz && epNum === currentEp + 1) ? 'next-up' : '';

            html += `
                <div class="episode-row ${activeClass}" onclick="app.setEpisode(${show.id}, ${seasonNum}, ${epNum})">
                    <div class="checkbox ${checkState}">${isChecked ? '✔' : ''}</div>
                    <div class="ep-info">
                        <span class="ep-num">${epNum}.</span>
                        <span class="ep-name">${ep.name}</span>
                    </div>
                </div>
            `;
        });
        return html;
    },

    // --- ADD/EDIT MODAL ---
    async renderModalContent(showObj = null) {
        const body = document.getElementById('modalBody');
        const titleHeader = document.getElementById('modalTitle');
        const hasKey = API.hasKey();

        // 1. ADD NEW (API MODE)
        if (hasKey && !showObj) {
            titleHeader.innerText = "Search Show";
            body.innerHTML = `
                <div class="form-group">
                    <label>Search TMDB</label>
                    <input type="text" id="apiSearch" placeholder="Type show name..." autocomplete="off">
                    <div id="searchResults" class="hidden"></div>
                </div>
                <input type="hidden" id="convertId" value="">
                <input type="hidden" id="tmdbId"><input type="hidden" id="apiPoster">
                <input type="hidden" id="apiStatus"><input type="hidden" id="apiRating">
                <input type="hidden" id="apiSeasonData"><input type="hidden" id="title">
                
                <div id="apiSelections" class="hidden">
                    <div class="form-group"><label>Where are you?</label><select id="seasonSelect" onchange="UI.updateEpisodeMax()"></select></div>
                    <div class="form-group"><label>Episode</label><input type="number" id="episode" value="1" min="1"></div>
                    <div class="modal-actions">
                        <button class="secondary" onclick="app.closeModal()">Cancel</button> <button onclick="app.saveShow()">Start Tracking</button>
                    </div>
                </div>
                <div id="initialActions" class="modal-actions" style="margin-top:10px">
                     <button class="secondary" onclick="app.closeModal()">Cancel</button>
                </div>
            `;
            document.getElementById('apiSearch').addEventListener('input', debounce((e) => UI.handleSearch(e.target.value), 500));
            return;
        }

        // 2. EDIT / MANUAL
        titleHeader.innerText = showObj ? "Edit Show" : "Add Show (Manual)";
        let upgradeHtml = '';
        if (showObj && !showObj.tmdbId && hasKey) {
            upgradeHtml = `
                <div class="upgrade-box">
                    <div class="upgrade-title">✨ Upgrade to Smart Tracking</div>
                    <input type="text" id="apiSearch" placeholder="Search to link TMDB..." autocomplete="off">
                    <div id="searchResults" class="hidden"></div>
                    <input type="hidden" id="convertId" value="${showObj.id}">
                </div>
            `;
        }

        body.innerHTML = `
            ${upgradeHtml}
            <input type="hidden" id="showId">
            <input type="hidden" id="tmdbId"><input type="hidden" id="apiSeasonData">

            <div class="form-group"><label>Title</label><input type="text" id="title" placeholder="Show Title"></div>
            <div class="row">
                <div class="form-group"><label>Season</label><input type="number" id="season" value="1" min="1"></div>
                <div class="form-group"><label>Episode</label><input type="number" id="episode" value="1" min="1"></div>
            </div>
            ${!hasKey || !showObj ? `<div class="form-group"><label>Poster (Opt)</label><input type="file" id="poster" accept="image/*"></div>` : ''}
            
            <div class="modal-actions">
                <button class="secondary" onclick="app.closeModal()">Cancel</button>
                <button onclick="app.saveShow()">Save</button>
            </div>
        `;
        if (document.getElementById('apiSearch')) document.getElementById('apiSearch').addEventListener('input', debounce((e) => UI.handleSearch(e.target.value), 500));
    },

    // --- SETTINGS (Updated with Backup) ---
    renderSettings() {
        const body = document.getElementById('settingsBody'); // Use a different target or generic modal
        // Note: app.js handles the generic modal, so we just use the same modal for settings
        // But typically we used a separate 'settingsModal' div. 
        // Let's assume we stick to the HTML structure provided.
    },

    // ... (Keep handleSearch, populateSeasonSelect, fillForm, updateEpisodeMax)
    async handleSearch(query) {
        const resultsDiv = document.getElementById('searchResults');
        // Hide initial cancel button when searching starts
        const initActions = document.getElementById('initialActions');
        if(initActions) initActions.style.display = 'none';

        if (query.length < 2) { resultsDiv.classList.add('hidden'); return; }
        const results = await API.search(query);
        resultsDiv.innerHTML = results.map(show => `
            <div class="search-item" onclick="app.selectApiShow('${show.id}')">
                <img src="${show.poster_path ? 'https://image.tmdb.org/t/p/w92' + show.poster_path : 'icon.svg'}">
                <div class="search-info">
                    <div class="search-title">${show.name}</div>
                    <div class="search-year">${show.first_air_date ? show.first_air_date.substring(0,4) : ''}</div>
                </div>
            </div>
        `).join('');
        resultsDiv.classList.remove('hidden');
    },

    populateSeasonSelect(seasonData) {
        const select = document.getElementById('seasonSelect');
        const container = document.getElementById('apiSelections');
        select.innerHTML = '';
        seasonData.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.number;
            opt.innerText = `Season ${s.number} (${s.episodes} Eps)`;
            opt.dataset.eps = s.episodes;
            select.appendChild(opt);
        });
        container.classList.remove('hidden');
        document.getElementById('searchResults').classList.add('hidden');
        // Hide initial Cancel button as the form now has its own cancel
        const initActions = document.getElementById('initialActions');
        if(initActions) initActions.style.display = 'none';
    },

    updateEpisodeMax() {
        const select = document.getElementById('seasonSelect');
        const epInput = document.getElementById('episode');
        const eps = select.options[select.selectedIndex].dataset.eps;
        epInput.max = eps;
        epInput.value = 1;
    },

    fillForm(data) {
        setValue('showId', data.id);
        setValue('title', data.title);
        setValue('season', data.season);
        setValue('episode', data.episode);
    }
};

function setValue(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
function debounce(func, wait) { let timeout; return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), wait); }; }
