# """QuantumFlow Analytics API. Run from the backend directory: `uvicorn main:app --reload --port 8000`."""
#
# from fastapi import FastAPI
# from fastapi.middleware.cors import CORSMiddleware
#
# from api.routes import VERSION, router
# from config import settings
#
# app = FastAPI(title="QuantumFlow Analytics API", version=VERSION)
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=settings.cors_origins,
#     allow_origin_regex=settings.cors_origin_regex,
#     allow_credentials=False,
#     allow_methods=["GET", "POST"],
#     allow_headers=["Content-Type"],
# )
# app.include_router(router)
#
#
# @app.get("/")
# def root() -> dict:
#     return {"name": "QuantumFlow Analytics API", "version": VERSION, "docs": "/docs", "health": "/api/health"}
#
#
# if __name__ == "__main__":
#     import uvicorn
#
#     uvicorn.run("main:app", host="0.0.0.0", port=8000)

"""QuantumFlow Analytics API."""

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import VERSION, router


from fastapi import Request
from fastapi.responses import JSONResponse

app = FastAPI(title="QuantumFlow Analytics API", version=VERSION)

# HACKATHON FIX: Allow all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


@app.exception_handler(Exception)
async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
    """Catch all unhandled exceptions inside the middleware stack so the
    CORSMiddleware still gets to add Access-Control-Allow-Origin to the
    500 response. Without this, ServerErrorMiddleware returns the error
    before CORSMiddleware can inject the header."""
    return JSONResponse(status_code=500, content={"detail": str(exc)})

@app.get("/")
def root() -> dict:
    return {"name": "QuantumFlow Analytics API", "version": VERSION, "docs": "/docs", "health": "/api/health"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000)
