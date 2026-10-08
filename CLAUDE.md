# Portfolio — Alon Zvi Sabag

## Project
Plain HTML/CSS portfolio site hosted on GitHub Pages at https://alonzvisabag.github.io

## Structure
- `index.html` — the main page: hero with draggable word stickers, a running band of "מילים של מבוגרים", a bento grid of work (the Instagram card opens the posts as stories), and the cover letter as an ICQ-style chat
- `assets/` — pieces the main page loads: `shared.js`/`shared.css` (the opening CV that folds into a paper plane, once per browser), `icq.js`/`icq.css` (the chat), `words.js` (the word list)
- `old-site.html` — the previous main page, kept for reference (noindex)
- `portfolio/` — project pages (`far.html`, `sixty.html`, shared `case.css`), phone videos and stills in `portfolio/media/`
- `demo/` — demos of the two gift sites with invented names and blurred photos (noindex)
- `roni/`, `galit/` — the real gift sites (private, noindex)
- `image-1-nobg.png` … `image-10-nobg.png` and the Hebrew-named Instagram post images — artwork in the root folder (not a subfolder)

## Owner
- Name: Alon Zvi Sabag
- Email: alonzvi99@gmail.com
- GitHub: alonzvisabag

## Notes
- Images are in the root directory (not `/images/`) because GitHub upload via web UI doesn't support folders easily
- Hebrew image file names are set from JS with `encodeURIComponent` (`data-src` attributes)
- Fonts loaded from Google Fonts: Rubik (variable); the project pages also use Alef
