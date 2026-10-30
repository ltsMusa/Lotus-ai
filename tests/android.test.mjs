// Tests for the Android packaging: the AIDE project (android/) and the cloud
// build (tools/android-ci + .github/workflows/android-apk.yml) must agree, and
// nothing in the resources may trip the stricter aapt2 used by the cloud build.
// Run:  node --test tests/android.test.mjs
//
// The web-only package ships without android/, so everything here is skipped
// when that folder is missing.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = path => readFile(join(root, path), "utf8");
const hasAndroid = existsSync(join(root, "android/app/build.gradle"));
const hasCi = existsSync(join(root, "tools/android-ci/app/build.gradle"));

const walk = async dir => {
    const out = [];
    for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) out.push(...await walk(path));
        else out.push(path);
    }
    return out;
};

// "versionCode 72" / "versionName "7.0-beta.1"" / "targetSdk 35" / "targetSdkVersion 35"
const field = (gradle, name) => {
    const match = gradle.match(new RegExp(`^\\s*${name}\\s+["']?([^"'\\s]+)["']?`, "m"));
    return match ? match[1] : null;
};

test("target SDK is high enough for Play Protect (no 'older Android' warning)", { skip: !hasAndroid }, async () => {
    const gradle = await read("android/app/build.gradle");
    const target = Number(field(gradle, "targetSdkVersion"));

    // Play Protect warns when the target is more than 2 API levels below the phone's.
    // 35 stays quiet up to Android 17 (API 37).
    assert.ok(target >= 35, `targetSdkVersion ${target} is too old`);
    assert.ok(Number(field(gradle, "minSdkVersion")) <= 24);
});

test("the cloud build mirrors the AIDE project's identity and versions", { skip: !(hasAndroid && hasCi) }, async () => {
    const aide = await read("android/app/build.gradle");
    const ci = await read("tools/android-ci/app/build.gradle");

    assert.equal(field(ci, "applicationId"), field(aide, "applicationId"));
    assert.equal(field(ci, "versionCode"), field(aide, "versionCode"));
    assert.equal(field(ci, "versionName"), field(aide, "versionName"));
    assert.equal(field(ci, "minSdk"), field(aide, "minSdkVersion"));
    assert.equal(field(ci, "targetSdk"), field(aide, "targetSdkVersion"));

    // AGP 8 needs the namespace in Gradle; it must match the manifest's package.
    const manifest = await read("android/app/src/main/AndroidManifest.xml");
    const manifestPackage = manifest.match(/package="([^"]+)"/)[1];
    assert.equal(field(ci, "namespace"), manifestPackage);
    assert.equal(field(ci, "applicationId"), manifestPackage);

    // It builds the very same sources — not a copy that could drift.
    for (const dir of ["java", "res", "assets"]) {
        assert.ok(ci.includes(`\${androidMain}/${dir}`), `${dir} is not read from android/`);
    }
    assert.match(ci, /def androidMain = '\.\.\/\.\.\/\.\.\/android\/app\/src\/main'/);
});

test("package.json version, APK versionName and the release tag line up", { skip: !hasAndroid }, async () => {
    const pkg = JSON.parse(await read("package.json"));
    const gradle = await read("android/app/build.gradle");
    // 7.0.0-beta.1 (npm style) vs 7.0-beta.1 (Android versionName)
    assert.equal(pkg.version.replace(/^(\d+)\.(\d+)\.0-/, "$1.$2-"), field(gradle, "versionName"));
});

test("resources only hold files aapt2 accepts (the stray 'A' file broke it)", { skip: !hasAndroid }, async () => {
    for (const file of await walk("android/app/src/main/res")) {
        const name = file.split("/").pop();
        assert.ok([".xml", ".png"].includes(extname(name)), `${file}: only .xml / .png belong in res/`);
        assert.match(name, /^[a-z0-9_.]+$/, `${file}: resource names are [a-z0-9_.] only`);
    }
});

test("no signing key is committed", { skip: !hasAndroid }, async () => {
    const files = [...await walk("android"), ...(hasCi ? await walk("tools/android-ci") : [])];
    const keys = files.filter(file => /\.(jks|keystore|p12|pfx)$/i.test(file));
    assert.deepEqual(keys, []);

    if (hasCi) {
        const ci = await read("tools/android-ci/app/build.gradle");
        assert.match(ci, /System\.getenv\('LOTUS_KEYSTORE_PASSWORD'\)/);
        assert.doesNotMatch(ci, /storePassword\s+['"]/);
    }
});

test("workflow builds the CI project and checks what Android 11+ requires", { skip: !existsSync(join(root, ".github/workflows/android-apk.yml")) }, async () => {
    const yml = await read(".github/workflows/android-apk.yml");

    assert.match(yml, /workflow_dispatch:/);
    assert.match(yml, /gradle -p tools\/android-ci assembleRelease/);
    assert.match(yml, /java-version: "17"/);
    assert.match(yml, /gradle-version: "8\.9"/);

    // The build fails (instead of shipping an uninstallable APK) unless all of these hold.
    assert.match(yml, /Verified using v2 scheme/);
    assert.match(yml, /Verified using v3 scheme/);
    assert.match(yml, /targetSdkVersion:'35'/);
    assert.match(yml, /resources\.arsc/);
    assert.match(yml, /zipalign" -c -v 4/);

    // A permanent key comes only from secrets, never from the repo.
    for (const secret of ["ANDROID_KEYSTORE_BASE64", "ANDROID_KEYSTORE_PASSWORD", "ANDROID_KEY_ALIAS", "ANDROID_KEY_PASSWORD"]) {
        assert.ok(yml.includes(`secrets.${secret}`), secret);
    }

    // The tag the APK is attached to follows package.json (v7.0.0-beta.1).
    assert.match(yml, /jq -r \.version package\.json/);
});

test("MainActivity: external links are guarded, edge-to-edge insets only where enforced", { skip: !hasAndroid }, async () => {
    const java = await read("android/app/src/main/java/com/lotusai/app/MainActivity.java");

    // The only raw ACTION_VIEW start is inside openExternal(), which catches a missing browser.
    assert.equal((java.match(/new Intent\(Intent\.ACTION_VIEW/g) || []).length, 1);
    assert.match(java, /private void openExternal\(String url\)[\s\S]*?catch \(ActivityNotFoundException/);
    assert.equal((java.match(/openExternal\(url\)/g) || []).length, 2);

    // Android 15+ with target 35: bars/keyboard no longer shrink the window by themselves.
    assert.match(java, /Build\.VERSION\.SDK_INT < 35 \|\| getApplicationInfo\(\)\.targetSdkVersion < 35/);
    assert.match(java, /setOnApplyWindowInsetsListener/);
    assert.match(java, /getSystemWindowInsetBottom\(\)/);

    // Only APIs that exist in the old compileSdk 29 android.jar (AIDE) — newer ones by name/number.
    assert.doesNotMatch(java, /VANILLA_ICE_CREAM|WindowInsetsCompat|WindowInsets\.Type|OnBackInvokedCallback/);
});
