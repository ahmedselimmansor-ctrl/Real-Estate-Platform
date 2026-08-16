"""FAQ entries -> documents (``seed/faq.json``, 40 records).

The English and Arabic variants of an entry are ingested as **separate**
documents — and therefore separate chunks — so an Arabic question retrieves the
Arabic answer verbatim instead of a translated paraphrase.
"""

from __future__ import annotations

from typing import Any

from app.core.config import get_settings
from app.core.logging import get_logger
from app.ingestion.documents import RawDocument, document_metadata
from app.ingestion.formatting import join_list
from app.ingestion.loaders.base import IngestOptions, apply_limit, language_source_id
from app.ingestion.seed_files import FAQ, load_json

logger = get_logger("rag-svc.loader.faq")

SOURCE = "faq"
SOURCE_TYPE = "faq"

CATEGORY_LABELS: dict[str, tuple[str, str]] = {
    "buying_process": ("Buying process", "خطوات الشراء"),
    "payment_plans": ("Payment plans", "أنظمة السداد"),
    "mortgage": ("Mortgage", "التمويل العقاري"),
    "legal_documents": ("Legal documents", "الأوراق القانونية"),
    "delivery_handover": ("Delivery and handover", "التسليم والاستلام"),
    "nawy_services": ("Nawy services", "خدمات ناوي"),
    "resale": ("Resale", "إعادة البيع"),
    "rental": ("Rental", "الإيجار"),
    "fees_taxes": ("Fees and taxes", "الرسوم والضرائب"),
    "account_support": ("Account and support", "الحساب والدعم"),
}


def faq_url(record: dict[str, Any]) -> str:
    base = get_settings().frontend_url.rstrip("/")
    return f"{base}/faq#{record.get('id', '')}"


def category_label(category: str | None, lang: str) -> str:
    if not category:
        return ""
    pair = CATEGORY_LABELS.get(category)
    if pair is None:
        return category.replace("_", " ")
    return pair[1] if lang == "ar" else pair[0]


def render_faq(record: dict[str, Any], lang: str = "en") -> str:
    """Render a question/answer pair with its category and retrieval tags."""
    question = str((record.get("question") or {}).get(lang) or "").strip()
    answer = str((record.get("answer") or {}).get(lang) or "").strip()
    if not question or not answer:
        return ""

    category = category_label(record.get("category"), lang)
    tags = join_list([str(tag) for tag in record.get("tags") or []], lang)

    if lang == "ar":
        lines = [f"سؤال شائع ({category}): {question}", f"الإجابة: {answer}"]
        if tags:
            lines.append(f"مواضيع ذات صلة: {tags}.")
    else:
        lines = [f"Frequently asked question ({category}): {question}", f"Answer: {answer}"]
        if tags:
            lines.append(f"Related topics: {tags}.")
    return "\n".join(lines)


def faq_metadata(record: dict[str, Any], lang: str) -> dict[str, Any]:
    return document_metadata(
        type="faq",
        faqId=str(record.get("id") or ""),
        category=record.get("category"),
        categoryLabel=category_label(record.get("category"), lang),
        tags=list(record.get("tags") or []),
        title=str((record.get("question") or {}).get(lang) or ""),
        url=faq_url(record),
        lang=lang,
        recordId=str(record.get("id") or ""),
    )


def build_documents(record: dict[str, Any], options: IngestOptions) -> list[RawDocument]:
    record_id = str(record.get("id") or "")
    if not record_id:
        return []
    documents: list[RawDocument] = []
    for lang in ("en", "ar"):
        if not options.wants(lang):
            continue
        text = render_faq(record, lang)
        if not text:
            continue
        documents.append(
            RawDocument(
                source_type=SOURCE_TYPE,
                source_id=language_source_id(record_id, lang),
                title=str((record.get("question") or {}).get(lang) or record_id),
                text=text,
                lang=lang,
                uri=faq_url(record),
                metadata=faq_metadata(record, lang),
            )
        )
    return documents


class FaqLoader:
    """Loads ``seed/faq.json`` into EN + AR documents."""

    source = SOURCE
    source_type = SOURCE_TYPE
    prunable = True

    async def load(self, options: IngestOptions) -> list[RawDocument]:
        records = load_json(FAQ)
        documents: list[RawDocument] = []
        for record in records:
            if not options.selected(
                str(record.get("id") or ""), str(record.get("category") or "")
            ):
                continue
            documents.extend(build_documents(record, options))
        documents = apply_limit(documents, options.limit)
        logger.info("faq_loaded", records=len(records), documents=len(documents))
        return documents
