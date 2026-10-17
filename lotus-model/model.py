import torch
import torch.nn as nn


# ==========================================================
# LOTUS MINI — CONFIG
# ==========================================================

class LotusConfig:

    # Token sayısı train.py tarafından
    # gerçek tokenizer boyutuna ayarlanabilir.
    vocab_size = 512

    # Telefon için küçük tutuyoruz.
    block_size = 64

    n_embd = 64
    n_head = 4
    n_layer = 2

    dropout = 0.1


# ==========================================================
# LOTUS MINI — TRANSFORMER BLOCK
# ==========================================================

class LotusTransformerBlock(nn.Module):

    def __init__(self, config):

        super().__init__()


        self.norm1 = nn.LayerNorm(
            config.n_embd
        )


        self.attention = nn.MultiheadAttention(
            embed_dim=config.n_embd,
            num_heads=config.n_head,
            dropout=config.dropout,
            batch_first=True
        )


        self.norm2 = nn.LayerNorm(
            config.n_embd
        )


        self.feed_forward = nn.Sequential(

            nn.Linear(
                config.n_embd,
                config.n_embd * 4
            ),

            nn.GELU(),

            nn.Linear(
                config.n_embd * 4,
                config.n_embd
            ),

            nn.Dropout(
                config.dropout
            )
        )


    def forward(
        self,
        x,
        causal_mask=None
    ):

        # --------------------------------------------------
        # SELF ATTENTION
        # --------------------------------------------------

        normalized = self.norm1(x)


        attention_output, _ = self.attention(

            normalized,
            normalized,
            normalized,

            attn_mask=causal_mask,

            need_weights=False
        )


        x = (
            x +
            attention_output
        )


        # --------------------------------------------------
        # FEED FORWARD
        # --------------------------------------------------

        x = (
            x +
            self.feed_forward(
                self.norm2(x)
            )
        )


        return x


# ==========================================================
# LOTUS MINI — MODEL
# ==========================================================

class LotusMini(nn.Module):

    def __init__(
        self,
        config=None
    ):

        super().__init__()


        if config is None:

            config = LotusConfig()


        self.config = config


        # --------------------------------------------------
        # TOKEN EMBEDDING
        # --------------------------------------------------

        self.token_embedding = nn.Embedding(

            config.vocab_size,

            config.n_embd
        )


        # --------------------------------------------------
        # POSITION EMBEDDING
        # --------------------------------------------------

        self.position_embedding = nn.Embedding(

            config.block_size,

            config.n_embd
        )


        # --------------------------------------------------
        # TRANSFORMER BLOCKS
        # --------------------------------------------------

        self.blocks = nn.ModuleList([

            LotusTransformerBlock(config)

            for _ in range(
                config.n_layer
            )

        ])


        # --------------------------------------------------
        # FINAL NORMALIZATION
        # --------------------------------------------------

        self.final_norm = nn.LayerNorm(

            config.n_embd
        )


        # --------------------------------------------------
        # LANGUAGE MODEL HEAD
        # --------------------------------------------------

        self.lm_head = nn.Linear(

            config.n_embd,

            config.vocab_size,

            bias=False
        )


        # --------------------------------------------------
        # WEIGHT TYING
        # --------------------------------------------------

        self.lm_head.weight = (

            self.token_embedding.weight

        )


    # ======================================================
    # FORWARD
    # ======================================================

    def forward(
        self,
        input_ids
    ):

        batch_size, sequence_length = (
            input_ids.shape
        )


        # --------------------------------------------------
        # SEQUENCE CHECK
        # --------------------------------------------------

        if sequence_length > self.config.block_size:

            raise ValueError(

                "Sequence length "
                "block_size değerini aşamaz."

            )


        # --------------------------------------------------
        # POSITIONS
        # --------------------------------------------------

        positions = torch.arange(

            sequence_length,

            device=input_ids.device

        )


        # --------------------------------------------------
        # EMBEDDINGS
        # --------------------------------------------------

        token_embeddings = (

            self.token_embedding(
                input_ids
            )

        )


        position_embeddings = (

            self.position_embedding(
                positions
            )

        )


        x = (

            token_embeddings
            +
            position_embeddings

        )


        # --------------------------------------------------
        # CAUSAL MASK
        # --------------------------------------------------

        causal_mask = torch.triu(

            torch.ones(

                sequence_length,
                sequence_length,

                device=input_ids.device,

                dtype=torch.bool

            ),

            diagonal=1

        )


        # --------------------------------------------------
        # TRANSFORMER
        # --------------------------------------------------

        for block in self.blocks:

            x = block(

                x,

                causal_mask

            )


        # --------------------------------------------------
        # FINAL NORMALIZATION
        # --------------------------------------------------

        x = self.final_norm(x)


        # --------------------------------------------------
        # LOGITS
        # --------------------------------------------------

        logits = self.lm_head(x)


        return logits


# ==========================================================
# TEST
# ==========================================================

if __name__ == "__main__":

    config = LotusConfig()


    model = LotusMini(
        config
    )


    test_input = torch.randint(

        0,

        config.vocab_size,

        (2, 32)

    )


    output = model(
        test_input
    )


    print(
        "🌸 Lotus Mini çalışıyor!"
    )


    print(
        "Girdi :",
        test_input.shape
    )


    print(
        "Çıktı :",
        output.shape
    )


    parameters = sum(

        parameter.numel()

        for parameter
        in model.parameters()

    )


    print(

        "Parametre sayısı:",

        f"{parameters:,}"

    )
