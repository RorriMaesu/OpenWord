# 📝 OpenWord

OpenWord is a professional, high-fidelity, client-side word processor built with React, TypeScript, and Tiptap. It simulates a premium Microsoft Word desktop interface directly in your browser, featuring virtual pagination, dynamic margins, a responsive floating ribbon menu, auto-saving, and dark mode support.

[![Live Demo](https://img.shields.io/badge/Demo-Live%20on%20GitHub%20Pages-185abd?style=for-the-badge&logo=githubpages&logoColor=white)](https://rorrimaesu.github.io/OpenWord/)
[![Buy Me A Coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://buymeacoffee.com/rorrimaesu)

---

## ✨ Features

*   **Virtual A4/Letter Pagination:** Visual page splits that dynamically calculate heights and separate content exactly like a printed document.
*   **Dynamic Margin Ruler:** Drag-and-drop margin handles to adjust left and right margins dynamically in real-time, scaled with the document's zoom level.
*   **Auto-Collapsing Ribbon:** An interactive ribbon toolbar matching Microsoft Word's layout. It collapses into tabs automatically to maximize vertical reading space and slides open on hover.
*   **Direct Title Bar Renaming:** Click and rename the document title directly in the Windows-styled Title Bar.
*   **Auto-Save & Session Recovery:** Automatic, background saving to IndexedDB (v2) with an prompt-based session recovery interface on startup.
*   **Header & Footer Overlays:** Add dynamic, document-wide header and footer texts that appear relative to page margins.
*   **Sidebar Navigation:** Auto-updating outline list based on heading tags to navigate large documents quickly.
*   **Light/Dark Modes:** Full dark-mode canvas and UI theme selector on the bottom Status Bar.
*   **Zero-Server Exports:** Import HTML templates or export the document directly to `.docx` files completely client-side.

---

## 🛠️ Technology Stack

*   **Core:** React (v19) + TypeScript + Vite
*   **Editor Engine:** Tiptap (ProseMirror-based editor)
*   **Icons:** Lucide React
*   **State & DB:** HTML5 File System Access API & IndexedDB (client-side database)
*   **Styling:** Custom HSL variables for a sleek, responsive dark/light theme mockup.

---

## 🚀 Getting Started

### Prerequisites

Ensure you have [Node.js](https://nodejs.org/) installed on your machine.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/RorriMaesu/OpenWord.git
   cd OpenWord
   ```

2. Install the dependencies:
   ```bash
   npm install
   ```

3. Run the local development server:
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser to view the application.

### Building for Production

Compile the production-ready build:
```bash
npm run build
```
This generates a static single-page application inside the `dist/` directory.

---

## 📦 Deployment to GitHub Pages

OpenWord is configured to compile as a static, single-page application, making it ideal for hosting on **GitHub Pages**.

### Steps to Deploy:

1. **Install `gh-pages` helper package:**
   ```bash
   npm install gh-pages --save-dev
   ```

2. **Add homepage and scripts to `package.json`:**
   Configure `package.json` with your repository address:
   ```json
   "homepage": "https://RorriMaesu.github.io/OpenWord",
   "scripts": {
     ...
     "predeploy": "npm run build",
     "deploy": "gh-pages -r https://github.com/RorriMaesu/OpenWord.git -d dist"
   }
   ```

3. **Deploy from the command line:**
   ```bash
   npm run deploy
   ```

This will build the application, push the build artifacts to the `gh-pages` branch, and make the app live. Make sure that GitHub Pages is enabled in your repository settings under the `gh-pages` branch.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
