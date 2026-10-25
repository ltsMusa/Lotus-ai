/**
 * ==========================================================
 * Lotus AI - Theme
 * ==========================================================
 * Applies the chosen theme (Settings → Kişiselleştirme → Tema) by
 * setting data-theme on <html>; css/themes.css holds the colors.
 *
 * index.html also sets data-theme from the saved config in a tiny
 * inline script before the stylesheets load, so a returning user
 * never sees the default theme flash first — this module takes
 * over from there and reacts to changes.
 * ==========================================================
 */

import config from "./config.js";
import { themeById } from "./themeList.js";

const Themes = {

    get current() {

        return config.theme;
    },

    apply(id = config.theme) {

        const theme = themeById(id);

        document.documentElement.setAttribute("data-theme", theme.id);

        // Browser / PWA chrome (address bar, task switcher) follows the theme.
        document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.browserColor);

        return theme;
    },

    init() {

        this.apply();

        window.addEventListener("lotus:theme-changed", event => this.apply(event.detail?.theme));
    }
};

if (document.readyState === "loading") {

    document.addEventListener("DOMContentLoaded", () => Themes.init());

} else {

    Themes.init();
}

export default Themes;
