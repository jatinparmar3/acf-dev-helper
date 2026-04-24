=== ACF Dev Helper ===
Contributors: jatinparmar
Tags: acf, advanced custom fields, code generator, snippet, developer tools
Requires at least: 6.0
Tested up to: 6.9
Stable tag: 1.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

ACF Dev Helper adds a live PHP snippet generator to the ACF field group editor.

== Description ==

ACF Dev Helper is a developer-friendly tool that generates ready-to-use PHP code snippets directly inside the Advanced Custom Fields (ACF) field group editor.

It helps developers quickly copy working code for any ACF field without manually writing get_field(), get_sub_field(), repeater loops, or flexible content logic.

✨ Features:

* Live field list for all detected ACF fields
* One-click copy button for each field
* Copy-ready PHP snippet preview
* Supports Repeater and Flexible Content fields
* Supports Image, File, Link, Gallery, and Relationship fields
* Clean and modern admin UI
* Works with both ACF Free and ACF Pro

🚀 Ideal for:

* WordPress developers
* Theme developers
* Beginners learning ACF
* Faster development workflows

== Installation ==

1. Upload the `acf-dev-helper` folder to the `/wp-content/plugins/` directory.
2. Activate the plugin through the 'Plugins' menu in WordPress.
3. Open any ACF Field Group and use the Code Helper panel.

== Frequently Asked Questions ==

= Does this plugin work with ACF Pro? =

Yes, it works with both ACF Free and ACF Pro.

= Does it support Flexible Content and Repeater fields? =

Yes, it supports nested fields and generates loop-based code.

== Notes ==

* Repeater and flexible content snippets use the first nested subfield as an example.
* Image and file snippets adapt to the selected return format when available.

== Changelog ==

= 1.1.0 =
* Improved flexible content field detection
* Added per-field copy button UI
* UI and performance improvements