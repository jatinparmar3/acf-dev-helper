<?php
/**
 * Plugin Name: ACF Dev Helper
 * Plugin URI: https://github.com/jatinparmar3
 * Description: Adds a live code helper panel to ACF field group screens with copy-ready PHP snippets.
 * Version: 1.1.0
 * Author: Jatin Dev 
 * Text Domain: acf-dev-helper
 * Domain Path: /languages
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'ACF_DEV_HELPER_VERSION', '1.1.0' );
define( 'ACF_DEV_HELPER_FILE', __FILE__ );
define( 'ACF_DEV_HELPER_PATH', plugin_dir_path( __FILE__ ) );
define( 'ACF_DEV_HELPER_URL', plugin_dir_url( __FILE__ ) );
define( 'ACF_DEV_HELPER_BASENAME', plugin_basename( __FILE__ ) );

/**
 * Load plugin translation files.
 *
 * @return void
 */
function acf_dev_helper_load_textdomain() {
	load_plugin_textdomain( 'acf-dev-helper', false, dirname( ACF_DEV_HELPER_BASENAME ) . '/languages' );
}

/**
 * Run activation tasks.
 *
 * @return void
 */
function acf_dev_helper_activate() {
	// Reserved for future setup tasks.
}

/**
 * Run deactivation tasks.
 *
 * @return void
 */
function acf_dev_helper_deactivate() {
	// Reserved for future cleanup tasks.
}

register_activation_hook( ACF_DEV_HELPER_FILE, 'acf_dev_helper_activate' );
register_deactivation_hook( ACF_DEV_HELPER_FILE, 'acf_dev_helper_deactivate' );

require_once ACF_DEV_HELPER_PATH . 'includes/class-acf-dev-helper.php';

add_action( 'init', 'acf_dev_helper_load_textdomain' );

if ( class_exists( 'ACF_Dev_Helper' ) ) {
	add_action( 'plugins_loaded', array( 'ACF_Dev_Helper', 'init' ) );
}

