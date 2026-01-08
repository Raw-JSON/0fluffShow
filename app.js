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
const request = indexedDB.open(DB_NAME, 2);

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

request.onerror = (e) => {
    alert("Database Error: " + e.target.error);
};

// 3. UI Functions
function openModal(editId = null) {
    const modal = document.getElementById('modal');
    const titleHeader = document.getElementById('modalTitle');
    
    // Safety check: ensure modal exists
    if (!modal) return alert("Error: Modal HTML missing. Please clear cache.");

    modal.classList.remove('hidden');

    if (editId && typeof editId === 'number') {
        if(titleHeader) titleHeader.innerText = "Edit Show";
        
        const tx = db.transaction(STORE_NAME, "readonly");
        tx.objectStore(STORE_NAME).get(editId).onsuccess = (e) => {
            const show = e.target.result;
            if (!show) return; // Show might have been deleted

            // Safely set values if elements exist
            setValue('showId', show.id);
            setValue('title', show.title);
            setValue('season', show.season);
            setValue('episode', show.episode);
            setValue('totalSeasons', show.totalSeasons || '');
        };
    } else {
        if(titleHeader) titleHeader.innerText = "Add Show";
        clearModal();
    }
}

function closeModal() {
    const modal = document.getElementById('modal');
    if (modal) modal.classList.add('hidden');
    clearModal();
}

function clearModal() {
    setValue('showId', '');
    setValue('title', '');
    setValue('season', 1);
    setValue('episode', 1);
    setValue('totalSeasons', '');
    setValue('poster', ''); // Clears file input
}

// Helper to safely set value only if element exists
function setValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
}

// 4. CRUD Operations
async function saveShow() {
    try {
        const titleEl = document.getElementById('title');
        const title = titleEl ? titleEl.value.trim() : "";
        if (!title) return alert("Title is required");

        const season = parseInt(document.getElementById('season')?.value || 1);
        const episode = parseInt(document.getElementById('episode')?.value || 1);
        
        const totalInput = document.getElementById('totalSeasons')?.value;
        const totalSeasons = totalInput ? parseInt(totalInput) : null;

        // 1. CONVERT IMAGE FIRST (Outside the transaction)
        const fileInput = document.getElementById('poster');
        const posterFile = fileInput ? fileInput.files[0] : null;
        let newPosterBase64 = null;
        
        if (posterFile) {
            newPosterBase64 = await toBase64(posterFile);
        }

        // 2. NOW START TRANSACTION
        // We only open the transaction AFTER the await finishes
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);

        // Check if we are editing or adding
        const idInput = document.getElementById('showId');
        const editId = idInput && idInput.value ? parseInt(idInput.value) : null;

        if (editId) {
            // EDIT MODE
            store.get(editId).onsuccess = (e) => {
                const existing = e.target.result;
                if (!existing) return;

                const showData = {
                    id: editId,
                    title, 
                    season, 
                    episode, 
                    totalSeasons,
                    // Use new poster if uploaded, otherwise keep old one
                    poster: newPosterBase64 || existing.poster, 
                    updated: Date.now()
                };
                
                store.put(showData);
            };
        } else {
            // ADD MODE
            const showData = {
                title, 
                season, 
                episode, 
                totalSeasons,
                poster: newPosterBase64, // null if no file
                updated: Date.now()
            };
            store.add(showData);
        }

        tx.oncomplete = () => {
            closeModal();
            renderShows();
        };

        tx.onerror = (e) => {
            console.error(e);
            alert("Transaction failed: " + e.target.error);
        };

    } catch (err) {
        alert("Save failed: " + err.message);
    }
}

function renderShows() {
    const list = document.getElementById('showList');
    if (!list) return;

    list.innerHTML = '';
    
    const tx = db.transaction(STORE_NAME, "readonly");
    tx.objectStore(STORE_NAME).getAll().onsuccess = (e) => {
        const shows = e.target.result;
        
        if (!shows || shows.length === 0) {
            list.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:#666;">No shows yet. Click + Add.</div>`;
            return;
        }

        shows.sort((a,b) => (b.updated || 0) - (a.updated || 0));

        shows.forEach(show => {
            const card = document.createElement('div');
            card.className = 'card';
            
            
             // 4. status logic
            const imgHtml = show.poster 
                ? `<div class="poster-slot"><img src="${show.poster}" alt="${show.title}"></div>` 
                : `<div class="poster-slot"><div class="poster-placeholder">${show.title.substring(0,2).toUpperCase()}</div></div>`;

            card.innerHTML = `
                ${imgHtml}
                <div class="card-content">
                    <div class="card-title">${show.title}</div>
                    <div class="next-label">Watch Next</div>
                    <div class="card-stats">
                        <span>S${show.season}</span>
                        <span>E${show.episode}</span>
                    </div>
                    ${statusNote ? `<div class="status-badge">${statusNote}</div>` : ''}
                </div>
                <div class="card-actions">
                    <button onclick="quickUpdate(${show.id}, 0, 1)">+Ep</button>
                    <button onclick="quickUpdate(${show.id}, 1, 0)">+Sz</button>
                    <button onclick="openModal(${show.id})">✎</button>
                    <button class="danger" onclick="deleteShow(${show.id})">×</button>
                </div>
            `;
            list.appendChild(card);
        });
    };
}

function quickUpdate(id, ds, de) {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.get(id).onsuccess = (e) => {
        const data = e.target.result;
        if (!data) return;

        if (ds > 0) {
            data.season += ds;
            data.episode = 1; 
        } else {
            data.episode += de;
        }
        
        data.updated = Date.now();
        store.put(data).onsuccess = () => renderShows();
    };
}

function deleteShow(id) {
    if (!confirm("Delete this show?")) return;
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id).onsuccess = () => renderShows();
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
            const data = JSON.parse(e.target.result);
            if (!Array.isArray(data)) throw new Error("Invalid format");
            
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            
            await store.clear();
            data.forEach(item => {
                // Ensure we don't carry over old IDs if they conflict, 
                // but IndexedDB autoIncrement handles it if we strip ID.
                // However, preserving ID is good for backups if we are completely restoring.
                // For simplicity, we just add them.
                store.put(item); 
            });

            tx.oncomplete = () => {
                renderShows();
                alert("Restored successfully!");
            };
        } catch (err) {
            alert("Backup file invalid: " + err.message);
        }
    };
    reader.readAsText(file);
}
