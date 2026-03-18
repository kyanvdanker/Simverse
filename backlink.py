"""
SimVerseLab Backlink Prospector
--------------------------------
A Streamlit dashboard that uses your local Ollama to generate
personalized outreach emails for backlink prospects.

Run with:
    pip install streamlit requests
    streamlit run backlink_prospector.py
"""

import json
import os
import requests
import streamlit as st

# ── Config ────────────────────────────────────────────────────────────────────

SITE = "simverselab.com"
SITE_DESC = (
    "a drag-and-drop physics simulator that makes it easy to build and run "
    "physics simulations visually — great for students, teachers, and engineers"
)
OLLAMA_URL = "http://localhost:11434/api/generate"
DATA_FILE = "prospects.json"

# ── Default prospects ─────────────────────────────────────────────────────────

DEFAULT_PROSPECTS = [
    {"id": 1,  "domain": "phet.colorado.edu",          "category": "Edu Simulator",    "status": "new", "email": "",
     "why": "PhET runs the gold-standard interactive simulations site from Colorado University. A resource-page mention would reach millions of STEM students and teachers."},
    {"id": 2,  "domain": "physicsclassroom.com",        "category": "Physics Education","status": "new", "email": "",
     "why": "One of the most-visited physics education sites. They maintain a resource section for interactive tools — a perfect fit for a drag-and-drop physics simulator."},
    {"id": 3,  "domain": "teacher.desmos.com",          "category": "Edu Tools",        "status": "new", "email": "",
     "why": "Trusted by millions of math/science teachers. They link to complementary interactive tools — pitching simverselab as a physics companion could earn a strong contextual link."},
    {"id": 4,  "domain": "sciencebuddies.org",          "category": "STEM Education",   "status": "new", "email": "",
     "why": "Heavy traffic from students doing projects. A listing under their 'Online Simulation Tools' section drives relevant, high-intent visitors."},
    {"id": 5,  "domain": "edutopia.org",                "category": "Edu Blog",         "status": "new", "email": "",
     "why": "Edutopia publishes teacher-facing articles on ed-tech tools. A guest post or tool mention about drag-and-drop physics simulations would get DA-80+ backlink reach."},
    {"id": 6,  "domain": "instructables.com",           "category": "Maker / DIY",      "status": "new", "email": "",
     "why": "Large STEM community. Publishing a tutorial like 'Simulate This Physics Experiment Online' would earn a backlink and organic traffic."},
    {"id": 7,  "domain": "hackaday.com",                "category": "Engineering",      "status": "new", "email": "",
     "why": "Covers engineering projects and tools. A submission about the drag-and-drop physics engine would appeal to their hardware/physics audience."},
    {"id": 8,  "domain": "alternativeto.net",           "category": "Software Directory","status": "new","email": "",
     "why": "Major software discovery site. Listing simverselab as an alternative to PhET or Algodoo would passively earn referral traffic and a backlink."},
    {"id": 9,  "domain": "producthunt.com",             "category": "Product Launch",   "status": "new", "email": "",
     "why": "A Product Hunt launch in Education or Developer Tools drives hundreds of visits, links from aggregator sites, and press coverage."},
    {"id": 10, "domain": "reddit.com/r/Physics",        "category": "Community",        "status": "new", "email": "",
     "why": "2M+ members. A well-timed post showing a simulation built with simverselab builds awareness and earns organic links from people sharing it."},
    {"id": 11, "domain": "reddit.com/r/gamedev",        "category": "Community",        "status": "new", "email": "",
     "why": "Game developers often prototype physics mechanics. Showing how simverselab can accelerate prototyping would resonate strongly here."},
    {"id": 12, "domain": "coolmathgames.com",           "category": "Edu Games",        "status": "new", "email": "",
     "why": "Features interactive browser tools. A submission as a physics puzzle/simulation tool could earn a permanent featured link on a high-traffic site."},
    {"id": 13, "domain": "physlink.com",                "category": "Physics Resource", "status": "new", "email": "",
     "why": "Maintains a curated directory of physics resources and online tools. Getting listed here is straightforward and earns a permanent contextual backlink."},
    {"id": 14, "domain": "tes.com",                     "category": "Teacher Resource", "status": "new", "email": "",
     "why": "Used by 20M+ teachers globally. Uploading a free simulation resource or lesson plan earns a backlink and routes teachers directly to the site."},
    {"id": 15, "domain": "geeksforgeeks.org",           "category": "Dev / Science Blog","status": "new","email": "",
     "why": "Publishes tutorials on physics engines and simulations. A contributed article about drag-and-drop physics simulation would rank on Google and link back."},
    {"id": 16, "domain": "dev.to",                      "category": "Dev Blog",         "status": "new", "email": "",
     "why": "Reaches developers interested in physics engines and web-based simulations. A post about how simverselab works technically earns backlinks and followers."},
    {"id": 17, "domain": "commonsense.org/education",   "category": "Edu Review",       "status": "new", "email": "",
     "why": "Reviews digital tools for teachers and students. A positive review listing for simverselab carries serious SEO weight and teacher trust."},
    {"id": 18, "domain": "futureschool.com",            "category": "EdTech",           "status": "new", "email": "",
     "why": "Curates and recommends ed-tech tools for schools. Outreach to their editorial team could earn a 'tool of the month' feature and a strong backlink."},
]

