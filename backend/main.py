import json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Clash Fleet API")

# --- Security: CORS Configuration ---
# This tells the API to accept requests from your frontend browser
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For local dev, we allow any origin. We will lock this down for production.
    allow_credentials=True,
    allow_methods=["*"],  # Allow GET, POST, OPTIONS, etc.
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "Imposter API is breathing"}

# --- The Imposter API ---
@app.get("/api/load")
def load_timers():
    """ Mimics the GET request of api.php?action=load """
    try:
        # We mapped your local ./data folder to /app/data inside the container!
        with open("/app/data/timers.json", "r") as f:
            return json.load(f)
    except FileNotFoundError:
        return {"error": "timers.json not found in the container"}