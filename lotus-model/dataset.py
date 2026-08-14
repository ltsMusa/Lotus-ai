# ==========================================================
# LOTUS MINI — DATASET
# Version: 0.1
# ==========================================================

import torch
from torch.utils.data import Dataset


class LotusTextDataset(Dataset):

    def __init__(
        self,
        texts,
        tokenizer,
        block_size=128
    ):

        self.tokenizer = tokenizer
        self.block_size = block_size

        self.samples = []

        # --------------------------------------------------
        # TEXT → TOKEN IDS
        # --------------------------------------------------

        for text in texts:

            ids = tokenizer.encode(
                text,
                add_special_tokens=True
            )

            # Çok kısa örnekleri atla.
            if len(ids) < 2:
                continue

            # Modelin maksimum context uzunluğunu aşma.
            ids = ids[:block_size + 1]

            self.samples.append(
                torch.tensor(
                    ids,
                    dtype=torch.long
                )
            )


    # ------------------------------------------------------
    # LENGTH
    # ------------------------------------------------------

    def __len__(self):

        return len(self.samples)


    # ------------------------------------------------------
    # GET ITEM
    # ------------------------------------------------------

    def __getitem__(self, index):

        tokens = self.samples[index]

        # Girdi:
        # [BOS, Merhaba, ...]
        input_ids = tokens[:-1]

        # Hedef:
        # [Merhaba, ..., EOS]
        target_ids = tokens[1:]

        return {
            "input_ids": input_ids,
            "target_ids": target_ids
        }


# ==========================================================
# COLLATE
# ==========================================================

def lotus_collate(batch):

    max_length = max(
        len(sample["input_ids"])
        for sample in batch
    )

    input_ids = []
    target_ids = []

    pad_id = 0

    for sample in batch:

        input_tensor = sample["input_ids"]
        target_tensor = sample["target_ids"]

        padding = max_length - len(input_tensor)

        input_tensor = torch.nn.functional.pad(
            input_tensor,
            (0, padding),
            value=pad_id
        )

        target_tensor = torch.nn.functional.pad(
            target_tensor,
            (0, padding),
            value=-100
        )

        input_ids.append(input_tensor)
        target_ids.append(target_tensor)

    return {
        "input_ids": torch.stack(input_ids),
        "target_ids": torch.stack(target_ids)
    }


# ==========================================================
# TEST
# ==========================================================

if __name__ == "__main__":

    from tokenizer import LotusTokenizer


    texts = [
        "Merhaba, ben Lotus.",
        "Lotus bir yapay zeka projesidir.",
        "Lotus Türkçe konuşmayı öğreniyor.",
        "Ben Lotus'um.",
        "Merhaba dünya!"
    ]


    tokenizer = LotusTokenizer()

    tokenizer.build_vocab(texts)


    dataset = LotusTextDataset(
        texts,
        tokenizer,
        block_size=128
    )


    print("🌸 Lotus Dataset çalışıyor!")
    print()

    print(
        "Örnek sayısı:",
        len(dataset)
    )

    print(
        "Vocabulary:",
        tokenizer.vocab_size
    )


    sample = dataset[0]

    print(
        "Input:",
        sample["input_ids"]
    )

    print(
        "Target:",
        sample["target_ids"]
    )
