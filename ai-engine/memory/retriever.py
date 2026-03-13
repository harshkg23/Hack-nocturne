"""Memory retriever module for SentinelQA Healer RAG.

Before every heal cycle, this module retrieves the top-K semantically
similar past fixes from MongoDB Atlas Vector Search and injects them into
the Healer's system prompt as contextual reference.
"""
from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)


def get_similar_past_fixes(
    git_diff: str,
    changed_files: list,
    failed_tests: list,
    top_k: int = 3,
) -> list[dict]:
    """Retrieve the top-K semantically similar past fixes from Atlas Vector Search.

    Builds a query text from ``git_diff``, ``changed_files``, and the first 3
    error messages inside ``failed_tests``, generates an embedding, and runs a
    ``$vectorSearch`` aggregation against ``sentinelqa.healer_memory``.

    Returns an empty list (instead of raising) on any error so that the Healer
    always continues to run normally even when Atlas is unavailable.

    Args:
        git_diff: The recent git diff string from the current state.
        changed_files: List of files that changed in the recent commit.
        failed_tests: List of failed test result dicts (each may have "error" key).
        top_k: Maximum number of similar past fixes to return (default: 3).

    Returns:
        A list of matching MongoDB documents (dicts), or an empty list on any failure.
    """
    mongodb_uri = os.getenv("MONGODB_URI", "")
    openai_key = os.getenv("OPENAI_API_KEY", "")

    if not mongodb_uri or not openai_key:
        logger.warning(
            "get_similar_past_fixes: MONGODB_URI or OPENAI_API_KEY not set — returning empty list."
        )
        return []

    try:
        from langchain_openai import OpenAIEmbeddings
        import pymongo

        # Build query text from at most the first 3 error strings
        error_snippets = [
            item.get("error", "") for item in (failed_tests or [])[:3]
        ]
        query_text = "\n".join(
            [
                git_diff,
                str(changed_files),
                *error_snippets,
            ]
        )

        # Generate query embedding
        embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
        query_vector: list[float] = embeddings.embed_query(query_text)

        # Run Atlas Vector Search aggregation
        client: pymongo.MongoClient = pymongo.MongoClient(mongodb_uri)
        collection = client["sentinelqa"]["healer_memory"]

        pipeline = [
            {
                "$vectorSearch": {
                    "index": "healer_vector_index",
                    "path": "embedding",
                    "queryVector": query_vector,
                    "numCandidates": 50,
                    "limit": top_k,
                }
            }
        ]

        results: list[dict] = list(collection.aggregate(pipeline))
        logger.info(
            "get_similar_past_fixes: retrieved %d similar past fix(es).", len(results)
        )
        return results

    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "get_similar_past_fixes: failed to retrieve past fixes — %s: %s — Healer will proceed without RAG context.",
            exc.__class__.__name__,
            exc,
        )
        return []
