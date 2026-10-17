/**
 * Shared error type for all providers, so APIManager can decide
 * whether to fall back to the next provider (rate limit, auth,
 * network, timeout, server error) without parsing message strings.
 */
export class ProviderError extends Error {

    constructor(message, code) {

        super(message);

        this.name = "ProviderError";

        // "RATE_LIMIT" | "AUTH" | "TIMEOUT" | "NETWORK" | "NO_KEY" | "SERVER" | "UNKNOWN"
        this.code = code || "UNKNOWN";
    }
}

export function classifyHttpStatus(status) {

    if (status === 401 || status === 403) return "AUTH";

    if (status === 404) return "NOT_FOUND";

    if (status === 429) return "RATE_LIMIT";

    if (status >= 500) return "SERVER";

    return "UNKNOWN";
}
