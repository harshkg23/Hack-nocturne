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

        # Build query text
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
        query_vector = embeddings.embed_query(query_text)

        # Run Atlas Vector Search
        client = pymongo.MongoClient(mongodb_uri)
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

        results = list(collection.aggregate(pipeline))
        logger.info(
            "get_similar_past_fixes: retrieved %d similar past fix(es).", len(results)
        )
        return results

    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "get_similar_past_fixes: failed to retrieve past fixes — %s: %s",
            exc.__class__.__name__,
            exc,
        )
        return []
