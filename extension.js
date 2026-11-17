import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { drawClock } from './clock.js';

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
        this._statsTimeoutId = null;

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

        this._updateClock();
        this._updateStats();
    }

    _buildUi() {
        const header = new St.BoxLayout({ style_class: 'dw-header' });
        header.add_child(new St.Label({ text: '▰', style_class: 'dw-insignia' }));
        const identity = new St.BoxLayout({ vertical: true, x_expand: true });
        identity.add_child(new St.Label({ text: 'WALL MONITOR', style_class: 'dw-heading' }));
        identity.add_child(new St.Label({ text: 'PERSONAL TELEMETRY TERMINAL', style_class: 'dw-subheading' }));
        header.add_child(identity);
        this._statusLabel = new St.Label({ text: '● ONLINE', style_class: 'dw-status', y_align: Clutter.ActorAlign.CENTER });
        header.add_child(this._statusLabel);

        const clockBox = new St.BoxLayout({ vertical: true, style_class: 'dw-clock' });
        const clockHeading = new St.BoxLayout({ style_class: 'dw-clock-heading' });
        clockHeading.add_child(new St.Label({ text: '01 / LOCAL TIME', x_expand: true }));
        clockHeading.add_child(new St.Label({ text: '[ RTC ]', style_class: 'dw-clock-tag' }));
        clockBox.add_child(clockHeading);

        const clockRow = new St.BoxLayout({ style_class: 'dw-clock-row' });
        this._clockDigits = '0000';
        this._clockFace = new St.DrawingArea({ style_class: 'dw-clock-face' });
        this._clockFace.connect('repaint', area => {
            const cr = area.get_context();
            const [width, height] = area.get_surface_size();
            drawClock(cr, this._clockDigits, width, height);
            cr.$dispose();
        });
        clockRow.add_child(this._clockFace);
        const clockDetail = new St.BoxLayout({ vertical: true, style_class: 'dw-clock-detail', y_align: Clutter.ActorAlign.END });
        this._secondsLabel = new St.Label({ text: '00', style_class: 'dw-seconds' });
        this._periodLabel = new St.Label({ text: '24H', style_class: 'dw-period' });
        clockDetail.add_child(new St.Label({ text: 'SEC', style_class: 'dw-detail-label' }));
        clockDetail.add_child(this._secondsLabel);
        clockDetail.add_child(this._periodLabel);
        clockRow.add_child(clockDetail);
        clockBox.add_child(clockRow);
        this._dateLabel = new St.Label({ style_class: 'dw-date', text: '' });
        clockBox.add_child(this._dateLabel);

        this._statsBox = new St.BoxLayout({ vertical: true, style_class: 'dw-stats' });
        const statsHeading = new St.BoxLayout({ style_class: 'dw-stats-heading' });
        statsHeading.add_child(new St.Label({ text: '02 / SYSTEM LOAD', x_expand: true }));
        statsHeading.add_child(new St.Label({ text: '0 ───── 100', style_class: 'dw-scale' }));
        this._statsBox.add_child(statsHeading);
        this._cpuRow = this._buildStatRow('A', 'CPU');
        this._ramRow = this._buildStatRow('B', 'RAM');
        this._statsBox.add_child(this._cpuRow.container);
        this._statsBox.add_child(this._ramRow.container);

        const footer = new St.BoxLayout({ style_class: 'dw-footer' });
        footer.add_child(new St.Label({ text: `NODE / ${GLib.get_host_name().toUpperCase().slice(0, 16)}`, x_expand: true }));
        footer.add_child(new St.Label({ text: ':: DRAG TO RELOCATE' }));

        this._accentRail = new St.Widget({ style_class: 'dw-accent-rail' });
        this.add_child(this._accentRail);
        this.add_child(header);
        this.add_child(clockBox);
        this.add_child(this._statsBox);
        this.add_child(footer);
    }

    _buildStatRow(index, label) {
        const container = new St.BoxLayout({ vertical: false, style_class: 'dw-stat-row' });
        const indexLabel = new St.Label({ text: index, style_class: 'dw-stat-index', y_align: Clutter.ActorAlign.CENTER });
        const nameLabel = new St.Label({ text: label, style_class: 'dw-stat-name', y_align: Clutter.ActorAlign.CENTER });

        const meter = new St.BoxLayout({ style_class: 'dw-meter', y_align: Clutter.ActorAlign.CENTER });
        const segments = Array.from({ length: 20 }, () => {
            const segment = new St.Widget({ style_class: 'dw-meter-segment' });
            meter.add_child(segment);
            return segment;
        });

        const pctLabel = new St.Label({ text: '—%', style_class: 'dw-stat-pct', x_expand: true, x_align: Clutter.ActorAlign.END, y_align: Clutter.ActorAlign.CENTER });

        container.add_child(indexLabel);
        container.add_child(nameLabel);
        container.add_child(meter);
        container.add_child(pctLabel);

        return { container, segments, pctLabel, usage: null };
    }

    _applySettings() {
        const opacity = this._settings.get_int('opacity');
        const accent = this._settings.get_string('accent-color');

        this.set_style(`background-color: ${hexToRgba('#0c100e', opacity / 100)};`);
        this._statusLabel.set_style(`color: ${accent};`);
        this._secondsLabel.set_style(`color: ${accent};`);
        this._accentRail.set_style(`background-color: ${accent};`);

        this._dateLabel.visible = this._settings.get_boolean('show-date');
        this._statsBox.visible = this._settings.get_boolean('show-stats');

        const x = this._settings.get_int('pos-x');
        const y = this._settings.get_int('pos-y');
        this.set_position(x, y);

        for (const row of [this._cpuRow, this._ramRow]) {
            if (row.usage !== null) this._setBar(row, row.usage);
        }

        this._updateClock();
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
        const digits = now.format(use24h ? '%H%M' : '%I%M');
        if (this._clockDigits !== digits) {
            this._clockDigits = digits;
            this._clockFace.queue_repaint();
        }
        this._secondsLabel.set_text(now.format('%S'));
        this._periodLabel.set_text(use24h ? '24H' : now.format('%p'));
        this._dateLabel.set_text(now.format('%a  /  %d %b %Y').toUpperCase());
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
        row.usage = pct;
        row.pctLabel.set_text(`${pct}%`);
        const accent = this._settings.get_string('accent-color');
        const activeSegments = Math.round(pct / 100 * row.segments.length);
        row.segments.forEach((segment, index) => {
            segment.set_style(index < activeSegments ? `background-color: ${accent};` : null);
        });
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
