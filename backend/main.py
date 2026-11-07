"""QuantumFlow Analytics API. Run from the backend directory: `uvicorn main:app --reload --port 8000`."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import VERSION, router
from config import settings

app = FastAPI(title="QuantumFlow Analytics API", version=VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
app.include_router(router)


@app.get("/")
def root() -> dict:
    return {"name": "QuantumFlow Analytics API", "version": VERSION, "docs": "/docs", "health": "/api/health"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000)
