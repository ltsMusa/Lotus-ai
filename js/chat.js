const messageInput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");
const chat = document.getElementById("chat");


function addMessage(text, type) {

    const message = document.createElement("div");

    message.className = `message ${type}-message`;

    message.innerHTML = `
        <div class="message-content">
            ${text}
        </div>
    `;

    chat.appendChild(message);

    chat.scrollTop = chat.scrollHeight;
}


function sendMessage() {

    const text = messageInput.value.trim();

    if (!text) return;


    addMessage(text, "user");

    messageInput.value = "";


    localResponse(text);

}


function localResponse(text) {

    const message = text.toLowerCase();


    if (message.includes("merhaba") ||
        message.includes("selam")) {

        addMessage(
            "Merhaba! Ben Lotus AI. Sana nasıl yardımcı olabilirim?",
            "ai"
        );

        return;
    }


    if (message.includes("sen kimsin")) {

        addMessage(
            "Ben Lotus AI, kişisel yapay zeka asistanınım.",
            "ai"
        );

        return;
    }


    addMessage(
        "Bu konuda henüz API bağlantım yok ama yakında öğrenebileceğim.",
        "ai"
    );

}


sendButton.addEventListener(
    "click",
    sendMessage
);


messageInput.addEventListener(
    "keydown",
    (event) => {

        if (event.key === "Enter" && !event.shiftKey) {

            event.preventDefault();

            sendMessage();

        }

    }
);