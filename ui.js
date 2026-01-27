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

    renderChecklist(show) {
        const body = document.getElementById('modalBody');
        const title = document.getElementById('modalTitle');
        title.innerText = `${show.title} - S${show.season}`;

        const safeSeasonData = show.seasonData || [];
        const sData = safeSeasonData.find(s => s.number === show.season);
        const totalEps = sData ? sData.episodes : 24; 

        let gridHtml = `<div class="checklist-grid">`;
        for (let i = 1; i <= totalEps; i++) {
            const isWatched = i <= show.episode;
            const isNext = i === show.episode + 1;
            let classList = "ep-box";
            if (isWatched) classList += " watched";
            if (isNext) classList += " next";

            gridHtml += `<div class="${classList}" onclick="app.setEpisode(${show.id}, ${i})">${i}</div>`;
        }
        gridHtml += `</div>`;

        let nextSeasonHtml = '';
        if (show.episode >= totalEps) {
            const nextS = safeSeasonData.find(s => s.number === show.season + 1);
            if (nextS) {
                nextSeasonHtml = `
                    <div class="season-complete-banner">
                        <p>Season ${show.season} Complete!</p>
                        <button class="next-season-btn" onclick="app.startSeason(${show.id}, ${show.season + 1})">Start Season ${show.season + 1}</button>
                    </div>`;
            } else {
                nextSeasonHtml = `<div class="season-complete-banner"><p>All caught up!</p></div>`;
            }
        }

        body.innerHTML = `
            ${gridHtml}
            ${nextSeasonHtml}
            <div class="modal-actions" style="margin-top:20px">
                <button class="secondary" onclick="app.closeModal()">Close</button>
                <button class="danger" onclick="app.deleteShow(${show.id})">Delete Show</button>
            </div>
        `;
    },

    // Handles Add (Manual/API) and Edit (Manual/API)
    async renderModalContent(showObj = null) {
        const body = document.getElementById('modalBody');
        const titleHeader = document.getElementById('modalTitle');
        const hasKey = API.hasKey();

        // SCENARIO 1: NEW SHOW (API ENABLED)
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
                    <div class="modal-actions"><button onclick="app.saveShow()">Start Tracking</button></div>
                </div>
            `;
            document.getElementById('apiSearch').addEventListener('input', debounce((e) => UI.handleSearch(e.target.value), 500));
            return;
        }

        // SCENARIO 2: EDITING or ADDING MANUAL
        titleHeader.innerText = showObj ? "Edit Show" : "Add Show (Manual)";
        
        let upgradeHtml = '';
        // CONVERSION LOGIC: If Editing a Manual show AND API is active
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

        if (document.getElementById('apiSearch')) {
            document.getElementById('apiSearch').addEventListener('input', debounce((e) => UI.handleSearch(e.target.value), 500));
        }
    },

    async handleSearch(query) {
        const resultsDiv = document.getElementById('searchResults');
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
        // If API show, we might fill hidden fields, but usually unneeded for basic edits
    }
};

function setValue(id, val) { const el = document.getElementById(id); if (el) el.value = val; }
function debounce(func, wait) { let timeout; return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), wait); }; }
