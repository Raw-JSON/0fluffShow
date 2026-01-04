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
const request = indexedDB.open(DB_NAME, 1);
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
function openModal() {
    document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal').classList.add('hidden');
    document.getElementById('title').value = '';
    document.getElementById('season').value = 1;
    document.getElementById('episode').value = 1;
    document.getElementById('poster').value = '';
}

// 4. CRUD Operations
async function saveShow() {
    const title = document.getElementById('title').value.trim();
    if (!title) return alert("Title required");

    const season = parseInt(document.getElementById('season').value) || 1;
    const episode = parseInt(document.getElementById('episode').value) || 1;
    const posterFile = document.getElementById('poster').files[0];

    let posterBase64 = null;
    if (posterFile) {
        posterBase64 = await toBase64(posterFile);
    }

    const show = { 
        title, 
        season, 
        episode, 
        poster: posterBase64, 
        updated: Date.now() 
    };
    
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add(show);
    tx.oncomplete = () => {
        closeModal();
        renderShows();
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
                    No shows yet.
                </div>`;
            return;
        }

        // Sort by most recently updated
        shows.sort((a,b) => b.updated - a.updated).forEach(show => {
            const card = document.createElement('div');
            card.className = 'card';
            
            const imgHtml = show.poster 
                ? `<img src="${show.poster}" alt="${show.title}">` 
                : `<div class="poster-placeholder"><span>${show.title.substring(0,2).toUpperCase()}</span></div>`;

            card.innerHTML = `
                <div class="poster-slot">${imgHtml}</div>
                <div class="card-content">
                    <div class="card-title">${show.title}</div>
                    <div class="card-stats">
                        <span>S: <b>${show.season}</b></span>
                        <span>E: <b>${show.episode}</b></span>
                    </div>
                </div>
                <div class="card-actions">
                    <button class="secondary" onclick="updateProgress(${show.id}, 0, 1)">+Ep</button>
                    <button class="secondary" onclick="updateProgress(${show.id}, 1, 0)">+Sz</button>
                    <button class="danger" onclick="deleteShow(${show.id})">×</button>
                </div>
            `;
            container.appendChild(card);
        });
    };
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