# ── Data persistence ──────────────────────────────────────────────────────────

def load_prospects():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r") as f:
            return json.load(f)
    return [p.copy() for p in DEFAULT_PROSPECTS]


def save_prospects(prospects):
    with open(DATA_FILE, "w") as f:
        json.dump(prospects, f, indent=2)


# ── Ollama helpers ────────────────────────────────────────────────────────────

def generate_email(domain: str, why: str, model: str) -> str:
    prompt = f"""You are an expert SEO outreach specialist. Write a short, friendly, personalized outreach email to the team at {domain} asking them to link to or feature {SITE} ({SITE_DESC}).

Context about why {domain} is a good fit: {why}

Requirements:
- Keep it under 150 words
- Sound like a real person, not a robot
- Mention something specific about {domain} to show you know their site
- Clearly explain the value for their audience
- Include a subject line at the top like "Subject: ..."
- End with a friendly sign-off from "The SimVerseLab Team"
- Do not use placeholder brackets like [Name] — write it naturally

Write only the email, nothing else."""

    response = requests.post(
        OLLAMA_URL,
        json={"model": model, "prompt": prompt, "stream": False},
        timeout=120,
    )
    response.raise_for_status()
    return response.json()["response"].strip()


def check_ollama(model: str) -> tuple[bool, str]:
    try:
        r = requests.get("http://localhost:11434/api/tags", timeout=5)
        r.raise_for_status()
        models = [m["name"].split(":")[0] for m in r.json().get("models", [])]
        if model not in models:
            return False, f"Model '{model}' not found. Available: {', '.join(models) or 'none'}. Run: ollama pull {model}"
        return True, "Connected"
    except requests.exceptions.ConnectionError:
        return False, "Ollama not running. Start it with: ollama serve"
    except Exception as e:
        return False, str(e)


# ── UI helpers ────────────────────────────────────────────────────────────────

STATUS_COLORS = {
    "new":     "🔵",
    "draft":   "🟡",
    "sent":    "🟣",
    "replied": "🟢",
}

STATUS_ORDER = ["new", "draft", "sent", "replied"]


# ── Main app ──────────────────────────────────────────────────────────────────

st.set_page_config(
    page_title="Backlink Prospector — SimVerseLab",
    page_icon="🔗",
    layout="wide",
)

st.title("🔗 Backlink Prospector")
st.caption(f"**{SITE}** · drag-and-drop physics simulator · STEM education niche")

# Session state init
if "prospects" not in st.session_state:
    st.session_state.prospects = load_prospects()

prospects = st.session_state.prospects

# ── Sidebar ───────────────────────────────────────────────────────────────────

