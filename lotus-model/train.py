# ==========================================================
# LOTUS MINI — TRAINING
# Version: 0.1
# ==========================================================

import torch
import torch.nn as nn
from pathlib import Path

from model import LotusMini, LotusConfig
from tokenizer import LotusTokenizer


# ==========================================================
# SETTINGS
# ==========================================================

DATA_PATH = Path("data/train.txt")
TOKENIZER_PATH = Path("data/tokenizer.json")
MODEL_PATH = Path("data/lotus-mini-v0.1.pt")

EPOCHS = 20
BATCH_SIZE = 4
LEARNING_RATE = 0.001

DEVICE = torch.device(
    "cuda" if torch.cuda.is_available()
    else "cpu"
)


# ==========================================================
# LOAD DATA
# ==========================================================

def load_text():

    if not DATA_PATH.exists():

        raise FileNotFoundError(
            f"Eğitim verisi bulunamadı: {DATA_PATH}"
        )

    return DATA_PATH.read_text(
        encoding="utf-8"
    )


# ==========================================================
# CREATE TRAINING SEQUENCE
# ==========================================================

def create_training_data(
    tokenizer,
    text,
    block_size
):

    token_ids = tokenizer.encode(
        text,
        add_special_tokens=False
    )

    if len(token_ids) <= block_size:

        raise ValueError(
            "Eğitim verisi block_size değerinden "
            "daha uzun olmalı."
        )


    inputs = []
    targets = []


    for i in range(
        0,
        len(token_ids) - block_size
    ):

        chunk = token_ids[
            i:i + block_size + 1
        ]

        inputs.append(
            chunk[:-1]
        )

        targets.append(
            chunk[1:]
        )


    return (
        torch.tensor(
            inputs,
            dtype=torch.long
        ),
        torch.tensor(
            targets,
            dtype=torch.long
        )
    )


# ==========================================================
# TRAIN
# ==========================================================

def train():

    print("🌸 Lotus Mini eğitim başlıyor...")
    print("Cihaz:", DEVICE)


    # ------------------------------------------------------
    # DATA
    # ------------------------------------------------------

    text = load_text()


    # ------------------------------------------------------
    # TOKENIZER
    # ------------------------------------------------------

    tokenizer = LotusTokenizer()

    tokenizer.build_vocab(
        [text]
    )


    print(
        "Vocabulary:",
        tokenizer.vocab_size
    )


    # ------------------------------------------------------
    # CONFIG
    # ------------------------------------------------------

    config = LotusConfig()

    # Tokenizer vocabulary modelle aynı olmalı.
    config.vocab_size = tokenizer.vocab_size


    # ------------------------------------------------------
    # TRAINING DATA
    # ------------------------------------------------------

    inputs, targets = create_training_data(
        tokenizer,
        text,
        config.block_size
    )


    print(
        "Training samples:",
        len(inputs)
    )


    # ------------------------------------------------------
    # MODEL
    # ------------------------------------------------------

    model = LotusMini(
        config
    ).to(DEVICE)


    parameter_count = sum(
        parameter.numel()
        for parameter in model.parameters()
    )


    print(
        "Parametre sayısı:",
        f"{parameter_count:,}"
    )


    # ------------------------------------------------------
    # OPTIMIZER
    # ------------------------------------------------------

    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=LEARNING_RATE
    )


    # ------------------------------------------------------
    # LOSS
    # ------------------------------------------------------

    criterion = nn.CrossEntropyLoss()


    # ------------------------------------------------------
    # TRAINING LOOP
    # ------------------------------------------------------

    model.train()


    for epoch in range(EPOCHS):

        total_loss = 0.0


        permutation = torch.randperm(
            len(inputs)
        )


        for start in range(
            0,
            len(inputs),
            BATCH_SIZE
        ):

            indices = permutation[
                start:start + BATCH_SIZE
            ]


            batch_inputs = inputs[
                indices
            ].to(DEVICE)


            batch_targets = targets[
                indices
            ].to(DEVICE)


            optimizer.zero_grad()


            logits = model(
                batch_inputs
            )


            loss = criterion(
                logits.reshape(-1, config.vocab_size),
                batch_targets.reshape(-1)
            )


            loss.backward()


            # Eğitim sırasında aşırı büyük
            # gradientleri engelle.
            torch.nn.utils.clip_grad_norm_(
                model.parameters(),
                1.0
            )


            optimizer.step()


            total_loss += loss.item()


        average_loss = (
            total_loss
            /
            max(
                1,
                (len(inputs) + BATCH_SIZE - 1)
                // BATCH_SIZE
            )
        )


        print(
            f"Epoch {epoch + 1:02d}/{EPOCHS} "
            f"| Loss: {average_loss:.4f}"
        )


    # ------------------------------------------------------
    # SAVE
    # ------------------------------------------------------

    MODEL_PATH.parent.mkdir(
        parents=True,
        exist_ok=True
    )


    TOKENIZER_PATH.parent.mkdir(
        parents=True,
        exist_ok=True
    )


    torch.save(
        {
            "model_state_dict":
                model.state_dict(),

            "config":
                config.__dict__
        },
        MODEL_PATH
    )


    tokenizer.save(
        TOKENIZER_PATH
    )


    print()
    print("🌸 Eğitim tamamlandı!")
    print(
        "Model:",
        MODEL_PATH
    )
    print(
        "Tokenizer:",
        TOKENIZER_PATH
    )


# ==========================================================
# START
# ==========================================================

if __name__ == "__main__":

    train()
