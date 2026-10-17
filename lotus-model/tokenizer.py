# ==========================================================
# LOTUS MINI — TOKENIZER
# Version: 0.1
# ==========================================================

import json
import re
from pathlib import Path


class LotusTokenizer:

    PAD = "<PAD>"
    UNK = "<UNK>"
    BOS = "<BOS>"
    EOS = "<EOS>"

    SPECIAL_TOKENS = [
        PAD,
        UNK,
        BOS,
        EOS
    ]


    # ------------------------------------------------------
    # INIT
    # ------------------------------------------------------

    def __init__(self, vocab=None):

        if vocab is None:

            self.token_to_id = {
                token: index
                for index, token in enumerate(
                    self.SPECIAL_TOKENS
                )
            }

        else:

            self.token_to_id = vocab


        self.id_to_token = {
            index: token
            for token, index
            in self.token_to_id.items()
        }


    # ------------------------------------------------------
    # BASIC TOKENIZATION
    # ------------------------------------------------------

    def split_text(self, text):

        text = str(text)

        # Türkçe karakterleri koruyarak
        # kelime, sayı ve noktalama işaretlerini ayır.
        tokens = re.findall(
            r"\w+|[^\w\s]",
            text,
            flags=re.UNICODE
        )

        return tokens


    # ------------------------------------------------------
    # BUILD VOCABULARY
    # ------------------------------------------------------

    def build_vocab(
        self,
        texts,
        min_frequency=1
    ):

        frequencies = {}


        for text in texts:

            tokens = self.split_text(text)

            for token in tokens:

                frequencies[token] = (
                    frequencies.get(token, 0) + 1
                )


        for token, frequency in frequencies.items():

            if frequency >= min_frequency:

                if token not in self.token_to_id:

                    new_id = len(
                        self.token_to_id
                    )

                    self.token_to_id[token] = new_id

                    self.id_to_token[new_id] = token


    # ------------------------------------------------------
    # ENCODE
    # ------------------------------------------------------

    def encode(
        self,
        text,
        add_special_tokens=True
    ):

        tokens = self.split_text(text)

        ids = []


        if add_special_tokens:

            ids.append(
                self.token_to_id[self.BOS]
            )


        unk_id = self.token_to_id[self.UNK]


        for token in tokens:

            ids.append(
                self.token_to_id.get(
                    token,
                    unk_id
                )
            )


        if add_special_tokens:

            ids.append(
                self.token_to_id[self.EOS]
            )


        return ids


    # ------------------------------------------------------
    # DECODE
    # ------------------------------------------------------

    def decode(
        self,
        ids,
        skip_special_tokens=True
    ):

        tokens = []


        for token_id in ids:

            token = self.id_to_token.get(
                int(token_id),
                self.UNK
            )


            if (
                skip_special_tokens
                and token in self.SPECIAL_TOKENS
            ):

                continue


            tokens.append(token)


        # Noktalama işaretlerinden önce boşluk bırakma.
        text = " ".join(tokens)

        text = re.sub(
            r"\s+([.,!?;:%)\]}])",
            r"\1",
            text
        )

        text = re.sub(
            r"([(\[{])\s+",
            r"\1",
            text
        )

        return text


    # ------------------------------------------------------
    # VOCAB SIZE
    # ------------------------------------------------------

    @property
    def vocab_size(self):

        return len(
            self.token_to_id
        )


    # ------------------------------------------------------
    # SAVE
    # ------------------------------------------------------

    def save(self, path):

        path = Path(path)

        path.parent.mkdir(
            parents=True,
            exist_ok=True
        )


        data = {
            "token_to_id":
                self.token_to_id
        }


        with open(
            path,
            "w",
            encoding="utf-8"
        ) as file:

            json.dump(
                data,
                file,
                ensure_ascii=False,
                indent=2
            )


    # ------------------------------------------------------
    # LOAD
    # ------------------------------------------------------

    @classmethod
    def load(cls, path):

        with open(
            path,
            "r",
            encoding="utf-8"
        ) as file:

            data = json.load(file)


        return cls(
            vocab=data["token_to_id"]
        )


# ==========================================================
# TEST
# ==========================================================

if __name__ == "__main__":

    tokenizer = LotusTokenizer()


    texts = [
        "Merhaba, ben Lotus.",
        "Lotus bir yapay zeka projesidir.",
        "Lotus Türkçe konuşabilir."
    ]


    tokenizer.build_vocab(texts)


    sample = "Merhaba, Lotus!"


    encoded = tokenizer.encode(
        sample
    )


    decoded = tokenizer.decode(
        encoded
    )


    print("🌸 Lotus Tokenizer çalışıyor!")
    print()
    print("Metin :", sample)
    print("Token :", encoded)
    print("Geri  :", decoded)
    print()
    print(
        "Vocabulary:",
        tokenizer.vocab_size
          )
