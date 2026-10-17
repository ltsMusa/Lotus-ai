# ==========================================================
# LOTUS MINI — GENERATION
# Version: 0.1
# ==========================================================

import torch
from pathlib import Path

from model import LotusMini, LotusConfig
from tokenizer import LotusTokenizer


# ==========================================================
# SETTINGS
# ==========================================================

MODEL_PATH = Path("data/lotus-mini-v0.1.pt")
TOKENIZER_PATH = Path("data/tokenizer.json")

DEVICE = torch.device("cpu")

MAX_NEW_TOKENS = 30


# ==========================================================
# LOAD TOKENIZER
# ==========================================================

tokenizer = LotusTokenizer.load(
    TOKENIZER_PATH
)


# ==========================================================
# LOAD MODEL
# ==========================================================

checkpoint = torch.load(
    MODEL_PATH,
    map_location=DEVICE,
    weights_only=False
)


config = LotusConfig()

for key, value in checkpoint["config"].items():

    setattr(
        config,
        key,
        value
    )


model = LotusMini(
    config
).to(DEVICE)


model.load_state_dict(
    checkpoint["model_state_dict"]
)

model.eval()


# ==========================================================
# GENERATE
# ==========================================================

def generate(
    prompt,
    max_new_tokens=MAX_NEW_TOKENS
):

    input_ids = tokenizer.encode(
        prompt,
        add_special_tokens=True
    )

    input_ids = torch.tensor(
        [input_ids],
        dtype=torch.long,
        device=DEVICE
    )


    with torch.no_grad():

        for _ in range(max_new_tokens):

            # Modelin context sınırını aşma.
            context = input_ids[
                :, -config.block_size:
            ]


            logits = model(
                context
            )


            # Son token'ın tahminleri.
            next_token_logits = logits[
                :, -1, :
            ]


            # En yüksek olasılıklı token.
            next_token = torch.argmax(
                next_token_logits,
                dim=-1,
                keepdim=True
            )


            input_ids = torch.cat(
                [
                    input_ids,
                    next_token
                ],
                dim=1
            )


            # EOS geldiyse dur.
            if (
                next_token.item()
                ==
                tokenizer.token_to_id[
                    tokenizer.EOS
                ]
            ):

                break


    generated_ids = input_ids[
        0
    ].tolist()


    return tokenizer.decode(
        generated_ids
    )


# ==========================================================
# CHAT
# ==========================================================

print()
print("========================================")
print("🌸 LOTUS MINI — İLK KONUŞMA")
print("========================================")
print()
print("Lotus hazır.")
print("Çıkmak için 'çıkış' yaz.")
print()


while True:

    prompt = input(
        "Sen: "
    ).strip()


    if prompt.lower() in [
        "çıkış",
        "exit",
        "quit"
    ]:

        print()
        print("🌸 Lotus: Görüşürüz!")
        break


    if not prompt:

        continue


    response = generate(
        prompt
    )


    print(
        "🌸 Lotus:",
        response
  )
