#!/usr/bin/env bash
# Build & install script for the Desktop Widget GNOME Shell extension.
set -e

UUID="desktop-widget@anik"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"

echo "==> Compiling GSettings schema..."
glib-compile-schemas "$SRC_DIR/schemas"

echo "==> Installing to $DEST_DIR ..."
mkdir -p "$DEST_DIR"
cp -r "$SRC_DIR"/* "$DEST_DIR"/

echo "==> Enabling extension..."
gnome-extensions enable "$UUID" || true

echo ""
echo "Done."
echo "Code changes require a new GNOME Shell process; toggling the extension is not enough."
echo "On X11: press Alt+F2, type 'r', press Enter to reload GNOME Shell."
echo "On Wayland: log out and back in (Shell can't hot-reload on Wayland)."
echo ""
echo "Then open settings with:"
echo "  gnome-extensions prefs $UUID"
