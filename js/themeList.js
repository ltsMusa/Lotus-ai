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
    }
];

/** Always returns the id of a real theme. */
export function normalizeTheme(id) {

    return THEMES.some(theme => theme.id === id) ? id : DEFAULT_THEME;
}

export function themeById(id) {

    return THEMES.find(theme => theme.id === normalizeTheme(id));
}
