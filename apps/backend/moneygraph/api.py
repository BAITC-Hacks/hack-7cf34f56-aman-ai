"""Optional API: serves snapshots only, never computes analytics per request."""
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .store import ArtifactStore, ROOT


class InvestigationRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


def create_app(results_dir=None):
    @asynccontextmanager
    async def lifespan(app):
        try:
            app.state.store = ArtifactStore(results_dir or ROOT / "results")
        except (OSError, ValueError, KeyError):
            app.state.store = None
        yield

    app = FastAPI(title="MoneyGraph Investigator", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=[
        "http://127.0.0.1:5173", "http://localhost:5173"],
        allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

    def store():
        if app.state.store is None:
            raise HTTPException(503, "Artifacts unavailable; run python main.py and restart API.")
        return app.state.store

    def call(function, *args):
        try:
            return function(*args)
        except KeyError:
            raise HTTPException(404, "Unknown gid or cluster") from None
        except ValueError as error:
            raise HTTPException(400, str(error)) from None

    @app.get("/health")
    def health():
        return {"status": "ok", "artifacts_ready": app.state.store is not None}

    @app.get("/api/top-nodes")
    def top(limit: int = Query(20, ge=1, le=100)):
        return call(store().top, limit)

    @app.get("/api/nodes/{gid}/subgraph")
    def subgraph(gid: str, hop: int = 1):
        return call(store().subgraph, gid, hop)

    @app.get("/api/nodes/{gid}")
    def node(gid: str):
        return call(store().node, gid)

    @app.get("/api/clusters/{cluster_id}")
    def cluster(cluster_id: int):
        return call(store().clusters.__getitem__, cluster_id)

    @app.get("/api/search")
    def search(gid: str, limit: int = Query(20, ge=1, le=50)):
        return call(store().search, gid, limit)

    @app.post("/api/investigate")
    def investigate_endpoint(request: InvestigationRequest):
        from .investigator import investigate, InvestigatorUnavailable
        snapshot = store()
        try:
            return investigate(request.question, snapshot)
        except InvestigatorUnavailable as error:
            raise HTTPException(503, str(error)) from None
        except ValueError as error:
            raise HTTPException(400, str(error)) from None
        except Exception:
            raise HTTPException(502, "OpenAI request failed; deterministic endpoints remain available.") from None

    return app


app = create_app()
