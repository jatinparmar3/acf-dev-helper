<?php
/**
 * Plugin Name: Dcode Snippet Helper for ACF
 * Plugin URI: https://github.com/jatinparmar3/dcode-snippet-helper-for-acf
 * Description: Adds a live code helper panel to ACF field group screens with copy-ready PHP snippets.
 * Version: 1.1.0
 * Author: Jatin Parmar
 * License: GPL2
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: dcode-snippet-helper-for-acf
 * Domain Path: /languages
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'DCODE_SNIPPET_HELPER_VERSION', '1.1.0' );
define( 'DCODE_SNIPPET_HELPER_FILE', __FILE__ );
define( 'DCODE_SNIPPET_HELPER_PATH', plugin_dir_path( __FILE__ ) );
define( 'DCODE_SNIPPET_HELPER_URL', plugin_dir_url( __FILE__ ) );
define( 'DCODE_SNIPPET_HELPER_BASENAME', plugin_basename( __FILE__ ) );

/**
 * Run activation tasks.
 *
 * @return void
 */
function dcode_snippet_helper_activate() {
	// Reserved for future setup tasks.
}

/**
 * Run deactivation tasks.
 *
 * @return void
 */
function dcode_snippet_helper_deactivate() {
	// Reserved for future cleanup tasks.
}

register_activation_hook( DCODE_SNIPPET_HELPER_FILE, 'dcode_snippet_helper_activate' );
register_deactivation_hook( DCODE_SNIPPET_HELPER_FILE, 'dcode_snippet_helper_deactivate' );

require_once DCODE_SNIPPET_HELPER_PATH . 'includes/class-dcode-snippet-helper.php';

if ( class_exists( 'Dcode_Snippet_Helper' ) ) {
	add_action( 'plugins_loaded', array( 'Dcode_Snippet_Helper', 'init' ) );
}

