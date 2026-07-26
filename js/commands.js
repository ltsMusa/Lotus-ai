function getTime() {

    const now = new Date();

    return now.toLocaleTimeString("tr-TR", {
        hour: "2-digit",
        minute: "2-digit"
    });

}


function getDate() {

    const now = new Date();

    return now.toLocaleDateString("tr-TR");

}


export function checkCommand(text) {

    const message = text.toLowerCase();


    if (message.includes("saat kaç")) {

        return `Saat şu an ${getTime()}`;

    }


    if (message.includes("tarih")) {

        return `Bugünün tarihi ${getDate()}`;

    }


    return null;

}