(function() {
    'use strict';

    const state = {
        activeField: null,
        fields: [],
        lastSignature: '',
        parserDebugLines: [],
    };

    const selectors = {
        panel: '#dcode-snippet-helper-panel',
        code: '[data-dcode-snippet-helper-code]',
        meta: '[data-dcode-snippet-helper-meta]',
        fields: '[data-dcode-snippet-helper-fields]',
        template: '[data-dcode-snippet-helper-setting="template"]',
        look: '[data-dcode-snippet-helper-setting="look"]',
        copy: '[data-dcode-snippet-helper-copy]',
        refresh: '[data-dcode-snippet-helper-refresh]',
        item: '.dcode-snippet-helper-field-item',
        rowAction: '[data-dcode-snippet-helper-row-action]',
    };

    const fieldRowSelector = '.acf-field-object, .acf-field[data-type], tr.acf-field[data-type], tr.acf-row[data-id]';

    function qs(selector, context) {
        return (context || document).querySelector(selector);
    }

    function qsa(selector, context) {
        return Array.from((context || document).querySelectorAll(selector));
    }

    function panel() {
        return qs(selectors.panel);
    }

    function codeNode() {
        return qs(selectors.code);
    }

    function metaNode() {
        return qs(selectors.meta);
    }

    function fieldListNode() {
        return qs(selectors.fields);
    }

    function control(name) {
        return qs('[data-dcode-snippet-helper-setting="' + name + '"]');
    }

    function getLocalizedSettings() {
        const defaults = {
            defaultTemplate: 'php',
            enableNestedPlaceholders: true,
            mediaReturnFormat: 'auto',
            enableParserDebug: false,
        };

        if (!window.dcodeSnippetHelperData || !dcodeSnippetHelperData.settings) {
            return defaults;
        }

        return Object.assign({}, defaults, dcodeSnippetHelperData.settings);
    }

    function getBuilderRoot() {
        return qs('#acf-field-group-fields') || qs('.acf-field-list') || qs('#poststuff');
    }

    function esc(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function phpWrap(lines) {
        return ['<?php'].concat(lines).concat(['?>']).join('\n');
    }

    function indent(lines, level) {
        const pad = '    '.repeat(level);
        return lines.map(function(line) {
            return line ? pad + line : line;
        });
    }

    function slugify(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/[^a-z0-9_\s-]/g, '')
            .trim()
            .replace(/[\s-]+/g, '_');
    }

    function normalizeFieldType(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');
    }

    function directInputRoot(field) {
        return field.querySelector(':scope > .acf-input') || field;
    }

    function getFieldValue(field, suffix) {
        const input = directInputRoot(field).querySelector('[name$="[' + suffix + ']"], [name*="[' + suffix + ']"]');
        if (!input) {
            return '';
        }

        if (input.type === 'checkbox') {
            return input.checked ? input.value || '1' : '';
        }

        return input.value || '';
    }

    function cleanFieldLabel(value) {
        const label = String(value || '').replace(/\s+/g, ' ').trim();
        if (!label) {
            return '';
        }

        // Ignore generic setting labels/help text that are not actual field labels.
        if (/^field\s+(label|name|type)\b/i.test(label)) {
            return '';
        }
        if (/which\s+will\s+appear\s+on\s+the\s+edit\s+page/i.test(label)) {
            return '';
        }

        return label;
    }

    function getFieldLabel(field) {
        const directLabel = cleanFieldLabel(getFieldValue(field, 'label'));
        if (directLabel) {
            return directLabel;
        }

        const labelCell = qs('[data-name="label"], td[data-name="label"], td.label, .label', field);
        const labelFromCell = cleanFieldLabel(labelCell ? String(labelCell.textContent || '') : '');
        if (labelFromCell) {
            return labelFromCell;
        }

        const labelNode = field.querySelector(':scope > .acf-label label') || field.querySelector('.acf-label label');
        const labelFromNode = cleanFieldLabel((labelNode && labelNode.textContent) || '');
        if (labelFromNode) {
            return labelFromNode;
        }

        const fallbackLabel = cleanFieldLabel(getFieldValue(field, 'name') || '');
        return fallbackLabel || 'Unnamed field';
    }

    function getFieldData(field) {
        const nameCell = qs('[data-name="name"], td[data-name="name"], td.name', field);
        const typeCell = qs('[data-name="type"], td[data-name="type"], td.type', field);
        const nameFromCell = nameCell ? String(nameCell.textContent || '').trim() : '';
        const typeFromCell = typeCell ? String(typeCell.textContent || '').trim() : '';
        const fieldType = normalizeFieldType(getFieldValue(field, 'type') || typeFromCell || field.getAttribute('data-type') || 'text');

        return {
            field: field,
            name: getFieldValue(field, 'name') || nameFromCell || field.getAttribute('data-name') || '',
            type: fieldType,
            key: getFieldValue(field, 'key') || field.getAttribute('data-key') || '',
            label: getFieldLabel(field),
            returnFormat: getFieldValue(field, 'return_format') || '',
            multiple: isTruthySetting(getFieldValue(field, 'multiple')),
            allowNull: isTruthySetting(getFieldValue(field, 'allow_null')),
            defaultValue: getFieldValue(field, 'default_value') || '',
            depth: getFieldDepth(field),
        };
    }

    function getSettings() {
        const localized = getLocalizedSettings();
        return {
            mode: 'escaped',
            template: control('template') ? control('template').value : localized.defaultTemplate,
            look: control('look') ? control('look').value : 'modern',
            enableNestedPlaceholders: Boolean(localized.enableNestedPlaceholders),
            mediaReturnFormat: String(localized.mediaReturnFormat || 'auto').toLowerCase(),
            enableParserDebug: Boolean(localized.enableParserDebug),
        };
    }

    function isParserDebugEnabled() {
        return Boolean(getLocalizedSettings().enableParserDebug);
    }

    function resetParserDebug() {
        if (!isParserDebugEnabled()) {
            return;
        }

        state.parserDebugLines = [];
    }

    function addParserDebug(line) {
        if (!isParserDebugEnabled()) {
            return;
        }

        if (!line) {
            return;
        }

        state.parserDebugLines.push(String(line));
    }

    function parserDebugHtml() {
        if (!isParserDebugEnabled() || !state.parserDebugLines.length) {
            return '';
        }

        const lines = state.parserDebugLines.slice(-20).map(function(line) {
            return esc(line);
        }).join('<br>');

        return '<div class="dcode-snippet-helper-meta__stats"><strong>Parser debug</strong><br>' + lines + '</div>';
    }

    function normalizeReturnFormat(value, fallback) {
        const normalized = String(value || '').toLowerCase();
        const allowed = ['auto', 'id', 'array', 'url'];
        if (allowed.includes(normalized)) {
            return normalized;
        }

        return fallback || 'auto';
    }

    function resolveMediaReturnFormat(data, settings, allowUrl) {
        const override = normalizeReturnFormat(settings && settings.mediaReturnFormat ? settings.mediaReturnFormat : 'auto', 'auto');
        const fromField = normalizeReturnFormat(data && data.returnFormat ? data.returnFormat : 'array', 'array');
        let format = override === 'auto' ? fromField : override;

        if (format === 'url' && allowUrl === false) {
            format = 'array';
        }

        return format;
    }

    function canGenerateSnippet(data) {
        return Boolean(data && data.name && data.type && isValidFieldName(data.name) && !isIgnoredFieldType(data.type));
    }

    function isValidFieldName(name) {
        return Boolean(String(name || '').trim());
    }

    function isRealAcfInputName(input) {
        if (!input || !input.name || !input.value) {
            return false;
        }

        return input.name.indexOf('%') === -1;
    }

    function isIgnoredFieldType(type) {
        const ignored = ['tab', 'accordion', 'message'];
        return ignored.includes(String(type || '').toLowerCase());
    }

    function isTruthySetting(value) {
        return ['1', 'true', 'yes', 'multiple', 'array'].includes(String(value || '').toLowerCase());
    }

    function sanitizeVarName(name) {
        return String(name || 'field').replace(/[^a-zA-Z0-9_]/g, '_').replace(/^([0-9])/, '_$1');
    }

    function escapeRegExp(value) {
        return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function fieldId(data) {
        return data.key || data.name || data.label;
    }

    function getFieldKey(fieldRow) {
        return getFieldValue(fieldRow, 'key') || fieldRow.getAttribute('data-key') || '';
    }

    function isCloneTemplateNode(node) {
        return !!(node && node.classList && node.classList.contains('acf-clone'));
    }

    // Returns true if the node is inside an .acf-clone template container.
    // ACF wraps both real rows and template (placeholder) rows in .acf-clone
    // lists, but only template rows have a numeric placeholder key like
    // "%i%" in their name attributes. We detect template ancestry by checking
    // whether the name of any input inside the node (or the node's own name)
    // contains ACF's placeholder token, OR by checking the nearest .acf-clone
    // ancestor that is NOT the ACF sortable list wrapping real rows.
    function isInsideCloneTemplate(node) {
        if (!node || !node.closest) {
            return false;
        }
        // Walk up to find .acf-clone ancestors.
        var el = node.parentElement;
        while (el) {
            if (el.classList && el.classList.contains('acf-clone')) {
                // An .acf-clone that is a direct sortable list for a field
                // type usually sits right inside .acf-fields or .acf-input.
                // A *template* clone is typically hidden (display:none) or has
                // data-id/data-key attributes with placeholder values.
                var parentOfClone = el.parentElement;
                var isTemplateSibling = parentOfClone &&
                    parentOfClone.classList &&
                    (parentOfClone.classList.contains('acf-fields') ||
                        parentOfClone.classList.contains('acf-input') ||
                        parentOfClone.classList.contains('acf-field-object') ||
                        parentOfClone.tagName === 'TBODY');
                if (!isTemplateSibling && el.style.display === 'none') {
                    return true;
                }
                // If any input inside has a placeholder (%i%) name, it is a template.
                var templateInput = el.querySelector('input[name*="%"], input[name*="[%"]');
                if (templateInput) {
                    return true;
                }
            }
            el = el.parentElement;
        }
        return false;
    }

    function getFieldRows(context) {
        const root = context || getBuilderRoot();
        if (!root) {
            return [];
        }

        const rows = qsa(fieldRowSelector, root);

        return rows.filter(function(row) {
            if (!row || !row.getAttribute) {
                return false;
            }

            if (row.classList.contains('acf-field-settings')) {
                return false;
            }

            if (row.classList.contains('acf-clone')) {
                return false;
            }

            var cloneAncestor = row.closest('.acf-clone');
            if (cloneAncestor && cloneAncestor !== row) {
                return false;
            }

            if (row.closest('.acf-field-settings') && !row.classList.contains('acf-field-object')) {
                return false;
            }

            const hasTypeAttr = Boolean(row.getAttribute('data-type'));
            const hasTypeCell = Boolean(getDirectChildBySelector(row, '[data-name="type"], td.type'));
            if (!hasTypeAttr && !hasTypeCell) {
                return false;
            }

            return true;
        });
    }

    function getParentFieldRow(row) {
        if (!row || !row.parentElement) {
            return null;
        }

        return row.parentElement.closest(fieldRowSelector);
    }

    function getFieldDepth(row) {
        let depth = 0;
        let parent = getParentFieldRow(row);
        while (parent) {
            depth += 1;
            parent = getParentFieldRow(parent);
        }

        return depth;
    }

    function getDirectChildRows(parentRow) {
        return getFieldRows(parentRow).filter(function(candidate) {
            return candidate !== parentRow && getParentFieldRow(candidate) === parentRow;
        });
    }

    function getSettingsRow(fieldRow) {
        if (!fieldRow) {
            return null;
        }

        var next = fieldRow.nextElementSibling;
        if (next && next.classList && next.classList.contains('acf-field-settings')) {
            return next;
        }

        var child = fieldRow.querySelector(':scope > .acf-field-settings');
        if (child) {
            return child;
        }

        var descendant = fieldRow.querySelector('.acf-field-settings');
        if (descendant) {
            return descendant;
        }

        return null;
    }

    function getInputValueByName(root, name) {
        if (!root || !name) {
            return '';
        }

        const input = qs('input[name="' + name.replace(/"/g, '\\"') + '"]', root) || qs('select[name="' + name.replace(/"/g, '\\"') + '"]', root);
        return input ? (input.value || '') : '';
    }

    function getInputValueByNameFromRoots(roots, name) {
        if (!Array.isArray(roots) || !name) {
            return '';
        }

        for (let i = 0; i < roots.length; i += 1) {
            const value = getInputValueByName(roots[i], name);
            if (value) {
                return value;
            }
        }

        return '';
    }

    function getInputRoots(fieldRow) {
        const roots = [getSettingsRow(fieldRow), fieldRow, getBuilderRoot()].filter(Boolean);
        return roots.filter(function(root, index) {
            return roots.indexOf(root) === index;
        });
    }

    function getLayoutTokenFromName(nameAttr) {
        if (!nameAttr) {
            return '';
        }

        const match = String(nameAttr).match(/\[layouts\]\[([^\]]+)\]/);
        return match ? match[1] : '';
    }

    function isFlexibleSubFieldNameInput(input) {
        if (!input || !input.name || !input.value) {
            return false;
        }

        const nameAttr = String(input.name);
        if (!isRealAcfInputName(input)) {
            return false;
        }

        return /\[layouts\]\[[^\]]+\]\[sub_fields\]\[[^\]]+\]\[name\]$/.test(nameAttr);
    }

    function isRepeaterSubFieldNameInput(input) {
        if (!input || !input.name || !input.value) {
            return false;
        }

        const nameAttr = String(input.name);
        if (!isRealAcfInputName(input)) {
            return false;
        }

        if (nameAttr.indexOf('[layouts]') !== -1) {
            return false;
        }

        return /\[sub_fields\]\[[^\]]+\]\[name\]$/.test(nameAttr);
    }

    function getRepeaterSubFieldsFromSettings(fieldRow) {
        const roots = getInputRoots(fieldRow);
        if (!roots.length) {
            return [];
        }

        const seen = new Set();
        const subFields = [];

        roots.forEach(function(root) {
            const nameInputs = qsa('input[name$="[name]"]', root).filter(function(input) {
                return isRepeaterSubFieldNameInput(input);
            });

            nameInputs.forEach(function(input) {
                const identity = input.name + '::' + input.value;
                if (seen.has(identity)) {
                    return;
                }

                seen.add(identity);
                const base = input.name.replace(/\[name\]$/, '');
                const label = getInputValueByNameFromRoots(roots, base + '[label]');
                const type = getInputValueByNameFromRoots(roots, base + '[type]');

                subFields.push({
                    name: input.value,
                    label: label || input.value,
                    type: (type || 'text').toLowerCase(),
                    returnFormat: getInputValueByNameFromRoots(roots, base + '[return_format]') || '',
                });
            });
        });

        return dedupeFields(subFields);
    }

    function getFlexibleLayoutsFromSettings(fieldRow) {
        const roots = getInputRoots(fieldRow);
        if (!roots.length) {
            addParserDebug('settings: no roots found');
            return [];
        }

        addParserDebug('settings: roots=' + roots.length);

        const layoutsByKey = new Map();
        const seenLayouts = new Set();
        const seenSubFields = new Set();

        roots.forEach(function(sourceRoot) {
            const layoutNameInputs = qsa('input[name*="[layouts]"][name$="[name]"]', sourceRoot).filter(function(input) {
                return input.value &&
                    input.name.indexOf('[sub_fields]') === -1 &&
                    isRealAcfInputName(input);
            });
            const subFieldInputs = qsa('input[name*="[layouts]"][name*="[sub_fields]"][name$="[name]"]', sourceRoot).filter(function(input) {
                return isFlexibleSubFieldNameInput(input);
            });

            layoutNameInputs.forEach(function(input) {
                const identity = input.name + '::' + input.value;
                if (seenLayouts.has(identity)) {
                    return;
                }
                seenLayouts.add(identity);

                const layoutMatch = input.name.match(/\[layouts\]\[([^\]]+)\]/);
                if (!layoutMatch) {
                    return;
                }

                addParserDebug('settings layout input: ' + input.name);

                const layoutKey = layoutMatch[1];
                const base = input.name.replace(/\[name\]$/, '');
                const layoutLabel = getInputValueByNameFromRoots(roots, base + '[label]');

                if (!layoutsByKey.has(layoutKey)) {
                    layoutsByKey.set(layoutKey, {
                        token: layoutKey,
                        name: input.value,
                        label: layoutLabel || input.value,
                        fields: [],
                    });
                    return;
                }

                const existing = layoutsByKey.get(layoutKey);
                existing.name = existing.name || input.value;
                existing.label = existing.label || layoutLabel || input.value;
            });

            subFieldInputs.forEach(function(input) {
                const identity = input.name + '::' + input.value;
                if (seenSubFields.has(identity)) {
                    return;
                }
                seenSubFields.add(identity);

                const layoutKey = getLayoutTokenFromName(input.name);
                if (!layoutKey) {
                    return;
                }

                addParserDebug('settings sub field: layout=' + layoutKey + ' input=' + input.name);

                const base = input.name.replace(/\[name\]$/, '');
                const label = getInputValueByNameFromRoots(roots, base + '[label]');
                const type = getInputValueByNameFromRoots(roots, base + '[type]');

                if (!layoutsByKey.has(layoutKey)) {
                    layoutsByKey.set(layoutKey, {
                        token: layoutKey,
                        name: '',
                        label: '',
                        fields: [],
                    });
                }

                layoutsByKey.get(layoutKey).fields.push({
                    name: input.value,
                    label: label || input.value,
                    type: (type || 'text').toLowerCase(),
                    returnFormat: getInputValueByNameFromRoots(roots, base + '[return_format]') || '',
                });
            });
        });

        return Array.from(layoutsByKey.values()).filter(function(layout) {
            return layout.name || layout.fields.length;
        }).map(function(layout, index) {
            const layoutName = layout.name || ('layout_' + (index + 1));
            return {
                token: layout.token || '',
                name: layoutName,
                label: layout.label || layoutName,
                fields: layout.fields,
            };
        });
    }

    function getFlexibleLayoutsFromGlobalInputs(fieldRow) {
        const root = getBuilderRoot();
        const fieldKey = getFieldKey(fieldRow);
        if (!root || !fieldKey) {
            addParserDebug('global: root or fieldKey missing');
            return [];
        }

        addParserDebug('global: fieldKey=' + fieldKey);

        const safeKey = escapeRegExp(fieldKey);
        const layoutNameRegex = new RegExp('\\[' + safeKey + '\\]\\[layouts\\]\\[([^\\]]+)\\]\\[name\\]$');
        const layoutNameInputs = qsa('input[name*="[' + safeKey + '][layouts]"][name$="[name]"]', root).filter(function(input) {
            return input.value &&
                input.name.indexOf('[sub_fields]') === -1 &&
                isRealAcfInputName(input);
        });
        const subFieldInputs = qsa('input[name*="[' + safeKey + '][layouts]"][name*="[sub_fields]"][name$="[name]"]', root).filter(function(input) {
            return isFlexibleSubFieldNameInput(input);
        });
        const layoutMap = new Map();

        layoutNameInputs.forEach(function(input) {
            const nameAttr = input.name || '';
            const layoutMatch = nameAttr.match(layoutNameRegex);
            if (!layoutMatch) {
                return;
            }

            addParserDebug('global layout input: ' + nameAttr);

            const layoutToken = layoutMatch[1];
            const base = nameAttr.replace(/\[name\]$/, '');
            const layoutLabel = getInputValueByName(root, base + '[label]');

            if (!layoutMap.has(layoutToken)) {
                layoutMap.set(layoutToken, {
                    token: layoutToken,
                    name: input.value,
                    label: layoutLabel || input.value,
                    fields: [],
                });
                return;
            }

            const existing = layoutMap.get(layoutToken);
            existing.name = existing.name || input.value;
            existing.label = existing.label || layoutLabel || input.value;
        });

        subFieldInputs.forEach(function(input) {
            const nameAttr = input.name || '';
            const layoutToken = getLayoutTokenFromName(nameAttr);
            if (!layoutToken) {
                return;
            }

            addParserDebug('global sub field: layout=' + layoutToken + ' input=' + nameAttr);

            const base = nameAttr.replace(/\[name\]$/, '');
            const label = getInputValueByName(root, base + '[label]');
            const type = getInputValueByName(root, base + '[type]');

            if (!layoutMap.has(layoutToken)) {
                layoutMap.set(layoutToken, {
                    token: layoutToken,
                    name: '',
                    label: '',
                    fields: [],
                });
            }

            layoutMap.get(layoutToken).fields.push({
                name: input.value,
                label: label || input.value,
                type: (type || 'text').toLowerCase(),
                returnFormat: getInputValueByName(root, base + '[return_format]') || '',
            });
        });

        return Array.from(layoutMap.values()).filter(function(layout) {
            return layout.name || layout.fields.length;
        }).map(function(layout, index) {
            const fallbackName = layout.label ? slugify(layout.label) : '';
            const layoutName = layout.name || fallbackName || ('layout_' + (index + 1));
            return {
                token: layout.token || '',
                name: layoutName,
                label: layout.label || layoutName,
                fields: layout.fields,
            };
        });
    }

    function getTextValue(node) {
        return node ? String(node.textContent || '').trim() : '';
    }

    function getTableHeaderMap(table) {
        const map = {};
        const headers = qsa('thead th', table);

        headers.forEach(function(th, index) {
            const key = slugify(getTextValue(th));
            if (key && map[key] === undefined) {
                map[key] = index;
            }
        });

        return map;
    }

    function getValueFromCell(cell) {
        if (!cell) {
            return '';
        }

        var input = qs('input[type="text"], input[type="hidden"], input:not([type]), textarea, select', cell);
        if (input && input.value) {
            return String(input.value).trim();
        }

        var valueNode = qs('.acf-field-name, .acf-field-label, .acf-field-type, .field-name, .field-label, .field-type', cell);
        if (valueNode) {
            var valueText = getTextValue(valueNode);
            if (valueText) {
                return valueText;
            }
        }

        return getTextValue(cell);
    }

    function parseSubFieldsFromLayoutTableRows(layoutNode) {
        var fields = [];
        var rows = qsa('tr.acf-row, tr.acf-field, tr[data-id]', layoutNode).filter(function(row) {
            if (!row || !row.querySelector) {
                return false;
            }

            if (row.classList && row.classList.contains('acf-clone')) {
                return false;
            }

            return Boolean(qs('td.label', row) && qs('td.name', row));
        });

        rows.forEach(function(row) {
            var name = getTextValue(qs('td.name', row));
            var label = getTextValue(qs('td.label', row));
            var type = normalizeFieldType(getTextValue(qs('td.type', row)) || 'text');

            if (!isValidFieldName(name) || isIgnoredFieldType(type)) {
                return;
            }

            fields.push({
                name: name,
                label: label || name,
                type: type,
                returnFormat: '',
            });
        });

        return dedupeFields(fields);
    }

    function parseSubFieldsFromLayoutSection(layoutRow) {
        if (!layoutRow || !layoutRow.parentElement) {
            return [];
        }

        var fields = [];
        var sibling = layoutRow.nextElementSibling;

        while (sibling) {
            if (sibling.matches && sibling.matches('tr.acf-field-setting-fc_layout')) {
                break;
            }

            fields = fields.concat(parseSubFieldsFromLayoutTableRows(sibling));
            sibling = sibling.nextElementSibling;
        }

        return dedupeFields(fields);
    }

    function getRowFieldDataFromTable(row, headerMap) {
        const cells = qsa(':scope > td', row);
        const directNameCell = qs('td[data-name="name"], td.name', row);
        const directLabelCell = qs('td[data-name="label"], td.label', row);
        const directTypeCell = qs('td[data-name="type"], td.type', row);

        const nameCell = directNameCell || (headerMap.name !== undefined ? cells[headerMap.name] : null);
        const labelCell = directLabelCell || (headerMap.label !== undefined ? cells[headerMap.label] : null);
        const typeCell = directTypeCell || (headerMap.type !== undefined ? cells[headerMap.type] : null);

        let name = getValueFromCell(nameCell);
        let label = getValueFromCell(labelCell);
        let type = getValueFromCell(typeCell);

        if (!name) {
            const nameInput = qs('input[name$="[name]"], input[data-name="name"]', row);
            if (nameInput && nameInput.value) {
                name = String(nameInput.value).trim();
            }
        }

        if (!label) {
            const labelInput = qs('input[name$="[label]"], input[data-name="label"]', row);
            if (labelInput && labelInput.value) {
                label = String(labelInput.value).trim();
            }
        }

        if (!type) {
            const typeInput = qs('select[name$="[type]"], input[name$="[type]"], [data-name="type"] select', row);
            if (typeInput && typeInput.value) {
                type = String(typeInput.value).trim();
            }
        }

        return {
            name: String(name || '').trim(),
            label: String(label || '').trim(),
            type: normalizeFieldType(String(type || 'text')),
        };
    }

    function parseVisibleSubFieldsFromLayout(layoutNode) {
        var fields = [];

        if (layoutNode && layoutNode.classList && layoutNode.classList.contains('-collapsed')) {
            layoutNode.classList.remove('-collapsed');
        }

        // Strategy 1: Find real (non-template) .acf-field-object elements inside
        // this layout. We must skip objects inside .acf-clone template containers
        // because ACF keeps hidden clone templates alongside real rows.
        var fieldObjects = qsa('.acf-field-object', layoutNode).filter(function(obj) {
            if (isCloneTemplateNode(obj)) {
                return false;
            }
            // CRITICAL: Skip any field object that is inside a settings panel
            // of ANOTHER field. We only want top-level sub-fields.
            // However, sub-fields of a FC layout ARE inside the FC field's own
            // .acf-field-settings, so only skip when the settings ancestor
            // does NOT contain our layoutNode (i.e. it belongs to a different field).
            var settingsAncestor = obj.closest('.acf-field-settings');
            if (settingsAncestor && !settingsAncestor.contains(layoutNode)) {
                return false;
            }
            // Skip if any ancestor up to layoutNode is an .acf-clone that looks
            // like a template (contains placeholder %-style inputs).
            var el = obj.parentElement;
            while (el && el !== layoutNode) {
                if (el.classList && el.classList.contains('acf-clone')) {
                    var ph = el.querySelector('input[name*="%"]');
                    if (ph) {
                        return false;
                    }
                }
                el = el.parentElement;
            }
            return true;
        });

        fieldObjects.forEach(function(obj) {
            var data = getFieldData(obj);

            // In the Field Group editor, real fields MUST have a valid ACF field key (field_xxxx).
            // UI setting fields often have no key or a generic name like 'label'.
            var hasFieldKey = data.key && data.key.indexOf('field_') === 0;

            if (data.name && isValidFieldName(data.name) && !isIgnoredFieldType(data.type)) {
                // If we are in the editor and it's not a real field key, skip it.
                if (!hasFieldKey) {
                    return;
                }

                fields.push({
                    name: data.name,
                    label: data.label || data.name,
                    type: data.type || 'text',
                    returnFormat: data.returnFormat || '',
                });
            }
        });

        if (fields.length) {
            return fields;
        }

        // Strategy 2: Find sub-field name inputs within this layout node.
        // Filter out placeholder/template inputs (empty value or % in name).
        var subFieldInputs = qsa('input[name*="[sub_fields]"][name$="[name]"]', layoutNode).filter(function(input) {
            return input.value &&
                isRealAcfInputName(input) &&
                isFlexibleSubFieldNameInput(input);
        });

        subFieldInputs.forEach(function(input) {
            var base = input.name.replace(/\[name\]$/, '');
            var label = '';
            var type = 'text';

            var labelInput = layoutNode.querySelector('input[name="' + base.replace(/"/g, '\\"') + '[label]"]');
            if (labelInput) { label = labelInput.value || ''; }

            var typeInput = layoutNode.querySelector('input[name="' + base.replace(/"/g, '\\"') + '[type]"]') ||
                layoutNode.querySelector('select[name="' + base.replace(/"/g, '\\"') + '[type]"]');
            if (typeInput) { type = (typeInput.value || 'text').toLowerCase(); }

            if (input.value && isValidFieldName(input.value) && !isIgnoredFieldType(type)) {
                fields.push({
                    name: input.value,
                    label: label || input.value,
                    type: type,
                    returnFormat: getInputValueByName(layoutNode, base + '[return_format]') || '',
                });
            }
        });

        if (fields.length) {
            return fields;
        }

        // Strategy 3: Parse visible ACF layout sub-field rows (Label/Name/Type table view)
        var subFieldTables = [];
        if (layoutNode && layoutNode.matches && layoutNode.matches('table')) {
            if (isSubFieldTable(layoutNode)) {
                subFieldTables.push(layoutNode);
            }
        } else {
            subFieldTables = qsa('table', layoutNode).filter(isSubFieldTable);
        }

        subFieldTables.forEach(function(table) {
            const headerMap = getTableHeaderMap(table);
            const bodyRows = qsa('tbody tr', table);
            const fallbackRows = qsa('tr', table).filter(function(row) {
                return !row.querySelector('th');
            });
            const rows = bodyRows.length ? bodyRows : fallbackRows;

            rows.forEach(function(row) {
                if (isCloneTemplateNode(row) || (row.classList && row.classList.contains('acf-clone'))) {
                    return;
                }

                const rowData = getRowFieldDataFromTable(row, headerMap);
                const name = rowData.name;
                const label = rowData.label;
                const type = rowData.type;

                if (!name || !isValidFieldName(name) || isIgnoredFieldType(type)) {
                    return;
                }

                fields.push({
                    name: name,
                    label: label || name,
                    type: type || 'text',
                    returnFormat: '',
                });
            });
        });

        if (fields.length) {
            return fields;
        }

        // Strategy 4: Parse directly from ACF row tables (Label/Name/Type columns).
        fields = parseSubFieldsFromLayoutTableRows(layoutNode);

        return fields;
    }

    function isSubFieldTable(table) {
        var headings = qsa('thead th', table).map(function(th) {
            return slugify(getTextValue(th));
        });

        if (!headings.length) {
            headings = qsa('tr:first-child th', table).map(function(th) {
                return slugify(getTextValue(th));
            });
        }

        if (!headings.length) {
            headings = qsa('th', table).map(function(th) {
                return slugify(getTextValue(th));
            });
        }

        return headings.includes('label') && headings.includes('name') && headings.includes('type');
    }

    function getFlexibleLayoutsFromVisibleTables(parentRow) {
        const settingsRow = getSettingsRow(parentRow);
        const sourceRoot = settingsRow || parentRow;

        const layoutInputs = qsa('input[name*="[layouts]"][name$="[name]"]', sourceRoot).filter(function(input) {
            return input.value && input.name.indexOf('[sub_fields]') === -1 && !isCloneTemplateNode(input);
        });

        const tables = qsa('table', sourceRoot).filter(isSubFieldTable);

        function findNearestLayoutContainer(input, allLayoutInputs) {
            const layoutContainer = input.closest('tr.acf-field-setting-fc_layout, tr[data-setting="flexible_content"], tr[data-name="fc_layout"]');
            if (layoutContainer) {
                const ownTable = qsa('table', layoutContainer).find(isSubFieldTable);
                return ownTable || layoutContainer;
            }

            const originRow = input.closest('tr, .acf-field-setting, .layout, .acf-fc-layout') || input.parentElement;
            if (!originRow) {
                return null;
            }

            const nextLayoutInput = allLayoutInputs.find(function(candidate) {
                if (candidate === input) {
                    return false;
                }

                return Boolean(originRow.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING);
            }) || null;

            let node = originRow;
            while (node) {
                const table = qsa('table', node).find(isSubFieldTable);
                if (table) {
                    return table;
                }

                node = node.nextElementSibling;
                if (!node) {
                    break;
                }

                if (nextLayoutInput && node.contains(nextLayoutInput)) {
                    break;
                }

                if (node.matches && node.matches('tr, .acf-field-setting, .layout, .acf-fc-layout')) {
                    const nextTable = qsa('table', node).find(isSubFieldTable);
                    if (nextTable) {
                        return nextTable;
                    }
                    // If we find a layout row, it IS the container
                    if (node.matches('tr.acf-field-setting-fc_layout')) {
                        return node;
                    }
                }
            }

            return null;
        }

        if (!layoutInputs.length && !tables.length) {
            const nodes = getFlexibleLayoutNodes(parentRow);
            return nodes.map(function(layout, index) {
                const layoutName = getFlexibleLayoutName(layout, index);
                const layoutLabel = getFlexibleLayoutLabel(layout, layoutName);
                const fields = parseVisibleSubFieldsFromLayout(layout);

                return {
                    token: '',
                    name: layoutName,
                    label: layoutLabel,
                    fields: fields,
                };
            }).filter(function(layout) {
                return layout.name;
            });
        }

        const layouts = layoutInputs.map(function(input, index) {
            const base = input.name.replace(/\[name\]$/, '');
            const label = getInputValueByName(sourceRoot, base + '[label]') || input.value;
            const container = findNearestLayoutContainer(input, layoutInputs) || tables[index] || null;

            return {
                token: '',
                name: input.value,
                label: label,
                fields: container ? parseVisibleSubFieldsFromLayout(container) : [],
            };
        });

        if (layouts.length) {
            return layouts;
        }

        return tables.map(function(table, index) {
            const name = 'layout_' + (index + 1);
            return {
                token: '',
                name: name,
                label: name,
                fields: parseVisibleSubFieldsFromLayout(table),
            };
        });
    }

    function getLayoutIdentity(layout) {
        if (!layout) {
            return '';
        }

        var name = slugify(layout.name || '');
        if (name) {
            return 'name:' + name;
        }

        var label = slugify(layout.label || '');
        if (label) {
            return 'label:' + label;
        }

        var token = slugify(layout.token || '');
        if (token) {
            return 'token:' + token;
        }

        return '';
    }

    function dedupeFields(fields) {
        const map = new Map();
        fields.forEach(function(field) {
            const key = slugify(field && field.name ? field.name : '');
            if (!key) {
                return;
            }

            if (!map.has(key)) {
                map.set(key, {
                    name: field.name,
                    label: field.label || field.name,
                    type: (field.type || 'text').toLowerCase(),
                    returnFormat: field.returnFormat || '',
                });
                return;
            }

            const existing = map.get(key);
            if ((!existing.label || existing.label === existing.name) && field.label) {
                existing.label = field.label;
            }
            if ((!existing.type || existing.type === 'text') && field.type) {
                existing.type = field.type;
            }
            if (!existing.returnFormat && field.returnFormat) {
                existing.returnFormat = field.returnFormat;
            }
        });

        return Array.from(map.values());
    }

    function mergeLayoutFields(primaryLayouts, fallbackLayouts) {
        const result = new Map();

        function upsert(layout) {
            if (!layout) {
                return;
            }

            const identity = getLayoutIdentity(layout) || ('idx:' + result.size);
            if (!result.has(identity)) {
                result.set(identity, {
                    token: layout.token || '',
                    name: layout.name || '',
                    label: layout.label || layout.name || '',
                    fields: Array.isArray(layout.fields) ? layout.fields.slice() : [],
                });
                return;
            }

            const existing = result.get(identity);
            existing.token = existing.token || layout.token || '';
            existing.name = existing.name || layout.name || '';
            existing.label = existing.label || layout.label || layout.name || '';
            existing.fields = dedupeFields((existing.fields || []).concat(layout.fields || []));
        }

        primaryLayouts.forEach(upsert);
        fallbackLayouts.forEach(upsert);

        return Array.from(result.values()).map(function(layout, index) {
            const fallbackName = layout.label ? slugify(layout.label) : '';
            const safeName = layout.name || fallbackName || ('layout_' + (index + 1));
            return {
                token: layout.token || '',
                name: safeName,
                label: layout.label || safeName,
                fields: dedupeFields(layout.fields || []),
            };
        });
    }

    function hasAnyLayoutFields(layouts) {
        return layouts.some(function(layout) {
            return Array.isArray(layout.fields) && layout.fields.length > 0;
        });
    }

    function getFlexibleLayoutNodes(parentRow) {
        const settingsRow = getSettingsRow(parentRow);
        const roots = [parentRow];
        if (settingsRow) {
            roots.push(settingsRow);
        }

        let nodes = [];

        // ACF v5/v6 flexible content layout selectors (broadest first)
        var layoutSelectors = [
            'tr.acf-field-setting-fc_layout',
            '.acf-fc-layout',
            '.layout[data-layout]',
            '.layout[data-id]',
            'li.acf-layout',
            'li.layout',
            '[data-layout]:not([data-dcode-snippet-helper-code])',
        ];

        roots.forEach(function(root) {
            layoutSelectors.forEach(function(sel) {
                var found = qsa(sel, root).filter(function(n) {
                    return n !== parentRow;
                });
                nodes = nodes.concat(found);
            });
        });

        // Resolve layout containers from known layout name inputs.
        roots.forEach(function(root) {
            qsa('input[name*="[layouts]"][name$="[name]"]', root).forEach(function(input) {
                if (!isRealAcfInputName(input)) {
                    return;
                }

                var container = input.closest('.acf-fc-layout, .layout[data-layout], li.acf-layout, li.layout');
                if (container) {
                    nodes.push(container);
                }
            });
        });

        // Deduplicate and exclude clone templates.
        const unique = [];
        nodes.forEach(function(node) {
            if (unique.includes(node)) { return; }
            if (isCloneTemplateNode(node)) { return; }
            // Skip if this node itself looks like a template (has placeholder inputs)
            if (node.querySelector && node.querySelector('input[name*="%"]')) { return; }
            unique.push(node);
        });

        // Prefer real layout containers over settings rows when available.
        const nonSettingRows = unique.filter(function(node) {
            return !(node.matches && node.matches('tr.acf-field-setting-fc_layout'));
        });

        return nonSettingRows.length ? nonSettingRows : unique;
    }

    function getFlexibleLayoutName(layout, index) {
        const explicit = layout.getAttribute('data-layout') || '';
        if (explicit) {
            return explicit;
        }

        const hiddenName = qs('input[name*="[layouts]"][name$="[name]"], input[name*="[layouts]"][name*="[name]"]', layout);
        if (hiddenName && hiddenName.value) {
            return hiddenName.value;
        }

        const titleNode = qs('.acf-fc-layout-title, .acf-fc-layout-handle, .acf-fc-layout-label, .hndle, .handle', layout);
        const fromTitle = titleNode ? slugify(titleNode.textContent.trim()) : '';

        return fromTitle || ('layout_' + (index + 1));
    }

    function getFlexibleLayoutLabel(layout, fallbackName) {
        const labelInput = qs('input[name*="[layouts]"][name$="[label]"], input[name*="[layouts]"][name*="[label]"]', layout);
        if (labelInput && labelInput.value) {
            return labelInput.value;
        }

        const titleNode = qs('.acf-fc-layout-title, .acf-fc-layout-handle, .acf-fc-layout-label, .hndle, .handle', layout);
        if (titleNode && titleNode.textContent.trim()) {
            return titleNode.textContent.trim();
        }

        return fallbackName;
    }

    function findFieldContainer(element) {
        if (!element || !element.closest) {
            return null;
        }

        const row = element.closest(fieldRowSelector);
        if (!row) {
            return null;
        }

        if (row.classList.contains('acf-field-settings')) {
            return null;
        }

        const hasTypeAttr = Boolean(row.getAttribute('data-type'));
        const hasTypeCell = Boolean(getDirectChildBySelector(row, '[data-name="type"], td.type'));
        if (!hasTypeAttr && !hasTypeCell) {
            return null;
        }

        if (row.closest('.acf-field-settings') && !row.classList.contains('acf-field-object')) {
            return null;
        }

        return row;
    }

    function getFlexibleLayouts(parentRow) {
        resetParserDebug();

        const parsedLayouts = getFlexibleLayoutsFromSettings(parentRow);

        // Prefer settings parsing first because it maps layouts/sub fields most reliably.
        if (hasAnyLayoutFields(parsedLayouts)) {
            addParserDebug('source selected: settings');
            parsedLayouts.forEach(function(layout) {
                addParserDebug('layout=' + (layout.name || '') + ' fields=' + ((layout.fields || []).length));
            });
            return mergeLayoutFields(parsedLayouts, []);
        }

        const globalLayouts = getFlexibleLayoutsFromGlobalInputs(parentRow);
        if (hasAnyLayoutFields(globalLayouts)) {
            addParserDebug('source selected: global');
            globalLayouts.forEach(function(layout) {
                addParserDebug('layout=' + (layout.name || '') + ' fields=' + ((layout.fields || []).length));
            });
            return mergeLayoutFields(globalLayouts, parsedLayouts);
        }

        const visibleLayouts = getFlexibleLayoutsFromVisibleTables(parentRow);
        if (hasAnyLayoutFields(visibleLayouts)) {
            addParserDebug('source selected: visible');
            visibleLayouts.forEach(function(layout) {
                addParserDebug('layout=' + (layout.name || '') + ' fields=' + ((layout.fields || []).length));
            });
            return mergeLayoutFields(visibleLayouts, parsedLayouts);
        }

        const nodes = getFlexibleLayoutNodes(parentRow);
        const nodeLayouts = nodes.map(function(layout, index) {
            const layoutName = getFlexibleLayoutName(layout, index);
            const layoutLabel = getFlexibleLayoutLabel(layout, layoutName);

            return {
                token: '',
                name: layoutName,
                label: layoutLabel,
                fields: dedupeFields(parseVisibleSubFieldsFromLayout(layout)),
            };
        });

        addParserDebug('source selected: nodes/fallback');
        nodeLayouts.forEach(function(layout) {
            addParserDebug('layout=' + (layout.name || '') + ' fields=' + ((layout.fields || []).length));
        });

        return mergeLayoutFields(nodeLayouts, parsedLayouts.length ? parsedLayouts : visibleLayouts);
    }

    function buildSubFieldOutputLines(fieldData, settings) {
        const mode = settings.mode;
        const template = settings.template;
        const subVar = sanitizeVarName(fieldData.name);
        const useHtmlTemplate = template === 'html';

        if (mode === 'the_field') {
            return ["the_sub_field( '" + fieldData.name + "' );"];
        }

        if (fieldData.type === 'image') {
            const imageFormat = resolveMediaReturnFormat(fieldData, settings, true);

            if (useHtmlTemplate) {
                if (imageFormat === 'id') {
                    return [
                        "$" + subVar + "_id = get_sub_field( '" + fieldData.name + "' );",
                        "if ( $" + subVar + "_id ) :",
                        "    echo wp_get_attachment_image( $" + subVar + "_id, 'large', false, array( 'loading' => 'lazy' ) );",
                        'endif;',
                    ];
                }

                if (imageFormat === 'url') {
                    return [
                        "$" + subVar + "_url = get_sub_field( '" + fieldData.name + "' );",
                        "if ( $" + subVar + "_url ) :",
                        "    echo '<img src=\"' . esc_url( $" + subVar + "_url ) . '\" alt=\"\" loading=\"lazy\">';",
                        'endif;',
                    ];
                }

                return [
                    "$" + subVar + " = get_sub_field( '" + fieldData.name + "' );",
                    "if ( $" + subVar + " ) :",
                    "    echo '<img src=\"' . esc_url( $" + subVar + "['url'] ) . '\" alt=\"\" loading=\"lazy\">';",
                    'endif;',
                ];
            }

            if (imageFormat === 'id') {
                return [
                    "$" + subVar + "_id = get_sub_field( '" + fieldData.name + "' );",
                    "if ( $" + subVar + "_id ) :",
                    "    echo wp_get_attachment_image( $" + subVar + "_id, 'large' );",
                    'endif;',
                ];
            }

            if (imageFormat === 'url') {
                return [
                    "$" + subVar + "_url = get_sub_field( '" + fieldData.name + "' );",
                    "if ( $" + subVar + "_url ) :",
                    "    echo '<img src=\"' . esc_url( $" + subVar + "_url ) . '\" alt=\"\">';",
                    'endif;',
                ];
            }

            return [
                "$" + subVar + " = get_sub_field( '" + fieldData.name + "' );",
                "if ( $" + subVar + " ) :",
                "    echo wp_get_attachment_image( $" + subVar + "['ID'], 'large' );",
                'endif;',
            ];
        }

        if (fieldData.type === 'file') {
            const fileFormat = resolveMediaReturnFormat(fieldData, settings, true);

            if (fileFormat === 'id') {
                return [
                    "$" + subVar + "_id = get_sub_field( '" + fieldData.name + "' );",
                    "if ( $" + subVar + "_id ) :",
                    "    $" + subVar + "_url = wp_get_attachment_url( $" + subVar + "_id );",
                    "    echo '<a href=\"' . esc_url( $" + subVar + "_url ) . '\" download>Download file</a>';",
                    'endif;',
                ];
            }

            if (fileFormat === 'url') {
                return [
                    "$" + subVar + "_url = get_sub_field( '" + fieldData.name + "' );",
                    "if ( $" + subVar + "_url ) :",
                    "    echo '<a href=\"' . esc_url( $" + subVar + "_url ) . '\" download>Download file</a>';",
                    'endif;',
                ];
            }

            return [
                "$" + subVar + " = get_sub_field( '" + fieldData.name + "' );",
                "if ( $" + subVar + " ) :",
                "    echo '<a href=\"' . esc_url( $" + subVar + "['url'] ) . '\" download>' . esc_html( $" + subVar + "['filename'] ) . '</a>';",
                'endif;',
            ];
        }

        if (fieldData.type === 'link') {
            return [
                "$" + subVar + " = get_sub_field( '" + fieldData.name + "' );",
                "if ( $" + subVar + " ) :",
                "    echo '<a href=\"' . esc_url( $" + subVar + "['url'] ) . '\">' . esc_html( $" + subVar + "['title'] ) . '</a>';",
                'endif;',
            ];
        }

        if (fieldData.type === 'gallery') {
            return [
                "$" + subVar + " = get_sub_field( '" + fieldData.name + "' );",
                "if ( $" + subVar + " ) :",
                "    foreach ( $" + subVar + " as $image ) :",
                "        echo wp_get_attachment_image( $image['ID'], 'large', false, array( 'loading' => 'lazy' ) );",
                '    endforeach;',
                'endif;',
            ];
        }

        if (fieldData.type === 'relationship' || fieldData.type === 'post_object') {
            return [
                "$" + subVar + " = get_sub_field( '" + fieldData.name + "' );",
                "if ( $" + subVar + " ) :",
                "    foreach ( (array) $" + subVar + " as $post ) :",
                '        setup_postdata( $post );',
                "        echo '<a href=\"' . esc_url( get_permalink( $post ) ) . '\">' . esc_html( get_the_title( $post ) ) . '</a>';",
                '    endforeach;',
                '    wp_reset_postdata();',
                'endif;',
            ];
        }

        if (fieldData.type === 'wysiwyg') {
            return [
                "$" + subVar + " = get_sub_field( '" + fieldData.name + "' );",
                "if ( $" + subVar + " ) :",
                "    echo apply_filters( 'the_content', $" + subVar + " );",
                'endif;',
            ];
        }

        if (fieldData.type === 'true_false') {
            return [
                "if ( get_sub_field( '" + fieldData.name + "' ) ) :",
                "    echo 'Yes';",
                'endif;',
            ];
        }

        if (fieldData.type === 'select') {
            return [
                "$" + subVar + " = get_sub_field( '" + fieldData.name + "' );",
                "if ( $" + subVar + " ) :",
                "    echo esc_html( is_array( $" + subVar + " ) ? implode( ', ', $" + subVar + " ) : $" + subVar + " );",
                'endif;',
            ];
        }

        if (fieldData.type === 'checkbox') {
            return [
                "$" + subVar + " = get_sub_field( '" + fieldData.name + "' );",
                "if ( $" + subVar + " ) :",
                "    foreach ( $" + subVar + " as $option ) :",
                "        echo esc_html( $option );",
                '    endforeach;',
                'endif;',
            ];
        }

        if (fieldData.type === 'taxonomy') {
            return [
                "$" + subVar + " = get_sub_field( '" + fieldData.name + "' );",
                "if ( $" + subVar + " ) :",
                "    foreach ( (array) $" + subVar + " as $term ) :",
                "        echo esc_html( is_object( $term ) ? $term->name : $term );",
                '    endforeach;',
                'endif;',
            ];
        }

        if (fieldData.type === 'user') {
            return [
                "$" + subVar + " = get_sub_field( '" + fieldData.name + "' );",
                "if ( $" + subVar + " ) :",
                "    echo esc_html( $" + subVar + "['display_name'] ?? '' );",
                'endif;',
            ];
        }

        if (fieldData.type === 'google_map') {
            return [
                "$" + subVar + " = get_sub_field( '" + fieldData.name + "' );",
                "if ( $" + subVar + " ) :",
                "    echo esc_html( $" + subVar + "['address'] );",
                'endif;',
            ];
        }

        if (fieldData.type === 'oembed') {
            return [
                "$" + subVar + " = get_sub_field( '" + fieldData.name + "' );",
                "if ( $" + subVar + " ) :",
                "    echo $" + subVar + ";",
                'endif;',
            ];
        }

        if (fieldData.type === 'page_link') {
            return [
                "$" + subVar + " = get_sub_field( '" + fieldData.name + "' );",
                "if ( $" + subVar + " ) :",
                "    echo '<a href=\"' . esc_url( $" + subVar + " ) . '\">' . esc_html( $" + subVar + " ) . '</a>';",
                'endif;',
            ];
        }

        if ((fieldData.type === 'date_picker' || fieldData.type === 'date_time_picker' || fieldData.type === 'time_picker')) {
            return [
                "$" + subVar + " = get_sub_field( '" + fieldData.name + "' );",
                "if ( $" + subVar + " ) :",
                "    echo esc_html( $" + subVar + " );",
                'endif;',
            ];
        }

        if (fieldData.type === 'repeater' && settings.enableNestedPlaceholders) {
            return [
                "if ( have_rows( '" + fieldData.name + "' ) ) :",
                "    while ( have_rows( '" + fieldData.name + "' ) ) : the_row();",
                '    endwhile;',
                'endif;',
            ];
        }

        if (fieldData.type === 'flexible_content' && settings.enableNestedPlaceholders) {
            return [
                "if ( have_rows( '" + fieldData.name + "' ) ) :",
                "    while ( have_rows( '" + fieldData.name + "' ) ) : the_row();",
                '    endwhile;',
                'endif;',
            ];
        }

        if (fieldData.type === 'group' && settings.enableNestedPlaceholders) {
            return [
                "$" + subVar + " = get_sub_field( '" + fieldData.name + "' );",
                "if ( $" + subVar + " ) :",
                "    // Access group sub-fields: $" + subVar + "['sub_field_name']",
                'endif;',
            ];
        }

        if (mode === 'raw') {
            return ["echo get_sub_field( '" + fieldData.name + "' );"];
        }

        if (useHtmlTemplate) {
            return [
                "$" + subVar + " = get_sub_field( '" + fieldData.name + "' );",
                "if ( $" + subVar + " ) :",
                "    echo '<p>' . esc_html( $" + subVar + " ) . '</p>';",
                'endif;',
            ];
        }

        return [
            "$" + subVar + " = get_sub_field( '" + fieldData.name + "' );",
            "if ( $" + subVar + " ) :",
            "    echo esc_html( $" + subVar + " );",
            'endif;',
        ];
    }

    function selectSnippet(data, settings) {
        const variableName = sanitizeVarName(data.name);

        if (data.multiple) {
            return phpWrap([
                "$" + variableName + " = get_field( '" + data.name + "' );",
                "if ( $" + variableName + " ) :",
                "    foreach ( $" + variableName + " as $option ) :",
                "        echo esc_html( $option );",
                '    endforeach;',
                'endif;',
            ]);
        }

        return scalarSnippet(data, settings);
    }

    function checkboxSnippet(data) {
        const variableName = sanitizeVarName(data.name);
        return phpWrap([
            "$" + variableName + " = get_field( '" + data.name + "' );",
            "if ( $" + variableName + " ) :",
            "    foreach ( $" + variableName + " as $option ) :",
            "        echo esc_html( $option );",
            '    endforeach;',
            'endif;',
        ]);
    }

    function trueFalseSnippet(data) {
        return phpWrap([
            "if ( get_field( '" + data.name + "' ) ) :",
            "    echo 'Yes';",
            'endif;',
        ]);
    }

    function wysiwygSnippet(data) {
        const variableName = sanitizeVarName(data.name);
        return phpWrap([
            "$" + variableName + " = get_field( '" + data.name + "' );",
            "if ( $" + variableName + " ) :",
            "    echo apply_filters( 'the_content', $" + variableName + " );",
            'endif;',
        ]);
    }

    function dateSnippet(data) {
        const variableName = sanitizeVarName(data.name);
        return phpWrap([
            "$" + variableName + " = get_field( '" + data.name + "' );",
            "if ( $" + variableName + " ) :",
            "    echo esc_html( date_i18n( get_option( 'date_format' ), strtotime( $" + variableName + " ) ) );",
            'endif;',
        ]);
    }

    function userSnippet(data) {
        const variableName = sanitizeVarName(data.name);
        const format = String(data.returnFormat || '').toLowerCase();

        if (format === 'id') {
            return phpWrap([
                "$" + variableName + " = get_field( '" + data.name + "' );",
                "if ( $" + variableName + " ) :",
                "    echo esc_html( get_the_author_meta( 'display_name', $" + variableName + " ) );",
                'endif;',
            ]);
        }

        return phpWrap([
            "$" + variableName + " = get_field( '" + data.name + "' );",
            "if ( $" + variableName + " ) :",
            "    echo esc_html( $" + variableName + "['display_name'] ?? $" + variableName + "['user_login'] ?? '' );",
            'endif;',
        ]);
    }

    function taxonomySnippet(data) {
        const variableName = sanitizeVarName(data.name);
        return phpWrap([
            "$" + variableName + " = get_field( '" + data.name + "' );",
            "if ( $" + variableName + " ) :",
            "    foreach ( (array) $" + variableName + " as $term ) :",
            "        echo esc_html( is_object( $term ) ? $term->name : ( $term['name'] ?? $term ) );",
            '    endforeach;',
            'endif;',
        ]);
    }

    function groupSnippet(data, settings) {
        const variableName = sanitizeVarName(data.name);

        // Detect actual sub-fields inside the group, like repeater does.
        const parsedSubFields = getRepeaterSubFieldsFromSettings(data.field);
        const subFields = parsedSubFields.length ? parsedSubFields : getDirectChildRows(data.field).map(getFieldData).filter(function(item) {
            return item.name;
        });

        const lines = [
            "$" + variableName + " = get_field( '" + data.name + "' );",
            "if ( $" + variableName + " ) :",
        ];

        if (subFields.length) {
            subFields.forEach(function(subField) {
                const subName = subField.name || subField.label;
                if (subName) {
                    lines.push("    echo esc_html( $" + variableName + "['" + subName + "'] ?? '' );");
                }
            });
        } else {
            lines.push("    // Access group sub-fields: $" + variableName + "['sub_field_name']");
        }

        lines.push('endif;');
        return phpWrap(lines);
    }

    function buildRepeaterLines(parentData, settings) {
        const parsedSubFields = getRepeaterSubFieldsFromSettings(parentData.field);
        const subFields = parsedSubFields.length ? parsedSubFields : getDirectChildRows(parentData.field).map(getFieldData).filter(function(item) {
            return item.name;
        });

        const lines = [
            "if ( have_rows( '" + parentData.name + "' ) ) :",
            "    while ( have_rows( '" + parentData.name + "' ) ) : the_row();",
        ];

        if (subFields.length) {
            subFields.forEach(function(subField) {
                lines.push.apply(lines, indent(buildSubFieldOutputLines(subField, settings), 2));
            });
        }

        lines.push('    endwhile;');
        lines.push('endif;');
        return lines;
    }

    function buildFlexibleLines(parentData, settings) {
        const layouts = getFlexibleLayouts(parentData.field);
        const lines = [
            "if ( have_rows( '" + parentData.name + "' ) ) :",
            "    while ( have_rows( '" + parentData.name + "' ) ) : the_row();",
        ];

        if (layouts.length) {
            layouts.forEach(function(layout) {
                lines.push("        if ( get_row_layout() === '" + layout.name + "' ) :");

                if (layout.fields && layout.fields.length) {
                    layout.fields.forEach(function(subField) {
                        lines.push.apply(lines, indent(buildSubFieldOutputLines(subField, settings), 3));
                    });
                }

                lines.push('        endif;');
            });
        }

        lines.push('    endwhile;');
        lines.push('endif;');
        return lines;
    }

    function scalarSnippet(data, settings) {
        if (settings.mode === 'the_field') {
            return phpWrap(["the_field( '" + data.name + "' );"]);
        }

        if (settings.mode === 'raw') {
            return phpWrap(["echo get_field( '" + data.name + "' );"]);
        }

        const variableName = sanitizeVarName(data.name);
        if (settings.template === 'html') {
            return phpWrap([
                "$" + variableName + " = get_field( '" + data.name + "' );",
                "if ( $" + variableName + " ) :",
                "    echo '<p>' . esc_html( $" + variableName + " ) . '</p>';",
                'endif;',
            ]);
        }

        return phpWrap([
            "$" + variableName + " = get_field( '" + data.name + "' );",
            "if ( $" + variableName + " ) :",
            "    echo esc_html( $" + variableName + " );",
            'endif;',
        ]);
    }

    function imageSnippet(data, settings) {
        const variableName = sanitizeVarName(data.name);
        const format = resolveMediaReturnFormat(data, settings, true);

        if (settings.template === 'html') {
            if (format === 'id') {
                return phpWrap([
                    "$" + variableName + "_id = get_field( '" + data.name + "' );",
                    "if ( $" + variableName + "_id ) :",
                    "    echo wp_get_attachment_image( $" + variableName + "_id, 'full', false, array( 'loading' => 'lazy' ) );",
                    'endif;',
                ]);
            }

            if (format === 'url') {
                return phpWrap([
                    "$" + variableName + "_url = get_field( '" + data.name + "' );",
                    "if ( $" + variableName + "_url ) :",
                    "    echo '<img src=\"' . esc_url( $" + variableName + "_url ) . '\" alt=\"\" loading=\"lazy\">';",
                    'endif;',
                ]);
            }

            return phpWrap([
                "$" + variableName + " = get_field( '" + data.name + "' );",
                "if ( $" + variableName + " ) :",
                "    echo '<img src=\"' . esc_url( $" + variableName + "['url'] ) . '\" alt=\"\" loading=\"lazy\">';",
                'endif;',
            ]);
        }

        if (format === 'id') {
            return phpWrap([
                "$" + variableName + "_id = get_field( '" + data.name + "' );",
                "if ( $" + variableName + "_id ) :",
                "    echo wp_get_attachment_image( $" + variableName + "_id, 'full' );",
                'endif;',
            ]);
        }

        if (format === 'url') {
            return phpWrap([
                "$" + variableName + "_url = get_field( '" + data.name + "' );",
                "if ( $" + variableName + "_url ) :",
                "    echo '<img src=\"' . esc_url( $" + variableName + "_url ) . '\" alt=\"\" loading=\"lazy\">';",
                'endif;',
            ]);
        }

        return phpWrap([
            "$" + variableName + " = get_field( '" + data.name + "' );",
            "if ( $" + variableName + " ) :",
            "    echo wp_get_attachment_image( $" + variableName + "['ID'], 'full', false, array( 'loading' => 'lazy' ) );",
            'endif;',
        ]);
    }

    function fileSnippet(data, settings) {
        const variableName = sanitizeVarName(data.name);
        const format = resolveMediaReturnFormat(data, settings, true);

        if (format === 'id') {
            return phpWrap([
                "$" + variableName + "_id = get_field( '" + data.name + "' );",
                "if ( $" + variableName + "_id ) :",
                "    $" + variableName + "_url = wp_get_attachment_url( $" + variableName + "_id );",
                "    echo '<a href=\"' . esc_url( $" + variableName + "_url ) . '\" download>Download file</a>';",
                'endif;',
            ]);
        }

        if (format === 'url') {
            return phpWrap([
                "$" + variableName + "_url = get_field( '" + data.name + "' );",
                "if ( $" + variableName + "_url ) :",
                "    echo '<a href=\"' . esc_url( $" + variableName + "_url ) . '\" download>Download file</a>';",
                'endif;',
            ]);
        }

        const lines = [
            "$" + variableName + " = get_field( '" + data.name + "' );",
            "if ( $" + variableName + " ) :",
            "    echo '<a href=\"' . esc_url( $" + variableName + "['url'] ) . '\" download>' . esc_html( $" + variableName + "['filename'] ) . '</a>';",
            'endif;',
        ];

        return phpWrap(lines);
    }

    function linkSnippet(data, settings) {
        const variableName = sanitizeVarName(data.name);
        return phpWrap([
            "$" + variableName + " = get_field( '" + data.name + "' );",
            "if ( $" + variableName + " ) :",
            "    echo '<a href=\"' . esc_url( $" + variableName + "['url'] ) . '\" target=\"' . esc_attr( $" + variableName + "['target'] ?: '_self' ) . '\">' . esc_html( $" + variableName + "['title'] ) . '</a>';",
            'endif;',
        ]);
    }

    function relationshipSnippet(data) {
        const variableName = sanitizeVarName(data.name);
        return phpWrap([
            "$" + variableName + " = get_field( '" + data.name + "' );",
            "if ( $" + variableName + " ) :",
            "    foreach ( $" + variableName + " as $post ) :",
            '        setup_postdata( $post );',
            "        echo '<a href=\"' . esc_url( get_permalink( $post ) ) . '\">' . esc_html( get_the_title( $post ) ) . '</a>';",
            '    endforeach;',
            '    wp_reset_postdata();',
            'endif;',
        ]);
    }

    function gallerySnippet(data) {
        const variableName = sanitizeVarName(data.name);
        return phpWrap([
            "$" + variableName + " = get_field( '" + data.name + "' );",
            "if ( $" + variableName + " ) :",
            "    foreach ( $" + variableName + " as $image ) :",
            "        echo wp_get_attachment_image( $image['ID'], 'large', false, array( 'loading' => 'lazy' ) );",
            '    endforeach;',
            'endif;',
        ]);
    }

    function oembedSnippet(data) {
        const variableName = sanitizeVarName(data.name);
        return phpWrap([
            "$" + variableName + " = get_field( '" + data.name + "' );",
            "if ( $" + variableName + " ) :",
            "    echo $" + variableName + ";",
            'endif;',
        ]);
    }

    function googleMapSnippet(data) {
        const variableName = sanitizeVarName(data.name);
        return phpWrap([
            "$" + variableName + " = get_field( '" + data.name + "' );",
            "if ( $" + variableName + " ) :",
            "    echo esc_html( $" + variableName + "['address'] );",
            "    // Lat: $" + variableName + "['lat']  Lng: $" + variableName + "['lng']",
            'endif;',
        ]);
    }

    function pageLinkSnippet(data) {
        const variableName = sanitizeVarName(data.name);
        return phpWrap([
            "$" + variableName + " = get_field( '" + data.name + "' );",
            "if ( $" + variableName + " ) :",
            "    echo '<a href=\"' . esc_url( $" + variableName + " ) . '\">' . esc_html( $" + variableName + " ) . '</a>';",
            'endif;',
        ]);
    }

    function repeaterSnippet(data, settings) {
        return phpWrap(buildRepeaterLines(data, settings));
    }

    function flexibleSnippet(data, settings) {
        return phpWrap(buildFlexibleLines(data, settings));
    }

    function buildSnippet(data, settings) {
        switch (data.type) {
            case 'image':
                return imageSnippet(data, settings);
            case 'file':
                return fileSnippet(data, settings);
            case 'link':
                return linkSnippet(data, settings);
            case 'select':
                return selectSnippet(data, settings);
            case 'checkbox':
                return checkboxSnippet(data);
            case 'radio':
                return scalarSnippet(data, settings);
            case 'true_false':
                return trueFalseSnippet(data);
            case 'wysiwyg':
                return wysiwygSnippet(data);
            case 'date_picker':
            case 'date_time_picker':
            case 'time_picker':
                return dateSnippet(data);
            case 'user':
                return userSnippet(data);
            case 'taxonomy':
                return taxonomySnippet(data);
            case 'group':
                return groupSnippet(data, settings);
            case 'repeater':
                return repeaterSnippet(data, settings);
            case 'flexible_content':
                return flexibleSnippet(data, settings);
            case 'gallery':
                return gallerySnippet(data);
            case 'relationship':
            case 'post_object':
                return relationshipSnippet(data);
            case 'oembed':
                return oembedSnippet(data);
            case 'google_map':
                return googleMapSnippet(data);
            case 'page_link':
                return pageLinkSnippet(data);
            default:
                return scalarSnippet(data, settings);
        }
    }

    function getNestedStats(data) {
        if (data.type === 'repeater') {
            const parsedSubFields = getRepeaterSubFieldsFromSettings(data.field);
            const count = parsedSubFields.length ? parsedSubFields.length : getDirectChildRows(data.field).length;
            return count ? count + ' sub fields detected' : 'No sub fields detected yet';
        }

        if (data.type === 'flexible_content') {
            const layouts = getFlexibleLayouts(data.field);
            const layoutCount = layouts.length;
            const subCount = layouts.reduce(function(sum, layout) {
                return sum + layout.fields.length;
            }, 0);
            return layoutCount + ' layouts, ' + subCount + ' sub fields detected';
        }

        return '';
    }

    function renderMeta(data) {
        const meta = metaNode();
        if (!meta) {
            return;
        }

        const chips = [
            '<span class="dcode-snippet-helper-chip is-soft">' + esc(data.type) + '</span>',
        ];

        if (data.name) {
            chips.push('<span class="dcode-snippet-helper-chip is-soft">' + esc(data.name) + '</span>');
        }

        if (data.key) {
            chips.push('<span class="dcode-snippet-helper-chip is-soft">' + esc(data.key) + '</span>');
        }

        const nestedStats = getNestedStats(data);
        const statsHtml = nestedStats ? '<div class="dcode-snippet-helper-meta__stats">' + esc(nestedStats) + '</div>' : '';
        const debugHtml = parserDebugHtml();
        const displayTitle = data.name && isValidFieldName(data.name) ? data.name : data.label;

        meta.innerHTML = '<div class="dcode-snippet-helper-meta__title">' + esc(displayTitle) + '</div><div class="dcode-snippet-helper-meta__chips">' + chips.join('') + '</div>' + statsHtml + debugHtml;
    }

    function renderCode(data) {
        const node = codeNode();
        if (!node) {
            return;
        }

        node.textContent = buildSnippet(data, getSettings());

        if (panel()) {
            panel().dataset.look = getSettings().look;
        }
    }

    function markActiveItem(data) {
        qsa(selectors.item).forEach(function(item) {
            item.classList.remove('is-active');
        });

        const active = qs('[data-dcode-snippet-helper-field-id="' + esc(fieldId(data)) + '"]');
        if (active) {
            active.classList.add('is-active');
        }
    }

    function renderActiveField(field) {
        if (!field) {
            return;
        }

        const data = getFieldData(field);
        state.activeField = field;
        renderMeta(data);
        renderCode(data);
        markActiveItem(data);
    }

    function collectFields() {
        const fields = getFieldRows(getBuilderRoot()).map(getFieldData).filter(function(data) {
            return data.name && data.type && isValidFieldName(data.name) && !isIgnoredFieldType(data.type);
        });

        state.fields = fields;
        return fields;
    }

    function renderFieldList() {
        const list = fieldListNode();
        const fields = collectFields();
        renderRowActions(fields);

        if (!list) {
            return;
        }

        const signature = fields.map(fieldId).join('|');
        if (signature && signature === state.lastSignature && list.children.length) {
            if (state.activeField) {
                markActiveItem(getFieldData(state.activeField));
            }
            return;
        }

        state.lastSignature = signature;

        if (!fields.length) {
            list.innerHTML = '<div class="dcode-snippet-helper-empty">' + esc((window.dcodeSnippetHelperData && dcodeSnippetHelperData.noField) || 'No fields found.') + '</div>';
            return;
        }

        list.innerHTML = fields.map(function(data) {
            const indent = Math.min(data.depth, 4) * 12;
            const display = data.name || data.label;
            return '<button type="button" class="dcode-snippet-helper-field-item" data-dcode-snippet-helper-field-id="' + esc(fieldId(data)) + '" style="--dcode-snippet-helper-indent:' + indent + 'px"><span class="dcode-snippet-helper-field-item__label">' + esc(display) + '</span><span class="dcode-snippet-helper-field-item__type">' + esc(data.type) + '</span></button>';
        }).join('');

        if (state.activeField && document.body.contains(state.activeField)) {
            markActiveItem(getFieldData(state.activeField));
        }
    }

    function getLastFieldCell(fieldRow) {
        if (!fieldRow || !fieldRow.querySelector) {
            return null;
        }

        const directCells = Array.from(fieldRow.children || []).filter(function(node) {
            return node && node.matches && node.matches('td, th');
        });
        const lastDataCell = directCells.length ? directCells[directCells.length - 1] : null;
        if (lastDataCell) {
            return lastDataCell;
        }

        return null;
    }

    function getDirectChildBySelector(fieldRow, selector) {
        if (!fieldRow) {
            return null;
        }

        const children = Array.from(fieldRow.children || []);
        for (let i = 0; i < children.length; i += 1) {
            const child = children[i];
            if (child && child.matches && child.matches(selector)) {
                return child;
            }
        }

        return null;
    }

    function getRowActionHost(fieldRow) {
        if (!fieldRow) {
            return null;
        }

        const mainTypeCell = getDirectChildBySelector(fieldRow, '[data-name="type"], td.type');
        if (mainTypeCell) {
            return mainTypeCell;
        }

        const mainLabelCell = getDirectChildBySelector(fieldRow, '[data-name="label"], td.label');
        if (mainLabelCell) {
            return mainLabelCell;
        }

        const directLabel = fieldRow.querySelector(':scope > .acf-label');
        if (directLabel && !directLabel.closest('.acf-field-settings')) {
            return directLabel;
        }

        return getLastFieldCell(fieldRow);
    }

    function createRowActionButton(action, label) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'dcode-snippet-helper-row-button';
        button.setAttribute('data-dcode-snippet-helper-row-action', action);
        button.textContent = label;
        return button;
    }

    function renderRowActions(fields) {
        const rows = getFieldRows(getBuilderRoot());
        const labels = window.dcodeSnippetHelperData || {};
        const byId = new Map((fields || state.fields || []).map(function(data) {
            return [fieldId(data), data];
        }));

        rows.forEach(function(row) {
            const data = byId.get(fieldId(getFieldData(row))) || getFieldData(row);
            const host = getRowActionHost(row);
            let wrapper = host ? qs('.dcode-snippet-helper-row-actions', host) : null;

            qsa('.dcode-snippet-helper-row-actions', row).forEach(function(node) {
                if (node.parentElement !== host) {
                    node.remove();
                }
            });

            if (!host) {
                if (wrapper) {
                    wrapper.remove();
                }
                return;
            }

            if (!canGenerateSnippet(data)) {
                if (wrapper) {
                    wrapper.remove();
                }
                return;
            }

            if (!wrapper) {
                wrapper = document.createElement('div');
                wrapper.className = 'dcode-snippet-helper-row-actions';
                wrapper.appendChild(createRowActionButton('view', labels.viewLabel || 'View code'));
                wrapper.appendChild(createRowActionButton('copy', labels.copyRowLabel || 'Copy code'));
                host.appendChild(wrapper);
            }

            wrapper.setAttribute('data-dcode-snippet-helper-field-id', fieldId(data));
        });
    }

    function copyText(text) {
        if (!text) {
            return Promise.resolve();
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }

        return new Promise(function(resolve, reject) {
            try {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                textarea.remove();
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    function copyCode() {
        const text = codeNode() ? codeNode().textContent : '';
        if (!text) {
            return;
        }

        copyText(text).then(flashCopyState);
    }

    function flashButtonState(button, text) {
        if (!button || !text) {
            return;
        }

        const original = button.textContent;
        button.textContent = text;
        window.setTimeout(function() {
            button.textContent = original;
        }, 1200);
    }

    function flashCopyState() {
        const button = qs(selectors.copy);
        flashButtonState(button, (window.dcodeSnippetHelperData && dcodeSnippetHelperData.copiedLabel) || 'Copied');
    }

    function ensureModal() {
        let modal = qs('#dcode-snippet-helper-modal');
        if (modal) {
            return modal;
        }

        const labels = window.dcodeSnippetHelperData || {};
        modal = document.createElement('div');
        modal.id = 'dcode-snippet-helper-modal';
        modal.className = 'dcode-snippet-helper-modal';
        modal.innerHTML = [
            '<div class="dcode-snippet-helper-modal__box" role="dialog" aria-modal="true" aria-label="Custom Field code preview">',
            '  <div class="dcode-snippet-helper-modal__header">',
            '    <strong>' + esc(labels.viewLabel || 'View code') + '</strong>',
            '    <button type="button" class="dcode-snippet-helper-modal__close" data-dcode-snippet-helper-modal-close>' + esc(labels.closeLabel || 'Close') + '</button>',
            '  </div>',
            '  <pre class="dcode-snippet-helper-modal__code"><code data-dcode-snippet-helper-modal-code></code></pre>',
            '</div>'
        ].join('');

        document.body.appendChild(modal);
        return modal;
    }

    function openCodeModal(code) {
        const modal = ensureModal();
        const codeEl = qs('[data-dcode-snippet-helper-modal-code]', modal);
        if (codeEl) {
            codeEl.textContent = code || '';
        }
        modal.classList.add('is-open');
        document.body.classList.add('dcode-snippet-helper-modal-open');
    }

    function closeCodeModal() {
        const modal = qs('#dcode-snippet-helper-modal');
        if (!modal) {
            return;
        }

        modal.classList.remove('is-open');
        document.body.classList.remove('dcode-snippet-helper-modal-open');
    }

    function bindEvents() {
        document.addEventListener('click', function(event) {
            const copyButton = event.target.closest(selectors.copy);
            if (copyButton) {
                copyCode();
                return;
            }

            const rowActionButton = event.target.closest(selectors.rowAction);
            if (rowActionButton) {
                const action = rowActionButton.getAttribute('data-dcode-snippet-helper-row-action');
                const field = findFieldContainer(rowActionButton);
                const data = field ? getFieldData(field) : null;

                if (!field || !canGenerateSnippet(data)) {
                    return;
                }

                if (action === 'view') {
                    const code = buildSnippet(data, getSettings());
                    openCodeModal(code);
                    renderActiveField(field);
                    return;
                }

                if (action === 'copy') {
                    const code = buildSnippet(data, getSettings());
                    copyText(code).then(function() {
                        flashButtonState(rowActionButton, (window.dcodeSnippetHelperData && dcodeSnippetHelperData.copiedLabel) || 'Copied');
                    });
                    return;
                }
            }

            const refreshButton = event.target.closest(selectors.refresh);
            if (refreshButton) {
                renderFieldList();
                if (state.activeField) {
                    renderActiveField(state.activeField);
                }
                return;
            }

            const item = event.target.closest(selectors.item);
            if (item) {
                const match = state.fields.find(function(data) {
                    return fieldId(data) === item.getAttribute('data-dcode-snippet-helper-field-id');
                });

                if (match) {
                    renderActiveField(match.field);
                }
                return;
            }

            const field = findFieldContainer(event.target);
            if (field && !event.target.closest(selectors.panel)) {
                renderActiveField(field);
            }

            if (event.target.closest('[data-dcode-snippet-helper-modal-close]')) {
                closeCodeModal();
                return;
            }

            if (event.target.classList && event.target.classList.contains('dcode-snippet-helper-modal')) {
                closeCodeModal();
            }
        });

        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape') {
                closeCodeModal();
            }
        });

        document.addEventListener('focusin', function(event) {
            const field = findFieldContainer(event.target);
            if (field && !event.target.closest(selectors.panel)) {
                renderActiveField(field);
            }
        });

        document.addEventListener('change', function(event) {
            if (state.activeField && event.target.closest && event.target.closest(selectors.panel)) {
                renderCode(getFieldData(state.activeField));
            }
        });

        document.addEventListener('input', function(event) {
            if (state.activeField && event.target.closest && event.target.closest(selectors.panel)) {
                renderCode(getFieldData(state.activeField));
            }
        });
    }

    function watchDom() {
        const root = getBuilderRoot();
        if (!root) {
            return;
        }

        let timer = null;
        const observer = new MutationObserver(function(mutations) {
            const shouldUpdate = mutations.some(function(mutation) {
                if (panel() && panel().contains(mutation.target)) {
                    return false;
                }

                if (mutation.type === 'childList' && (mutation.addedNodes.length || mutation.removedNodes.length)) {
                    return true;
                }

                return mutation.type === 'attributes';
            });

            if (!shouldUpdate) {
                return;
            }

            if (timer) {
                window.clearTimeout(timer);
            }

            timer = window.setTimeout(function() {
                renderFieldList();
                renderRowActions();
                if (state.activeField && document.body.contains(state.activeField)) {
                    renderCode(getFieldData(state.activeField));
                }
            }, 120);
        });

        observer.observe(root, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'data-type', 'data-name']
        });
    }

    function init() {
        if (!panel()) {
            return;
        }

        bindEvents();
        renderFieldList();
        renderRowActions();
        watchDom();

        const first = state.fields.length ? state.fields[0] : collectFields()[0];
        if (first && first.field) {
            renderActiveField(first.field);
        }

        const lookControl = control('look');
        if (lookControl) {
            lookControl.addEventListener('change', function() {
                if (panel()) {
                    panel().dataset.look = lookControl.value;
                }
            });
        }

        // ACF can render rows asynchronously; run delayed passes to ensure row buttons are injected.
        window.setTimeout(renderFieldList, 300);
        window.setTimeout(renderFieldList, 900);
        // Extra pass after 2 s to catch lazy-rendered flexible content layouts.
        window.setTimeout(renderFieldList, 2000);

        if (window.acf && window.acf.addAction) {
            window.acf.addAction('ready append', function() {
                renderFieldList();
            });
            // Re-render when ACF finishes rendering a specific field (e.g. after
            // a layout is added or sub-fields are saved).
            window.acf.addAction('render_field', function() {
                window.setTimeout(function() {
                    renderFieldList();
                    if (state.activeField && document.body.contains(state.activeField)) {
                        renderCode(getFieldData(state.activeField));
                    }
                }, 150);
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();