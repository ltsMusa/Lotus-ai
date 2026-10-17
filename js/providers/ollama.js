console.log("ollama.js yüklendi");

import config from "../config.js";
import { fetchWithTimeout } from "../utils.js";
import DeviceProfile from "../deviceProfile.js";
import { ProviderError } from "./providerError.js";

/**
 * Ollama does NOT run on the phone itself — it's a desktop/server
 * process. This provider talks to whatever Ollama instance is
 * reachable at config.providers.ollama.baseUrl (default:
 * http://localhost:11434, i.e. Ollama running on the same machine
 * as the browser). To use this from a phone, point baseUrl at an
 * Ollama server on the same network (e.g. your PC's LAN IP).
 */

function toOllamaMessages(history, systemPrompt) {

    return [{ role: "system", content: systemPrompt }, ...history];
}

export default class OllamaProvider {

    async sendMessage({ history = [], systemPrompt = "" } = {}) {

        const baseUrl = config.providers.ollama.baseUrl || "http://localhost:11434";
        const model = config.providers.ollama.model || DeviceProfile.getModel();

        const startedAt = Date.now();

        let response;

        try {

            response = await fetchWithTimeout(
                `${baseUrl}/api/chat`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model,
                        messages: toOllamaMessages(history, systemPrompt),
                        stream: false
                    })
                },
                30000
            );

        } catch (error) {

            if (error.code === "TIMEOUT") throw new ProviderError("Yerel Ollama sunucusu yanıt vermedi (zaman aşımı).", "TIMEOUT");

            throw new ProviderError(
                `Yerel Ollama sunucusuna ulaşılamadı (${baseUrl}). Ollama çalışıyor mu ve adres doğru mu?`,
                "NETWORK"
            );
        }

        DeviceProfile.reportLatency(Date.now() - startedAt);

        if (!response.ok) {

            throw new ProviderError(`Ollama hatası (${response.status})`, "SERVER");
        }

        const data = await response.json();

        const text = data?.message?.content;

        if (!text) throw new ProviderError("Ollama boş yanıt döndürdü.", "SERVER");

        return text;
    }

    async sendMessageStream({ history = [], systemPrompt = "" } = {}, onToken, controller = null) {

        const baseUrl = config.providers.ollama.baseUrl || "http://localhost:11434";
        const model = config.providers.ollama.model || DeviceProfile.getModel();

        const startedAt = Date.now();

        let fullText = "";

        try {

            // Ollama's /api/chat streams newline-delimited JSON, not
            // "data: " SSE — read and parse manually rather than reusing
            // streamSSE (which expects the "data:" prefix).
            const response = await fetch(`${baseUrl}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model,
                    messages: toOllamaMessages(history, systemPrompt),
                    stream: true
                }),
                signal: controller?.signal
            });

            if (!response.ok || !response.body) {

                throw new ProviderError(`Ollama hatası (${response.status})`, "SERVER");
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            let buffer = "";

            while (true) {

                const { value, done } = await reader.read();

                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split("\n");

                buffer = lines.pop() ?? "";

                for (const line of lines) {

                    if (!line.trim()) continue;

                    try {

                        const json = JSON.parse(line);

                        const delta = json?.message?.content;

                        if (delta) {

                            fullText += delta;

                            onToken?.(delta, fullText);
                        }

                    } catch {

                        // partial line, ignore
                    }
                }
            }

        } catch (error) {

            if (error instanceof ProviderError) throw error;

            if (error.name === "AbortError") {

                throw new ProviderError(
                    controller?.userStopped ? "Yanıt kullanıcı tarafından durduruldu." : "Ollama isteği zaman aşımına uğradı.",
                    controller?.userStopped ? "ABORTED" : "TIMEOUT"
                );
            }

            throw new ProviderError(
                `Yerel Ollama sunucusuna ulaşılamadı (${baseUrl}). Ollama çalışıyor mu ve adres doğru mu?`,
                "NETWORK"
            );
        }

        DeviceProfile.reportLatency(Date.now() - startedAt);

        if (!fullText) throw new ProviderError("Ollama boş yanıt döndürdü.", "SERVER");

        return fullText;
    }

    /** Lists models actually installed on the target Ollama server. */
    async listInstalledModels() {

        const baseUrl = config.providers.ollama.baseUrl || "http://localhost:11434";

        try {

            const response = await fetchWithTimeout(`${baseUrl}/api/tags`, {}, 5000);

            if (!response.ok) return [];

            const data = await response.json();

            return (data?.models || []).map(m => m.name);

        } catch {

            return [];
        }
    }
}
