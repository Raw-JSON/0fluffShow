const app = {
    async init() {
        await API.init(); 
        await UI.renderList();
        const key = await DB.getSetting('tmdb_key');
        if (key) document.getElementById('apiKeyInput').value = key;
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

    async openChecklist(id) {
        let show = await DB.getShow(id);
        if (!show) return;

        let seasonDetails = null;

        // Persistent Sync Logic: Always fetch latest TMDB data to keep tracking fresh
        if (show.tmdbId && API.hasKey()) {
            const details = await API.getDetails(show.tmdbId);
            if (details && details.seasonData) {
                show.seasonData = details.seasonData;
                show.status = details.status; 
                show.rating = details.rating;
                await DB.saveShow(show);
            }
            // Fetch episode names for the current season
            seasonDetails = await API.getSeason(show.tmdbId, show.season);
        }

        document.getElementById('modal').classList.remove('hidden');
        UI.renderChecklist(show, seasonDetails);
        UI.renderList();
    },

    closeModal() {
        document.getElementById('modal').classList.add('hidden');
        document.getElementById('modalBody').innerHTML = '';
    },

    async selectApiShow(tmdbId) {
        const details = await API.getDetails(tmdbId);
        if (!details) return alert("Failed to fetch details");

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
        alert(`Upgraded "${show.title}" to Smart Tracking!`);
    },

    async saveShow() {
        const idInput = document.getElementById('showId');
        const editId = idInput && idInput.value ? parseInt(idInput.value) : null;
        const apiIdEl = document.getElementById('tmdbId');
        let showData = {};

        if (apiIdEl && apiIdEl.value) {
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

        await DB.saveShow(showData);
        this.closeModal();
        UI.renderList();
    },

    async setEpisode(id, epNum) {
        const show = await DB.getShow(id);
        
        if (show.episode === epNum) {
            show.episode = Math.max(0, epNum - 1);
        } else {
            show.episode = epNum;
        }
        
        show.updated = Date.now();
        await DB.saveShow(show);
        
        // Re-render checklist with same season details if available
        let seasonDetails = null;
        if (show.tmdbId) {
             seasonDetails = await API.getSeason(show.tmdbId, show.season);
        }
        UI.renderChecklist(show, seasonDetails);
        UI.renderList();
    },

    async startSeason(id, newSeasonNum) {
        const show = await DB.getShow(id);
        show.season = newSeasonNum;
        show.episode = 1;
        show.updated = Date.now();
        await DB.saveShow(show);
        this.openChecklist(id); // Reload full data
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

function openSettings() { document.getElementById('settingsModal').classList.remove('hidden'); }
function closeSettings() { document.getElementById('settingsModal').classList.add('hidden'); }
async function saveSettings() {
    const key = document.getElementById('apiKeyInput').value.trim();
    await DB.saveSetting('tmdb_key', key);
    location.reload();
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
