/**
 * ==========================================================
 * Lotus AI - Theme
 * ==========================================================
 * Lotus AI has one fixed visual identity — the premium purple
 * neon glassmorphism theme defined in css/themes.css. There is
 * no light/dark toggle and no "Görünüm" (Appearance) section in
 * Settings; this file just makes that theme explicit on <html>
 * in case future CSS wants to key off it.
 * ==========================================================
 */

const Themes = {

    current: "neon-purple",

    init() {

        document.documentElement.setAttribute("data-theme", this.current);
    }
};

document.addEventListener("DOMContentLoaded", () => Themes.init());

export default Themes;
