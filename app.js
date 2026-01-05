let db;
const DB_NAME = "0fluffDB";
const STORE_NAME = "shows";

// 1. PWA Service Worker Registration
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('SW Registered'))
        .catch(err => console.log('SW Fail:', err));
}

// 2. Database Init
const request = indexedDB.open(DB_NAME, 2); // Increased version for schema updates if needed in future

request.onupgradeneeded = (e) => {
    db = e.target.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
    }
};

request.onsuccess = (e) => {
    db = e.target.result;
    renderShows();
};

// 3. UI Functions
function openModal(isEdit = false) {
    document.getElementById('modal').classList.remove('hidden');
    document.getElementById('modalTitle').innerText = isEdit ? "Edit Show" : "Add Show";
    if (!isEdit) clearModal();
}

function closeModal() {
    document.getElementById('modal').classList.add('hidden');
    clearModal();
}

function clearModal() {
    document.getElementById('showId').value = '';
    document.getElementById('title').value = '';
    document.getElementById('season').value = 1;
    document.getElementById('episode').value = 1;
    document.getElementById('totalSeasons').value = '';
    document.getElementById('poster').value = '';
}

// 4. CRUD Operations
async function saveShow() {
    const idInput = document.getElementById('showId').value;
    const title = document.getElementById('title').value.trim();
    if (!title) return alert("Title required");

    const season = parseInt(document.getElementById('season').value) || 1;
    const episode = parseInt(document.getElementById('episode').value) || 1;
    const totalSeasons = document.getElementById('totalSeasons').value ? parseInt(document.getElementById('totalSeasons').value) : null;
    const posterFile = document.getElementById('poster').files[0];

    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    // Logic: If ID exists, we are updating. We need to preserve the old poster if no new one is uploaded.
    let showData = {
        title, season, episode, totalSeasons, updated: Date.now()
    };

    if (idInput) {
        // Update existing
        const id = parseInt(idInput);
        store.get(id).onsuccess = async (e) => {
            const oldData = e.target.result;
            showData.id = id;
            // Use new poster if uploaded, otherwise keep old
            showData.poster = posterFile ? await toBase64(posterFile) : oldData.poster;
            
            store.put(showData).onsuccess = () => {
                closeModal();
                renderShows();
            };
        };
    } else {
        // Create new
        showData.poster = posterFile ? await toBase64(posterFile) : null;
        store.add(showData).onsuccess = () => {
            closeModal();
            renderShows();
        };
    }
}

function editShow(id) {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    
    store.get(id).onsuccess = (e) => {
        const show = e.target.result;
        if (!show) return;

        document.getElementById('showId').value = show.id;
        document.getElementById('title').value = show.title;
        document.getElementById('season').value = show.season;
        document.getElementById('episode').value = show.episode;
        document.getElementById('totalSeasons').value = show.totalSeasons || '';
        
        openModal(true);
    };
}

function renderShows() {
    const container = document.getElementById('showList');
    container.innerHTML = '';
    
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    
    store.getAll().onsuccess = (e) => {
        const shows = e.target.result;
        
        if (shows.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; color: #666; padding: 40px;">
                    No shows yet. Click + Add to start.
                </div>`;
            return;
        }

        shows.sort((a,b) => b.updated - a.updated).forEach(show => {
            const card = document.createElement('div');
            card.className = 'card';
            
            const imgHtml = show.poster 
                ? `<img src="${show.poster}" alt="${show.title}">` 
                : `<div class="poster-placeholder"><span>${show.title.substring(0,2).toUpperCase()}</span></div>`;

            // Status Logic
            const statusHtml = determineStatus(show);

            card.innerHTML = `
                <div class="poster-slot">${imgHtml}</div>
                <div class="card-content">
                    <div class="card-title">${show.title}</div>
                    
                    <div class="next-label">Up Next:</div>
                    <div class="card-stats">
                        <span>S: <b>${show.season}</b></span>
                        <span>E: <b>${show.episode}</b></span>
                    </div>
                    ${statusHtml}
                </div>
                <div class="card-actions">
                    <button class="secondary" onclick="updateProgress(${show.id}, 0, 1)">+Ep</button>
                    <button class="secondary" onclick="updateProgress(${show.id}, 1, 0)">+Sz</button>
                    <button class="secondary" onclick="editShow(${show.id})" title="Edit">✎</button>
                    <button class="danger" onclick="deleteShow(${show.id})" title="Delete">×</button>
                </div>
            `;
            container.appendChild(card);
        });
    };
}

function determineStatus(show) {
    if (!show.totalSeasons) return ''; // No total set, no badge

    // Logic: 
    // If Current Season > Total -> Completed
    // If Current Season == Total -> Final Season
    // If Current Season > 1 AND Episode is 1 -> Just finished previous season
    
    if (show.season > show.totalSeasons) {
        return `<div class="status-badge">Completed! 🎉</div>`;
    }
    
    if (show.season === show.totalSeasons) {
         if (show.episode === 1 && show.season > 1) {
             return `<div class="status-badge">Season ${show.season - 1} Finished</div>`;
         }
        return `<div class="status-badge" style="color:#bb86fc">Final Season</div>`;
    }

    if (show.season > 1 && show.episode === 1) {
        return `<div class="status-badge">Season ${show.season - 1} Finished</div>`;
    }

    // Default: Show progress (e.g. 2/5 Seasons)
    return `<div class="status-badge" style="color:#888; background:transparent; padding-left:0;">${show.season}/${show.totalSeasons} Seasons</div>`;
}

function updateProgress(id, dS, dE) {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    
    store.get(id).onsuccess = (e) => {
        const data = e.target.result;
        if (!data) return;

        if (dS > 0) {
            data.season += dS;
            data.episode = 1; // Reset ep on new season
        } else {
            data.episode += dE;
        }
        
        data.updated = Date.now();
        store.put(data);
        tx.oncomplete = () => renderShows();
    };
}

function deleteShow(id) {
    if (!confirm("Remove this show?")) return;
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => renderShows();
}

// 5. Utilities
function toBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

function exportData() {
    const tx = db.transaction(STORE_NAME, "readonly");
    tx.objectStore(STORE_NAME).getAll().onsuccess = (e) => {
        const data = JSON.stringify(e.target.result);
        const blob = new Blob([data], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ofluff_backup_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
    };
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const shows = JSON.parse(e.target.result);
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            
            await store.clear();
            shows.forEach(show => {
                // If importing old backups without ID, we can let autoIncrement handle it or use existing logic
                // Deleting ID ensures we don't conflict with key paths if schematic changes occur, 
                // but usually fine to keep if migrating same DB
                delete show.id; 
                store.add(show);
            });

            tx.oncomplete = () => {
                renderShows();
                alert("Restored!");
            };
        } catch (err) {
            alert("Invalid Backup File");
        }
    };
    reader.readAsText(file);
}
