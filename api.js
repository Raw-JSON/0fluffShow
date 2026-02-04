const API_BASE = "https://api.themoviedb.org/3";
const IMG_BASE = "https://image.tmdb.org/t/p/w500";

const API = {
    key: null,

    async init() {
        this.key = await DB.getSetting('tmdb_key');
    },

    hasKey() { return !!this.key; },

    async search(query) {
        if (!this.key || !query) return [];
        try {
            const res = await fetch(`${API_BASE}/search/tv?api_key=${this.key}&query=${encodeURIComponent(query)}`);
            const data = await res.json();
            return data.results ? data.results.slice(0, 5) : [];
        } catch (e) { console.error(e); return []; }
    },

    async getDetails(tmdbId) {
        if (!this.key) return null;
        try {
            const res = await fetch(`${API_BASE}/tv/${tmdbId}?api_key=${this.key}`);
            const data = await res.json();
            
            const seasonsMap = data.seasons
                .filter(s => s.season_number > 0)
                .map(s => ({
                    number: s.season_number,
                    episodes: s.episode_count
                }));

            return {
                tmdbId: data.id,
                title: data.name,
                poster: data.poster_path ? IMG_BASE + data.poster_path : null,
                status: data.status,
                rating: data.vote_average ? data.vote_average.toFixed(1) : null,
                overview: data.overview,
                seasonData: seasonsMap
            };
        } catch (e) { console.error(e); return null; }
    },

    // NEW: Fetch specific season details (Episode Names)
    async getSeasonDetails(tmdbId, seasonNum) {
        if (!this.key) return null;
        try {
            const res = await fetch(`${API_BASE}/tv/${tmdbId}/season/${seasonNum}?api_key=${this.key}`);
            const data = await res.json();
            return data.episodes; // Returns array of episode objects { name, episode_number, etc. }
        } catch (e) { console.error(e); return null; }
    }
};
