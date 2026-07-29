import config from "js/config.js";

export default class GroqProvider {

    async sendMessage(message) {

        try {

            const response = await fetch(
                "https://api.groq.com/openai/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${config.providers.groq.apiKey}`
                    },
                    body: JSON.stringify({
                        model: "llama-3.3-70b-versatile",
                        messages: [
                            {
                                role: "user",
                                content: message
                            }
                        ]
                    })
                }
            );

            if (!response.ok) {
                return `Groq Hatası (${response.status})`;
            }

            const data = await response.json();

            return data.choices[0].message.content;

        } catch (error) {

            console.error(error);

            return "Groq bağlantısı başarısız.";

        }

    }

}
