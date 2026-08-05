// Render Snippets — pure-JS HTML string helpers for the NamaMedical SPA.
// No npm dependencies. Returns HTML strings (NOT DOM nodes).
// All user-supplied content is escaped via escapeHTML to prevent XSS.

(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.RenderSnippets = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /* ---------- helpers ---------- */
    var RTL_LOCALES = { 'ar': 1, 'ar-sa': 1, 'ar-eg': 1, 'ur': 1, 'ur-pk': 1, 'fa': 1, 'he': 1, 'he-il': 1 };

    function escapeHTML(value) {
        if (value === null || value === undefined) return '';
        var s = String(value);
        return s
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function isRTL(lang) {
        if (!lang) return false;
        var s = String(lang).toLowerCase();
        return !!RTL_LOCALES[s.split('-')[0]] || !!RTL_LOCALES[s];
    }

    function attrs(obj) {
        if (!obj || typeof obj !== 'object') return '';
        var out = [];
        Object.keys(obj).forEach(function (k) {
            if (obj[k] === null || obj[k] === undefined || obj[k] === false) return;
            out.push(' ' + escapeHTML(k) + '="' + escapeHTML(obj[k]) + '"');
        });
        return out.join('');
    }

    function pick(o, k, d) {
        return (o && k in o && o[k] !== undefined) ? o[k] : d;
    }

    function dirnameOf(opts, fallback) {
        var lang = (opts && (opts.lang || opts.locale)) || fallback || 'en';
        return isRTL(lang) ? 'rtl' : 'ltr';
    }

    /* ---------- tag ---------- */
    function tag(text, opts) {
        opts = opts || {};
        var color = pick(opts, 'color', 'gray');
        var variant = pick(opts, 'variant', 'soft');
        var aria = pick(opts, 'ariaLabel', null) ? ' aria-label="' + escapeHTML(opts.ariaLabel) + '"' : '';
        return '<span class="r-tag r-tag--' + escapeHTML(color) + ' r-tag--' + escapeHTML(variant) + '"' + aria + '>'
            + escapeHTML(text) + '</span>';
    }

    /* ---------- stat ---------- */
    function stat(opts) {
        opts = opts || {};
        var dir = dirnameOf(opts);
        var trend = pick(opts, 'trend', null);
        var trendHTML = '';
        if (trend) {
            var t = String(trend);
            var cls = t.indexOf('-') === 0 ? 'r-trend r-trend--down' : (t.indexOf('+') === 0 ? 'r-trend r-trend--up' : 'r-trend');
            trendHTML = ' <span class="' + cls + '">' + escapeHTML(t) + '</span>';
        }
        return '<div class="r-stat" dir="' + dir + '">'
            + '<div class="r-stat__label">' + escapeHTML(opts.label || '') + '</div>'
            + '<div class="r-stat__value">' + escapeHTML(pick(opts, 'value', '')) + trendHTML + '</div>'
            + (opts.subtitle ? '<div class="r-stat__sub">' + escapeHTML(opts.subtitle) + '</div>' : '')
            + '</div>';
    }

    /* ---------- emptyState ---------- */
    function emptyState(opts) {
        opts = opts || {};
        var dir = dirnameOf(opts);
        var action = pick(opts, 'action', null);
        var onAction = pick(opts, 'onAction', null);
        var actionHTML = '';
        if (action) {
            actionHTML = '<button type="button" class="r-btn r-btn--primary"'
                + (onAction ? ' onclick="' + escapeHTML(onAction) + '"' : '')
                + '>' + escapeHTML(action) + '</button>';
        }
        return '<div class="r-empty" dir="' + dir + '" role="status">'
            + '<div class="r-empty__icon" aria-hidden="true">∅</div>'
            + '<div class="r-empty__title">' + escapeHTML(opts.title || '') + '</div>'
            + (opts.message ? '<div class="r-empty__msg">' + escapeHTML(opts.message) + '</div>' : '')
            + (actionHTML ? '<div class="r-empty__action">' + actionHTML + '</div>' : '')
            + '</div>';
    }

    /* ---------- table ---------- */
    function table(columns, rows, opts) {
        opts = opts || {};
        var dir = dirnameOf(opts);
        var sortable = !!opts.sortable;
        var aria = pick(opts, 'ariaLabel', 'Data table') ? ' aria-label="' + escapeHTML(opts.ariaLabel) + '"' : '';
        var cls = 'r-table' + (sortable ? ' r-table--sortable' : '');

        var thead = '<thead><tr>';
        columns.forEach(function (col, i) {
            var label = (typeof col === 'string') ? col : (col.label || col.key || '');
            var key = (typeof col === 'string') ? col : (col.key || col.label || '');
            var dataAttr = ' data-key="' + escapeHTML(key) + '"';
            thead += '<th scope="col"' + (sortable ? ' role="button" tabindex="0"' + dataAttr : '')
                + ' aria-sort="none">' + escapeHTML(label) + '</th>';
        });
        thead += '</tr></thead>';

        var tbody = '<tbody>';
        if (!rows || !rows.length) {
            tbody += '<tr><td colspan="' + columns.length + '" class="r-table__empty">'
                + escapeHTML(opts.emptyText || 'No data') + '</td></tr>';
        } else {
            rows.forEach(function (row) {
                tbody += '<tr>';
                columns.forEach(function (col) {
                    var key = (typeof col === 'string') ? col : (col.key || col.label || '');
                    var cell = (row && key in row) ? row[key] : '';
                    tbody += '<td>' + escapeHTML(cell) + '</td>';
                });
                tbody += '</tr>';
            });
        }
        tbody += '</tbody>';

        return '<div class="' + cls + '" dir="' + dir + '"' + aria + '>'
            + '<table>' + thead + tbody + '</table></div>';
    }

    /* ---------- card ---------- */
    function card(opts) {
        opts = opts || {};
        var dir = dirnameOf(opts);
        var actions = [];
        if (Array.isArray(opts.actions)) {
            opts.actions.forEach(function (a) {
                var cls = 'r-btn ' + (a.variant ? 'r-btn--' + escapeHTML(a.variant) : 'r-btn--secondary');
                var onClick = a.onClick ? ' onclick="' + escapeHTML(a.onClick) + '"' : '';
                var disabled = a.disabled ? ' disabled' : '';
                var type = a.href ? 'a' : 'button';
                var hrefAttr = a.href ? ' href="' + escapeHTML(a.href) + '"' : '';
                actions.push('<' + type + ' class="' + cls + '"' + onClick + disabled + hrefAttr + '>'
                    + escapeHTML(a.label || '') + '</' + type + '>');
            });
        }
        var actionsHTML = actions.length ? '<div class="r-card__actions">' + actions.join('') + '</div>' : '';
        var bodyHTML = typeof opts.body === 'string'
            ? opts.body
            : (opts.body === null || opts.body === undefined ? '' : String(opts.body));
        return '<section class="r-card" dir="' + dir + '">'
            + (opts.title ? '<header class="r-card__title">' + escapeHTML(opts.title) + '</header>' : '')
            + '<div class="r-card__body">' + bodyHTML + '</div>'
            + actionsHTML
            + '</section>';
    }

    /* ---------- form ---------- */
    function form(fields, opts) {
        opts = opts || {};
        var dir = dirnameOf(opts);
        var fieldsHTML = '';
        (fields || []).forEach(function (f) {
            var id = 'r-fld-' + (f.name || Math.random().toString(36).slice(2, 8));
            var label = f.label || f.name || '';
            var req = f.required ? ' required aria-required="true"' : '';
            var disabled = f.disabled ? ' disabled' : '';
            var val = f.value !== undefined && f.value !== null ? ' value="' + escapeHTML(f.value) + '"' : '';
            var ph = f.placeholder ? ' placeholder="' + escapeHTML(f.placeholder) + '"' : '';
            var inputHTML;
            var t = (f.type || 'text').toLowerCase();
            if (t === 'textarea') {
                inputHTML = '<textarea id="' + id + '" name="' + escapeHTML(f.name || '') + '"' + req + disabled + ph + '>'
                    + escapeHTML(f.value || '') + '</textarea>';
            } else if (t === 'select') {
                inputHTML = '<select id="' + id + '" name="' + escapeHTML(f.name || '') + '"' + req + disabled + '>';
                (f.options || []).forEach(function (o) {
                    var oV = (typeof o === 'string') ? o : o.value;
                    var oL = (typeof o === 'string') ? o : o.label;
                    var sel = String(oV) === String(f.value) ? ' selected' : '';
                    inputHTML += '<option value="' + escapeHTML(oV) + '"' + sel + '>' + escapeHTML(oL) + '</option>';
                });
                inputHTML += '</select>';
            } else {
                inputHTML = '<input type="' + escapeHTML(t) + '" id="' + id + '" name="'
                    + escapeHTML(f.name || '') + '"' + req + disabled + val + ph + ' />';
            }
            fieldsHTML += '<div class="r-form__field">'
                + '<label for="' + id + '">' + escapeHTML(label) + '</label>'
                + inputHTML + '</div>';
        });
        var onSubmit = opts.onSubmit ? ' onsubmit="' + escapeHTML(opts.onSubmit) + ';return false;"' : '';
        var submitLabel = opts.submitLabel || 'Save';
        var submitDisabled = opts.submitDisabled ? ' disabled' : '';
        return '<form class="r-form" dir="' + dir + '"' + onSubmit + '>'
            + fieldsHTML
            + '<div class="r-form__actions">'
            + '<button type="submit" class="r-btn r-btn--primary"' + submitDisabled + '>'
            + escapeHTML(submitLabel) + '</button>'
            + '</div></form>';
    }

    /* ---------- modal ---------- */
    function modal(opts) {
        opts = opts || {};
        var dir = dirnameOf(opts);
        var onClose = opts.onClose ? ' onclick="' + escapeHTML(opts.onClose) + '"' : '';
        var onPrimary = opts.onPrimary ? ' onclick="' + escapeHTML(opts.onPrimary) + '"' : '';
        var bodyHTML = typeof opts.body === 'string' ? opts.body : String(opts.body || '');
        return '<div class="r-modal" role="dialog" aria-modal="true" dir="' + dir + '">'
            + '<div class="r-modal__panel">'
            + '<header class="r-modal__head">'
            + '<h2 class="r-modal__title">' + escapeHTML(opts.title || '') + '</h2>'
            + '<button type="button" class="r-modal__close" aria-label="Close"' + onClose + '>×</button>'
            + '</header>'
            + '<div class="r-modal__body">' + bodyHTML + '</div>'
            + '<footer class="r-modal__foot">'
            + '<button type="button" class="r-btn r-btn--secondary"' + onClose + '>'
            + escapeHTML(opts.secondaryLabel || 'Cancel') + '</button>'
            + '<button type="button" class="r-btn r-btn--primary"' + onPrimary + '>'
            + escapeHTML(opts.primaryLabel || 'OK') + '</button>'
            + '</footer></div></div>';
    }

    /* ---------- tabs ---------- */
    function tabs(items, opts) {
        opts = opts || {};
        var dir = dirnameOf(opts);
        var active = parseInt(pick(opts, 'active', 0), 10) || 0;
        var onSelect = pick(opts, 'onSelect', null);
        var list = '<div class="r-tabs__list" role="tablist">';
        (items || []).forEach(function (t, i) {
            var isActive = i === active;
            list += '<button type="button" role="tab" id="tab-' + escapeHTML(t.id || ('t' + i))
                + '" aria-selected="' + (isActive ? 'true' : 'false') + '" class="r-tabs__tab'
                + (isActive ? ' is-active' : '') + '"'
                + (onSelect ? ' onclick="' + escapeHTML(onSelect) + '(' + i + ')"' : '') + '>'
                + escapeHTML(t.label || '') + '</button>';
        });
        list += '</div>';
        var panels = '<div class="r-tabs__panels">';
        (items || []).forEach(function (t, i) {
            var isActive = i === active;
            panels += '<div role="tabpanel" id="panel-' + escapeHTML(t.id || ('t' + i))
                + '" class="r-tabs__panel' + (isActive ? ' is-active' : '') + '" '
                + (isActive ? '' : 'hidden') + '>' + escapeHTML(t.body || '') + '</div>';
        });
        panels += '</div>';
        return '<div class="r-tabs" dir="' + dir + '">' + list + panels + '</div>';
    }

    /* ---------- list ---------- */
    function list(items, opts) {
        opts = opts || {};
        var dir = dirnameOf(opts);
        var renderSrc = pick(opts, 'render', null);
        var renderer;
        if (typeof renderSrc === 'function') {
            renderer = renderSrc;
        } else if (typeof renderSrc === 'string') {
            try {
                renderer = new Function('item', 'index', 'return ' + renderSrc);
            } catch (e) {
                renderer = function (item) { return '<li>' + escapeHTML(item && item.name || '') + '</li>'; };
            }
        } else {
            renderer = function (item) { return '<li>' + escapeHTML(item && item.name || '') + '</li>'; };
        }
        var itemsHTML = (items || []).map(function (it, idx) {
            var out = renderer(it, idx);
            return (typeof out === 'string') ? out : '';
        }).join('');
        return '<ul class="r-list" dir="' + dir + '">' + itemsHTML + '</ul>';
    }

    /* ---------- timeline ---------- */
    function timeline(events, opts) {
        opts = opts || {};
        var dir = dirnameOf(opts);
        var html = '<ol class="r-timeline" dir="' + dir + '"';
        if (opts.id) html += ' id="' + escapeHTML(opts.id) + '"';
        html += '>';
        (events || []).forEach(function (ev, i) {
            var ts = '';
            if (ev.ts instanceof Date) ts = ev.ts.toISOString();
            else if (typeof ev.ts === 'number') ts = new Date(ev.ts).toISOString();
            else if (typeof ev.ts === 'string') ts = ev.ts;
            html += '<li class="r-timeline__item">'
                + '<time class="r-timeline__time" datetime="' + escapeHTML(ts) + '">'
                + escapeHTML(ts) + '</time>'
                + '<div class="r-timeline__text">' + escapeHTML(ev.text || '') + '</div>'
                + '</li>';
        });
        html += '</ol>';
        return html;
    }

    /* ---------- public API ---------- */
    return {
        escapeHTML: escapeHTML,
        isRTL: isRTL,
        tag: tag,
        stat: stat,
        emptyState: emptyState,
        table: table,
        card: card,
        form: form,
        modal: modal,
        tabs: tabs,
        list: list,
        timeline: timeline
    };
}));
