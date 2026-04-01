"""
JobPulse Backend — Multi-Source Job Aggregator API
====================================================
Scrapes/fetches real job listings from multiple free public APIs:
  1. LinkedIn Guest API (no auth needed)
  2. Remotive API (free, no auth)
  3. Himalayas API (free, no auth)
  4. Arbeitnow API (free, no auth)

Cleans, deduplicates, enriches, and serves via Flask REST API.

Run: pip install flask flask-cors requests beautifulsoup4
      python server.py
"""

import requests
from bs4 import BeautifulSoup
from flask import Flask, jsonify, request
from flask_cors import CORS
import re
import time
import hashlib
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
from functools import lru_cache

app = Flask(__name__)
CORS(app)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/124.0.0.0 Safari/537.36"
}

# Cache to avoid hammering APIs
_cache = {}
CACHE_TTL = 300  # 5 minutes


# ══════════════════════════════════════════════════════════════
# SOURCE 1: LinkedIn Guest API (public, no auth)
# ══════════════════════════════════════════════════════════════

def fetch_linkedin_jobs(query="software engineer", location="India", limit=25):
    """
    LinkedIn exposes guest endpoints that serve job data without auth.
    Endpoint: linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search
    """
    jobs = []
    try:
        url = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
        params = {
            "keywords": query,
            "location": location,
            "start": 0,
        }
        resp = requests.get(url, params=params, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            print(f"[LinkedIn] HTTP {resp.status_code}")
            return jobs

        soup = BeautifulSoup(resp.text, "html.parser")
        cards = soup.find_all("li")

        for card in cards[:limit]:
            try:
                title_el = card.find("h3", class_="base-search-card__title")
                company_el = card.find("h4", class_="base-search-card__subtitle")
                location_el = card.find("span", class_="job-search-card__location")
                link_el = card.find("a", class_="base-card__full-link")
                time_el = card.find("time")

                if not title_el:
                    continue

                job_url = link_el["href"].split("?")[0] if link_el else None
                job_id = None
                if job_url:
                    match = re.search(r'/view/(\d+)', job_url)
                    if match:
                        job_id = match.group(1)

                jobs.append({
                    "title": title_el.text.strip(),
                    "company": company_el.text.strip() if company_el else "Unknown",
                    "location": location_el.text.strip() if location_el else "Unknown",
                    "url": job_url,
                    "apply_url": job_url,
                    "posted_date": time_el.get("datetime", "") if time_el else "",
                    "posted_text": time_el.text.strip() if time_el else "Recently",
                    "salary": None,
                    "job_type": None,
                    "description_snippet": None,
                    "source": "LinkedIn",
                    "source_id": job_id,
                })
            except Exception as e:
                continue

        print(f"[LinkedIn] Fetched {len(jobs)} jobs for '{query}' in '{location}'")
    except Exception as e:
        print(f"[LinkedIn] Error: {e}")

    return jobs


def fetch_linkedin_job_details(job_id):
    """Fetch full description for a LinkedIn job."""
    try:
        url = f"https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{job_id}"
        resp = requests.get(url, headers=HEADERS, timeout=10)
        if resp.status_code != 200:
            return None

        soup = BeautifulSoup(resp.text, "html.parser")
        desc_el = soup.find("div", class_="show-more-less-html__markup")
        criteria = soup.find_all("li", class_="description__job-criteria-item")

        details = {
            "description": desc_el.get_text(separator="\n").strip() if desc_el else None,
            "description_html": str(desc_el) if desc_el else None,
        }

        for item in criteria:
            label = item.find("h3")
            value = item.find("span")
            if label and value:
                key = label.text.strip().lower().replace(" ", "_")
                details[key] = value.text.strip()

        return details
    except Exception as e:
        print(f"[LinkedIn Detail] Error: {e}")
        return None


# ══════════════════════════════════════════════════════════════
# SOURCE 2: Remotive API (free, no auth)
# ══════════════════════════════════════════════════════════════

REMOTIVE_CATEGORIES = {
    "software": "software-dev",
    "frontend": "software-dev",
    "backend": "software-dev",
    "devops": "devops-sysadmin",
    "data": "data",
    "design": "design",
    "product": "product",
    "marketing": "marketing",
    "customer": "customer-support",
    "sales": "sales",
    "hr": "human-resources",
    "finance": "finance-legal",
    "qa": "qa",
    "writing": "writing",
    "all": "all-others",
}


def fetch_remotive_jobs(query="", category="software-dev", limit=25):
    """
    Remotive: Free public API, no auth needed.
    Endpoint: https://remotive.com/api/remote-jobs
    Returns: title, company_name, url, salary, job_type, description, etc.
    """
    jobs = []
    try:
        url = "https://remotive.com/api/remote-jobs"
        params = {"limit": limit}

        if query:
            params["search"] = query

        # Map query to category
        q_lower = query.lower() if query else ""
        for key, cat in REMOTIVE_CATEGORIES.items():
            if key in q_lower:
                params["category"] = cat
                break

        resp = requests.get(url, params=params, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            print(f"[Remotive] HTTP {resp.status_code}")
            return jobs

        data = resp.json()
        for job in data.get("jobs", [])[:limit]:
            # Extract email from description if present
            desc_text = BeautifulSoup(job.get("description", ""), "html.parser").get_text()
            email = extract_email(desc_text)
            apply_url = extract_apply_url(job.get("description", ""), job.get("url", ""))

            jobs.append({
                "title": job.get("title", ""),
                "company": job.get("company_name", "Unknown"),
                "location": job.get("candidate_required_location", "Remote"),
                "url": job.get("url", ""),
                "apply_url": apply_url,
                "posted_date": job.get("publication_date", ""),
                "posted_text": format_date(job.get("publication_date", "")),
                "salary": job.get("salary", None),
                "job_type": job.get("job_type", "").replace("_", " ").title(),
                "description_snippet": desc_text[:300] + "..." if desc_text else None,
                "description_html": job.get("description", ""),
                "company_logo": job.get("company_logo", None),
                "category": job.get("category", ""),
                "contact_email": email,
                "source": "Remotive",
                "source_id": str(job.get("id", "")),
                "tags": job.get("tags", []),
            })

        print(f"[Remotive] Fetched {len(jobs)} jobs for '{query}'")
    except Exception as e:
        print(f"[Remotive] Error: {e}")

    return jobs


# ══════════════════════════════════════════════════════════════
# SOURCE 3: Himalayas API (free, no auth)
# ══════════════════════════════════════════════════════════════

def fetch_himalayas_jobs(query="", limit=20):
    """
    Himalayas: Free public JSON API for remote jobs.
    Search: https://himalayas.app/jobs/api/search?query=...
    Browse: https://himalayas.app/jobs/api?limit=20&offset=0
    """
    jobs = []
    try:
        if query:
            url = "https://himalayas.app/jobs/api/search"
            params = {"query": query, "page": 1}
        else:
            url = "https://himalayas.app/jobs/api"
            params = {"limit": limit, "offset": 0}

        resp = requests.get(url, params=params, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            print(f"[Himalayas] HTTP {resp.status_code}")
            return jobs

        data = resp.json()
        job_list = data.get("jobs", data) if isinstance(data, dict) else data

        for job in job_list[:limit]:
            desc_text = job.get("description", "") or ""
            apply_url = job.get("applicationUrl") or job.get("url") or ""
            company_url = job.get("companyUrl", "")

            jobs.append({
                "title": job.get("title", ""),
                "company": job.get("companyName", job.get("company", "Unknown")),
                "location": ", ".join(job.get("locationRestrictions", [])) or "Worldwide",
                "url": f"https://himalayas.app/jobs/{job.get('slug', '')}" if job.get("slug") else "",
                "apply_url": apply_url,
                "posted_date": job.get("pubDate", job.get("createdAt", "")),
                "posted_text": format_date(job.get("pubDate", job.get("createdAt", ""))),
                "salary": format_salary(job.get("minSalary"), job.get("maxSalary")),
                "job_type": job.get("employmentType", ""),
                "description_snippet": desc_text[:300] + "..." if len(desc_text) > 300 else desc_text,
                "company_logo": job.get("companyLogo", None),
                "category": ", ".join(job.get("categories", [])),
                "seniority": job.get("seniority", ""),
                "company_url": company_url,
                "source": "Himalayas",
                "source_id": str(job.get("id", "")),
            })

        print(f"[Himalayas] Fetched {len(jobs)} jobs for '{query}'")
    except Exception as e:
        print(f"[Himalayas] Error: {e}")

    return jobs


# ══════════════════════════════════════════════════════════════
# SOURCE 4: Arbeitnow API (free, no auth)
# ══════════════════════════════════════════════════════════════

def fetch_arbeitnow_jobs(query="", limit=25):
    """
    Arbeitnow: Free public job board API.
    Endpoint: https://www.arbeitnow.com/api/job-board-api
    """
    jobs = []
    try:
        url = "https://www.arbeitnow.com/api/job-board-api"
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            print(f"[Arbeitnow] HTTP {resp.status_code}")
            return jobs

        data = resp.json()
        q_lower = query.lower()

        for job in data.get("data", []):
            # Filter by query if provided
            title = job.get("title", "")
            company = job.get("company_name", "")
            tags = job.get("tags", [])
            desc = job.get("description", "")

            if q_lower:
                searchable = f"{title} {company} {' '.join(tags)} {desc}".lower()
                if q_lower not in searchable:
                    continue

            desc_text = BeautifulSoup(desc, "html.parser").get_text()
            email = extract_email(desc_text)

            jobs.append({
                "title": title,
                "company": company,
                "location": job.get("location", "Remote"),
                "url": job.get("url", ""),
                "apply_url": job.get("url", ""),
                "posted_date": datetime.fromtimestamp(job.get("created_at", 0)).isoformat() if job.get("created_at") else "",
                "posted_text": format_date_unix(job.get("created_at", 0)),
                "salary": None,
                "job_type": "Remote" if job.get("remote", False) else "On-site",
                "description_snippet": desc_text[:300] + "..." if desc_text else None,
                "contact_email": email,
                "category": ", ".join(tags[:3]),
                "source": "Arbeitnow",
                "source_id": str(job.get("slug", "")),
                "tags": tags,
            })

            if len(jobs) >= limit:
                break

        print(f"[Arbeitnow] Fetched {len(jobs)} jobs for '{query}'")
    except Exception as e:
        print(f"[Arbeitnow] Error: {e}")

    return jobs


# ══════════════════════════════════════════════════════════════
# UTILITIES
# ══════════════════════════════════════════════════════════════

def extract_email(text):
    """Extract contact/application email from job description."""
    # Common patterns for application emails
    patterns = [
        r'(?:apply|send|email|contact|submit|resume|cv)[\s\S]{0,40}?([\w.+-]+@[\w-]+\.[\w.-]+)',
        r'([\w.+-]+@[\w-]+\.[\w.-]+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, text.lower())
        if match:
            email = match.group(1)
            # Filter out common non-application emails
            skip = ["noreply", "no-reply", "unsubscribe", "privacy", "info@", "support@"]
            if not any(s in email for s in skip):
                return email
    return None


def extract_apply_url(html_desc, fallback_url):
    """Extract application URL from job description HTML."""
    if not html_desc:
        return fallback_url

    soup = BeautifulSoup(html_desc, "html.parser")
    for link in soup.find_all("a", href=True):
        href = link["href"]
        text = link.get_text().lower()
        # Look for application links
        if any(kw in text for kw in ["apply", "application", "submit", "careers"]):
            return href
        if any(kw in href.lower() for kw in ["apply", "application", "careers", "jobs", "lever.co", "greenhouse.io", "workable.com", "ashbyhq.com"]):
            return href

    return fallback_url


def format_date(date_str):
    """Convert ISO date to relative time string."""
    if not date_str:
        return "Recently"
    try:
        dt = datetime.fromisoformat(date_str.replace("Z", "+00:00").split("+")[0])
        delta = datetime.now() - dt
        if delta.days == 0:
            hours = delta.seconds // 3600
            if hours == 0:
                return "Just now"
            return f"{hours}h ago"
        elif delta.days == 1:
            return "1 day ago"
        elif delta.days < 7:
            return f"{delta.days} days ago"
        elif delta.days < 30:
            weeks = delta.days // 7
            return f"{weeks}w ago"
        else:
            return f"{delta.days // 30}mo ago"
    except:
        return "Recently"


def format_date_unix(timestamp):
    """Convert Unix timestamp to relative time."""
    if not timestamp:
        return "Recently"
    try:
        dt = datetime.fromtimestamp(timestamp)
        return format_date(dt.isoformat())
    except:
        return "Recently"


def format_salary(min_sal, max_sal):
    """Format salary range."""
    if not min_sal and not max_sal:
        return None
    if min_sal and max_sal:
        return f"${min_sal:,.0f} - ${max_sal:,.0f}"
    if min_sal:
        return f"${min_sal:,.0f}+"
    return f"Up to ${max_sal:,.0f}"


def deduplicate_jobs(jobs):
    """Remove duplicate jobs based on title + company hash."""
    seen = set()
    unique = []
    for job in jobs:
        key = hashlib.md5(
            f"{job['title'].lower().strip()}{job['company'].lower().strip()}".encode()
        ).hexdigest()
        if key not in seen:
            seen.add(key)
            unique.append(job)
    return unique


def enrich_job(job):
    """Add computed fields to each job."""
    title_lower = job["title"].lower()

    # Auto-detect level
    if any(kw in title_lower for kw in ["intern", "trainee", "apprentice"]):
        job["level"] = "Intern"
    elif any(kw in title_lower for kw in ["senior", "sr.", "lead", "principal", "staff"]):
        job["level"] = "Senior"
    elif any(kw in title_lower for kw in ["junior", "jr.", "entry", "associate", "graduate"]):
        job["level"] = "Entry Level"
    elif any(kw in title_lower for kw in ["manager", "director", "head of", "vp"]):
        job["level"] = "Manager"
    else:
        job["level"] = "Mid Level"

    # Auto-detect category
    if any(kw in title_lower for kw in ["ai", "ml", "machine learning", "deep learning", "nlp", "data scien"]):
        job["auto_category"] = "AI/ML"
    elif any(kw in title_lower for kw in ["frontend", "front-end", "react", "angular", "vue", "ui"]):
        job["auto_category"] = "Frontend"
    elif any(kw in title_lower for kw in ["backend", "back-end", "server", "api", "django", "flask"]):
        job["auto_category"] = "Backend"
    elif any(kw in title_lower for kw in ["full stack", "fullstack", "full-stack"]):
        job["auto_category"] = "Full Stack"
    elif any(kw in title_lower for kw in ["devops", "sre", "infrastructure", "cloud", "platform"]):
        job["auto_category"] = "DevOps"
    elif any(kw in title_lower for kw in ["data", "analytics", "analyst", "bi"]):
        job["auto_category"] = "Data"
    elif any(kw in title_lower for kw in ["design", "ux", "ui", "graphic"]):
        job["auto_category"] = "Design"
    elif any(kw in title_lower for kw in ["product", "pm"]):
        job["auto_category"] = "Product"
    elif any(kw in title_lower for kw in ["growth", "marketing", "seo", "content"]):
        job["auto_category"] = "Growth"
    else:
        job["auto_category"] = "Engineering"

    return job


# ══════════════════════════════════════════════════════════════
# API ROUTES
# ══════════════════════════════════════════════════════════════

@app.route("/api/search", methods=["GET"])
def search_jobs():
    """
    Main search endpoint.
    Params:
        q       - search query (e.g., "python developer")
        location - location filter (e.g., "India", "Remote")
        sources  - comma-separated sources (e.g., "linkedin,remotive")
        limit    - max results per source (default 20)
    Returns:
        JSON array of deduplicated, enriched job listings
    """
    query = request.args.get("q", "software engineer")
    location = request.args.get("location", "")
    sources = request.args.get("sources", "linkedin,remotive,himalayas,arbeitnow").split(",")
    limit = min(int(request.args.get("limit", 20)), 50)

    # Check cache
    cache_key = f"{query}_{location}_{','.join(sorted(sources))}_{limit}"
    if cache_key in _cache:
        cached_time, cached_data = _cache[cache_key]
        if time.time() - cached_time < CACHE_TTL:
            print(f"[Cache] Serving cached results for '{query}'")
            return jsonify({
                "jobs": cached_data,
                "count": len(cached_data),
                "query": query,
                "location": location,
                "sources": sources,
                "cached": True,
            })

    all_jobs = []

    # Fetch from sources in parallel
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {}

        if "linkedin" in sources:
            futures[executor.submit(fetch_linkedin_jobs, query, location or "India", limit)] = "linkedin"

        if "remotive" in sources:
            futures[executor.submit(fetch_remotive_jobs, query, "", limit)] = "remotive"

        if "himalayas" in sources:
            futures[executor.submit(fetch_himalayas_jobs, query, limit)] = "himalayas"

        if "arbeitnow" in sources:
            futures[executor.submit(fetch_arbeitnow_jobs, query, limit)] = "arbeitnow"

        for future in as_completed(futures):
            source = futures[future]
            try:
                jobs = future.result()
                all_jobs.extend(jobs)
            except Exception as e:
                print(f"[{source}] Failed: {e}")

    # Deduplicate and enrich
    unique_jobs = deduplicate_jobs(all_jobs)
    enriched_jobs = [enrich_job(job) for job in unique_jobs]

    # Sort by date (newest first)
    enriched_jobs.sort(key=lambda j: str(j.get("posted_date", "")), reverse=True)

    # Cache results
    _cache[cache_key] = (time.time(), enriched_jobs)

    return jsonify({
        "jobs": enriched_jobs,
        "count": len(enriched_jobs),
        "query": query,
        "location": location,
        "sources": sources,
        "cached": False,
    })


@app.route("/api/job/<source>/<job_id>", methods=["GET"])
def get_job_details(source, job_id):
    """
    Fetch full details for a specific job.
    Currently supports LinkedIn detail fetching.
    """
    if source == "linkedin":
        details = fetch_linkedin_job_details(job_id)
        if details:
            return jsonify({"details": details, "source": source})
        return jsonify({"error": "Could not fetch details"}), 404

    return jsonify({"error": "Detail fetch not supported for this source"}), 400


@app.route("/api/sources", methods=["GET"])
def list_sources():
    """List available job sources and their status."""
    return jsonify({
        "sources": [
            {
                "id": "linkedin",
                "name": "LinkedIn",
                "type": "scraper",
                "auth": "none",
                "description": "Scrapes LinkedIn's public guest job API",
                "endpoint": "linkedin.com/jobs-guest/jobs/api/",
            },
            {
                "id": "remotive",
                "name": "Remotive",
                "type": "api",
                "auth": "none",
                "description": "Free public API for remote jobs",
                "endpoint": "remotive.com/api/remote-jobs",
            },
            {
                "id": "himalayas",
                "name": "Himalayas",
                "type": "api",
                "auth": "none",
                "description": "Free public API for remote jobs with search",
                "endpoint": "himalayas.app/jobs/api",
            },
            {
                "id": "arbeitnow",
                "name": "Arbeitnow",
                "type": "api",
                "auth": "none",
                "description": "Free public job board API",
                "endpoint": "arbeitnow.com/api/job-board-api",
            },
        ]
    })


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "timestamp": datetime.now().isoformat()})


# ══════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("=" * 55)
    print("  JobPulse Backend — Multi-Source Job Aggregator")
    print("=" * 55)
    print()
    print("  Endpoints:")
    print("    GET /api/search?q=python&location=India")
    print("    GET /api/job/linkedin/<job_id>")
    print("    GET /api/sources")
    print("    GET /api/health")
    print()
    print("  Sources: LinkedIn, Remotive, Himalayas, Arbeitnow")
    print("  All free, no API keys required!")
    print()
    print("=" * 55)
    app.run(debug=True, port=5000)