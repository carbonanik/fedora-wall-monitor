# Desktop Widget (GNOME Shell Extension)

An Android-style floating widget for your GNOME desktop on Fedora. Shows a
live clock, date, and CPU/RAM usage bars in a draggable card that sits
directly on the desktop layer (not in a window).

## Requirements

- Fedora with GNOME Shell 45, 46, or 47 (check with `gnome-shell --version`)
- `glib2-devel` for `glib-compile-schemas` (usually already present; if not:
  `sudo dnf install glib2-devel`)

## Install

```bash
chmod +x build.sh
./build.sh
```

Then reload GNOME Shell:
- **X11**: `Alt+F2`, type `r`, hit Enter
- **Wayland**: log out and back in (required — Wayland sessions can't
  hot-reload the shell)

Verify it's enabled:
```bash
gnome-extensions list --enabled | grep desktop-widget
```

If it's not enabled:
```bash
gnome-extensions enable desktop-widget@anik
```

## Usage

- **Move it**: click and drag the card anywhere on the desktop. Its new
  position is saved automatically.
- **Settings**: `gnome-extensions prefs desktop-widget@anik`, or find
  "Desktop Widget" in the Extensions app.

Settings available:
| Setting | What it does |
|---|---|
| Opacity | Background transparency of the card |
| Accent color | Clock text + stat bar color |
| Show date | Toggle the date line |
| 24-hour clock | 24h vs 12h AM/PM |
| Show CPU/RAM | Toggle the stats section |
| Refresh interval | How often stats update (seconds) |
| X / Y position | Manual position (or just drag it) |

## Uninstall

```bash
gnome-extensions disable desktop-widget@anik
rm -rf ~/.local/share/gnome-shell/extensions/desktop-widget@anik
```

## Project layout

```
desktop-widget@anik/
├── extension.js      # widget logic: clock, stats polling, drag handling
├── prefs.js           # Adwaita settings UI
├── metadata.json      # extension metadata (uuid, supported shell versions)
├── stylesheet.css      # card + bar styling
├── schemas/
│   └── org.gnome.shell.extensions.desktop-widget.gschema.xml
└── build.sh            # compiles schema + installs into ~/.local/share
```

## How it works (notes for hacking on it)

- `Main.layoutManager.addChrome()` is what places the widget on the desktop
  layer rather than as a normal window — this is the key API that makes it
  behave like an Android home-screen widget instead of a floating app window.
- CPU % is computed by diffing two `/proc/stat` samples (idle vs total
  jiffies) between refresh ticks — first tick after enable has no previous
  sample so it's skipped.
- RAM % uses `MemAvailable` from `/proc/meminfo` (falls back to `MemFree`
  on very old kernels that lack `MemAvailable`).
- Dragging is implemented manually via `button-press-event` /
  `motion-event` / `button-release-event` on the actor itself, since St
  widgets placed with `addChrome` aren't normal draggable windows.
- All prefs are backed by GSettings (`dconf`), so changes in the prefs
  window apply live via a `settings.connect('changed', ...)` listener —
  no need to reload the shell after tweaking settings, only after
  installing/updating the extension files themselves.

## Extending it

Some natural next additions if you want to keep building on this:
- Multiple widget instances (e.g. separate clock + separate stats card)
- Per-monitor placement for multi-monitor setups
- A "click to open app" action, closer to real Android widget behavior
- Weather via a local API call (would need network permission handling)
