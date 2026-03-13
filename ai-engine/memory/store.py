from __future__ import annotations

import datetime
import logging
import os

from graph.state import SentinelState

logger = logging.getLogger(__name__)


def store_successful_fix(state: SentinelState) -> None:
    mongodb_uri = os.getenv("MONGODB_URI", "")
    openai_key = os.getenv("OPENAI_API_KEY", "")

    if not mongodb_uri or not openai_key:
        logger.warning(
            "store_successful_fix: MONGODB_URI or OPENAI_API_KEY not set — skipping memory storage."
        )
        return

    try:
        from langchain_openai import OpenAIEmbeddings
        import pymongo

        # Build the text to embed
        text = "\n".join(
            [
                str(state.get("rca_type", "")),
                str(state.get("rca_report", "")),
                str(state.get("git_diff", "")),
                str(state.get("changed_files", [])),
            ]
        )

        # Generate embedding
        embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
        embedding_vector = embeddings.embed_documents([text])[0]

        # Insert into MongoDB
        client = pymongo.MongoClient(mongodb_uri)
        collection = client["sentinelqa"]["healer_memory"]

        doc = {
            "embedding": embedding_vector,
            "rca_type": str(state.get("rca_type", "")),
            "rca_report": str(state.get("rca_report", "")),
            "proposed_fix": str(state.get("proposed_fix", "")),
            "proposed_patch": str(state.get("proposed_patch", "")),
            "target_files": state.get("target_files", []),
            "fix_branch": str(state.get("fix_branch", "")),
            "confidence_score": float(state.get("confidence_score", 0.0)),
            "repo_url": str(state.get("repo_url", "")),
            "created_at": datetime.datetime.utcnow(),
        }

        collection.insert_one(doc)
        logger.info(
            "store_successful_fix: stored fix for rca_type=%s repo=%s",
            doc["rca_type"],
            doc["repo_url"],
        )
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "store_successful_fix: failed to store fix in MongoDB — %s: %s",
            exc.__class__.__name__,
            exc,
        )
