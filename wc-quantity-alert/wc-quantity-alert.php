<?php
/**
 * Plugin Name: WC Quantity Alert
 * Plugin URI:  https://example.com/wc-quantity-alert
 * Description: Shows a toast notification when a cart item quantity changes.
 * Version:     8.0.0
 * Author:      Jared Test
 * Text Domain: wc-quantity-alert
 * Requires Plugins: woocommerce
 */

defined( 'ABSPATH' ) || exit;

// Wait for WooCommerce to load before doing anything
add_action( 'plugins_loaded', function () {
    if ( ! class_exists( 'WooCommerce' ) ) {
        add_action( 'admin_notices', function () {
            echo '<div class="notice notice-error"><p>'
               . esc_html__( 'WC Quantity Alert requires WooCommerce to be active.', 'wc-quantity-alert' )
               . '</p></div>';
        } );
        return;
    }

    WC_Quantity_Alert::init();
} );


class WC_Quantity_Alert {

    const HANDLE = 'wc-quantity-alert';

    public static function init(): void {
        add_action( 'wp_enqueue_scripts', [ self::class, 'enqueue' ] );
        // Hook into WC's fragment response so we can piggyback our cart data
        add_filter( 'woocommerce_add_to_cart_fragments', [ self::class, 'add_quantity_fragment' ] );
    }

    public static function enqueue(): void {
        // No point loading this outside the cart/checkout
        if ( ! is_cart() && ! is_checkout() ) {
            return;
        }

        $plugin_url = plugin_dir_url( __FILE__ );

        wp_enqueue_script(
            self::HANDLE,
            $plugin_url . 'assets/wc-quantity-alert.js',
            [ 'jquery', 'wc-cart' ],
            '8.0.0',
            true
        );

        // Pass the current cart state + ajax url to JS on page load
        wp_localize_script(
            self::HANDLE,
            'wcQuantityAlertParams',
            [
                'ajaxUrl'         => admin_url( 'admin-ajax.php' ),
                'initialSnapshot' => self::get_cart_snapshot(),
            ]
        );

        wp_enqueue_style(
            self::HANDLE,
            $plugin_url . 'assets/wc-quantity-alert.css',
            [],
            '6.0.0'
        );
    }

    // Builds a simple snapshot of the cart: item key -> qty, sku, name
    public static function get_cart_snapshot(): array {
        $cart = WC()->cart;
        if ( ! $cart ) return [];

        $snapshot = [];
        foreach ( $cart->get_cart() as $item_key => $item_data ) {
            $product = $item_data['data'];
            $sku = $product->get_sku();

            $snapshot[ $item_key ] = [
                'qty'  => (int) $item_data['quantity'],
                'sku'  => $sku ?: null,
                'name' => $product->get_name(),
            ];
        }
        return $snapshot;
    }

    // Inject our snapshot into WC's AJAX fragment response
    public static function add_quantity_fragment( array $fragments ): array {
        $fragments['wc_quantity_alert_data'] = wp_json_encode( self::get_cart_snapshot() );
        return $fragments;
    }
}
