<?php
/**
 * Plugin Name: Custom Field Helper
 * Plugin URI: https://github.com/jatinparmar3/custom-field-helper
 * Description: Adds a live code helper panel to ACF field group screens with copy-ready PHP snippets.
 * Version: 1.1.0
 * Author: Jatin Parmar
 * License: GPL2
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: custom-field-helper
 * Domain Path: /languages
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'CFHELPER_VERSION', '1.1.0' );
define( 'CFHELPER_FILE', __FILE__ );
define( 'CFHELPER_PATH', plugin_dir_path( __FILE__ ) );
define( 'CFHELPER_URL', plugin_dir_url( __FILE__ ) );
define( 'CFHELPER_BASENAME', plugin_basename( __FILE__ ) );

/**
 * Run activation tasks.
 *
 * @return void
 */
function cfhelper_activate() {
	// Reserved for future setup tasks.
}

/**
 * Run deactivation tasks.
 *
 * @return void
 */
function cfhelper_deactivate() {
	// Reserved for future cleanup tasks.
}

register_activation_hook( CFHELPER_FILE, 'cfhelper_activate' );
register_deactivation_hook( CFHELPER_FILE, 'cfhelper_deactivate' );

require_once CFHELPER_PATH . 'includes/class-custom-field-helper.php';

if ( class_exists( 'Custom_Field_Helper' ) ) {
	add_action( 'plugins_loaded', array( 'Custom_Field_Helper', 'init' ) );
}

