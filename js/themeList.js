/**
 * ==========================================================
 * Lotus AI - Theme list
 * ==========================================================
 * The themes a user can pick in Settings → Kişiselleştirme → Tema.
 * Pure data + validation (no DOM), so config.js and the unit tests
 * can use it; js/themes.js applies the choice to the page.
 *
 * The colors themselves live in css/themes.css, keyed by these ids
 * (:root[data-theme="…"]). `swatch` is only for the little preview
 * cards in Settings, which must look right whichever theme is active.
 * ==========================================================
 */

export const DEFAULT_THEME = "neon-purple";

export const THEMES = [
    {
        id: "neon-purple",
        name: "Lotus Mor",
        hint: "Pembe-mor neon · varsayılan",
        browserColor: "#07060B",
        swatch: { bg: "#07060b", panel: "#15112a", from: "#8b5cf6", to: "#f472b6", text: "#f5f3fa" }
    },
    {
        id: "dark-gray",
        name: "Karanlık",
        hint: "Siyah ve gri",
        browserColor: "#030303",
        swatch: { bg: "#030303", panel: "#151517", from: "#3b3b42", to: "#7a7a85", text: "#f4f4f5" }
    },
    {
        id: "ocean-blue",
        name: "Mavi-Beyaz",
        hint: "Lacivert zemin, mavi ve beyaz",
        browserColor: "#050914",
        swatch: { bg: "#050914", panel: "#0f1c38", from: "#1d4ed8", to: "#38bdf8", text: "#f1f7ff" }
    },
    {
        id: "sun-green",
        name: "Sarı-Yeşil",
        hint: "Orman zemini, yeşil ve sarı",
        browserColor: "#060903",
        swatch: { bg: "#060903", panel: "#141d0b", from: "#16a34a", to: "#facc15", text: "#f7faee" }
    }
];

/** Always returns the id of a real theme. */
export function normalizeTheme(id) {

    return THEMES.some(theme => theme.id === id) ? id : DEFAULT_THEME;
}

export function themeById(id) {

    return THEMES.find(theme => theme.id === normalizeTheme(id));
}
