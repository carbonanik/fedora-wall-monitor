import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// ---- helpers -------------------------------------------------------------

function hexToRgba(hex, alpha) {
    hex = hex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function readFileSync(path) {
    try {
        const file = Gio.File.new_for_path(path);
        const [ok, contents] = file.load_contents(null);
        if (!ok) return null;
        return new TextDecoder('utf-8').decode(contents);
    } catch (e) {
        return null;
    }
}

// ---- the widget actor ------------------------------------------------------

const DesktopWidget = GObject.registerClass(
class DesktopWidget extends St.BoxLayout {
    _init(settings) {
        super._init({
            style_class: 'desktop-widget-card',
            vertical: true,
            reactive: true,
            track_hover: true,
            can_focus: true,
        });

        this._settings = settings;
        this._prevCpu = null;

        // --- drag state ---
        this._dragging = false;
        this._dragOffsetX = 0;
        this._dragOffsetY = 0;

        this._buildUi();
        this._applySettings();

        // connect drag events
        this.connect('button-press-event', this._onButtonPress.bind(this));
        this.connect('button-release-event', this._onButtonRelease.bind(this));
        this.connect('motion-event', this._onMotionEvent.bind(this));

        // react to settings changes live (e.g. from prefs window)
        this._settingsChangedId = this._settings.connect('changed', () => {
            this._applySettings();
        });

        // timers
        this._clockTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this._updateClock();
            return GLib.SOURCE_CONTINUE;
        });

        this._statsTimeoutId = null;
        this._scheduleStatsTimer();

        this._updateClock();
        this._updateStats();
    }

    _buildUi() {
        this._timeLabel = new St.Label({ style_class: 'dw-time', text: '--:--' });
        this._dateLabel = new St.Label({ style_class: 'dw-date', text: '' });

        this._statsBox = new St.BoxLayout({ vertical: true, style_class: 'dw-stats' });
        this._cpuRow = this._buildStatRow('CPU');
        this._ramRow = this._buildStatRow('RAM');
        this._statsBox.add_child(this._cpuRow.container);
        this._statsBox.add_child(this._ramRow.container);

        this.add_child(this._timeLabel);
        this.add_child(this._dateLabel);
        this.add_child(this._statsBox);
    }

    _buildStatRow(label) {
        const container = new St.BoxLayout({ vertical: false, style_class: 'dw-stat-row' });
        const nameLabel = new St.Label({ text: label, style_class: 'dw-stat-name' });

        const barBg = new St.Widget({ style_class: 'dw-bar-bg' });
        const barFg = new St.Widget({ style_class: 'dw-bar-fg' });
        barBg.add_child(barFg);

        const pctLabel = new St.Label({ text: '0%', style_class: 'dw-stat-pct' });

        container.add_child(nameLabel);
        container.add_child(barBg);
        container.add_child(pctLabel);

        return { container, barBg, barFg, pctLabel };
    }

    _applySettings() {
        const opacity = this._settings.get_int('opacity');
        const accent = this._settings.get_string('accent-color');

        this.set_style(`background-color: ${hexToRgba('#101018', opacity / 100)};`);
        this._timeLabel.set_style(`color: ${accent};`);

        this._dateLabel.visible = this._settings.get_boolean('show-date');
        this._statsBox.visible = this._settings.get_boolean('show-stats');

        const x = this._settings.get_int('pos-x');
        const y = this._settings.get_int('pos-y');
        this.set_position(x, y);

        this._cpuRow.barFg.set_style(`background-color: ${accent};`);
        this._ramRow.barFg.set_style(`background-color: ${accent};`);

        this._scheduleStatsTimer();
    }

    _scheduleStatsTimer() {
        if (this._statsTimeoutId) {
            GLib.source_remove(this._statsTimeoutId);
            this._statsTimeoutId = null;
        }
        const seconds = Math.max(1, this._settings.get_int('refresh-seconds'));
        this._statsTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, () => {
            this._updateStats();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _updateClock() {
        const now = GLib.DateTime.new_now_local();
        const use24h = this._settings.get_boolean('use-24h');
        const timeFmt = use24h ? '%H:%M' : '%I:%M %p';
        this._timeLabel.set_text(now.format(timeFmt));
        this._dateLabel.set_text(now.format('%A, %d %B'));
    }

    _updateStats() {
        this._updateCpu();
        this._updateRam();
    }

    _updateCpu() {
        const text = readFileSync('/proc/stat');
        if (!text) return;
        const line = text.split('\n')[0]; // "cpu  1234 0 5678 ..."
        const parts = line.trim().split(/\s+/).slice(1).map(Number);
        const idle = parts[3] + (parts[4] || 0);
        const total = parts.reduce((a, b) => a + b, 0);

        if (this._prevCpu) {
            const totalDiff = total - this._prevCpu.total;
            const idleDiff = idle - this._prevCpu.idle;
            const usage = totalDiff > 0 ? Math.round(100 * (1 - idleDiff / totalDiff)) : 0;
            this._setBar(this._cpuRow, usage);
        }
        this._prevCpu = { idle, total };
    }

    _updateRam() {
        const text = readFileSync('/proc/meminfo');
        if (!text) return;
        const map = {};
        for (const line of text.split('\n')) {
            const m = line.match(/^(\w+):\s+(\d+)/);
            if (m) map[m[1]] = parseInt(m[2], 10);
        }
        const total = map['MemTotal'];
        const avail = map['MemAvailable'] ?? map['MemFree'];
        if (!total || avail === undefined) return;
        const usage = Math.round(100 * (1 - avail / total));
        this._setBar(this._ramRow, usage);
    }

    _setBar(row, pct) {
        pct = Math.max(0, Math.min(100, pct));
        row.pctLabel.set_text(`${pct}%`);
        const accent = this._settings.get_string('accent-color');
        row.barFg.set_style(`background-color: ${accent}; width: ${pct}%;`);
    }

    // --- dragging ---

    _onButtonPress(actor, event) {
        if (event.get_button() !== 1) return Clutter.EVENT_PROPAGATE;
        this._dragging = true;
        const [stageX, stageY] = event.get_coords();
        const [actorX, actorY] = this.get_transformed_position();
        this._dragOffsetX = stageX - actorX;
        this._dragOffsetY = stageY - actorY;
        global.display.set_cursor(Meta.Cursor.MOVE);
        return Clutter.EVENT_STOP;
    }

    _onButtonRelease(actor, event) {
        if (!this._dragging) return Clutter.EVENT_PROPAGATE;
        this._dragging = false;
        const [x, y] = this.get_position();
        this._settings.set_int('pos-x', Math.round(x));
        this._settings.set_int('pos-y', Math.round(y));
        return Clutter.EVENT_STOP;
    }

    _onMotionEvent(actor, event) {
        if (!this._dragging) return Clutter.EVENT_PROPAGATE;
        const [stageX, stageY] = event.get_coords();
        const newX = stageX - this._dragOffsetX;
        const newY = stageY - this._dragOffsetY;
        this.set_position(Math.round(newX), Math.round(newY));
        return Clutter.EVENT_STOP;
    }

    destroy() {
        if (this._clockTimeoutId) {
            GLib.source_remove(this._clockTimeoutId);
            this._clockTimeoutId = null;
        }
        if (this._statsTimeoutId) {
            GLib.source_remove(this._statsTimeoutId);
            this._statsTimeoutId = null;
        }
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        super.destroy();
    }
});

// ---- extension entry point -------------------------------------------------

export default class DesktopWidgetExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._widget = new DesktopWidget(this._settings);

        // Main.layoutManager._backgroundGroup sits below global.window_group
        // in the stacking order (wallpaper -> backgroundGroup -> windows -> UI
        // chrome), so adding the widget here makes it render behind normal
        // app windows instead of always-on-top, like a real desktop widget.
        Main.layoutManager._backgroundGroup.add_child(this._widget);
    }

    disable() {
        if (this._widget) {
            this._widget.destroy();
            this._widget = null;
        }
        this._settings = null;
    }
}
