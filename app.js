const app = {
    async init() {
        await API.init(); 
        await UI.renderList();
        const key = await DB.getSetting('tmdb_key');
        if (key) document.getElementById('apiKeyInput').value = key;

        // CLICK OUTSIDE TO CLOSE
        const modal = document.getElementById('modal');
        modal.addEventListener('click', (e) => {
            if (e.target === modal) app.closeModal();
        });

        // Also for Settings Modal
        const settings = document.getElementById('settingsModal');
        settings.addEventListener('click', (e) => {
            if (e.target === settings) closeSettings();
        });
    },

    openModal() {
        document.getElementById('modal').classList.remove('hidden');
        UI.renderModalContent(null);
    },

    async openEdit(id) {
        document.getElementById('modal').classList.remove('hidden');
        const show = await DB.getShow(id);
        if (show) {
            await UI.renderModalContent(show);
            UI.fillForm(show);
        }
    },

    // --- V4.0 TRACKING LOGIC ---
    async openChecklist(id) {
        let show = await DB.getShow(id);
        if (!show) return;

        // LIVE SYNC: Check if show updated?
        if (show.tmdbId) {
            const now = Date.now();
            // Check once every 12 hours (43200000 ms)
            if (!show.lastSync || (now - show.lastSync > 43200000)) {
                console.log("Auto-Syncing show...");
                const fresh = await API.getDetails(show.tmdbId);
                if (fresh) {
                    show.seasonData = fresh.seasonData;
                    show.status = fresh.status;
                    show.lastSync = now;
                    // Preserve existing cache of episode names
                    if(!show.seasonDetailCache) show.seasonDetailCache = {};
                    await DB.saveShow(show);
                }
            }
        }

        document.getElementById('modal').classList.remove('hidden');
        await UI.renderChecklist(show);
    },

    closeModal() {
        document.getElementById('modal').classList.add('hidden');
        document.getElementById('modalBody').innerHTML = '';
    },

    // --- ACCORDION LOGIC ---
    async toggleSeason(showId, seasonNum) {
        const group = document.getElementById(`season-group-${seasonNum}`);
        const listContainer = document.getElementById(`ep-list-${seasonNum}`);
        const show = await DB.getShow(showId);

        // Toggle Open/Closed
        const isOpen = group.classList.contains('open');
        
        if (isOpen) {
            group.classList.remove('open');
        } else {
            // Close others (Optional, but cleaner)
            document.querySelectorAll('.season-group').forEach(el => el.classList.remove('open'));
            
            group.classList.add('open');
            // Render content if empty
            if (listContainer.innerHTML.trim() === '') {
                listContainer.innerHTML = '<div style="padding:15px; text-align:center;">Loading...</div>';
                listContainer.innerHTML = await UI.buildEpisodeList(show, seasonNum);
            }
        }
    },

    async cacheSeasonDetails(showId, seasonNum, episodes) {
        const show = await DB.getShow(showId);
        if (!show.seasonDetailCache) show.seasonDetailCache = {};
        show.seasonDetailCache[seasonNum] = episodes;
        await DB.saveShow(show);
    },

    // --- PROGRESS LOGIC (SEQUENTIAL) ---
    async setEpisode(showId, seasonNum, epNum) {
        const show = await DB.getShow(showId);
        
        // Logic: Clicking an item sets progress to THAT item.
        // If clicking the current exact progress, toggle back one?
        // Simpler: Just set strict progress.
        
        // If user clicks S2 E5:
        // show.season = 2
        // show.episode = 5
        
        // TOGGLE: If we click the one we are currently on, go back 1.
        if (show.season === seasonNum && show.episode === epNum) {
            if (epNum > 1) {
                show.episode = epNum - 1;
            } else {
                // Back to end of previous season? 
                // Too complex for 0fluff. Just stay at 1 or go to 0?
                // Let's just decrement episode.
                show.episode = Math.max(0, epNum - 1);
            }
        } else {
            show.season = seasonNum;
            show.episode = epNum;
        }

        show.updated = Date.now();
        await DB.saveShow(show);
        
        // Re-render only the list part? Or full modal?
        // Full modal is safer to update all checks correctly.
        await UI.renderChecklist(show);
        UI.renderList(); // Update background
    },

    // --- API & SAVE ---
    async selectApiShow(tmdbId) {
        const details = await API.getDetails(tmdbId);
        const convertId = document.getElementById('convertId').value;
        
        if (convertId) {
            await this.finalizeConversion(parseInt(convertId), details);
            return;
        }

        document.getElementById('title').value = details.title;
        document.getElementById('tmdbId').value = details.tmdbId;
        document.getElementById('apiPoster').value = details.poster;
        document.getElementById('apiStatus').value = details.status;
        document.getElementById('apiRating').value = details.rating;
        document.getElementById('apiSeasonData').value = JSON.stringify(details.seasonData);
        UI.populateSeasonSelect(details.seasonData);
    },

    async finalizeConversion(id, details) {
        const show = await DB.getShow(id);
        show.tmdbId = details.tmdbId;
        show.title = details.title;
        show.poster = details.poster;
        show.status = details.status;
        show.rating = details.rating;
        show.seasonData = details.seasonData;
        show.updated = Date.now();
        await DB.saveShow(show);
        this.closeModal();
        UI.renderList();
    },

    async saveShow() {
        const idInput = document.getElementById('showId');
        const editId = idInput && idInput.value ? parseInt(idInput.value) : null;
        const apiIdEl = document.getElementById('tmdbId');
        let showData = {};

        if (apiIdEl && apiIdEl.value) {
            // API SAVE
            const seasonSelect = document.getElementById('seasonSelect');
            showData = {
                title: document.getElementById('title').value,
                tmdbId: parseInt(apiIdEl.value),
                poster: document.getElementById('apiPoster').value,
                status: document.getElementById('apiStatus').value,
                rating: document.getElementById('apiRating').value,
                seasonData: JSON.parse(document.getElementById('apiSeasonData').value),
                season: parseInt(seasonSelect ? seasonSelect.value : document.getElementById('season').value),
                episode: parseInt(document.getElementById('episode').value),
                updated: Date.now()
            };
        } else {
            // MANUAL SAVE
            const title = document.getElementById('title').value;
            if(!title) return alert("Title req");
            showData = {
                title,
                season: parseInt(document.getElementById('season').value),
                episode: parseInt(document.getElementById('episode').value),
                updated: Date.now()
            };
            const fileInput = document.getElementById('poster');
            if (fileInput && fileInput.files[0]) {
                showData.poster = await toBase64(fileInput.files[0]);
            } else if (editId) {
                const old = await DB.getShow(editId);
                showData.poster = old.poster;
            }
        }
        if (editId) showData.id = editId;
        
        // Preserve cache if editing
        if (editId) {
            const old = await DB.getShow(editId);
            if(old.seasonDetailCache) showData.seasonDetailCache = old.seasonDetailCache;
        }

        await DB.saveShow(showData);
        this.closeModal();
        UI.renderList();
    },

    async quickUpdate(id, ds, de) {
        const show = await DB.getShow(id);
        if (ds > 0) { show.season += ds; show.episode = 1; } 
        else { show.episode += de; }
        show.updated = Date.now();
        await DB.saveShow(show);
        UI.renderList();
    },

    async deleteShow(id) {
        if (!confirm("Delete show?")) return;
        await DB.deleteShow(id);
        this.closeModal();
        UI.renderList();
    }
};

