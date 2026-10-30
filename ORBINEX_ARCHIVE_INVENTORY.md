# ORBINEX — Archive & Extracted Folder Inventory

**Date:** October 30, 2026  
**Scope:** Read-Only Discovery across `c:\Users\shash\Downloads`  
**Purpose:** Identify, classify, and isolate all project archives, modules, and datasets to prevent accidental deletion or overlapping builds.

---

## 1. Inventory & Classification Matrix

| Folder / Archive Name | Discovered Type | Main Technology | Dependency Manifest | Category | Description & Role in ORBINEX |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`osiris-master/osiris-master`** | **Active Full-Stack App** | Next.js 16, TypeScript, MapLibre GL | `package.json` | **A. Main Application** | **PRIMARY REPOSITORY.** Contains the complete 3D globe, 87 API routes, 53 UI components, and MapLibre rendering engine. Currently running on `localhost:3000`. |
| **`RefugeeCampShelterDetection-YOLOv8-main`** | **AI Inference Module** | Python, Ultralytics YOLOv8, SAHI | `requirements.txt` / scripts | **B. Supporting AI Module** | Contains pretrained YOLOv8 settlement and shelter detection models (`app.py`, `run_detection.py`, SAHI inference scripts). To be leveraged in Phase 1 for satellite settlement detection. |
| **`worldmonitor-main`** / `worldmonitor-main.zip` | Alternative Dashboard | Next.js / TypeScript | `package.json` | **F. Reference / Duplicate** | Separate open-source monitoring project. Do not merge into ORBINEX; keep as external reference. |
| **`archive (2)`** / `archive (2).zip` (517 MB) | Dataset Archive | Compressed text/features (`.bz2`) | None | **C. Data & Imagery Archive** | Large dataset archive (likely NLP/sentiment or benchmark data). Preserve read-only. |
| **`Camverse`** | Camera Vision Backend | Python / Computer Vision | `.env`, `.pytest_cache` | **B. Supporting Backend Module** | CCTV / camera analysis scripts. Independent of main platform. |
| **`AAROHA-HUMAN_OS`** | Mobile / IoT Application | Python / Android APK | `requirements.txt` | **G. Independent Project** | Independent project. Not related to ORBINEX geospatial platform. |
| **`Bank-Management_system`** | Academic Application | Java / Web | None | **G. Independent Project** | Unrelated academic project. Preserve read-only. |
| **`NavGuide-master`** | Navigation Utility | Python / Web | None | **G. Independent Project** | Unrelated navigation project. Preserve read-only. |
| **`UTKFace-new.zip`** (347 MB) | Facial Dataset | Image dataset | None | **C. Data Archive** | Computer vision benchmark dataset. Unrelated to geospatial monitoring. |
| **`tweeteval-main.zip`** / `tweeteval-main` | NLP Benchmark | Python | None | **C. Data Archive** | TweetEval sentiment dataset. Unrelated to geospatial monitoring. |

---

## 2. Recommendation on Project Root

### **Primary Project Root: `c:\Users\shash\Downloads\osiris-master\osiris-master`**

**Rationale:**
1. This is the **only repository** containing the full MapLibre GL 3D globe, WebGL vector pipelines, 87 Next.js API routes, and 53 UI components.
2. The active development server (`task-45`) is running directly from this directory on `http://localhost:3000`.
3. All dependencies are already installed and verified (`node_modules` intact, 1,506 tests passing).
4. All future phases (Phase 1 AI settlement detection, Phase 2 historical satellite comparison, Phase 3 Indian regional presets) will be built natively on top of this codebase.
5. Supporting AI models from `RefugeeCampShelterDetection-YOLOv8-main` will be interfaced via clean API contracts without disturbing or moving the folders.
