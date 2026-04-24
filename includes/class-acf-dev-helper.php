<?php

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class ACF_Dev_Helper {
	private static $instance = null;
	private $option_name      = 'acf_dev_helper_options';

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
		add_filter( 'plugin_action_links_' . ACF_DEV_HELPER_BASENAME, array( $this, 'add_plugin_action_links' ) );
	}

	public function register_metabox() {
		if ( ! $this->is_acf_available() ) {
			return;
		}

		add_meta_box(
			'acf-dev-helper',
			__( 'ACF Code Helper', 'acf-dev-helper' ),
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

		$css_file    = ACF_DEV_HELPER_PATH . 'assets/admin.css';
		$js_file     = ACF_DEV_HELPER_PATH . 'assets/admin.js';
		$css_version = file_exists( $css_file ) ? (string) filemtime( $css_file ) : ACF_DEV_HELPER_VERSION;
		$js_version  = file_exists( $js_file ) ? (string) filemtime( $js_file ) : ACF_DEV_HELPER_VERSION;

		wp_enqueue_style(
			'acf-dev-helper-admin',
			ACF_DEV_HELPER_URL . 'assets/admin.css',
			array(),
			$css_version
		);

		wp_enqueue_script(
			'acf-dev-helper-admin',
			ACF_DEV_HELPER_URL . 'assets/admin.js',
			array(),
			$js_version,
			true
		);

		wp_localize_script(
			'acf-dev-helper-admin',
			'acfDevHelperData',
			array(
				'copyLabel'    => __( 'Copy code', 'acf-dev-helper' ),
				'copiedLabel'  => __( 'Copied', 'acf-dev-helper' ),
				'viewLabel'    => __( 'View code', 'acf-dev-helper' ),
				'copyRowLabel' => __( 'Copy code', 'acf-dev-helper' ),
				'closeLabel'   => __( 'Close', 'acf-dev-helper' ),
				'noField'      => __( 'Select a field in the builder to generate a snippet.', 'acf-dev-helper' ),
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
		<div class="acf-dev-helper-panel" id="acf-dev-helper-panel">
			<div class="acf-dev-helper-panel__header">
				<div>
					<p class="acf-dev-helper-panel__eyebrow"><?php esc_html_e( 'Row actions enabled', 'acf-dev-helper' ); ?></p>
					<h2><?php esc_html_e( 'Per-field code actions', 'acf-dev-helper' ); ?></h2>
				</div>
				<span class="acf-dev-helper-chip"><?php esc_html_e( 'PHP', 'acf-dev-helper' ); ?></span>
			</div>

			<div class="acf-dev-helper-panel__controls acf-dev-helper-panel__controls--single">
				<label class="acf-dev-helper-control">
					<span><?php esc_html_e( 'Code template', 'acf-dev-helper' ); ?></span>
					<select data-acf-dev-helper-setting="template">
						<option value="php" <?php selected( $settings['default_template'], 'php' ); ?>><?php esc_html_e( 'PHP', 'acf-dev-helper' ); ?></option>
						<option value="html" <?php selected( $settings['default_template'], 'html' ); ?>><?php esc_html_e( 'HTML + PHP', 'acf-dev-helper' ); ?></option>
					</select>
				</label>
			</div>

			<div class="acf-dev-helper-meta" data-acf-dev-helper-meta>
				<p><?php esc_html_e( 'Every field row now has View code and Copy code buttons.', 'acf-dev-helper' ); ?></p>
			</div>

			<div class="acf-dev-helper-actions">
				<button type="button" class="button button-primary" data-acf-dev-helper-copy><?php esc_html_e( 'Copy code', 'acf-dev-helper' ); ?></button>
			</div>

			<div class="acf-dev-helper-code-shell">
				<pre class="acf-dev-helper-code"><code data-acf-dev-helper-code><?php echo esc_html( $this->get_placeholder_code() ); ?></code></pre>
			</div>

			<p class="acf-dev-helper-note">
				<?php esc_html_e( 'Tip: choose template once, then copy directly from each field row.', 'acf-dev-helper' ); ?>
			</p>
		</div>
		<?php
	}

	private function is_acf_available() {
		return function_exists( 'acf' ) || defined( 'ACF_VERSION' );
	}

	public function register_settings_page() {
		add_options_page(
			__( 'ACF Dev Helper', 'acf-dev-helper' ),
			__( 'ACF Dev Helper', 'acf-dev-helper' ),
			'manage_options',
			'acf-dev-helper-settings',
			array( $this, 'render_settings_page' )
		);
	}

	public function register_settings() {
		register_setting(
			'acf_dev_helper_settings',
			$this->option_name,
			array( $this, 'sanitize_settings' )
		);

		add_settings_section(
			'acf_dev_helper_general',
			__( 'General Settings', 'acf-dev-helper' ),
			array( $this, 'render_general_section' ),
			'acf-dev-helper-settings'
		);

		add_settings_field(
			'default_template',
			__( 'Default code template', 'acf-dev-helper' ),
			array( $this, 'render_default_template_field' ),
			'acf-dev-helper-settings',
			'acf_dev_helper_general'
		);

		add_settings_field(
			'enable_nested_placeholders',
			__( 'Nested field placeholders', 'acf-dev-helper' ),
			array( $this, 'render_nested_placeholders_field' ),
			'acf-dev-helper-settings',
			'acf_dev_helper_general'
		);

		add_settings_field(
			'media_return_format',
			__( 'Media return format handling', 'acf-dev-helper' ),
			array( $this, 'render_media_return_format_field' ),
			'acf-dev-helper-settings',
			'acf_dev_helper_general'
		);

		add_settings_field(
			'enable_parser_debug',
			__( 'Parser debug mode', 'acf-dev-helper' ),
			array( $this, 'render_parser_debug_field' ),
			'acf-dev-helper-settings',
			'acf_dev_helper_general'
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
		echo '<p>' . esc_html__( 'Control default snippet behavior for the ACF code helper panel.', 'acf-dev-helper' ) . '</p>';
	}

	public function render_default_template_field() {
		$settings = $this->get_settings();
		?>
		<select name="<?php echo esc_attr( $this->option_name ); ?>[default_template]">
			<option value="php" <?php selected( $settings['default_template'], 'php' ); ?>><?php esc_html_e( 'PHP', 'acf-dev-helper' ); ?></option>
			<option value="html" <?php selected( $settings['default_template'], 'html' ); ?>><?php esc_html_e( 'HTML + PHP', 'acf-dev-helper' ); ?></option>
		</select>
		<?php
	}

	public function render_nested_placeholders_field() {
		$settings = $this->get_settings();
		?>
		<label>
			<input type="checkbox" name="<?php echo esc_attr( $this->option_name ); ?>[enable_nested_placeholders]" value="1" <?php checked( ! empty( $settings['enable_nested_placeholders'] ) ); ?> />
			<?php esc_html_e( 'Show structured placeholder blocks for nested repeater/flexible fields.', 'acf-dev-helper' ); ?>
		</label>
		<?php
	}

	public function render_media_return_format_field() {
		$settings = $this->get_settings();
		?>
		<select name="<?php echo esc_attr( $this->option_name ); ?>[media_return_format]">
			<option value="auto" <?php selected( $settings['media_return_format'], 'auto' ); ?>><?php esc_html_e( 'Auto (use field setting)', 'acf-dev-helper' ); ?></option>
			<option value="id" <?php selected( $settings['media_return_format'], 'id' ); ?>><?php esc_html_e( 'Force ID', 'acf-dev-helper' ); ?></option>
			<option value="array" <?php selected( $settings['media_return_format'], 'array' ); ?>><?php esc_html_e( 'Force Array', 'acf-dev-helper' ); ?></option>
			<option value="url" <?php selected( $settings['media_return_format'], 'url' ); ?>><?php esc_html_e( 'Force URL', 'acf-dev-helper' ); ?></option>
		</select>
		<p class="description"><?php esc_html_e( 'Applies to Image and File snippet output in the helper.', 'acf-dev-helper' ); ?></p>
		<?php
	}

	public function render_parser_debug_field() {
		$settings = $this->get_settings();
		?>
		<label>
			<input type="checkbox" name="<?php echo esc_attr( $this->option_name ); ?>[enable_parser_debug]" value="1" <?php checked( ! empty( $settings['enable_parser_debug'] ) ); ?> />
			<?php esc_html_e( 'Show parser debug lines in helper panel (layouts + input paths).', 'acf-dev-helper' ); ?>
		</label>
		<?php
	}

	public function render_settings_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'ACF Dev Helper Settings', 'acf-dev-helper' ); ?></h1>
			<form action="options.php" method="post">
				<?php
				settings_fields( 'acf_dev_helper_settings' );
				do_settings_sections( 'acf-dev-helper-settings' );
				submit_button();
				?>
			</form>
		</div>
		<?php
	}

	public function add_plugin_action_links( $links ) {
		$settings_link = '<a href="' . esc_url( admin_url( 'options-general.php?page=acf-dev-helper-settings' ) ) . '">' . esc_html__( 'Settings', 'acf-dev-helper' ) . '</a>';
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