// --- SETTINGS LOGIC ---
function openSettings() { 
    document.getElementById('settingsModal').classList.remove('hidden');
    // Removed the dynamic HTML injection code here because it is now hardcoded in index.html
    const key = localStorage.getItem('tmdb_key'); // Or DB.getSetting equivalent
    // The key input population happens in init() usually, but safe to ensure it here if you like
}

function closeSettings() { document.getElementById('settingsModal').classList.add('hidden'); }

async function saveSettings() {
    const key = document.getElementById('apiKeyInput').value.trim();
    await DB.saveSetting('tmdb_key', key);
    // Reload to apply settings
    location.reload();
}

}
async function exportData() { const shows = await DB.getAllShows(); const blob = new Blob([JSON.stringify(shows)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `ofluff_backup_${new Date().toISOString().slice(0,10)}.json`; a.click(); }
async function importData(event) { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = async (e) => { try { const data = JSON.parse(e.target.result); await DB.clearShows(); for (const item of data) await DB.saveShow(item); location.reload(); } catch (err) { alert("Invalid backup"); } }; reader.readAsText(file); }
function toBase64(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.readAsDataURL(file); reader.onload = () => resolve(reader.result); reader.onerror = error => reject(error); }); }

window.app = app;
window.openModal = app.openModal;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.saveSettings = saveSettings;
window.exportData = exportData;
window.importData = importData;

app.init();
