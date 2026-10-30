# Snake LCD

A classic Snake game with an LCD-screen look. Plain HTML, CSS and JavaScript, so there is nothing to install or build.

## Features
- Three speeds: Relaxed, Classic, Frantic (higher speeds score more points)
- Two edge modes: solid walls, or wrap around
- Speed goes up every 5 foods
- Bonus item every 4 foods, worth 50 points and gone after 6 seconds
- Separate best score for each speed and edge mode, saved in the browser
- Sound effects made with the Web Audio API (no audio files), with an on/off button
- Pause (Space, P or Esc), and the game pauses by itself when you switch tabs
- Works on phones: swipe on the board or use the on-screen pad

## Controls
- Keyboard: arrow keys or WASD
- Phone: swipe on the board, or use the pad
- Pause: Space, P, Esc, or the pause button

## Put it online with GitHub Pages
1. Create a new repository on GitHub, for example `snake-game`.
2. Upload every file from this folder, including the hidden `.github` folder, to the `main` branch.
3. In the repository, open **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.
4. Open the **Actions** tab. When the "Deploy to GitHub Pages" run turns green, your game is live at
   `https://<your-username>.github.io/<repo-name>/`

If the first run fails because Pages was not enabled yet, set the Source in step 3 and re-run the workflow from the Actions tab.

## Run it on your computer
Open `index.html` in a browser.

## Files
| File | What it does |
| --- | --- |
| `index.html` | Page structure, menu and overlays |
| `style.css` | Look and layout |
| `game.js` | Game logic, drawing, sound and input |
| `.github/workflows/deploy.yml` | Deploys the site to GitHub Pages on every push to `main` |
