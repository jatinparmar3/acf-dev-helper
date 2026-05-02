<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Custom_Field_Helper {
	private static $instance = null;
	private $option_name      = 'cfhelper_options';

	public static function init() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	private function __construct() {
		add_action( 'add_meta_boxes_acf-field-group', array( $this, 'register_metabox' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_assets' ) );
		add_action( 'admin_menu', array( $this, 'register_settings_page' ) );
		add_action( 'admin_init', array( $this, 'register_settings' ) );
		add_filter( 'plugin_action_links_' . CFHELPER_BASENAME, array( $this, 'add_plugin_action_links' ) );
	}

	public function register_metabox() {
		if ( ! $this->is_acf_available() ) {
			return;
		}

		add_meta_box(
			'custom-field-helper',
			__( 'Custom Field Helper', 'custom-field-helper' ),
			array( $this, 'render_metabox' ),
			'acf-field-group',
			'side',
			'high'
		);
	}

	public function enqueue_assets( $hook_suffix ) {
		if ( ! $this->is_acf_field_group_screen() ) {
			return;
		}

		$settings = $this->get_settings();

		$css_file    = CFHELPER_PATH . 'assets/admin.css';
		$js_file     = CFHELPER_PATH . 'assets/admin.js';
		$css_version = file_exists( $css_file ) ? (string) filemtime( $css_file ) : CFHELPER_VERSION;
		$js_version  = file_exists( $js_file ) ? (string) filemtime( $js_file ) : CFHELPER_VERSION;

		wp_enqueue_style(
			'custom-field-helper-admin',
			CFHELPER_URL . 'assets/admin.css',
			array(),
			$css_version
		);

		wp_enqueue_script(
			'custom-field-helper-admin',
			CFHELPER_URL . 'assets/admin.js',
			array(),
			$js_version,
			true
		);

		wp_localize_script(
			'custom-field-helper-admin',
			'customFieldHelperData',
			array(
				'copyLabel'    => __( 'Copy code', 'custom-field-helper' ),
				'copiedLabel'  => __( 'Copied', 'custom-field-helper' ),
				'viewLabel'    => __( 'View code', 'custom-field-helper' ),
				'copyRowLabel' => __( 'Copy code', 'custom-field-helper' ),
				'closeLabel'   => __( 'Close', 'custom-field-helper' ),
				'noField'      => __( 'Select a field in the builder to generate a snippet.', 'custom-field-helper' ),
				'settings'     => array(
					'defaultTemplate'          => $settings['default_template'],
					'enableNestedPlaceholders' => ! empty( $settings['enable_nested_placeholders'] ),
					'mediaReturnFormat'        => $settings['media_return_format'],
					'enableParserDebug'        => ! empty( $settings['enable_parser_debug'] ),
				),
			)
		);
	}

	public function render_metabox() {
		$settings = $this->get_settings();
		?>
		<div class="custom-field-helper-panel" id="custom-field-helper-panel">
			<div class="custom-field-helper-panel__header">
				<div>
					<p class="custom-field-helper-panel__eyebrow"><?php esc_html_e( 'Row actions enabled', 'custom-field-helper' ); ?></p>
					<h2><?php esc_html_e( 'Per-field code actions', 'custom-field-helper' ); ?></h2>
				</div>
				<span class="custom-field-helper-chip"><?php esc_html_e( 'PHP', 'custom-field-helper' ); ?></span>
			</div>

			<div class="custom-field-helper-panel__controls custom-field-helper-panel__controls--single">
				<label class="custom-field-helper-control">
					<span><?php esc_html_e( 'Code template', 'custom-field-helper' ); ?></span>
					<select data-custom-field-helper-setting="template">
						<option value="php" <?php selected( $settings['default_template'], 'php' ); ?>><?php esc_html_e( 'PHP', 'custom-field-helper' ); ?></option>
						<option value="html" <?php selected( $settings['default_template'], 'html' ); ?>><?php esc_html_e( 'HTML + PHP', 'custom-field-helper' ); ?></option>
					</select>
				</label>
			</div>

			<div class="custom-field-helper-meta" data-custom-field-helper-meta>
				<p><?php esc_html_e( 'Every field row now has View code and Copy code buttons.', 'custom-field-helper' ); ?></p>
			</div>

			<div class="custom-field-helper-actions">
				<button type="button" class="button button-primary" data-custom-field-helper-copy><?php esc_html_e( 'Copy code', 'custom-field-helper' ); ?></button>
			</div>

			<div class="custom-field-helper-code-shell">
				<pre class="custom-field-helper-code"><code data-custom-field-helper-code><?php echo esc_html( $this->get_placeholder_code() ); ?></code></pre>
			</div>

			<p class="custom-field-helper-note">
				<?php esc_html_e( 'Tip: choose template once, then copy directly from each field row.', 'custom-field-helper' ); ?>
			</p>
		</div>
		<?php
	}

	private function is_acf_available() {
		return function_exists( 'acf' ) || defined( 'ACF_VERSION' );
	}

	public function register_settings_page() {
		add_options_page(
			__( 'Custom Field Helper', 'custom-field-helper' ),
			__( 'Custom Field Helper', 'custom-field-helper' ),
			'manage_options',
			'custom-field-helper-settings',
			array( $this, 'render_settings_page' )
		);
	}

	public function register_settings() {
		register_setting(
			'cfhelper_settings',
			$this->option_name,
			array( $this, 'sanitize_settings' )
		);

		add_settings_section(
			'cfhelper_general',
			__( 'General Settings', 'custom-field-helper' ),
			array( $this, 'render_general_section' ),
			'custom-field-helper-settings'
		);

		add_settings_field(
			'default_template',
			__( 'Default code template', 'custom-field-helper' ),
			array( $this, 'render_default_template_field' ),
			'custom-field-helper-settings',
			'cfhelper_general'
		);

		add_settings_field(
			'enable_nested_placeholders',
			__( 'Nested field placeholders', 'custom-field-helper' ),
			array( $this, 'render_nested_placeholders_field' ),
			'custom-field-helper-settings',
			'cfhelper_general'
		);

		add_settings_field(
			'media_return_format',
			__( 'Media return format handling', 'custom-field-helper' ),
			array( $this, 'render_media_return_format_field' ),
			'custom-field-helper-settings',
			'cfhelper_general'
		);

		add_settings_field(
			'enable_parser_debug',
			__( 'Parser debug mode', 'custom-field-helper' ),
			array( $this, 'render_parser_debug_field' ),
			'custom-field-helper-settings',
			'cfhelper_general'
		);
	}

	public function sanitize_settings( $input ) {
		$defaults = $this->get_default_settings();
		$input    = is_array( $input ) ? $input : array();

		$template = isset( $input['default_template'] ) ? sanitize_text_field( $input['default_template'] ) : $defaults['default_template'];
		if ( ! in_array( $template, array( 'php', 'html' ), true ) ) {
			$template = $defaults['default_template'];
		}

		$media_return_format = isset( $input['media_return_format'] ) ? sanitize_text_field( $input['media_return_format'] ) : $defaults['media_return_format'];
		if ( ! in_array( $media_return_format, array( 'auto', 'id', 'array', 'url' ), true ) ) {
			$media_return_format = $defaults['media_return_format'];
		}

		return array(
			'default_template'            => $template,
			'enable_nested_placeholders' => empty( $input['enable_nested_placeholders'] ) ? 0 : 1,
			'media_return_format'        => $media_return_format,
			'enable_parser_debug'        => empty( $input['enable_parser_debug'] ) ? 0 : 1,
		);
	}

	public function render_general_section() {
		echo '<p>' . esc_html__( 'Control default snippet behavior for the Custom field helper panel.', 'custom-field-helper' ) . '</p>';
	}

	public function render_default_template_field() {
		$settings = $this->get_settings();
		?>
		<select name="<?php echo esc_attr( $this->option_name ); ?>[default_template]">
			<option value="php" <?php selected( $settings['default_template'], 'php' ); ?>><?php esc_html_e( 'PHP', 'custom-field-helper' ); ?></option>
			<option value="html" <?php selected( $settings['default_template'], 'html' ); ?>><?php esc_html_e( 'HTML + PHP', 'custom-field-helper' ); ?></option>
		</select>
		<?php
	}

	public function render_nested_placeholders_field() {
		$settings = $this->get_settings();
		?>
		<label>
			<input type="checkbox" name="<?php echo esc_attr( $this->option_name ); ?>[enable_nested_placeholders]" value="1" <?php checked( ! empty( $settings['enable_nested_placeholders'] ) ); ?> />
			<?php esc_html_e( 'Show structured placeholder blocks for nested repeater/flexible fields.', 'custom-field-helper' ); ?>
		</label>
		<?php
	}

	public function render_media_return_format_field() {
		$settings = $this->get_settings();
		?>
		<select name="<?php echo esc_attr( $this->option_name ); ?>[media_return_format]">
			<option value="auto" <?php selected( $settings['media_return_format'], 'auto' ); ?>><?php esc_html_e( 'Auto (use field setting)', 'custom-field-helper' ); ?></option>
			<option value="id" <?php selected( $settings['media_return_format'], 'id' ); ?>><?php esc_html_e( 'Force ID', 'custom-field-helper' ); ?></option>
			<option value="array" <?php selected( $settings['media_return_format'], 'array' ); ?>><?php esc_html_e( 'Force Array', 'custom-field-helper' ); ?></option>
			<option value="url" <?php selected( $settings['media_return_format'], 'url' ); ?>><?php esc_html_e( 'Force URL', 'custom-field-helper' ); ?></option>
		</select>
		<p class="description"><?php esc_html_e( 'Applies to Image and File snippet output in the helper.', 'custom-field-helper' ); ?></p>
		<?php
	}

	public function render_parser_debug_field() {
		$settings = $this->get_settings();
		?>
		<label>
			<input type="checkbox" name="<?php echo esc_attr( $this->option_name ); ?>[enable_parser_debug]" value="1" <?php checked( ! empty( $settings['enable_parser_debug'] ) ); ?> />
			<?php esc_html_e( 'Show parser debug lines in helper panel (layouts + input paths).', 'custom-field-helper' ); ?>
		</label>
		<?php
	}

	public function render_settings_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'Custom Field Helper Settings', 'custom-field-helper' ); ?></h1>
			<form action="options.php" method="post">
				<?php
				settings_fields( 'cfhelper_settings' );
				do_settings_sections( 'custom-field-helper-settings' );
				submit_button();
				?>
			</form>
		</div>
		<?php
	}

	public function add_plugin_action_links( $links ) {
		$settings_link = '<a href="' . esc_url( admin_url( 'options-general.php?page=custom-field-helper-settings' ) ) . '">' . esc_html__( 'Settings', 'custom-field-helper' ) . '</a>';
		array_unshift( $links, $settings_link );

		return $links;
	}

	private function get_default_settings() {
		return array(
			'default_template'            => 'php',
			'enable_nested_placeholders' => 1,
			'media_return_format'        => 'auto',
			'enable_parser_debug'        => 0,
		);
	}

	private function get_settings() {
		$defaults = $this->get_default_settings();
		$saved    = get_option( $this->option_name, array() );
		$saved    = is_array( $saved ) ? $saved : array();

		return wp_parse_args( $saved, $defaults );
	}

	private function is_acf_field_group_screen() {
		if ( ! is_admin() ) {
			return false;
		}

		if ( ! function_exists( 'get_current_screen' ) ) {
			return false;
		}

		$screen = get_current_screen();

		return $screen && 'acf-field-group' === $screen->post_type;
	}

	private function get_placeholder_code() {
		return "<?php\n// Select a field to generate a live snippet.\n";
	}
}
