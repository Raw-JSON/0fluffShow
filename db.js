const DB_NAME = "0fluffDB";
const STORE_SHOWS = "shows";
const STORE_SETTINGS = "settings";

let dbInstance;

const DB = {
    async open() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 3); // Bump version for new store

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_SHOWS)) {
                    db.createObjectStore(STORE_SHOWS, { keyPath: "id", autoIncrement: true });
                }
                if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
                    db.createObjectStore(STORE_SETTINGS, { keyPath: "key" });
                }
            };

            request.onsuccess = (e) => {
                dbInstance = e.target.result;
                resolve(dbInstance);
            };
            request.onerror = (e) => reject(e);
        });
    },

    async getShow(id) {
        if (!dbInstance) await this.open();
        return new Promise((resolve) => {
            const tx = dbInstance.transaction(STORE_SHOWS, "readonly");
            tx.objectStore(STORE_SHOWS).get(id).onsuccess = (e) => resolve(e.target.result);
        });
    },

    async getAllShows() {
        if (!dbInstance) await this.open();
        return new Promise((resolve) => {
            const tx = dbInstance.transaction(STORE_SHOWS, "readonly");
            tx.objectStore(STORE_SHOWS).getAll().onsuccess = (e) => resolve(e.target.result || []);
        });
    },

    async saveShow(data) {
        if (!dbInstance) await this.open();
        return new Promise((resolve, reject) => {
            const tx = dbInstance.transaction(STORE_SHOWS, "readwrite");
            const store = tx.objectStore(STORE_SHOWS);
            
            // If editing, use put, if adding, use add. 
            // IndexedDB put handles both if keyPath exists, but for clarity:
            const req = data.id ? store.put(data) : store.add(data);
            
            req.onsuccess = () => resolve();
            req.onerror = (e) => reject(e);
        });
    },

    async deleteShow(id) {
        if (!dbInstance) await this.open();
        const tx = dbInstance.transaction(STORE_SHOWS, "readwrite");
        tx.objectStore(STORE_SHOWS).delete(id);
    },

    async getSetting(key) {
        if (!dbInstance) await this.open();
        return new Promise((resolve) => {
            const tx = dbInstance.transaction(STORE_SETTINGS, "readonly");
            const req = tx.objectStore(STORE_SETTINGS).get(key);
            req.onsuccess = (e) => resolve(e.target.result ? e.target.result.value : null);
        });
    },

    async saveSetting(key, value) {
        if (!dbInstance) await this.open();
        const tx = dbInstance.transaction(STORE_SETTINGS, "readwrite");
        tx.objectStore(STORE_SETTINGS).put({ key, value });
    },
    
    // For Backup/Restore
    async clearShows() {
         if (!dbInstance) await this.open();
         const tx = dbInstance.transaction(STORE_SHOWS, "readwrite");
         tx.objectStore(STORE_SHOWS).clear();
    }
};
