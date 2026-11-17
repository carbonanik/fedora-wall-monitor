import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class DesktopWidgetPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'Widget',
            icon_name: 'preferences-desktop-display-symbolic',
        });
        window.add(page);

        // --- Appearance group ---
        const appearanceGroup = new Adw.PreferencesGroup({ title: 'Appearance' });
        page.add(appearanceGroup);

        appearanceGroup.add(this._spinRow(
            'Opacity', 'Background opacity of the widget card (%)',
            settings, 'opacity', 0, 100, 5
        ));

        appearanceGroup.add(this._colorRow(
            'Accent color', 'Used for the live indicator and usage meters', settings
        ));

        appearanceGroup.add(this._switchRow(
            'Show date', 'Display the date under the clock', settings, 'show-date'
        ));

        appearanceGroup.add(this._switchRow(
            'Use 24-hour clock', 'Show time as 24h instead of 12h AM/PM', settings, 'use-24h'
        ));

        // --- Stats group ---
        const statsGroup = new Adw.PreferencesGroup({ title: 'System Stats' });
        page.add(statsGroup);

        statsGroup.add(this._switchRow(
            'Show CPU / RAM', 'Display live CPU and memory usage bars', settings, 'show-stats'
        ));

        statsGroup.add(this._spinRow(
            'Refresh interval', 'How often to refresh stats (seconds)',
            settings, 'refresh-seconds', 1, 30, 1
        ));

        // --- Position group ---
        const positionGroup = new Adw.PreferencesGroup({
            title: 'Position',
            description: 'You can also just drag the widget with your mouse on the desktop.',
        });
        page.add(positionGroup);

        positionGroup.add(this._spinRow(
            'X position', 'Pixels from the left edge', settings, 'pos-x', 0, 5000, 10
        ));

        positionGroup.add(this._spinRow(
            'Y position', 'Pixels from the top edge', settings, 'pos-y', 0, 5000, 10
        ));
    }

    _switchRow(title, subtitle, settings, key) {
        const row = new Adw.SwitchRow({ title, subtitle });
        settings.bind(key, row, 'active', 0);
        return row;
    }

    _spinRow(title, subtitle, settings, key, lower, upper, step) {
        const row = new Adw.SpinRow({
            title,
            subtitle,
            adjustment: new Gtk.Adjustment({
                lower, upper,
                step_increment: step,
                page_increment: step * 5,
            }),
        });
        settings.bind(key, row, 'value', 0);
        return row;
    }

    _colorRow(title, subtitle, settings) {
        const row = new Adw.ActionRow({ title, subtitle });

        const colorButton = new Gtk.ColorButton({ valign: Gtk.Align.CENTER });

        // Initialize from current hex string
        const hex = settings.get_string('accent-color');
        const gdkRgba = new Gdk.RGBA();
        gdkRgba.parse(hex);
        colorButton.set_rgba(gdkRgba);

        colorButton.connect('color-set', () => {
            const c = colorButton.get_rgba();
            const toHex = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
            const hexOut = `#${toHex(c.red)}${toHex(c.green)}${toHex(c.blue)}`;
            settings.set_string('accent-color', hexOut);
        });

        row.add_suffix(colorButton);
        row.activatable_widget = colorButton;
        return row;
    }
}
