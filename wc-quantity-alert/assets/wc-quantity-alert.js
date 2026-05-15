/**
 * wc-quantity-alert.js
 * Shows a toast when a cart item quantity actually changes.
 */

( function ( $ ) {
    'use strict';

    const STORAGE_KEY = 'wcQtyAlertSnapshot';
    const FRAGMENT_KEY = 'wc_quantity_alert_data';
    const TOAST_DURATION_MS = 4000;

    // sessionStorage helpers

    function saveSnapshot( snapshot ) {
        try {
            sessionStorage.setItem( STORAGE_KEY, JSON.stringify( snapshot ) );
        } catch ( e ) {
            console.warn( '[wc-quantity-alert] sessionStorage write failed:', e );
        }
    }

    function loadSnapshot() {
        try {
            const raw = sessionStorage.getItem( STORAGE_KEY );
            return raw ? JSON.parse( raw ) : null;
        } catch ( e ) {
            return null;
        }
    }

    // When the user clicks Update cart, set a flag so we know it was intentional
    $( document ).on( 'click', '[name="update_cart"]', function () {
        try {
            sessionStorage.setItem( 'wcQtyAlertPendingUpdate', '1' );
        } catch( e ) {}
    } );

    // WooCommerce disables the Update cart button until a qty changes.
    // We keep it enabled so we can demo the "no change = no toast" behaviour.
    // Would remove this in a real deployment.
    $( document.body ).on( 'updated_cart_totals wc_fragments_loaded wc_fragments_refreshed', function () {
        $( '[name="update_cart"]' ).prop( 'disabled', false );
    } );

    $( function () {
        $( '[name="update_cart"]' ).prop( 'disabled', false );
    } );

    // Compare old and new snapshots, return items that actually changed
    function diffSnapshots( prev, curr ) {
        if ( ! prev ) return [];

        const changed = [];
        for ( const key in curr ) {
            const currItem = curr[ key ];
            const prevItem = prev[ key ];

            // New item that wasn't in the cart before
            if ( ! prevItem ) {
                changed.push( {
                    key,
                    sku: currItem.sku,
                    name: currItem.name,
                    newQty: currItem.qty,
                    delta: currItem.qty,
                } );
                continue;
            }

            // Existing item with a changed quantity
            if ( currItem.qty !== prevItem.qty ) {
                changed.push( {
                    key,
                    sku: currItem.sku,
                    name: currItem.name,
                    newQty: currItem.qty,
                    delta: Math.abs( currItem.qty - prevItem.qty ),
                } );
            }
        }

        // Sort by biggest change so we surface the most relevant item first
        changed.sort( ( a, b ) => b.delta - a.delta );
        return changed;
    }

    function buildMessage( item ) {
        const identifier = item.sku ? item.sku : 'this product';
        return 'You just changed the quantity of ' + identifier + ' to ' + item.newQty;
    }

    function showToast( message ) {
        const toast = document.createElement( 'div' );
        toast.className = 'wcqa-toast';
        toast.setAttribute( 'role', 'status' );
        toast.setAttribute( 'aria-live', 'polite' );
        toast.textContent = message;
        document.body.appendChild( toast );

        // Double rAF needed to trigger the CSS transition after insert
        requestAnimationFrame( () => {
            requestAnimationFrame( () => toast.classList.add( 'wcqa-toast--visible' ) );
        } );

        setTimeout( () => {
            toast.classList.remove( 'wcqa-toast--visible' );
            toast.addEventListener( 'transitionend', () => toast.remove(), { once: true } );
        }, TOAST_DURATION_MS );
    }

    // WC doesn't reliably pass fragments via the event, so we fetch them ourselves.
    // We capture previousSnapshot BEFORE the async call to avoid a race condition
    // where the snapshot gets overwritten by the time the response comes back.
    function fetchAndAlert() {
        const previousSnapshot = loadSnapshot();

        const ajaxUrl = typeof wcQuantityAlertParams !== 'undefined'
            ? wcQuantityAlertParams.ajaxUrl
            : '/wp-admin/admin-ajax.php';

        $.post( ajaxUrl, { action: 'woocommerce_get_refreshed_fragments' }, function( data ) {
            if ( ! data || ! data.fragments || ! data.fragments[ FRAGMENT_KEY ] ) {
                console.warn( '[wc-quantity-alert] Fragment not found in response.' );
                return;
            }

            let currentSnapshot;
            try {
                currentSnapshot = JSON.parse( data.fragments[ FRAGMENT_KEY ] );
            } catch ( e ) {
                console.error( '[wc-quantity-alert] Could not parse snapshot:', e );
                return;
            }

            saveSnapshot( currentSnapshot );

            const changedItems = diffSnapshots( previousSnapshot, currentSnapshot );
            if ( changedItems.length > 0 ) {
                showToast( buildMessage( changedItems[0] ) );
            }
        } );
    }

    // On page load, seed sessionStorage with the current cart state from PHP.
    // If this load was triggered by an Update cart click, skip seeding
    // and let fetchAndAlert handle the diff instead.
    $( function () {
        if ( typeof wcQuantityAlertParams === 'undefined' || ! wcQuantityAlertParams.initialSnapshot ) {
            return;
        }

        let pendingUpdate = false;
        try {
            pendingUpdate = sessionStorage.getItem( 'wcQtyAlertPendingUpdate' ) === '1';
            sessionStorage.removeItem( 'wcQtyAlertPendingUpdate' );
        } catch( e ) {}

        if ( ! pendingUpdate ) {
            saveSnapshot( wcQuantityAlertParams.initialSnapshot );
        }
    } );

    // Fires after WC confirms the cart update via AJAX
    $( document ).on( 'updated_cart_totals', function () {
        fetchAndAlert();
    } );

    // Backup listener — also fires after AJAX update in some WC/theme combos
    $( document ).on( 'wc_fragments_refreshed', function ( _event, fragments ) {
        if ( ! fragments || ! fragments[ FRAGMENT_KEY ] ) return;

        let pendingUpdate = false;
        try {
            pendingUpdate = sessionStorage.getItem( 'wcQtyAlertPendingUpdate' ) === '1';
            sessionStorage.removeItem( 'wcQtyAlertPendingUpdate' );
        } catch( e ) {}

        let currentSnapshot;
        try {
            currentSnapshot = JSON.parse( fragments[ FRAGMENT_KEY ] );
        } catch ( e ) { return; }

        const previousSnapshot = loadSnapshot();
        saveSnapshot( currentSnapshot );

        if ( pendingUpdate ) {
            const changedItems = diffSnapshots( previousSnapshot, currentSnapshot );
            if ( changedItems.length > 0 ) {
                showToast( buildMessage( changedItems[0] ) );
            }
        }
    } );

} )( jQuery );