with st.sidebar:
    st.header("Settings")
    model = st.text_input(
        "Ollama model",
        value="llama3",
        help="Run `ollama list` in your terminal to see available models.",
    )

    ok, msg = check_ollama(model)
    if ok:
        st.success(f"✓ Ollama connected · model: {model}")
    else:
        st.error(msg)

    st.divider()

    st.header("Filters")
    categories = ["All"] + sorted(set(p["category"] for p in prospects))
    selected_cat = st.selectbox("Category", categories)
    selected_status = st.selectbox("Status", ["All"] + STATUS_ORDER)

    st.divider()

    st.header("Stats")
    total = len(prospects)
    drafted = sum(1 for p in prospects if p["email"])
    sent = sum(1 for p in prospects if p["status"] == "sent")
    replied = sum(1 for p in prospects if p["status"] == "replied")

    col1, col2 = st.columns(2)
    col1.metric("Total", total)
    col2.metric("Drafted", drafted)
    col1.metric("Sent", sent)
    col2.metric("Replied", replied)

    st.divider()

    st.header("Add prospect")
    with st.form("add_form", clear_on_submit=True):
        new_domain = st.text_input("Domain", placeholder="example.com")
        new_cat = st.text_input("Category", placeholder="Blog, Directory…")
        new_why = st.text_area("Why relevant?", placeholder="Explain why this site would link to you…", height=80)
        if st.form_submit_button("Add prospect"):
            if new_domain and new_why:
                new_id = max((p["id"] for p in prospects), default=0) + 1
                prospects.insert(0, {
                    "id": new_id,
                    "domain": new_domain.strip(),
                    "category": new_cat.strip() or "Other",
                    "why": new_why.strip(),
                    "status": "new",
                    "email": "",
                })
                save_prospects(prospects)
                st.success(f"Added {new_domain}")
                st.rerun()
            else:
                st.warning("Domain and 'why relevant' are required.")

    if st.button("🔄 Reset to defaults", type="secondary"):
        st.session_state.prospects = [p.copy() for p in DEFAULT_PROSPECTS]
        save_prospects(st.session_state.prospects)
        st.rerun()

# ── Prospect list ─────────────────────────────────────────────────────────────

visible = prospects
if selected_cat != "All":
    visible = [p for p in visible if p["category"] == selected_cat]
if selected_status != "All":
    visible = [p for p in visible if p["status"] == selected_status]

if not visible:
    st.info("No prospects match the current filters.")
else:
    for p in visible:
        emoji = STATUS_COLORS.get(p["status"], "⚪")
        with st.expander(f"{emoji} **{p['domain']}** — {p['category']}  ·  status: {p['status']}", expanded=False):
            st.caption(p["why"])

            col_a, col_b, col_c, col_d = st.columns([2, 2, 2, 2])

            # Generate / regenerate
            btn_label = "✨ Regenerate email" if p["email"] else "✨ Generate outreach email"
            if col_a.button(btn_label, key=f"gen_{p['id']}"):
                if not ok:
                    st.error(msg)
                else:
                    with st.spinner(f"Generating email via Ollama ({model})…"):
                        try:
                            email_text = generate_email(p["domain"], p["why"], model)
                            # Update in-place
                            idx = next(i for i, x in enumerate(prospects) if x["id"] == p["id"])
                            prospects[idx]["email"] = email_text
                            if prospects[idx]["status"] == "new":
                                prospects[idx]["status"] = "draft"
                            save_prospects(prospects)
                            st.rerun()
                        except Exception as e:
                            st.error(f"Ollama error: {e}")

            # Status transitions
            if p["status"] in ("new", "draft"):
                if col_b.button("📤 Mark sent", key=f"sent_{p['id']}"):
                    idx = next(i for i, x in enumerate(prospects) if x["id"] == p["id"])
                    prospects[idx]["status"] = "sent"
                    save_prospects(prospects)
                    st.rerun()

            if p["status"] == "sent":
                if col_b.button("✅ Mark replied", key=f"replied_{p['id']}"):
                    idx = next(i for i, x in enumerate(prospects) if x["id"] == p["id"])
                    prospects[idx]["status"] = "replied"
                    save_prospects(prospects)
                    st.rerun()

            if col_d.button("🗑 Remove", key=f"del_{p['id']}"):
                st.session_state.prospects = [x for x in prospects if x["id"] != p["id"]]
                save_prospects(st.session_state.prospects)
                st.rerun()

            # Show generated email
            if p["email"]:
                st.text_area(
                    "Generated email",
                    value=p["email"],
                    height=220,
                    key=f"email_{p['id']}",
                    help="Copy this and paste it into your email client.",
                )
                # Gmail deep link
                lines = p["email"].split("\n")
                subject_line = next((l for l in lines if l.lower().startswith("subject:")), "Link opportunity")
                subject = subject_line.replace("Subject:", "").replace("subject:", "").strip()
                body = p["email"].replace(subject_line, "").strip()
                gmail_url = (
                    f"https://mail.google.com/mail/?view=cm"
                    f"&su={requests.utils.quote(subject)}"
                    f"&body={requests.utils.quote(body)}"
                )
                st.link_button("Open in Gmail →", gmail_url)