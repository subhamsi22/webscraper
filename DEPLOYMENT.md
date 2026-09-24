# Deployment Guide: Render (`onrender.com`) vs Vercel

This guide explains how to host your **Google Business CRM Finder** online so anyone can use it.

---

## 🏆 Recommendation: Render (`onrender.com`) vs Vercel

| Feature | Render (`onrender.com`) ⭐ **Recommended** | Vercel |
| :--- | :--- | :--- |
| **Puppeteer / Chrome Support** | **Native Docker support with full Chrome** | Serverless Lambda (Requires `@sparticuz/chromium`) |
| **Execution Timeout** | **No short timeout** (persistent Web Service) | **10-second hard limit** (Hobby free tier) |
| **Scraping Reliability** | **High** (Runs full desktop browser session) | Low (Google often blocks AWS Lambda serverless IPs) |
| **Pricing** | **Free Tier Available** | Free Tier Available |

> [!IMPORTANT]
> Because web scraping takes 5 to 15 seconds to load Google and render dynamic business listings, **Render (via Docker)** is the easiest, most reliable, and recommended option. Vercel's 10-second timeout will often abort long search queries before Google finishes rendering.

---

## 🚀 How to Host on Render (`onrender.com`) in 5 Minutes

### Step 1: Push your code to GitHub
If you haven't already initialized Git and pushed to GitHub:
```bash
git init
git add .
git commit -m "Initial commit of Google CRM Finder Web App"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

---

### Step 2: Deploy on Render

1. Go to **[dashboard.render.com](https://dashboard.render.com/)** and sign up / log in with your GitHub account.
2. Click the **"New +"** button in the top right and select **"Web Service"**.
3. Choose **"Build and deploy from a Git repository"** and click **Next**.
4. Select your `googlecrmfinder` repository.
5. Fill in the deployment settings:
   - **Name**: `googlecrmfinder` (or any name you choose)
   - **Region**: Choose the region closest to you (e.g., *Singapore*, *Frankfurt*, *Oregon*)
   - **Branch**: `main`
   - **Root Directory**: `web`
   - **Runtime**: Select **Docker** (Render will automatically detect the provided [`Dockerfile`](./Dockerfile))
   - **Instance Type**: Select **Free**
6. Click **"Deploy Web Service"** at the bottom of the page!

Render will build the Docker container with Google Chrome and all dependencies already included. Within 2-3 minutes, your site will be live at:
👉 `https://your-app-name.onrender.com`

---

## ⚡ Option 2: Deploying on Vercel

If you want to host on Vercel, the recommended architecture is:
1. **Backend**: Host the scraper server on Render (`https://your-backend.onrender.com`).
2. **Frontend**: Deploy the `public/` frontend to Vercel.

### Deploying Frontend to Vercel:
1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```
2. Navigate to `web` and run:
   ```bash
   cd web
   vercel
   ```
3. In `public/app.js`, update the API endpoint URLs to point to your live Render backend URL:
   ```javascript
   const API_BASE = 'https://your-app-name.onrender.com';
   // e.g. fetch(`${API_BASE}/api/scrape`, ...)
   ```

---

## 🛠️ Included Deployment Files in This Repository

1. [`Dockerfile`](./Dockerfile) — Official Puppeteer container with Chrome and fonts pre-installed for Render Docker deployment.
2. [`render.yaml`](./render.yaml) — Render blueprint configuration.
3. [`.dockerignore`](./.dockerignore) — Excludes unnecessary files to keep deployment fast and lightweight.
4. [`vercel.json`](./vercel.json) — Static routing configuration for Vercel.
