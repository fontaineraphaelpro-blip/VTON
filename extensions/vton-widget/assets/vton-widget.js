(function() {
      'use strict';

      if (window.__VTON_WIDGET_BOOTED) return;
      window.__VTON_WIDGET_BOOTED = true;

      try {

      var isProduction = !/localhost|127\.0\.0\.1/.test(window.location.hostname) && window.location.search.indexOf('vton_debug') === -1;
      var log = isProduction ? function() {} : console.log.bind(console);
      var warn = isProduction ? function() {} : console.warn.bind(console);
      var error = console.error.bind(console);

      var VTON_STATUS_CACHE_TTL = 300000;
      var _vtonWidgetRenderQueued = false;
      var _vtonStatusInFlight = null;
      var _vtonSuppressed = false;
      var _vtonReinjectObserver = null;

      function runWhenIdle(fn, timeoutMs) {
        timeoutMs = timeoutMs || 2000;
        if (typeof requestIdleCallback === 'function') {
          return requestIdleCallback(fn, { timeout: timeoutMs });
        }
        return setTimeout(fn, 16);
      }

      function vtonGetObserverRoot() {
        return (
          document.querySelector(
            'main, [role="main"], #MainContent, .product, .product-main, .product__info-wrapper, .shopify-section--product, [id*="Product"], form[action*="/cart"]'
          ) || document.body
        );
      }

      function isProductPageContext() {
        var liquid = window.VTON_LIQUID || {};
        if (liquid.productId) return true;
        if (liquid.pageType === 'product') return true;
        if (liquid.templateName && String(liquid.templateName).indexOf('product') !== -1) return true;
        if (/\/products\/[^\/\?#]+/i.test(window.location.pathname)) return true;
        if (window.Shopify && window.Shopify.product && window.Shopify.product.id) return true;
        if (document.querySelector('form[action*="/cart/add"], product-form, [data-product-id], [data-product-handle]')) return true;
        return false;
      }

      function bootWidget() {
        if (!isProductPageContext()) return;
        if (_vtonSuppressed) return;
        initWidget();
      }

      function bootWidgetWithRetries() {
        if (!isProductPageContext()) return;
        if (_vtonSuppressed) return;
        bootWidget();
        if (_vtonSuppressed || vtonHasWidgetContainers()) return;
        [800, 2000, 4500, 9000, 15000, 22000].forEach(function(delayMs) {
          setTimeout(function() {
            if (!isProductPageContext()) return;
            if (_vtonSuppressed) return;
            if (vtonHasWidgetContainers()) return;
            _vtonWidgetRenderQueued = false;
            bootWidget();
          }, delayMs);
        });
      }

      function startWidgetBoot() {
        var bootIdleMs =
          isProductPageContext() && (window.VTON_LIQUID && window.VTON_LIQUID.productId)
            ? 0
            : 200;
        if (bootIdleMs === 0) {
          bootWidgetWithRetries();
        } else {
          runWhenIdle(bootWidgetWithRetries, bootIdleMs);
        }
      }

      function waitForConfigThenBoot() {
        if (window.VTON_LIQUID) {
          startWidgetBoot();
          return;
        }
        var tries = 0;
        var timer = setInterval(function() {
          tries++;
          if (window.VTON_LIQUID || tries >= 40) {
            clearInterval(timer);
            startWidgetBoot();
          }
        }, 50);
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitForConfigThenBoot, { once: true });
      } else {
        waitForConfigThenBoot();
      }

      function vtonScheduleRetryBoot() {
        if (!isProductPageContext()) return;
        if (_vtonSuppressed) return;
        if (vtonHasWidgetContainers()) return;
        _vtonWidgetRenderQueued = false;
        runWhenIdle(bootWidget, 300);
      }

      document.addEventListener('shopify:section:load', vtonScheduleRetryBoot);
      document.addEventListener('shopify:section:reorder', vtonScheduleRetryBoot);
      window.addEventListener('pageshow', function(ev) {
        if (ev.persisted) vtonScheduleRetryBoot();
      });

      ['turbo:load', 'page:loaded', 'theme:product:loaded'].forEach(function(evt) {
        document.addEventListener(evt, vtonScheduleRetryBoot);
      });

      setTimeout(vtonScheduleRetryBoot, 1500);
      setTimeout(vtonScheduleRetryBoot, 5000);
      setTimeout(vtonScheduleRetryBoot, 12000);
      
      function vtonStatusCacheKey(shop, productId) {
        return 'vton:status:' + shop + ':' + productId;
      }

      function readStatusCache(shop, productId) {
        try {
          var raw = sessionStorage.getItem(
            vtonStatusCacheKey(shop, normalizeProductIdForStatus(productId))
          );
          if (!raw) return null;
          var parsed = JSON.parse(raw);
          if (!parsed || Date.now() - parsed.ts > VTON_STATUS_CACHE_TTL) {
            sessionStorage.removeItem(
              vtonStatusCacheKey(shop, normalizeProductIdForStatus(productId))
            );
            return null;
          }
          return parsed.data;
        } catch (e) {
          return null;
        }
      }

      function clearStatusCache(shop, productId) {
        try {
          sessionStorage.removeItem(
            vtonStatusCacheKey(shop, normalizeProductIdForStatus(productId))
          );
        } catch (e) {}
      }

      function writeStatusCache(shop, productId, data) {
        try {
          var key = vtonStatusCacheKey(shop, normalizeProductIdForStatus(productId));
          // Only negative cache — never trust a stale "enabled" from sessionStorage
          if (!isTryonEnabledStatus(data)) {
            sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data: data }));
          } else {
            sessionStorage.removeItem(key);
          }
        } catch (e) {}
      }

      function normalizeProductIdForStatus(productId) {
        if (!productId) return productId;
        var s = String(productId);
        var gidMatch = s.match(/^gid:\/\/shopify\/Product\/(\d+)$/i);
        if (gidMatch) return 'gid://shopify/Product/' + gidMatch[1];
        if (/^\d+$/.test(s)) return 'gid://shopify/Product/' + s;
        return s;
      }

      function isTryonEnabledStatus(status) {
        if (!status || status.error) return false;
        if (status.ab_test_enabled && status.ab_bucket === 'control') return false;
        if (status.product_enabled === false) return false;
        if (status.enabled === false) return false;
        return status.enabled === true;
      }

      function vtonGetVisitorId() {
        var key = 'vton:visitor';
        try {
          var existing = localStorage.getItem(key);
          if (existing) return existing;
          var id =
            'v_' +
            Date.now().toString(36) +
            '_' +
            Math.random().toString(36).slice(2, 10);
          localStorage.setItem(key, id);
          return id;
        } catch (e) {
          return 'v_anon_' + Date.now();
        }
      }

      function trackAbEvent(shop, productId, bucket, eventType) {
        if (!shop || !bucket) return;
        var q =
          'shop=' +
          encodeURIComponent(shop) +
          '&product_id=' +
          encodeURIComponent(normalizeProductIdForStatus(productId || ''));
        var url = window.location.origin + '/apps/tryon/ab-event?' + q;
        var payload = JSON.stringify({
          bucket: bucket,
          event_type: eventType,
          visitor_id: vtonGetVisitorId(),
          product_id: normalizeProductIdForStatus(productId || ''),
        });
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          credentials: 'same-origin',
          keepalive: true,
        }).catch(function() {});
      }

      var _vtonAbImpressionSent = false;
      function trackAbImpressionOnce(shop, productId, bucket) {
        if (_vtonAbImpressionSent || !bucket) return;
        _vtonAbImpressionSent = true;
        trackAbEvent(shop, productId, bucket, 'impression');
      }

      var _vtonControlAtcListenerBound = false;
      var _vtonControlAtcSent = false;
      function bindControlAtcTracking(shop, productId) {
        if (_vtonControlAtcListenerBound || !shop || !productId) return;
        _vtonControlAtcListenerBound = true;

        function trackControlAtcOnce() {
          if (_vtonControlAtcSent) return;
          _vtonControlAtcSent = true;
          trackAbEvent(shop, productId, 'control', 'atc');
        }

        document.addEventListener(
          'submit',
          function(e) {
            var form = e.target;
            if (
              form &&
              form.tagName === 'FORM' &&
              form.action &&
              String(form.action).indexOf('/cart/add') !== -1
            ) {
              trackControlAtcOnce();
            }
          },
          true
        );

        document.addEventListener(
          'click',
          function(e) {
            var target = e.target;
            if (!target || !target.closest) return;
            var btn = target.closest(
              'button[name="add"], [data-add-to-cart], .product-form__submit, .shopify-payment-button button, form[action*="/cart/add"] button[type="submit"]'
            );
            if (btn) trackControlAtcOnce();
          },
          true
        );

        document.addEventListener('cart:added', trackControlAtcOnce);
        document.addEventListener('variant:add', trackControlAtcOnce);
      }

      function vtonHasWidgetContainers() {
        return document.querySelectorAll('#vton-widget-container, [data-vton-widget="true"]').length > 0;
      }

      function vtonStopReinjectObserver() {
        if (_vtonReinjectObserver) {
          try {
            _vtonReinjectObserver.disconnect();
          } catch (e) {}
          _vtonReinjectObserver = null;
        }
      }

      function queueWidgetRender(shop, productId, productHandle, statusPayload) {
        if (_vtonSuppressed) return;
        if (vtonHasWidgetContainers()) return;
        if (_vtonWidgetRenderQueued) return;
        _vtonWidgetRenderQueued = true;
        initializeWidget(shop, productId, productHandle, statusPayload || {});
      }

      function removeWidgetContainer() {
        vtonStopReinjectObserver();
        var nodes = document.querySelectorAll('#vton-widget-container, [data-vton-widget="true"]');
        for (var i = 0; i < nodes.length; i++) {
          nodes[i].remove();
        }
        if (window.vtonWidgetInstance) {
          try {
            delete window.vtonWidgetInstance;
          } catch (e) {
            window.vtonWidgetInstance = undefined;
          }
        }
        _vtonWidgetRenderQueued = false;
      }

      function suppressWidget(shop, productId, status) {
        _vtonSuppressed = true;
        _vtonWidgetRenderQueued = false;
        if (shop && productId) {
          writeStatusCache(shop, productId, {
            enabled: false,
            product_enabled: false,
            widget_settings: (status && status.widget_settings) || {},
          });
        }
        removeWidgetContainer();
      }

      function applyTryonStatus(status, shop, productId, productHandle) {
        if (status && status.ab_test_enabled && status.ab_bucket) {
          trackAbImpressionOnce(shop, productId, status.ab_bucket);
        }

        if (isTryonEnabledStatus(status)) {
          _vtonSuppressed = false;
          writeStatusCache(shop, productId, status);
          queueWidgetRender(shop, productId, productHandle, status);
          return;
        }

        if (status && status.ab_test_enabled && status.ab_bucket === 'control') {
          bindControlAtcTracking(shop, productId);
          suppressWidget(shop, productId, status);
          return;
        }

        suppressWidget(shop, productId, status || { enabled: false, product_enabled: false });
      }

      function refreshTryonStatus(shop, productId, productHandle) {
        if (_vtonStatusInFlight) {
          return _vtonStatusInFlight.then(function(status) {
            applyTryonStatus(status, shop, productId, productHandle);
          });
        }
        _vtonStatusInFlight = checkStatus(shop, productId, productHandle)
          .then(function(status) {
            applyTryonStatus(status, shop, productId, productHandle);
            return status;
          })
          .catch(function(err) {
            warn('[VTON] Status check failed', err);
            return null;
          })
          .finally(function() {
            _vtonStatusInFlight = null;
          });
        return _vtonStatusInFlight;
      }

      function vtonInjectMobilePlacementCss() {
        if (document.getElementById('vton-mobile-placement-css')) return;
        var style = document.createElement('style');
        style.id = 'vton-mobile-placement-css';
        style.textContent =
          '@media (max-width:640px){' +
          '#vton-widget-container[data-vton-placement="floating_fallback"]{' +
          'left:max(12px,env(safe-area-inset-left))!important;' +
          'right:max(12px,env(safe-area-inset-right))!important;' +
          'bottom:max(88px,env(safe-area-inset-bottom))!important;' +
          'width:auto!important;max-width:none!important;}' +
          '#vton-widget-container:not([data-vton-placement="floating_fallback"]){' +
          'margin:12px 0!important;max-width:100%!important;box-sizing:border-box!important;}' +
          '}';
        document.head.appendChild(style);
      }

      function vtonInjectPageModalCss() {
        if (document.getElementById('vton-page-modal-css')) return;
        var style = document.createElement('style');
        style.id = 'vton-page-modal-css';
        style.textContent =
          'html.vton-modal-active header,' +
          'html.vton-modal-active .shopify-section-group-header-group,' +
          'html.vton-modal-active sticky-header,' +
          'html.vton-modal-active .header-wrapper,' +
          'html.vton-modal-active .announcement-bar,' +
          'html.vton-modal-active [data-header],' +
          'html.vton-modal-active #shopify-section-header,' +
          'html.vton-modal-active .section-header,' +
          'html.vton-modal-active cart-drawer,' +
          'html.vton-modal-active .sticky-add-to-cart,' +
          'html.vton-modal-active [data-sticky-product-form],' +
          'html.vton-modal-active .product-sticky-form{' +
          'visibility:hidden!important;pointer-events:none!important;}' +
          'html.vton-modal-active,html.vton-modal-active body{overflow:hidden!important;}';
        document.head.appendChild(style);
      }

      function vtonGetWidgetHost() {
        return document.getElementById('vton-widget-container');
      }

      function vtonExpandHostForModal() {
        var host = vtonGetWidgetHost();
        if (!host || host.dataset.vtonModalExpanded === '1') return;
        host._vtonStyleBackup = host.getAttribute('style') || '';
        host.dataset.vtonModalExpanded = '1';
        host.style.cssText =
          'position:fixed!important;inset:0!important;top:0!important;left:0!important;right:0!important;bottom:0!important;' +
          'width:100%!important;height:100%!important;max-width:none!important;margin:0!important;' +
          'z-index:2147483647!important;box-sizing:border-box!important;';
        document.documentElement.classList.add('vton-modal-active');
      }

      function vtonCollapseHostAfterModal() {
        var host = vtonGetWidgetHost();
        if (!host || host.dataset.vtonModalExpanded !== '1') return;
        host.dataset.vtonModalExpanded = '0';
        if (host._vtonStyleBackup) {
          host.setAttribute('style', host._vtonStyleBackup);
        } else {
          host.removeAttribute('style');
        }
        host._vtonStyleBackup = '';
        document.documentElement.classList.remove('vton-modal-active');
      }

      function initWidget() {
        vtonInjectMobilePlacementCss();
        vtonInjectPageModalCss();
        var shop = extractShop();
        if (!shop) return;

        var productId = extractProductId();
        if (!productId) return;

        var productHandle = extractProductHandle();
        var cachedStatus = readStatusCache(shop, productId);

        if (cachedStatus && !isTryonEnabledStatus(cachedStatus)) {
          suppressWidget(shop, productId, cachedStatus);
            refreshTryonStatus(shop, productId, productHandle);
          return;
        }

        _vtonSuppressed = false;
        refreshTryonStatus(shop, productId, productHandle);
      }
      
      function extractShop() {
        if (window.Shopify && window.Shopify.shop) {
          return window.Shopify.shop;
        }
        const hostname = window.location.hostname;
        const match = hostname.match(/([^.]+\.myshopify\.com)/);
        return match ? match[1] : hostname;
      }
      
      function extractProductId() {
        // 0. Liquid (most reliable on product pages - works even when theme omits Shopify.product)
        if (window.VTON_LIQUID && window.VTON_LIQUID.productId) {
          log('[VTON] Found product ID from Liquid:', window.VTON_LIQUID.productId);
          return window.VTON_LIQUID.productId;
        }

        // Try to get Shopify product ID (GID) from various sources
        // Priority order: GID format > numeric ID > handle (last resort)
        
        // 1. Try from Shopify global object (most reliable)
        if (window.Shopify && window.Shopify.product) {
          // Try product.id first
          if (window.Shopify.product.id) {
            const productId = window.Shopify.product.id;
            log('[VTON] Found product ID from window.Shopify.product.id:', productId);
            if (/^\d+$/.test(String(productId))) {
              return 'gid://shopify/Product/' + productId;
            }
            if (String(productId).startsWith('gid://shopify/Product/')) {
              return String(productId);
            }
          }
          // Also try product.product_id (sometimes different from id)
          if (window.Shopify.product.product_id) {
            const productId = window.Shopify.product.product_id;
            log('[VTON] Found product ID from window.Shopify.product.product_id:', productId);
            if (/^\d+$/.test(String(productId))) {
              return 'gid://shopify/Product/' + productId;
            }
            if (String(productId).startsWith('gid://shopify/Product/')) {
              return String(productId);
            }
          }
        }
        
        // 2. Try from JSON-LD structured data (common in Shopify themes)
        const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const script of jsonLdScripts) {
          try {
            const data = JSON.parse(script.textContent || '{}');
            if (data['@type'] === 'Product' && data.productID) {
              const productId = String(data.productID);
              log('[VTON] Found product ID from JSON-LD:', productId);
              if (/^\d+$/.test(productId)) {
                return 'gid://shopify/Product/' + productId;
              }
            }
            // Also check for @graph array
            if (data['@graph'] && Array.isArray(data['@graph'])) {
              for (const item of data['@graph']) {
                if (item['@type'] === 'Product' && item.productID) {
                  const productId = String(item.productID);
                  log('[VTON] Found product ID from JSON-LD @graph:', productId);
                  if (/^\d+$/.test(productId)) {
                    return 'gid://shopify/Product/' + productId;
                  }
                }
              }
            }
          } catch (e) {
            // Ignore JSON parse errors
          }
        }
        
        // 3. Try from data attribute on product form
        const productForm = document.querySelector('form[action*="/cart/add"]');
        if (productForm) {
          const productId = productForm.getAttribute('data-product-id') || 
                           productForm.querySelector('[name="id"]')?.getAttribute('value') ||
                           productForm.querySelector('input[name="id"]')?.value;
          if (productId) {
            log('[VTON] Found product ID from form:', productId);
            // Convert numeric ID to GID format if needed
            if (/^\d+$/.test(productId)) {
              return 'gid://shopify/Product/' + productId;
            }
            // Already in GID format
            if (productId.startsWith('gid://shopify/Product/')) {
              return productId;
            }
          }
        }
        
        // 4. Try from meta tags
        const metaSelectors = [
          'meta[property="product:retailer_item_id"]',
          'meta[name="product-id"]',
          'meta[property="og:product:retailer_item_id"]',
          '[data-product-id]'
        ];
        for (const selector of metaSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            const productId = element.getAttribute('content') || 
                             element.getAttribute('data-product-id') ||
                             element.getAttribute('value');
            if (productId) {
              log('[VTON] Found product ID from meta:', productId);
              if (/^\d+$/.test(productId)) {
                return 'gid://shopify/Product/' + productId;
              }
              if (productId.startsWith('gid://shopify/Product/')) {
                return productId;
              }
            }
          }
        }
        
        // 5. Try from variant selectors (often contain product ID)
        const variantSelect = document.querySelector('select[name="id"], select[data-product-id]');
        if (variantSelect) {
          const productId = variantSelect.getAttribute('data-product-id');
          if (productId && /^\d+$/.test(productId)) {
            log('[VTON] Found product ID from variant select:', productId);
            return 'gid://shopify/Product/' + productId;
          }
        }
        
        // 6. Last resort: Try from URL (handle) - backend will try to match
        const urlMatch = window.location.pathname.match(/\/products\/([^\/\?]+)/);
        if (urlMatch) {
          const handle = urlMatch[1];
          warn('[VTON] Could not find product ID, using handle as fallback:', handle);
          return handle; // Return handle as fallback
        }
        
        error('[VTON] Could not extract product ID from any source');
        return null;
      }
      
      function extractProductHandle() {
        if (window.VTON_LIQUID && window.VTON_LIQUID.productHandle) {
          return window.VTON_LIQUID.productHandle;
        }

        // Try from URL (most reliable) - extract handle from /products/handle
        const urlMatch = window.location.pathname.match(/\/products\/([^\/\?]+)/);
        if (urlMatch) {
          const handle = urlMatch[1];
          log('[VTON] Extracted handle from URL:', handle);
          return handle;
        }
        // Try from Shopify object
        if (window.Shopify && window.Shopify.product) {
          if (window.Shopify.product.handle) {
            log('[VTON] Extracted handle from window.Shopify.product.handle:', window.Shopify.product.handle);
            return window.Shopify.product.handle;
          }
          // Also try from product JSON data
          if (window.Shopify.productJson && window.Shopify.productJson.handle) {
            log('[VTON] Extracted handle from window.Shopify.productJson.handle:', window.Shopify.productJson.handle);
            return window.Shopify.productJson.handle;
          }
        }
        // Try from meta tags
        const metaHandle = document.querySelector('meta[property="product:handle"]') || 
                          document.querySelector('[data-product-handle]');
        if (metaHandle) {
          const handle = metaHandle.getAttribute('content') || 
                        metaHandle.getAttribute('data-product-handle');
          if (handle) {
            log('[VTON] Extracted handle from meta tag:', handle);
            return handle;
          }
        }
        warn('[VTON] Could not extract product handle');
        return null;
      }
      
      function buildStatusQuery(shop, productId, productHandle) {
        var normalizedId = normalizeProductIdForStatus(productId);
        var q =
          'shop=' +
          encodeURIComponent(shop) +
          '&product_id=' +
          encodeURIComponent(normalizedId) +
          '&visitor_id=' +
          encodeURIComponent(vtonGetVisitorId()) +
          '&_vton_ts=' +
          Date.now();
        if (productHandle) {
          q += '&product_handle=' + encodeURIComponent(productHandle);
        }
        return q;
        }

      function fetchStatusUrl(url) {
        var controller = new AbortController();
        var timeoutId = setTimeout(function() { controller.abort(); }, 3500);

        return fetch(url, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
          credentials: 'same-origin',
          cache: 'no-store'
        })
          .then(function(response) {
            clearTimeout(timeoutId);
            if (!response.ok) {
              throw new Error('Status check failed: ' + response.status);
            }
            return response.json();
          })
          .catch(function(err) {
            clearTimeout(timeoutId);
            throw err;
          });
      }

      function checkStatus(shop, productId, productHandle) {
        var query = buildStatusQuery(shop, productId, productHandle);
        var proxyUrl = window.location.origin + '/apps/tryon/status?' + query;
        var liquid = window.VTON_LIQUID || {};
        var appBase = (liquid.appUrl || '').replace(/\/$/, '');
        var directUrl = appBase ? appBase + '/apps/tryon/status?' + query : null;

        var attempts = [fetchStatusUrl(proxyUrl)];
        if (directUrl) {
          attempts.push(fetchStatusUrl(directUrl));
        }

        return Promise.any(attempts)
          .catch(function(err) {
            var cached = readStatusCache(shop, productId);
            if (cached && !isTryonEnabledStatus(cached)) {
              return {
                enabled: false,
                product_enabled: false,
                widget_settings: cached.widget_settings || {},
              };
            }
            warn('[VTON] Status check failed:', err);
            return {
              enabled: false,
              product_enabled: false,
              error: (err && err.errors && err.errors[0] && err.errors[0].message) || err.message || 'status_check_failed',
            };
          });
      }
      
      function getProductImage() {
        // Try multiple selectors to find product image
        const selectors = [
          '.product__media img',
          '.product-single__media img',
          '[data-product-image] img',
          '.product-media img',
          '.product-photos img',
          '.product-gallery img',
          'img[data-product-image]',
          '.product__photo img',
          'img.product-featured-image'
        ];
        
        for (const selector of selectors) {
          const img = document.querySelector(selector);
          if (img && img.src) {
            // Get the full-size image URL (remove size parameters)
            const imageUrl = img.src.split('?')[0].replace(/_small|_medium|_large|_grande/g, '');
            return imageUrl;
          }
        }
        
        return null;
      }

      var VTON_ATC_BUTTON_SELECTORS = 'button[type="submit"][name="add"], button[name="add"], button[type="submit"], [data-add-to-cart], .product-form__cart-submit, .product-form__submit, .btn--add-to-cart, .add-to-cart, shopify-buy-it-now-button, [aria-label*="add to cart" i], [aria-label*="ajouter" i], .shopify-payment-button, .dynamic-checkout__content';
      var VTON_FORM_SELECTORS = [
        'product-form form[action*="/cart"]',
        'form[action*="/cart/add"]',
        'form[action*="/cart/add.js"]',
        'form[data-type="add-to-cart-form"]',
        'form.product-form',
        'form#AddToCartForm',
        'form[action="/cart/add"]',
        '.shopify-product-form form',
        '[data-product-form] form',
        'form[data-productid]',
        'form[data-product-id]'
      ];
      var VTON_PRODUCT_INFO_SELECTORS = [
        '.product__info-wrapper',
        '.product__info-container',
        '.product__info',
        '.product-single__meta',
        '.product-info',
        '.product-details',
        '.product__content',
        '.product-single',
        '.product-main',
        '[data-product-info]',
        '[data-section-type="product"]',
        '[id*="shopify-section"][id*="product"]',
        '#ProductSection',
        '.product-section',
        '.product-form',
        '.product-block-list',
        '.product__column-sticky'
      ];
      var VTON_EXCLUDED_ANCESTORS = '.cart-drawer, .mini-cart, cart-drawer, .quick-add-modal, [data-quick-add], dialog, [role="dialog"], .drawer, #CartDrawer, .predictive-search, .search-modal, header.site-header, .announcement-bar';

      function vtonIsExcluded(el) {
        return !!(el && el.closest && el.closest(VTON_EXCLUDED_ANCESTORS));
      }

      function vtonIsVisible(el) {
        if (!el || typeof el.getBoundingClientRect !== 'function') return false;
        if (!el.isConnected) return false;
        if (vtonIsExcluded(el)) return false;
        if (el.closest && el.closest('[hidden]:not(#vton-embed-slot)')) return false;
        var rect = el.getBoundingClientRect();
        if (rect.width < 1 && rect.height < 1) return false;
        var style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0.01;
      }

      function vtonIsAnchorable(el) {
        if (!el || el.nodeType !== 1 || !el.isConnected) return false;
        if (vtonIsExcluded(el)) return false;
        if (el.id === 'vton-widget-container' || el.id === 'vton-embed-slot') return false;
        var style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        return true;
      }

      function vtonPickVisible(elements) {
        var list = Array.isArray(elements) ? elements : Array.from(elements || []);
        return list.find(vtonIsVisible) || list.find(vtonIsAnchorable) || list[0] || null;
      }

      function vtonQueryDeep(selector, root) {
        var results = [];
        function walk(node) {
          if (!node || node.nodeType !== 1) return;
          try {
            if (node.matches && node.matches(selector)) results.push(node);
            if (node.querySelectorAll) {
              node.querySelectorAll(selector).forEach(function(el) {
                results.push(el);
              });
            }
          } catch (e) {}
          if (node.shadowRoot) walk(node.shadowRoot);
          var children = node.children || [];
          for (var i = 0; i < children.length; i++) walk(children[i]);
        }
        walk(root || document.documentElement);
        return results;
      }

      function vtonFindBestProductForm() {
        for (var i = 0; i < VTON_FORM_SELECTORS.length; i++) {
          var picked = vtonPickVisible(document.querySelectorAll(VTON_FORM_SELECTORS[i]));
          if (picked) return picked;
        }
        var productFormEl = document.querySelector('product-form');
        if (productFormEl) {
          var inner = productFormEl.querySelector('form') || productFormEl;
          if (vtonPickVisible([inner])) return inner;
        }
        var deepForms = vtonQueryDeep('form[action*="/cart/add"], form[action*="/cart/add.js"]');
        return vtonPickVisible(deepForms);
      }

      function vtonFindAddToCartButton(root) {
        var scope = root || document;
        var parts = VTON_ATC_BUTTON_SELECTORS.split(', ');
        for (var i = 0; i < parts.length; i++) {
          var btn = scope.querySelector(parts[i]);
          if (btn && vtonPickVisible([btn])) return btn;
        }
        var deepMatches = vtonQueryDeep(
          'button[type="submit"], button[name="add"], [data-add-to-cart]',
          scope === document ? document.documentElement : scope
        );
        for (var d = 0; d < deepMatches.length; d++) {
          if (vtonPickVisible([deepMatches[d]])) return deepMatches[d];
        }
        var allButtons = scope.querySelectorAll ? scope.querySelectorAll('button, [role="button"], input[type="submit"]') : [];
        for (var j = 0; j < allButtons.length; j++) {
          var b = allButtons[j];
          var label = (b.textContent || b.getAttribute('aria-label') || b.getAttribute('title') || '').toLowerCase();
          if (
            (label.indexOf('cart') !== -1 ||
              label.indexOf('panier') !== -1 ||
              label.indexOf('add') !== -1 ||
              label.indexOf('ajouter') !== -1 ||
              label.indexOf('acheter') !== -1 ||
              label.indexOf('buy') !== -1) &&
            vtonPickVisible([b])
          ) {
            return b;
          }
        }
        return null;
      }

      function vtonGetEmbedSlotAnchor() {
        var slot = document.getElementById('vton-embed-slot');
        if (slot) return { anchor: slot, method: 'append', source: 'embed_slot' };
        return null;
      }

      function vtonFindInjectionAnchor(customSelector, options) {
        options = options || {};
        var allowHidden = options.allowHidden === true;

        function accept(el, method, source) {
          if (!el) return null;
          if (vtonPickVisible([el])) return { anchor: el, method: method || 'after', source: source };
          if (allowHidden && vtonIsAnchorable(el)) {
            return { anchor: el, method: method || 'after', source: source + '_relaxed' };
          }
          return null;
        }

        if (customSelector) {
          try {
            var customCandidates = document.querySelectorAll(customSelector);
            for (var c = 0; c < customCandidates.length; c++) {
              var customHit = accept(customCandidates[c], 'after', 'custom_selector');
              if (customHit) return customHit;
            }
          } catch (e) {
            warn('[VTON] Invalid custom anchor selector:', customSelector);
          }
        }

        var form = vtonFindBestProductForm();
        if (form) {
          var atcBtn = vtonFindAddToCartButton(form);
          if (atcBtn) {
            var wrapper = atcBtn.closest(
              '.product-form__buttons, .product-form__actions, .product-form__cart, .shopify-product-form, .product-form__submit-wrapper, .product-form__cta, .product__submit, .buy-buttons, .product-form__controls'
            );
            var btnHit = accept(wrapper || atcBtn, 'after', 'form_atc_button');
            if (btnHit) return btnHit;
          }
          var formHit = accept(form, 'after', 'product_form');
          if (formHit) return formHit;
        }

        var globalAtc = vtonFindAddToCartButton(document);
        if (globalAtc) {
          var globalHit = accept(globalAtc, 'after', 'global_atc_button');
          if (globalHit) return globalHit;
        }

        var productFormComponents = document.querySelectorAll('product-form');
        for (var p = 0; p < productFormComponents.length; p++) {
          var compHit = accept(productFormComponents[p], 'append', 'product-form_element');
          if (compHit) return compHit;
        }

        for (var k = 0; k < VTON_PRODUCT_INFO_SELECTORS.length; k++) {
          var infoNodes = document.querySelectorAll(VTON_PRODUCT_INFO_SELECTORS[k]);
          for (var n = 0; n < infoNodes.length; n++) {
            var infoHit = accept(infoNodes[n], 'append', 'product_info');
            if (infoHit) return infoHit;
          }
        }

        var stickyAtc = document.querySelector(
          '.sticky-add-to-cart, .product-sticky-form, [data-sticky-product-form]'
        );
        var stickyHit = accept(stickyAtc, 'append', 'sticky_atc');
        if (stickyHit) return stickyHit;

        var main = document.querySelector('main, [role="main"], #MainContent');
        var mainHit = accept(main, 'append', 'main_fallback');
        if (mainHit) return mainHit;

        return null;
      }

      function vtonMountContainer(target) {
        var container = document.createElement('div');
        container.id = 'vton-widget-container';
        container.setAttribute('data-vton-widget', 'true');
        container.setAttribute('data-vton-placement', target.source || 'unknown');

        if (target.floating) {
          container.style.cssText =
            'position:fixed;bottom:max(16px,env(safe-area-inset-bottom));right:max(16px,env(safe-area-inset-right));z-index:2147483000;width:auto;max-width:min(360px,calc(100vw - 32px));margin:0;box-sizing:border-box;';
          document.body.appendChild(container);
          return container;
        }

        container.style.cssText =
          'width:100%;max-width:100%;display:block;margin:16px 0;position:relative;z-index:2;box-sizing:border-box;';

        if (target.source === 'embed_slot') {
          target.anchor.style.display = 'block';
          target.anchor.setAttribute('aria-hidden', 'false');
        }

        var anchor = target.anchor;
        var method = target.method;
        if (method === 'after' && anchor.parentNode) {
          anchor.parentNode.insertBefore(container, anchor.nextSibling);
        } else if (method === 'prepend' && anchor.insertBefore) {
          anchor.insertBefore(container, anchor.firstChild);
        } else if (anchor.appendChild) {
          anchor.appendChild(container);
        } else if (anchor.parentNode) {
          anchor.parentNode.insertBefore(container, anchor.nextSibling);
        } else {
          return null;
        }
        return container;
      }

      function vtonResolveInjectionTarget(customSelector) {
        var primary = vtonFindInjectionAnchor(customSelector, { allowHidden: false });
        if (primary) return primary;
        var relaxed = vtonFindInjectionAnchor(customSelector, { allowHidden: true });
        if (relaxed) return relaxed;
        var slot = vtonGetEmbedSlotAnchor();
        if (slot) return slot;
        return { anchor: document.body, method: 'append', source: 'floating_fallback', floating: true };
      }

      function vtonWaitForInjectionAnchor(customSelector, timeoutMs) {
        return new Promise(function(resolve) {
          var immediate = vtonResolveInjectionTarget(customSelector);
          if (immediate && immediate.source !== 'floating_fallback' && immediate.source !== 'embed_slot') {
            return resolve(immediate);
          }

          var resolved = false;
          function finish() {
            if (resolved) return;
            resolved = true;
            try { obs.disconnect(); } catch (e) {}
            resolve(vtonResolveInjectionTarget(customSelector));
          }

          var scanTimer = null;
          var obs = new MutationObserver(function() {
            if (resolved) return;
            if (scanTimer) return;
            scanTimer = setTimeout(function() {
              scanTimer = null;
              if (resolved) return;
            var anchor = vtonFindInjectionAnchor(customSelector, { allowHidden: false });
            if (!anchor) anchor = vtonFindInjectionAnchor(customSelector, { allowHidden: true });
            if (anchor) {
              resolved = true;
              try { obs.disconnect(); } catch (e) {}
              resolve(anchor);
            }
            }, 120);
          });

          var observeRoot = vtonGetObserverRoot();
          obs.observe(observeRoot, { childList: true, subtree: true });

          setTimeout(finish, timeoutMs);
        });
      }

      function vtonWatchForDomRemoval(shop, productId, productHandle, statusPayload) {
        if (_vtonSuppressed) return;
        vtonStopReinjectObserver();

        var container = document.getElementById('vton-widget-container');
        if (!container || !container.parentNode) return;

        var parent = container.parentNode;
        var reinjectTimer = null;
        var reinjectCount = 0;
        var observer = new MutationObserver(function() {
          if (_vtonSuppressed) return;
          if (vtonHasWidgetContainers()) return;
          if (reinjectCount >= 3) {
            observer.disconnect();
            _vtonReinjectObserver = null;
            return;
          }
          clearTimeout(reinjectTimer);
          reinjectTimer = setTimeout(function() {
            if (_vtonSuppressed) return;
            var cached = readStatusCache(shop, productId);
            if (cached && !isTryonEnabledStatus(cached)) {
              suppressWidget(shop, productId, cached);
              return;
            }
            reinjectCount++;
            log('[VTON] Widget removed from DOM, re-checking status (attempt ' + reinjectCount + ')');
            _vtonWidgetRenderQueued = false;
            refreshTryonStatus(shop, productId, productHandle);
          }, 500);
        });
        _vtonReinjectObserver = observer;
        observer.observe(parent, { childList: true });
        setTimeout(function() {
          try {
          observer.disconnect();
          } catch (e) {}
          if (_vtonReinjectObserver === observer) {
            _vtonReinjectObserver = null;
          }
        }, 30000);
      }
      
      function initializeWidget(shop, productId, productHandle, statusPayload) {
        if (_vtonSuppressed) return;
        if (vtonHasWidgetContainers()) {
          warn('[VTON] Widget container already exists, skipping');
          return;
        }

        var payload = statusPayload && typeof statusPayload === 'object' ? statusPayload : {};
        var widgetSettings = payload.widget_settings || payload;

        if (!widgetSettings || typeof widgetSettings !== 'object') {
          widgetSettings = {};
        }

        var garmentFromAdmin = payload.garment_image_url || null;
        var abBucket = payload.ab_bucket || 'tryon';

        var customSelector = (window.VTON_LIQUID && window.VTON_LIQUID.customAnchor) || '';

        vtonWaitForInjectionAnchor(customSelector, 12000).then(function(injectionTarget) {
          if (!injectionTarget || !injectionTarget.anchor) {
            _vtonWidgetRenderQueued = false;
            error('[VTON] No injection anchor found. Enable App Embed or set a custom CSS selector in theme settings.');
            return;
          }

          if (injectionTarget.source === 'floating_fallback') {
            warn('[VTON] Using floating fallback — set a custom CSS selector in App Embed settings for better placement.');
          } else if (injectionTarget.source === 'embed_slot') {
            log('[VTON] Using app embed slot fallback');
          }

          log('[VTON] Injection anchor:', injectionTarget.source);
          var productImageUrl = garmentFromAdmin || getProductImage();
          if (garmentFromAdmin) {
            log('[VTON] Using admin-selected garment image for AI');
          }

          requestAnimationFrame(function() {
            var container = vtonMountContainer(injectionTarget);
            if (!container) {
              error('[VTON] Failed to mount widget container');
              return;
            }

            var shadowRoot = container.attachShadow({ mode: 'closed' });
            var state = {
              shop: shop,
              productId: productId,
              productHandle: productHandle,
              widgetSettings: widgetSettings,
              productImageUrl: productImageUrl,
              abBucket: abBucket,
              selectedVariantId: vtonNormalizeVariantIdForCart(vtonResolveVariantId()),
              userPhoto: null,
              resultImageUrl: null,
              modalOpen: false,
              isGenerating: false
            };

            requestAnimationFrame(function() {
              renderWidget(shadowRoot, state);
              log('[VTON] Widget rendered', { source: injectionTarget.source, productId: productId });

              window.vtonWidgetInstance = {
                openModal: function() { openModal(shadowRoot, state); },
                closeModal: function() { closeModal(shadowRoot, state); },
                triggerFileInput: function() {
                  var fileInput = shadowRoot.getElementById('vton-file-input');
                  if (fileInput) fileInput.click();
                },
                generate: function() { generateTryOn(shadowRoot, state); },
                handleFileChange: function(event) { handleFileChange(event, shadowRoot, state); },
                handleAddToCart: function() { handleAddToCart(shadowRoot, state); },
                startLoadingMessages: function() { startLoadingMessages(shadowRoot); },
                stopLoadingMessages: function() { stopLoadingMessages(shadowRoot); }
              };

              vtonWatchForDomRemoval(shop, productId, productHandle, payload);
            });
          });
        });
      }

      function vtonWidgetStyles(buttonBg, buttonColor) {
        return (
          ':host{display:block;width:100%;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;}' +
          '.vton-widget-container{margin:20px 0 0;width:100%;display:block;}' +
          '.vton-widget-container.vton-widget-container--modal-open{display:none;}' +
          '.vton-button{width:100%;padding:15px 22px;border:none;border-radius:14px;font-size:15px;font-weight:600;cursor:pointer;letter-spacing:0.01em;position:relative;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;gap:10px;transition:transform .25s cubic-bezier(.4,0,.2,1),box-shadow .25s cubic-bezier(.4,0,.2,1),filter .25s ease;box-shadow:0 2px 4px rgba(15,23,42,.06),0 8px 24px rgba(15,23,42,.1);}' +
          '.vton-button::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.14) 0%,transparent 48%);pointer-events:none;}' +
          '.vton-button:hover{transform:translateY(-2px);box-shadow:0 4px 8px rgba(15,23,42,.08),0 14px 32px rgba(15,23,42,.14);filter:brightness(1.04);}' +
          '.vton-button:active{transform:translateY(0);box-shadow:0 2px 6px rgba(15,23,42,.08);}' +
          '.vton-button__icon{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:8px;background:rgba(255,255,255,.18);flex-shrink:0;}' +
          '.vton-button__icon svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}' +
          '.vton-modal-overlay{position:fixed;inset:0;width:100vw;height:100dvh;background:rgba(15,23,42,.72);backdrop-filter:blur(12px) saturate(1.15);-webkit-backdrop-filter:blur(12px) saturate(1.15);display:none;align-items:center;justify-content:center;z-index:2147483646;padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));animation:vtonFadeIn .3s ease;overflow:hidden;overscroll-behavior:contain;box-sizing:border-box;}' +
          '@keyframes vtonFadeIn{from{opacity:0}to{opacity:1}}' +
          '.vton-modal-overlay.active{display:flex;}' +
          '.vton-modal{background:#fff;border-radius:24px;max-width:min(420px,calc(100vw - 32px));width:100%;max-height:min(90dvh,760px);overflow:hidden;position:relative;display:flex;flex-direction:column;box-shadow:0 32px 64px rgba(15,23,42,.22),0 0 0 1px rgba(15,23,42,.06);animation:vtonSlideUp .38s cubic-bezier(.22,1,.36,1);box-sizing:border-box;}' +
          '@keyframes vtonSlideUp{from{opacity:0;transform:translateY(24px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}' +
          '.vton-modal::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,' + buttonBg + ',transparent);z-index:2;}' +
          '.vton-modal-close{position:absolute;top:14px;right:14px;background:rgba(15,23,42,.06);border:none;font-size:20px;cursor:pointer;padding:0;line-height:1;color:#64748b;border-radius:12px;width:40px;height:40px;display:flex;align-items:center;justify-content:center;transition:background .2s ease,color .2s ease,transform .2s ease;z-index:10;font-weight:400;}' +
          '.vton-modal-close:hover{background:rgba(15,23,42,.1);color:#0f172a;transform:scale(1.05);}' +
          '.vton-modal-content{padding:44px 18px 18px;display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;box-sizing:border-box;}' +
          '.vton-funnel-head{text-align:center;margin-bottom:18px;flex-shrink:0;}' +
          '.vton-step-dots{display:flex;align-items:center;gap:6px;margin-bottom:12px;padding:0 2px;}' +
          '.vton-step-dot{flex:1;height:4px;border-radius:999px;background:rgba(15,23,42,.08);transition:background .35s cubic-bezier(.4,0,.2,1),transform .35s ease;width:auto;}' +
          '.vton-step-dot.active{background:' + buttonBg + ';transform:scaleY(1.35);}' +
          '.vton-step-dot.done{background:' + buttonBg + ';opacity:.35;}' +
          '.vton-funnel-label{margin:0;font-size:15px;font-weight:600;color:#0f172a;line-height:1.4;letter-spacing:-.02em;}'
        );
      }

      function renderWidget(shadowRoot, state) {
        const settings = state.widgetSettings;
        const buttonText =
          vtonStripEmojis(settings.widget_text) || 'Try it on';
        const buttonBg = settings.widget_bg || '#111827';
        const buttonColor = settings.widget_color || '#ffffff';
        
        shadowRoot.innerHTML = `
          <style>
            ${vtonWidgetStyles(buttonBg, buttonColor)}
            .vton-panel {
              display: none;
              flex-direction: column;
              flex: 1;
              min-height: 0;
              animation: vtonPanelIn 0.35s cubic-bezier(0.22, 1, 0.36, 1);
            }
            @keyframes vtonPanelIn {
              from { opacity: 0; transform: translateY(8px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .vton-panel.active {
              display: flex;
            }
            .vton-upload-area {
              border: 2px dashed rgba(15, 23, 42, 0.12);
              border-radius: 18px;
              padding: 32px 20px;
              text-align: center;
              cursor: pointer;
              margin-bottom: 16px;
              transition: border-color 0.3s ease, background 0.3s ease, box-shadow 0.3s ease, transform 0.3s ease;
              background: linear-gradient(165deg, #f8fafc 0%, #f1f5f9 100%);
              position: relative;
              overflow: hidden;
            }
            .vton-upload-area:hover {
              border-color: ${buttonBg};
              background: #fff;
              box-shadow: 0 8px 32px rgba(15, 23, 42, 0.08);
              transform: translateY(-1px);
            }
            .vton-upload-area.hidden {
              display: none;
            }
            .vton-upload-area p {
              margin: 0;
              font-size: 15px;
              color: #0f172a;
              font-weight: 600;
              line-height: 1.4;
              letter-spacing: -0.01em;
            }
            .vton-upload-area p:last-of-type {
              font-size: 13px;
              color: #64748b;
              font-weight: 400;
              margin-top: 6px;
            }
            .vton-upload-icon {
              width: 56px;
              height: 56px;
              margin: 0 auto 14px;
              display: flex;
              align-items: center;
              justify-content: center;
              position: relative;
              z-index: 1;
              border-radius: 16px;
              background: #fff;
              box-shadow: 0 4px 16px rgba(15, 23, 42, 0.08);
            }
            .vton-upload-icon svg {
              width: 28px;
              height: 28px;
              stroke: ${buttonBg};
              transition: stroke 0.25s ease, transform 0.25s ease;
            }
            .vton-upload-area:hover .vton-upload-icon svg {
              transform: scale(1.06);
            }
            .vton-upload-area.has-image {
              border: none;
              padding: 0;
              background: transparent;
              box-shadow: none;
            }
            .vton-upload-area.has-image:hover {
              background: transparent;
              transform: none;
            }
            .vton-upload-area img {
              max-width: 100%;
              max-height: min(24dvh, 200px);
              border-radius: 18px;
              object-fit: contain;
              box-shadow: 0 12px 40px rgba(15, 23, 42, 0.14);
              border: 1px solid rgba(15, 23, 42, 0.06);
            }
            .vton-privacy-notice {
              font-size: 12px;
              color: #94a3b8;
              text-align: center;
              margin: 0 0 14px;
              line-height: 1.45;
              padding: 0;
              background: transparent;
              border: none;
            }
            .vton-privacy-notice.hidden {
              display: none;
            }
            .vton-generate-btn {
              width: 100%;
              padding: 16px 20px;
              border: none;
              border-radius: 14px;
              font-size: 15px;
              font-weight: 600;
              cursor: pointer;
              margin-top: 4px;
              position: relative;
              overflow: hidden;
              transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s ease, opacity 0.2s ease;
              box-shadow: 0 4px 14px rgba(15, 23, 42, 0.14);
              letter-spacing: 0.01em;
            }
            .vton-generate-btn:hover:not(:disabled) {
              transform: translateY(-2px);
              box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
              filter: brightness(1.05);
            }
            .vton-generate-btn.hidden {
              display: none;
            }
            .vton-generate-btn:disabled {
              opacity: 0.42;
              cursor: not-allowed;
              transform: none;
              box-shadow: none;
            }
            .vton-loading {
              text-align: center;
              padding: 36px 12px;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              flex: 1;
              min-height: 220px;
            }
            .vton-spinner {
              width: 48px;
              height: 48px;
              border-radius: 50%;
              margin: 0 auto 28px;
              flex-shrink: 0;
              background: conic-gradient(from 0deg, ${buttonBg} 0deg, rgba(15,23,42,0.08) 120deg, transparent 240deg);
              animation: vtonSpin 0.9s linear infinite;
              position: relative;
            }
            .vton-spinner::after {
              content: "";
              position: absolute;
              inset: 5px;
              border-radius: 50%;
              background: #fff;
            }
            @keyframes vtonSpin {
              to { transform: rotate(360deg); }
            }
            .vton-loading-text {
              margin: 0 0 18px;
              font-size: 15px;
              color: #0f172a;
              font-weight: 600;
              min-height: 22px;
              line-height: 1.45;
              max-width: 300px;
              letter-spacing: -0.01em;
            }
            .vton-loading-text.fade-out {
              opacity: 0;
              transition: opacity 0.25s ease;
            }
            .vton-loading-subtext,
            .vton-progress-info {
              display: none !important;
            }
            .vton-progress-container {
              width: 100%;
              max-width: 260px;
              margin: 0 auto;
              background: rgba(15, 23, 42, 0.08);
              border-radius: 999px;
              height: 8px;
              overflow: hidden;
              position: relative;
              flex-shrink: 0;
            }
            .vton-progress-bar {
              height: 100%;
              background: linear-gradient(90deg, ${buttonBg}, ${buttonBg});
              border-radius: 999px;
              width: 0%;
              transition: width 0.45s cubic-bezier(0.4, 0, 0.2, 1);
              position: relative;
              box-shadow: 0 0 12px rgba(15, 23, 42, 0.15);
            }
            .vton-progress-info {
              display: flex;
              justify-content: space-between;
              align-items: center;
              max-width: 420px;
              margin: 0 auto;
              padding: 0 4px;
              flex-shrink: 0;
                width: 100%;
            }
            .vton-progress-text {
              font-size: 13px;
              font-weight: 600;
              color: #000000;
              flex-shrink: 0;
            }
            .vton-timer-value {
              font-size: 12px;
              font-weight: 400;
              color: #666666;
              flex-shrink: 0;
            }
            .vton-timer {
              text-align: center;
              font-size: 12px;
              color: #999;
              margin-top: 12px;
              font-family: monospace;
            }
            .vton-steps {
              display: none;
            }
            .vton-step {
              padding: 6px 12px;
              border-radius: 20px;
              font-size: 11px;
              font-weight: 600;
              background: #f0f0f0;
              color: #999;
              transition: all 0.3s ease;
            }
            .vton-step.active {
              background: ${buttonBg};
              color: ${buttonColor};
              transform: scale(1.1);
            }
            .vton-step.completed {
              background: #28a745;
              color: #fff;
            }
            .vton-loading-dots {
              display: inline-block;
              margin-left: 6px;
              vertical-align: middle;
            }
            .vton-loading-dots span {
              display: inline-block;
              width: 5px;
              height: 5px;
              border-radius: 50%;
              background: ${buttonBg};
              margin: 0 3px;
              animation: dotPulse 1.4s infinite ease-in-out;
            }
            .vton-loading-dots span:nth-child(1) { animation-delay: 0s; }
            .vton-loading-dots span:nth-child(2) { animation-delay: 0.25s; }
            .vton-loading-dots span:nth-child(3) { animation-delay: 0.5s; }
            @keyframes dotPulse {
              0%, 80%, 100% { 
                opacity: 0.3;
              }
              40% { 
                opacity: 1;
              }
            }
            .vton-result {
              width: 100%;
              min-height: 0;
            }
            .vton-result-content {
              width: 100%;
              display: flex;
              flex-direction: column;
              align-items: stretch;
              gap: 10px;
              box-sizing: border-box;
              flex: 1;
              min-height: 0;
              overflow: hidden;
            }
            #vton-panel-result.active {
              flex: 1;
              min-height: 0;
              overflow: hidden;
            }
            #vton-panel-result .vton-result {
              flex: 1;
              min-height: 0;
              overflow: hidden;
              display: flex;
              flex-direction: column;
            }
            .vton-result-lead {
              margin: 0;
              font-size: 15px;
              font-weight: 500;
              color: #334155;
              text-align: center;
              line-height: 1.5;
            }
            .vton-result-lead strong {
              color: #0f172a;
              font-weight: 600;
            }
            .vton-result img {
              width: 100%;
              max-height: min(34dvh, 280px);
              height: auto;
              border-radius: 14px;
              object-fit: contain;
              display: block;
              background: linear-gradient(165deg, #f8fafc, #f1f5f9);
              box-shadow: 0 8px 24px rgba(15, 23, 42, 0.1);
              border: 1px solid rgba(15, 23, 42, 0.06);
              flex-shrink: 1;
            }
            .vton-add-to-cart-btn {
              width: 100%;
              padding: 16px 20px;
              border: none;
              border-radius: 14px;
              font-size: 15px;
              font-weight: 600;
              cursor: pointer;
              position: relative;
              overflow: hidden;
              transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s ease, opacity 0.2s ease;
              box-shadow: 0 4px 16px rgba(15, 23, 42, 0.16);
              letter-spacing: 0.01em;
              box-sizing: border-box;
            }
            .vton-add-to-cart-btn:hover {
              transform: translateY(-2px);
              box-shadow: 0 10px 28px rgba(15, 23, 42, 0.2);
              filter: brightness(1.04);
            }
            .vton-add-to-cart-btn:active {
              transform: translateY(0);
            }
            .vton-add-to-cart-btn:disabled {
              opacity: 0.65;
              cursor: not-allowed;
              transform: none;
            }
            .vton-value-props {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 10px;
              width: 100%;
              margin-bottom: 18px;
            }
            .vton-value-prop {
              background: #f6f7f8;
              border: 1px solid #e8eaed;
              border-radius: 12px;
              padding: 12px 10px;
              text-align: center;
            }
            .vton-value-prop strong {
              display: block;
              font-size: 12px;
              color: #111827;
              margin-bottom: 4px;
            }
            .vton-value-prop span {
              display: block;
              font-size: 11px;
              color: #6b7280;
              line-height: 1.35;
            }
            .vton-result-badge {
              display: block;
              width: fit-content;
              margin: 0 auto 14px;
              font-size: 11px;
              font-weight: 700;
              letter-spacing: 0.1em;
              text-transform: uppercase;
              color: #047857;
              background: linear-gradient(135deg, #ecfdf5, #d1fae5);
              border: 1px solid rgba(16, 185, 129, 0.25);
              border-radius: 999px;
              padding: 7px 14px;
            }
            .vton-result-sub {
              margin: 0 0 16px;
              font-size: 14px;
              line-height: 1.5;
              color: #4b5563;
              text-align: center;
              max-width: 420px;
            }
            .vton-trust-row {
              display: flex;
              flex-wrap: wrap;
              gap: 8px 14px;
              justify-content: center;
              width: 100%;
              max-width: 420px;
              font-size: 12px;
              color: #374151;
            }
            .vton-trust-row span {
              white-space: nowrap;
            }
            .vton-urgency {
              margin: 0;
              font-size: 13px;
              font-weight: 700;
              color: #b45309;
              text-align: center;
            }
            .vton-result-actions {
              display: flex;
              flex-wrap: wrap;
              gap: 10px;
              justify-content: center;
              width: 100%;
              max-width: 420px;
            }
            .vton-retry-link {
              background: none;
              border: none;
              padding: 6px 0 0;
              margin: 0;
              font-size: 13px;
              color: #64748b;
              cursor: pointer;
              font-weight: 500;
              text-align: center;
              width: 100%;
              transition: color 0.2s ease;
            }
            .vton-retry-link:hover {
              color: #0f172a;
            }
            .vton-share-block {
              width: 100%;
              margin-top: 4px;
              padding-top: 12px;
              border-top: 1px solid rgba(15, 23, 42, 0.08);
              flex-shrink: 0;
            }
            .vton-share-heading {
              margin: 0 0 8px 0;
              font-size: 11px;
              font-weight: 600;
              color: #94a3b8;
              text-align: center;
              text-transform: uppercase;
              letter-spacing: 0.08em;
            }
            .vton-share-btns {
              display: grid;
              grid-template-columns: repeat(3, minmax(0, 1fr));
              gap: 8px;
            }
            .vton-share-btns--dual {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }
            .vton-share-btn {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 6px;
              min-height: 44px;
              padding: 10px 8px;
              border-radius: 10px;
              border: 1px solid rgba(15, 23, 42, 0.12);
              background: #fff;
              color: #0f172a;
              font-size: 12px;
              font-weight: 600;
              cursor: pointer;
              line-height: 1.2;
              transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
              box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
            }
            .vton-share-btn:hover {
              border-color: rgba(15, 23, 42, 0.2);
              box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
            }
            .vton-share-btn__icon {
              width: 18px;
              height: 18px;
              flex-shrink: 0;
            }
            .vton-share-btn__label {
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .vton-share-btn--native {
              color: #334155;
            }
            .vton-share-btn--wa {
              border-color: rgba(22, 163, 74, 0.3);
              background: #f0fdf4;
              color: #166534;
            }
            .vton-share-btn--wa:hover {
              background: #dcfce7;
              border-color: rgba(22, 163, 74, 0.45);
            }
            .vton-share-btn--copy {
              color: #334155;
            }
            .vton-share-btn.is-copied {
              border-color: rgba(37, 99, 235, 0.35);
              background: #eff6ff;
              color: #1d4ed8;
            }
            .vton-privacy-notice .vton-privacy-icon {
              display: inline-flex;
              vertical-align: middle;
              margin-right: 4px;
              width: 14px;
              height: 14px;
              color: #94a3b8;
            }
            .vton-secondary-btn {
              flex: 1 1 140px;
              padding: 12px 16px;
              border-radius: 12px;
              border: 1px solid rgba(15, 23, 42, 0.1);
              background: #fff;
              color: #0f172a;
              font-size: 13px;
              font-weight: 600;
              cursor: pointer;
              transition: background 0.2s ease, border-color 0.2s ease;
            }
            .vton-secondary-btn:hover {
              border-color: rgba(15, 23, 42, 0.18);
              background: #f8fafc;
            }
            .vton-social-proof {
              margin: 8px 0 0;
              font-size: 12px;
              color: #6b7280;
              text-align: center;
              max-width: 400px;
              line-height: 1.45;
            }
            .vton-atc-error {
              width: 100%;
              max-width: 420px;
              margin: 0;
              padding: 10px 12px;
              border-radius: 8px;
              background: #fef2f2;
              border: 1px solid #fecaca;
              color: #b91c1c;
              font-size: 13px;
              text-align: center;
              display: none;
            }
            .vton-atc-error.active {
              display: block;
            }
            .vton-variant-picker {
              width: 100%;
              max-width: 420px;
              margin: 0 0 12px;
            }
            .vton-variant-label {
              display: block;
              font-size: 13px;
              font-weight: 700;
              color: #111827;
              margin-bottom: 6px;
            }
            .vton-variant-select {
              width: 100%;
              padding: 14px 16px;
              border-radius: 12px;
              border: 1px solid rgba(15, 23, 42, 0.12);
              font-size: 14px;
              background: #f8fafc;
              color: #0f172a;
              transition: border-color 0.2s ease, box-shadow 0.2s ease;
            }
            .vton-variant-select:focus {
              outline: none;
              border-color: ${buttonBg};
              box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.08);
              background: #fff;
            }
            .vton-variant-picker--multi .vton-variant-picker__row {
              margin-bottom: 10px;
            }
            .vton-variant-picker--multi .vton-variant-picker__row:last-of-type {
              margin-bottom: 0;
            }
            .vton-variant-select--hidden {
              position: absolute;
              width: 1px;
              height: 1px;
              opacity: 0;
              pointer-events: none;
              overflow: hidden;
              clip: rect(0, 0, 0, 0);
            }
            .vton-error {
              color: #b91c1c;
              text-align: center;
              padding: 16px 18px;
              display: none;
              background: #fef2f2;
              border: 1px solid #fecaca;
              border-radius: 14px;
              margin: 16px 0 0;
              font-size: 14px;
              line-height: 1.55;
              font-weight: 500;
            }
            .vton-error.active {
              display: block;
            }
            .vton-error.credits-limit {
              color: #7f1d1d;
              background: #fef2f2;
              border: 1px solid #fecaca;
              font-weight: 600;
            }
            .vton-error.credits-limit .vton-error-text {
              color: #7f1d1d;
            }
            .vton-error-text {
              margin: 0 0 12px 0;
            }
            .vton-free-retry-btn {
              display: block;
              width: 100%;
              margin-top: 10px;
              padding: 14px 16px;
              border: none;
              border-radius: 12px;
              font-size: 14px;
              font-weight: 600;
              cursor: pointer;
              background: ${buttonBg};
              color: ${buttonColor};
              box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
              transition: transform 0.2s ease, filter 0.2s ease;
            }
            .vton-free-retry-btn:hover {
              transform: translateY(-1px);
              filter: brightness(1.05);
            }
            @media (max-width: 640px) {
              .vton-widget-container {
                margin: 12px 0 0 0;
                width: 100%;
                max-width: 100%;
                box-sizing: border-box;
              }
              .vton-button {
                width: 100%;
                max-width: 100%;
                padding: 16px 20px;
                font-size: 15px;
                border-radius: 14px;
                box-sizing: border-box;
              }
              .vton-modal-overlay {
                padding: 0;
                align-items: stretch;
                justify-content: stretch;
              }
              .vton-modal {
                max-width: 100%;
                width: 100%;
                max-height: 100dvh;
                height: 100%;
                min-height: 100dvh;
                margin: 0;
                border-radius: 0;
                border: none;
                align-self: stretch;
              }
              .vton-modal-content {
                padding: 36px 24px;
                height: auto;
                min-height: auto;
                justify-content: center;
                align-items: center;
                display: flex;
                flex-direction: column;
              }
              .vton-modal-content.has-result {
                padding: 32px 24px;
                justify-content: center;
                align-items: center;
              }
              .vton-upload-area {
                padding: 56px 28px;
                border-radius: 14px;
              }
              .vton-upload-area p {
                font-size: 15px;
              }
              .vton-generate-btn {
                padding: 18px 28px;
                font-size: 15px;
                border-radius: 10px;
              }
              .vton-modal-close {
                top: 20px;
                right: 20px;
                font-size: 28px;
                padding: 10px;
                width: 40px;
                height: 40px;
                z-index: 10;
              }
              .vton-loading {
                padding: 48px 24px;
              }
              .vton-loading-text {
                font-size: 16px;
              }
              .vton-privacy-notice {
                font-size: 12px;
                padding: 10px 14px;
                margin: 16px 0;
                border-radius: 8px;
              }
              .vton-error {
                padding: 20px 24px;
                font-size: 14px;
                border-radius: 12px;
              }
              .vton-result img {
                max-height: 60vh;
                border-radius: 16px;
              }
              .vton-result-title {
                font-size: 20px;
              }
              .vton-add-to-cart-btn {
                max-width: 100%;
                padding: 18px 28px;
                font-size: 16px;
                border-radius: 12px;
              }
              .vton-value-props {
                grid-template-columns: 1fr;
              }
            }
            @media (max-width: 480px) {
              .vton-button {
                padding: 11px 16px;
                font-size: 14px;
              }
              .vton-modal-overlay {
                align-items: stretch;
                justify-content: stretch;
              }
              .vton-modal {
                margin: 0;
                align-self: stretch;
                min-height: 100dvh;
                height: 100%;
              }
              .vton-modal-content {
                padding: 48px 14px 14px;
                justify-content: flex-start;
                align-items: stretch;
                display: flex;
                flex-direction: column;
                overflow: hidden;
              }
              .vton-modal-content.has-result {
                padding: 44px 12px 12px;
                justify-content: flex-start;
              }
              .vton-funnel-head {
                margin-bottom: 12px;
              }
              .vton-share-btns {
                grid-template-columns: repeat(2, minmax(0, 1fr));
              }
              .vton-share-btn--native {
                grid-column: 1 / -1;
              }
              .vton-result img {
                max-height: min(28dvh, 200px);
              }
              .vton-result-lead {
                font-size: 14px;
                margin: 0;
              }
              .vton-loading {
                min-height: 160px;
                padding: 24px 12px;
              }
              .vton-upload-area {
                padding: 32px 16px;
              }
              .vton-generate-btn {
                padding: 12px;
                font-size: 14px;
              }
              .vton-loading {
                padding: 28px 16px;
              }
              .vton-result img {
                max-height: min(26dvh, 180px);
              }
              .vton-result-title {
                font-size: 16px;
              }
              .vton-add-to-cart-btn {
                padding: 14px 20px;
                font-size: 15px;
              }
            }
          </style>
          <div class="vton-widget-container">
            <button type="button" class="vton-button" style="background: ${buttonBg}; color: ${buttonColor};" onclick="window.vtonWidgetInstance.openModal()">
              <span class="vton-button__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M5 20v-1a7 7 0 0114 0v1"/></svg>
              </span>
              <span class="vton-button__label">${buttonText}</span>
            </button>
          </div>
          <div id="vton-modal-overlay" class="vton-modal-overlay" onclick="if(event.target === this) window.vtonWidgetInstance.closeModal()">
            <div class="vton-modal">
              <button class="vton-modal-close" onclick="window.vtonWidgetInstance.closeModal()">&times;</button>
              <div class="vton-modal-content">
                <div class="vton-funnel-head">
                  <div class="vton-step-dots" aria-hidden="true">
                    <span class="vton-step-dot active" data-step="1"></span>
                    <span class="vton-step-dot" data-step="2"></span>
                    <span class="vton-step-dot" data-step="3"></span>
                  </div>
                  <p id="vton-funnel-label" class="vton-funnel-label">Upload your photo</p>
                </div>
                <div id="vton-panel-upload" class="vton-panel active">
                <div id="vton-upload-area" class="vton-upload-area" onclick="window.vtonWidgetInstance.triggerFileInput()">
                  <input type="file" id="vton-file-input" accept="image/*" style="display: none;" onchange="window.vtonWidgetInstance.handleFileChange(event)" />
                  <span class="vton-upload-icon">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M23 19C23 19.5304 22.7893 20.0391 22.4142 20.4142C22.0391 20.7893 21.5304 21 21 21H3C2.46957 21 1.96086 20.7893 1.58579 20.4142C1.21071 20.0391 1 19.5304 1 19V8C1 7.46957 1.21071 6.96086 1.58579 6.58579C1.96086 6.21071 2.46957 6 3 6H7L9 4H15L17 6H21C21.5304 6 22.0391 6.21071 22.4142 6.58579C22.7893 6.96086 23 7.46957 23 8V19Z" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M12 17C14.2091 17 16 15.2091 16 13C16 10.7909 14.2091 9 12 9C9.79086 9 8 10.7909 8 13C8 15.2091 9.79086 17 12 17Z" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </span>
                  <p>Tap to add your photo</p>
                  <p>Front-facing · good lighting · best results</p>
                </div>
                <p class="vton-privacy-notice"><span class="vton-privacy-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></span>Secure processing · your photo is not stored</p>
                <button id="vton-generate-btn" class="vton-generate-btn" style="background: ${buttonBg}; color: ${buttonColor};" onclick="window.vtonWidgetInstance.generate()" disabled>
                  Try it on
                </button>
                </div>
                <div id="vton-panel-loading" class="vton-panel">
                <div id="vton-loading" class="vton-loading">
                  <div class="vton-spinner"></div>
                  <p id="vton-loading-message" class="vton-loading-text">Creating your try-on<span class="vton-loading-dots"><span></span><span></span><span></span></span></p>
                  <div class="vton-progress-container">
                    <div id="vton-progress-bar" class="vton-progress-bar"></div>
                  </div>
                  <div class="vton-progress-info">
                    <span id="vton-progress-text" class="vton-progress-text">0%</span>
                    <span id="vton-timer-value" class="vton-timer-value">~30s</span>
                  </div>
                  <p class="vton-loading-subtext">This usually takes about 30 seconds</p>
                </div>
                </div>
                <div id="vton-panel-result" class="vton-panel">
                <div id="vton-result" class="vton-result"></div>
                </div>
                <div id="vton-error" class="vton-error"></div>
              </div>
            </div>
          </div>
        `;
      }
      

      function vtonShowFunnelPanel(shadowRoot, panelName) {
        var stepMap = { upload: 1, loading: 2, result: 3 };
        var step = stepMap[panelName] || 1;
        var labels = {
          upload: 'Upload your photo',
          loading: 'Creating your try-on...',
          result: 'Your result'
        };
        var labelEl = shadowRoot.getElementById('vton-funnel-label');
        if (labelEl) {
          labelEl.textContent = labels[panelName] || labels.upload;
        }
        var dots = shadowRoot.querySelectorAll('.vton-step-dot');
        for (var i = 0; i < dots.length; i++) {
          var n = parseInt(dots[i].getAttribute('data-step'), 10);
          dots[i].classList.remove('active', 'done');
          if (n < step) dots[i].classList.add('done');
          if (n === step) dots[i].classList.add('active');
        }
        var panels = shadowRoot.querySelectorAll('.vton-panel');
        for (var j = 0; j < panels.length; j++) {
          panels[j].classList.remove('active');
        }
        var panel = shadowRoot.getElementById('vton-panel-' + panelName);
        if (panel) panel.classList.add('active');
      }
      
      function openModal(shadowRoot, state) {
        const overlay = shadowRoot.getElementById('vton-modal-overlay');
        if (overlay) {
          vtonExpandHostForModal();
          overlay.classList.add('active');
          state.modalOpen = true;
          var triggerWrap = shadowRoot.querySelector('.vton-widget-container');
          if (triggerWrap) triggerWrap.classList.add('vton-widget-container--modal-open');

          // Prevent body scroll when modal is open
          const body = document.body;
          const html = document.documentElement;
          const scrollY = window.scrollY;

          // Save current scroll position
          body.style.position = 'fixed';
          body.style.top = '-' + scrollY + 'px';
          body.style.width = '100%';
          body.style.overflow = 'hidden';

          // Also prevent scroll on html element
          html.style.overflow = 'hidden';

          // Store scroll position for restoration
          state.savedScrollY = scrollY;
        }
        if (state.resultImageUrl) {
          renderTryonResultPanel(shadowRoot, state);
          vtonShowFunnelPanel(shadowRoot, 'result');
        } else {
          vtonShowFunnelPanel(shadowRoot, 'upload');
        }
      }
      
      function closeModal(shadowRoot, state) {
        const overlay = shadowRoot.getElementById('vton-modal-overlay');
        if (overlay) {
          overlay.classList.remove('active');
          state.modalOpen = false;
          var triggerWrap = shadowRoot.querySelector('.vton-widget-container');
          if (triggerWrap) triggerWrap.classList.remove('vton-widget-container--modal-open');
          vtonCollapseHostAfterModal();

          // Restore body scroll
          const body = document.body;
          const html = document.documentElement;
          const scrollY = state.savedScrollY || 0;

          // Restore body styles
          body.style.position = '';
          body.style.top = '';
          body.style.width = '';
          body.style.overflow = '';

          // Restore html overflow
          html.style.overflow = '';

          // Restore scroll position
          window.scrollTo(0, scrollY);

          // Clear saved scroll position
          state.savedScrollY = null;

          var modalContent = shadowRoot.querySelector('.vton-modal-content');
          if (modalContent) {
            modalContent.classList.remove('has-result');
          }
        }
      }
      
      function handleFileChange(event, shadowRoot, state) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(e) {
          state.userPhoto = e.target.result;
          vtonResetRetryState(state);
          const uploadArea = shadowRoot.getElementById('vton-upload-area');
          const generateBtn = shadowRoot.getElementById('vton-generate-btn');
          if (uploadArea) {
            uploadArea.className = 'vton-upload-area has-image';
            uploadArea.innerHTML = '<img src="' + state.userPhoto + '" alt="Preview" />';
          }
          if (generateBtn) {
            generateBtn.disabled = false;
          }
        };
        reader.readAsDataURL(file);
      }
      
      function vtonEscapeHtml(str) {
        return String(str || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      function vtonStripEmojis(str) {
        return String(str || '')
          .replace(
            /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}]/gu,
            ''
          )
          .replace(/\s+/g, ' ')
          .trim();
      }

      function vtonShareIconSvg(name) {
        if (name === 'whatsapp') {
          return (
            '<svg class="vton-share-btn__icon" viewBox="0 0 24 24" aria-hidden="true">' +
            '<path fill="currentColor" d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 2.09.62 4.03 1.69 5.66L2.05 22l4.51-1.65a9.86 9.86 0 004.48 1.07h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm5.84 14.17c-.25.71-1.21 1.32-1.67 1.38-.43.05-.98.08-1.58-.1-.36-.12-.83-.39-1.44-.76-2.54-1.5-4.18-4.13-4.31-4.32-.13-.19-1.03-1.36-1.03-2.64 0-1.28.67-1.91.91-2.17.25-.26.55-.32.74-.32h.53c.17 0 .4-.06.62.47.22.54.76 1.86.83 1.99.07.13.12.28.02.45-.1.17-.15.28-.3.43-.15.15-.31.34-.44.45-.15.12-.3.25-.13.49.17.24.76 1.25 1.63 2.02 1.12.99 2.06 1.3 2.37 1.44.31.14.49.12.67-.07.18-.19.77-.9.98-1.21.21-.31.42-.26.71-.16.29.1 1.84.87 2.16 1.03.32.16.53.24.61.37.08.13.08.76-.17 1.47z"/>' +
            '</svg>'
          );
        }
        if (name === 'copy') {
          return (
            '<svg class="vton-share-btn__icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<rect x="9" y="9" width="13" height="13" rx="2"/>' +
            '<path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>' +
            '</svg>'
          );
        }
        return (
          '<svg class="vton-share-btn__icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7"/>' +
          '<path d="M16 6l-4-4-4 4"/><path d="M12 2v14"/>' +
          '</svg>'
        );
      }

      function vtonGetShopifyRoot() {
        var root = '/';
        if (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) {
          root = window.Shopify.routes.root;
        }
        if (root.charAt(root.length - 1) !== '/') {
          root += '/';
        }
        return root;
      }

      var __vtonProductDataCache = null;

      function vtonGetProductData() {
        if (__vtonProductDataCache) {
          return __vtonProductDataCache;
        }

        var scriptEl = document.getElementById('vton-product-json');
        if (scriptEl && scriptEl.textContent) {
          try {
            __vtonProductDataCache = JSON.parse(scriptEl.textContent.trim());
            return __vtonProductDataCache;
          } catch (e) {}
        }

        var jsonScripts = document.querySelectorAll('script[type="application/json"]');
        for (var si = 0; si < jsonScripts.length; si++) {
          var sid = jsonScripts[si].id || '';
          if (!/product/i.test(sid) || !jsonScripts[si].textContent) {
            continue;
          }
          try {
            var parsed = JSON.parse(jsonScripts[si].textContent.trim());
            if (parsed && parsed.variants && parsed.variants.length) {
              __vtonProductDataCache = parsed;
              return __vtonProductDataCache;
            }
          } catch (e2) {}
        }

        if (
          window.ShopifyAnalytics &&
          window.ShopifyAnalytics.meta &&
          window.ShopifyAnalytics.meta.product
        ) {
          __vtonProductDataCache = window.ShopifyAnalytics.meta.product;
          return __vtonProductDataCache;
        }

        if (window.Shopify && window.Shopify.product) {
          __vtonProductDataCache = window.Shopify.product;
          return __vtonProductDataCache;
        }

        return null;
      }

      function vtonResolveVariantIdFromFormOnly(form) {
        var formEl = form || vtonFindBestProductForm();
        var productFormEl = document.querySelector('product-form');
        if (productFormEl) {
          var dataVid = productFormEl.getAttribute('data-variant-id');
          if (dataVid) {
            return String(dataVid);
          }
        }

        var scope = formEl || document.documentElement;
        var idInputs = vtonQueryDeep(
          'input[name="id"]:not([disabled]), select[name="id"]:not([disabled])',
          scope
        );
        for (var j = 0; j < idInputs.length; j++) {
          if (idInputs[j] && idInputs[j].value) {
            return String(idInputs[j].value);
          }
        }

        var urlVariant = new URLSearchParams(window.location.search).get('variant');
        if (urlVariant) {
          return String(urlVariant);
        }

        return null;
      }

      function vtonReadThemeOptionSelections(product, form) {
        var selections = {};
        if (!product || !product.options || !product.options.length) {
          return selections;
        }

        var opts = product.options;
        var formEl = form || vtonFindBestProductForm();
        var htmlForm =
          formEl instanceof HTMLFormElement
            ? formEl
            : formEl && formEl.querySelector
              ? formEl.querySelector('form')
              : null;

        if (htmlForm) {
          for (var i = 0; i < opts.length; i++) {
            var optName = opts[i];
            if (!optName) {
              continue;
            }
            var optionField =
              htmlForm.querySelector('[name="options[' + optName + ']"]') ||
              htmlForm.querySelector('select[name="option' + (i + 1) + '"]') ||
              htmlForm.querySelector('#Option-' + (i + 1) + ' select');
            if (optionField) {
              if (optionField.tagName === 'SELECT' && optionField.value) {
                selections[optName] = optionField.value;
              } else if (optionField.type === 'radio' && optionField.checked) {
                selections[optName] = optionField.value;
              }
            }
            var checkedRadio = htmlForm.querySelector(
              'input[name="options[' + optName + ']"]:checked'
            );
            if (checkedRadio && checkedRadio.value) {
              selections[optName] = checkedRadio.value;
            }
          }
        }

        var vid = vtonResolveVariantIdFromFormOnly(form);
        if (vid && product.variants) {
          var norm = vtonNormalizeVariantIdForCart(vid);
          for (var v = 0; v < product.variants.length; v++) {
            var variant = product.variants[v];
            if (vtonNormalizeVariantIdForCart(variant.id) === norm) {
              for (var j = 0; j < opts.length; j++) {
                var key = 'option' + (j + 1);
                if (variant[key] && variant[key] !== 'Default Title') {
                  selections[opts[j]] = variant[key];
                }
              }
              break;
            }
          }
        }

        return selections;
      }

      function vtonFindVariantIdFromSelections(product, selections) {
        if (!product || !product.variants || !selections) {
          return null;
        }
        var opts = product.options || [];
        var hasPick = false;
        for (var k in selections) {
          if (Object.prototype.hasOwnProperty.call(selections, k) && selections[k]) {
            hasPick = true;
            break;
          }
        }
        if (!hasPick) {
          return null;
        }

        for (var i = 0; i < product.variants.length; i++) {
          var variant = product.variants[i];
          var match = true;
          for (var j = 0; j < opts.length; j++) {
            var optName = opts[j];
            var selVal = selections[optName];
            if (!selVal) {
              continue;
            }
            var key = 'option' + (j + 1);
            if (variant[key] !== selVal) {
              match = false;
              break;
            }
          }
          if (match) {
            return String(variant.id);
          }
        }
        return null;
      }

      function vtonMeaningfulProductOptions(product) {
        if (!product || !product.variants) {
          return [];
        }
        var opts = product.options || [];
        var variants = product.variants;
        var result = [];
        for (var i = 0; i < opts.length; i++) {
          var name = opts[i];
          if (!name || name === 'Title') {
            continue;
          }
          var key = 'option' + (i + 1);
          var seen = {};
          var values = [];
          for (var v = 0; v < variants.length; v++) {
            var val = variants[v][key];
            if (val && val !== 'Default Title' && !seen[val]) {
              seen[val] = true;
              values.push(val);
            }
          }
          if (values.length) {
            result.push({ index: i, name: name, key: key, values: values });
          }
        }
        return result;
      }

      function vtonIsOptionValueAvailable(product, optionName, value, currentSelections) {
        if (!product || !product.variants) {
          return true;
        }
        var opts = product.options || [];
        var trial = {};
        var key;
        for (key in currentSelections || {}) {
          if (Object.prototype.hasOwnProperty.call(currentSelections, key)) {
            trial[key] = currentSelections[key];
          }
        }
        trial[optionName] = value;

        for (var i = 0; i < product.variants.length; i++) {
          var variant = product.variants[i];
          if (variant.available === false) {
            continue;
          }
          var match = true;
          for (var j = 0; j < opts.length; j++) {
            var name = opts[j];
            var pick = trial[name];
            if (!pick) {
              continue;
            }
            if (variant['option' + (j + 1)] !== pick) {
              match = false;
              break;
            }
          }
          if (match) {
            return true;
          }
        }
        return false;
      }

      function vtonResolveVariantId(form) {
        var fromForm = vtonResolveVariantIdFromFormOnly(form);
        if (fromForm) {
          return fromForm;
        }

        var product = vtonGetProductData();
        if (product && product.variants && product.variants.length) {
          var selections = vtonReadThemeOptionSelections(product, form);
          var fromOpts = vtonFindVariantIdFromSelections(product, selections);
          if (fromOpts) {
            return fromOpts;
          }
        }

        if (window.Shopify && window.Shopify.product) {
          var p = window.Shopify.product;
          if (p.selected_or_first_available_variant && p.selected_or_first_available_variant.id) {
            return String(p.selected_or_first_available_variant.id);
          }
          if (Array.isArray(p.variants) && p.variants.length) {
            for (var vi = 0; vi < p.variants.length; vi++) {
              if (p.variants[vi].available) {
                return String(p.variants[vi].id);
              }
            }
            return String(p.variants[0].id);
          }
        }

        return null;
      }

      function vtonNormalizeVariantIdForCart(variantId) {
        if (variantId === null || variantId === undefined || variantId === '') {
          return null;
        }
        var s = String(variantId).trim();
        var gid = s.match(/ProductVariant\/(\d+)/i);
        if (gid) {
          return gid[1];
        }
        if (/^\d+$/.test(s)) {
          return s;
        }
        var n = parseInt(s, 10);
        return Number.isFinite(n) && n > 0 ? String(n) : null;
      }

      function vtonVariantsFromThemeForm() {
        var form = vtonFindBestProductForm();
        if (!form) {
          return null;
        }
        var htmlForm = form instanceof HTMLFormElement ? form : form.querySelector('form');
        if (!htmlForm) {
          return null;
        }
        var select = htmlForm.querySelector('select[name="id"]');
        if (!select || select.options.length <= 1) {
          return null;
        }
        var variants = [];
        for (var i = 0; i < select.options.length; i++) {
          var opt = select.options[i];
          if (!opt.value) {
            continue;
          }
          variants.push({
            id: opt.value,
            title: (opt.textContent || '').trim() || 'Option ' + (i + 1),
            available: !opt.disabled,
          });
        }
        if (variants.length <= 1) {
          return null;
        }
        return { variants: variants, label: 'Choose option' };
      }

      function vtonGetVariantCatalog() {
        var product = vtonGetProductData();
        if (product && product.variants && product.variants.length > 1) {
          var meaningful = vtonMeaningfulProductOptions(product);
          var label = 'Choose option';
          if (meaningful.length === 1) {
            label = meaningful[0].name;
          } else if (meaningful.length > 1) {
            label = 'Options';
          } else {
            var opts = product.options || [];
            if (opts.length > 1) {
              label = opts.filter(Boolean).join(' / ');
            } else if (opts.length === 1 && opts[0]) {
              label = String(opts[0]);
            }
          }
          return {
            product: product,
            variants: product.variants,
            options: meaningful,
            label: label,
          };
        }
        return vtonVariantsFromThemeForm();
      }

      function vtonFirstAvailableVariantId(variants) {
        if (!variants || !variants.length) {
          return null;
        }
        for (var i = 0; i < variants.length; i++) {
          if (variants[i].available !== false) {
            return vtonNormalizeVariantIdForCart(variants[i].id);
          }
        }
        return vtonNormalizeVariantIdForCart(variants[0].id);
      }

      function vtonUpdateWidgetVariantFromOptions(shadowRoot, state) {
        var product = vtonGetProductData();
        if (!product || !shadowRoot) {
          return false;
        }
        state._vtonOptionSelections = state._vtonOptionSelections || {};
        var optionSelects = shadowRoot.querySelectorAll('.vton-option-select');
        for (var i = 0; i < optionSelects.length; i++) {
          var name = optionSelects[i].getAttribute('data-option-name');
          if (name) {
            state._vtonOptionSelections[name] = optionSelects[i].value;
          }
        }
        var vid = vtonFindVariantIdFromSelections(product, state._vtonOptionSelections);
        state.selectedVariantId = vtonNormalizeVariantIdForCart(vid);
        var hidden = shadowRoot.getElementById('vton-variant-select');
        if (hidden && state.selectedVariantId) {
          hidden.value = state.selectedVariantId;
        }
        return !!state.selectedVariantId;
      }

      function vtonRefreshOptionSelectAvailability(shadowRoot, state) {
        var product = vtonGetProductData();
        if (!product || !shadowRoot) {
          return;
        }
        var optionSelects = shadowRoot.querySelectorAll('.vton-option-select');
        for (var i = 0; i < optionSelects.length; i++) {
          var sel = optionSelects[i];
          var optName = sel.getAttribute('data-option-name');
          if (!optName) {
            continue;
          }
          for (var o = 0; o < sel.options.length; o++) {
            var opt = sel.options[o];
            var available = vtonIsOptionValueAvailable(
              product,
              optName,
              opt.value,
              state._vtonOptionSelections
            );
            opt.disabled = !available;
            opt.textContent = opt.value + (available ? '' : ' (sold out)');
          }
        }
      }

      function vtonResolveSelectedVariantId(state, shadowRoot) {
        if (shadowRoot) {
          var multiOpts = shadowRoot.querySelectorAll('.vton-option-select');
          if (multiOpts.length) {
            vtonUpdateWidgetVariantFromOptions(shadowRoot, state);
            if (state.selectedVariantId) {
              return vtonNormalizeVariantIdForCart(state.selectedVariantId);
            }
          }
        }
        var variantSelect =
          shadowRoot && shadowRoot.getElementById
            ? shadowRoot.getElementById('vton-variant-select')
            : null;
        if (variantSelect && variantSelect.value) {
          return vtonNormalizeVariantIdForCart(variantSelect.value);
        }
        if (state && state.selectedVariantId) {
          return vtonNormalizeVariantIdForCart(state.selectedVariantId);
        }
        return vtonNormalizeVariantIdForCart(vtonResolveVariantId());
      }

      function vtonResolveQuantity(form) {
        var formEl = form || vtonFindBestProductForm();
        if (formEl && formEl.querySelector) {
          var qInput = formEl.querySelector('input[name="quantity"], select[name="quantity"]');
          if (qInput && qInput.value) {
            var n = parseInt(qInput.value, 10);
            if (n > 0) {
              return n;
            }
          }
        }
        return 1;
      }

      function vtonCollectLineItemProperties(form) {
        var props = {};
        if (!form) {
          return props;
        }
        var htmlForm = form instanceof HTMLFormElement ? form : form.querySelector && form.querySelector('form');
        if (!htmlForm) {
          return props;
        }
        try {
          var fd = new FormData(htmlForm);
          fd.forEach(function(value, key) {
            if (key.indexOf('properties[') === 0) {
              var propKey = key.replace(/^properties\[/, '').replace(/\]$/, '');
              props[propKey] = value;
            }
          });
        } catch (e) {
          warn('[VTON] Could not read line item properties', e);
        }
        return props;
      }

      function vtonGetCartSectionIds() {
        var ids = [];
        if (document.querySelector('cart-drawer, #CartDrawer')) {
          ids.push('cart-drawer', 'cart-icon-bubble');
        }
        if (document.querySelector('cart-notification')) {
          ids.push('cart-notification');
        }
        return ids;
      }

      function vtonAddToCartAjax(variantId, quantity, properties) {
        var normalizedId = vtonNormalizeVariantIdForCart(variantId);
        if (!normalizedId) {
          return Promise.reject(new Error('Invalid variant'));
        }
        var url = vtonGetShopifyRoot() + 'cart/add.js';
        var item = { id: parseInt(normalizedId, 10), quantity: quantity };
        if (properties && Object.keys(properties).length) {
          item.properties = properties;
        }

        function postPayload(payload) {
          return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(payload)
          }).then(function(res) {
            return res.json().then(function(data) {
              if (!res.ok) {
                var msg =
                  data.description ||
                  data.message ||
                  (data.errors && JSON.stringify(data.errors)) ||
                  'Failed to add to cart';
                throw new Error(msg);
              }
              return data;
            });
          });
        }

        var body = { items: [item] };
        var sections = vtonGetCartSectionIds();
        if (sections.length) {
          body.sections = sections.join(',');
          body.sections_url = window.location.pathname;
        }

        return postPayload(body).catch(function(firstErr) {
          var legacy = { id: parseInt(normalizedId, 10), quantity: quantity };
          if (properties && Object.keys(properties).length) {
            legacy.properties = properties;
          }
          return postPayload(legacy).catch(function() {
            if (firstErr) {
              firstErr._vtonLegacyFailed = true;
            }
            throw firstErr || new Error('Failed to add to cart');
          });
        });
      }

      function vtonTryThemeAddToCart(variantId, quantity) {
        return new Promise(function(resolve, reject) {
          vtonSyncThemeVariant(variantId);
          var form = vtonFindBestProductForm();
          if (form) {
            var htmlForm = form instanceof HTMLFormElement ? form : form.querySelector('form');
            if (htmlForm) {
              var qtyInput = htmlForm.querySelector(
                'input[name="quantity"], select[name="quantity"]'
              );
              if (qtyInput && quantity) {
                qtyInput.value = String(quantity);
              }
            }
          }
          var btn = vtonFindAddToCartButton(form || document);
          if (!btn || btn.disabled) {
            reject(new Error('Unable to add to cart on this product page'));
            return;
          }
          var settled = false;
          function finish(ok, payload) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            document.removeEventListener('cart:updated', onCart);
            document.removeEventListener('cart:add', onCart);
            document.removeEventListener('cart:change', onCart);
            if (ok) {
              resolve(payload || { themeTriggered: true });
            } else {
              reject(new Error('Unable to add to cart'));
            }
          }
          function onCart() {
            finish(true, { themeTriggered: true });
          }
          document.addEventListener('cart:updated', onCart);
          document.addEventListener('cart:add', onCart);
          document.addEventListener('cart:change', onCart);
          var timer = setTimeout(function() {
            finish(true, { themeTriggered: true, optimistic: true });
          }, 2800);
          try {
            btn.click();
          } catch (e) {
            finish(false);
          }
        });
      }

      function vtonAddToCartWithFallback(variantId, quantity, properties) {
        return vtonAddToCartAjax(variantId, quantity, properties).catch(function(ajaxErr) {
          log('[VTON] Cart API failed, using theme add-to-cart button', ajaxErr);
          return vtonTryThemeAddToCart(variantId, quantity);
        });
      }

      function vtonPublishCartUpdate(cartData) {
        document.documentElement.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
        document.dispatchEvent(new CustomEvent('cart:updated', { detail: cartData }));
        document.dispatchEvent(new CustomEvent('cart:add', { detail: cartData }));

        if (typeof window.publish === 'function') {
          try {
            window.publish('cart-update', { source: 'vton-widget', cartData: cartData });
          } catch (e) {}
        }

        if (cartData && cartData.sections) {
          Object.keys(cartData.sections).forEach(function(sectionId) {
            var html = cartData.sections[sectionId];
            var el =
              document.getElementById('shopify-section-' + sectionId) ||
              document.getElementById(sectionId);
            if (el && html) {
              el.innerHTML = html;
            }
          });
        }

        fetch(vtonGetShopifyRoot() + 'cart.js', { credentials: 'same-origin' })
          .then(function(r) {
            return r.json();
          })
          .then(function(cart) {
            document.dispatchEvent(new CustomEvent('cart:change', { detail: { cart: cart } }));
          })
          .catch(function() {});
      }

      function vtonTryOpenCartDrawer() {
        var toggle = document.querySelector(
          '[data-cart-drawer-toggle], .cart-drawer-toggle, [aria-controls*="cart"], [data-cart-toggle], cart-drawer button[name="checkout"], a[href="/cart"]'
        );
        if (toggle && vtonIsVisible(toggle)) {
          setTimeout(function() {
            toggle.click();
          }, 400);
        }
      }

      function vtonBuildVariantSelectorHtml(state) {
        var catalog = vtonGetVariantCatalog();
        if (!catalog || !catalog.variants || catalog.variants.length <= 1) {
          return '';
        }

        var product = catalog.product || vtonGetProductData();
        var variants = catalog.variants;
        var meaningful = catalog.options || (product ? vtonMeaningfulProductOptions(product) : []);
        var hasMultiPicker =
          meaningful.length > 0 &&
          meaningful.some(function(o) {
            return o.values.length > 1;
          });

        state._vtonOptionSelections = product
          ? vtonReadThemeOptionSelections(product)
          : {};

        var preferredId =
          vtonNormalizeVariantIdForCart(state.selectedVariantId) ||
          vtonNormalizeVariantIdForCart(vtonResolveVariantId());
        var selectedId = null;

        if (preferredId) {
          for (var p = 0; p < variants.length; p++) {
            var pv = variants[p];
            var pvid = vtonNormalizeVariantIdForCart(pv.id) || String(pv.id);
            if (pvid === preferredId) {
              selectedId = pvid;
              break;
            }
          }
        }
        if (!selectedId) {
          selectedId = vtonFirstAvailableVariantId(variants);
        }
        state.selectedVariantId = selectedId;

        if (product && selectedId) {
          for (var sv = 0; sv < variants.length; sv++) {
            if (vtonNormalizeVariantIdForCart(variants[sv].id) === selectedId) {
              for (var oi = 0; oi < meaningful.length; oi++) {
                var m = meaningful[oi];
                if (variants[sv][m.key]) {
                  state._vtonOptionSelections[m.name] = variants[sv][m.key];
                }
              }
              break;
            }
          }
        }

        if (hasMultiPicker && product) {
          var multiHtml =
            '<div class="vton-variant-picker vton-variant-picker--multi">';
          for (var mi = 0; mi < meaningful.length; mi++) {
            var opt = meaningful[mi];
            if (opt.values.length <= 1) {
              continue;
            }
            var selVal =
              state._vtonOptionSelections[opt.name] || opt.values[0];
            multiHtml +=
              '<div class="vton-variant-picker__row">' +
              '<label class="vton-variant-label" for="vton-option-' +
              mi +
              '">' +
              vtonEscapeHtml(opt.name) +
              '</label>' +
              '<select class="vton-variant-select vton-option-select" id="vton-option-' +
              mi +
              '" data-option-index="' +
              opt.index +
              '" data-option-name="' +
              vtonEscapeHtml(opt.name) +
              '" aria-required="true">';
            for (var vi = 0; vi < opt.values.length; vi++) {
              var val = opt.values[vi];
              var available = vtonIsOptionValueAvailable(
                product,
                opt.name,
                val,
                state._vtonOptionSelections
              );
              multiHtml +=
                '<option value="' +
                vtonEscapeHtml(val) +
                '"' +
                (val === selVal ? ' selected' : '') +
                (available ? '' : ' disabled') +
                '>' +
                vtonEscapeHtml(val) +
                (available ? '' : ' (sold out)') +
                '</option>';
            }
            multiHtml += '</select></div>';
          }
          multiHtml +=
            '<select class="vton-variant-select vton-variant-select--hidden" id="vton-variant-select" aria-hidden="true" tabindex="-1">';
          for (var hi = 0; hi < variants.length; hi++) {
            var hv = variants[hi];
            var hvid = vtonNormalizeVariantIdForCart(hv.id) || String(hv.id);
            multiHtml +=
              '<option value="' +
              vtonEscapeHtml(hvid) +
              '"' +
              (hvid === selectedId ? ' selected' : '') +
              '></option>';
          }
          multiHtml += '</select></div>';
          return multiHtml;
        }

        var html =
          '<div class="vton-variant-picker">' +
          '<label class="vton-variant-label" for="vton-variant-select">' +
          vtonEscapeHtml(catalog.label || 'Choose option') +
          '</label>' +
          '<select class="vton-variant-select" id="vton-variant-select" aria-required="true">';

        for (var i = 0; i < variants.length; i++) {
          var v = variants[i];
          var vid = vtonNormalizeVariantIdForCart(v.id) || String(v.id);
          var soldOut = v.available === false;
          var selected = selectedId && vid === selectedId;
          var title = v.title || v.public_title || 'Option ' + (i + 1);
          html +=
            '<option value="' +
            vtonEscapeHtml(vid) +
            '"' +
            (selected ? ' selected' : '') +
            (soldOut ? ' disabled' : '') +
            '>' +
            vtonEscapeHtml(title) +
            (soldOut ? ' (sold out)' : '') +
            '</option>';
        }

        html += '</select></div>';
        return html;
      }

      function vtonSyncThemeVariant(variantId) {
        var normalized = vtonNormalizeVariantIdForCart(variantId);
        if (!normalized) {
          return;
        }

        var product = vtonGetProductData();
        var variantObj = null;
        if (product && product.variants) {
          for (var vi = 0; vi < product.variants.length; vi++) {
            if (vtonNormalizeVariantIdForCart(product.variants[vi].id) === normalized) {
              variantObj = product.variants[vi];
              break;
            }
          }
        }

        var form = vtonFindBestProductForm();
        var htmlForm =
          form instanceof HTMLFormElement
            ? form
            : form && form.querySelector
              ? form.querySelector('form')
              : null;

        if (variantObj && htmlForm && product && product.options) {
          for (var j = 0; j < product.options.length; j++) {
            var optName = product.options[j];
            var val = variantObj['option' + (j + 1)];
            if (!val || val === 'Default Title') {
              continue;
            }
            var optionEl =
              htmlForm.querySelector('[name="options[' + optName + ']"]') ||
              htmlForm.querySelector('select[name="option' + (j + 1) + '"]') ||
              htmlForm.querySelector('#Option-' + (j + 1) + ' select');
            if (optionEl && optionEl.tagName === 'SELECT' && optionEl.value !== val) {
              optionEl.value = val;
              optionEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
            var radios = htmlForm.querySelectorAll(
              'input[name="options[' + optName + ']"]'
            );
            for (var r = 0; r < radios.length; r++) {
              if (radios[r].value === val) {
                radios[r].checked = true;
                radios[r].dispatchEvent(new Event('change', { bubbles: true }));
              }
            }
          }
        }

        var productFormEl = document.querySelector('product-form');
        if (productFormEl) {
          productFormEl.setAttribute('data-variant-id', normalized);
        }
        if (!form) {
          return;
        }
        var inputs = vtonQueryDeep(
          'input[name="id"], select[name="id"]',
          form === document.documentElement ? document.documentElement : form
        );
        for (var i = 0; i < inputs.length; i++) {
          var inp = inputs[i];
          if (inp && inp.name === 'id') {
            inp.value = normalized;
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      }

      function vtonEnsureVariantSelectValid(shadowRoot, state) {
        var optionSelects = shadowRoot.querySelectorAll('.vton-option-select');
        if (optionSelects.length) {
          if (!vtonUpdateWidgetVariantFromOptions(shadowRoot, state)) {
            return false;
          }
          var product = vtonGetProductData();
          if (product && product.variants) {
            for (var i = 0; i < product.variants.length; i++) {
              var v = product.variants[i];
              if (vtonNormalizeVariantIdForCart(v.id) === state.selectedVariantId) {
                return v.available !== false;
              }
            }
          }
          return !!state.selectedVariantId;
        }

        var variantSelect = shadowRoot.getElementById('vton-variant-select');
        if (!variantSelect) {
          return true;
        }
        var opt = variantSelect.options[variantSelect.selectedIndex];
        if (!opt || !opt.value) {
          return false;
        }
        if (opt.disabled) {
          var catalog = vtonGetVariantCatalog();
          var fallback = catalog ? vtonFirstAvailableVariantId(catalog.variants) : null;
          if (!fallback) {
            return false;
          }
          variantSelect.value = fallback;
          state.selectedVariantId = fallback;
          vtonSyncThemeVariant(fallback);
          return true;
        }
        state.selectedVariantId = vtonNormalizeVariantIdForCart(opt.value);
        return true;
      }

      function vtonGetProductPageUrl() {
        if (window.Shopify && window.Shopify.product && window.Shopify.product.url) {
          var productUrl = String(window.Shopify.product.url);
          if (productUrl.indexOf('http://') === 0 || productUrl.indexOf('https://') === 0) {
            return productUrl;
          }
          return window.location.origin + productUrl;
        }
        return window.location.href.split('#')[0].split('?')[0];
      }

      function vtonBuildShareMessage(state) {
        var productTitle =
          (window.Shopify && window.Shopify.product && window.Shopify.product.title) ||
          'this product';
        var pageUrl = vtonGetProductPageUrl();
        var imageUrl = state.resultImageUrl || '';
        var lines = [
          'Check out my virtual try-on for ' + productTitle + '!',
          pageUrl
        ];
        if (imageUrl) {
          lines.push(imageUrl);
        }
        return lines.join('\n');
      }

      function vtonShareViaNative(state) {
        if (!state.resultImageUrl) {
          return;
        }
        var shareData = {
          title: 'My virtual try-on',
          text: vtonBuildShareMessage(state),
          url: state.resultImageUrl
        };
        if (navigator.share) {
          navigator.share(shareData).catch(function() {
            window.open(state.resultImageUrl, '_blank', 'noopener,noreferrer');
          });
        } else {
          window.open(state.resultImageUrl, '_blank', 'noopener,noreferrer');
        }
      }

      function vtonShareViaWhatsApp(state) {
        if (!state.resultImageUrl) {
          return;
        }
        var text = vtonBuildShareMessage(state);
        window.open(
          'https://wa.me/?text=' + encodeURIComponent(text),
          '_blank',
          'noopener,noreferrer'
        );
      }

      function vtonCopyTextFallback(text) {
        var textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        var ok = false;
        try {
          ok = document.execCommand('copy');
        } catch (e) {
          ok = false;
        }
        document.body.removeChild(textarea);
        return ok;
      }

      function vtonCopyImageLink(state, buttonEl) {
        if (!state.resultImageUrl) {
          return Promise.resolve(false);
        }
        var url = state.resultImageUrl;
        var done = function(success) {
          if (!buttonEl || !success) {
            return;
          }
          var labelEl = buttonEl.querySelector('.vton-share-btn__label');
          var original =
            buttonEl.getAttribute('data-vton-label') ||
            (labelEl && labelEl.textContent) ||
            'Copy link';
          buttonEl.setAttribute('data-vton-label', original);
          if (labelEl) {
            labelEl.textContent = 'Copied';
          }
          buttonEl.classList.add('is-copied');
          setTimeout(function() {
            if (labelEl) {
              labelEl.textContent = original;
            }
            buttonEl.classList.remove('is-copied');
          }, 2200);
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
          return navigator.clipboard
            .writeText(url)
            .then(function() {
              done(true);
              return true;
            })
            .catch(function() {
              var ok = vtonCopyTextFallback(url);
              done(ok);
              return ok;
            });
        }
        var fallbackOk = vtonCopyTextFallback(url);
        done(fallbackOk);
        return Promise.resolve(fallbackOk);
      }

      function buildResultPanelHtml(state) {
        var buttonBg = state.widgetSettings.widget_bg || '#000000';
        var buttonColor = state.widgetSettings.widget_color || '#ffffff';
        var variantHtml = vtonBuildVariantSelectorHtml(state);
        var productTitle =
          (window.Shopify && window.Shopify.product && window.Shopify.product.title) ||
          'this product';
        var urgencyHtml = '';
        if (window.Shopify && window.Shopify.product) {
          var v = window.Shopify.product.selected_or_first_available_variant;
          if (
            v &&
            typeof v.inventory_quantity === 'number' &&
            v.inventory_quantity > 0 &&
            v.inventory_quantity <= 8
          ) {
            urgencyHtml =
              '<p class="vton-urgency">Only ' +
              v.inventory_quantity +
              ' left in stock</p>';
          }
        }

        var hasNativeShare =
          typeof navigator !== 'undefined' && typeof navigator.share === 'function';
        var shareGridClass =
          'vton-share-btns' + (hasNativeShare ? '' : ' vton-share-btns--dual');
        var nativeShareBtn = hasNativeShare
          ? '<button type="button" class="vton-share-btn vton-share-btn--native" data-vton-action="share-native">' +
            vtonShareIconSvg('share') +
            '<span class="vton-share-btn__label">Share</span></button>'
          : '';

        return (
          '<div class="vton-result-content">' +
          '<img src="' +
          vtonEscapeHtml(state.resultImageUrl) +
          '" alt="Try-on result" />' +
          '<p class="vton-result-lead">' +
          (variantHtml
            ? 'Select your option, then add <strong>' +
              vtonEscapeHtml(productTitle) +
              '</strong> to your cart.'
            : 'Add <strong>' +
              vtonEscapeHtml(productTitle) +
              '</strong> to your cart.') +
          '</p>' +
          variantHtml +
          urgencyHtml +
          '<p class="vton-atc-error" role="alert"></p>' +
          '<button type="button" class="vton-add-to-cart-btn" style="background:' +
          buttonBg +
          ';color:' +
          buttonColor +
          ';">Add to cart</button>' +
          '<div class="vton-share-block">' +
          '<p class="vton-share-heading">Share your look</p>' +
          '<div class="' +
          shareGridClass +
          '">' +
          nativeShareBtn +
          '<button type="button" class="vton-share-btn vton-share-btn--wa" data-vton-action="share-whatsapp">' +
          vtonShareIconSvg('whatsapp') +
          '<span class="vton-share-btn__label">WhatsApp</span></button>' +
          '<button type="button" class="vton-share-btn vton-share-btn--copy" data-vton-action="share-copy" data-vton-label="Copy link">' +
          vtonShareIconSvg('copy') +
          '<span class="vton-share-btn__label">Copy link</span></button>' +
          '</div></div>' +
          '<button type="button" class="vton-retry-link" data-vton-action="retry">Try another photo</button>' +
          '</div>'
        );
      }

      function bindResultPanelEvents(shadowRoot, state) {
        var atcBtn = shadowRoot.querySelector('.vton-add-to-cart-btn');
        if (atcBtn) {
          atcBtn.addEventListener('click', function(ev) {
            ev.preventDefault();
            handleAddToCart(shadowRoot, state);
          });
        }

        var retryBtn = shadowRoot.querySelector('[data-vton-action="retry"]');
        if (retryBtn) {
          retryBtn.addEventListener('click', function() {
            resetResultForRetry(shadowRoot, state);
          });
        }

        function vtonOnWidgetVariantChange() {
          if (!vtonEnsureVariantSelectValid(shadowRoot, state)) {
            return;
          }
          vtonRefreshOptionSelectAvailability(shadowRoot, state);
          vtonSyncThemeVariant(state.selectedVariantId);
          var atcError = shadowRoot.querySelector('.vton-atc-error');
          if (atcError) {
            atcError.classList.remove('active');
            atcError.textContent = '';
          }
        }

        var optionSelects = shadowRoot.querySelectorAll('.vton-option-select');
        for (var oi = 0; oi < optionSelects.length; oi++) {
          optionSelects[oi].addEventListener('change', vtonOnWidgetVariantChange);
        }

        var variantSelect = shadowRoot.getElementById('vton-variant-select');
        if (variantSelect && !optionSelects.length) {
          vtonEnsureVariantSelectValid(shadowRoot, state);
          variantSelect.addEventListener('change', vtonOnWidgetVariantChange);
        } else if (variantSelect && optionSelects.length) {
          vtonEnsureVariantSelectValid(shadowRoot, state);
        }

        var shareNativeBtn = shadowRoot.querySelector('[data-vton-action="share-native"]');
        if (shareNativeBtn) {
          shareNativeBtn.addEventListener('click', function() {
            vtonShareViaNative(state);
          });
        }

        var shareWhatsAppBtn = shadowRoot.querySelector('[data-vton-action="share-whatsapp"]');
        if (shareWhatsAppBtn) {
          shareWhatsAppBtn.addEventListener('click', function() {
            vtonShareViaWhatsApp(state);
          });
        }

        var shareCopyBtn = shadowRoot.querySelector('[data-vton-action="share-copy"]');
        if (shareCopyBtn) {
          shareCopyBtn.addEventListener('click', function() {
            vtonCopyImageLink(state, shareCopyBtn);
          });
        }
      }

      function resetResultForRetry(shadowRoot, state) {
        state.resultImageUrl = null;
        var modalContent = shadowRoot.querySelector('.vton-modal-content');
        if (modalContent) {
          modalContent.classList.remove('has-result');
        }
        var result = shadowRoot.getElementById('vton-result');
        var uploadArea = shadowRoot.getElementById('vton-upload-area');
        var generateBtn = shadowRoot.getElementById('vton-generate-btn');
        var errorEl = shadowRoot.getElementById('vton-error');
        if (result) {
          result.innerHTML = '';
        }
        if (uploadArea) {
          uploadArea.classList.remove('hidden');
          uploadArea.className = 'vton-upload-area';
          uploadArea.innerHTML =
            '<input type="file" id="vton-file-input" accept="image/*" style="display: none;" onchange="window.vtonWidgetInstance.handleFileChange(event)" />' +
            '<span class="vton-upload-icon"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M23 19C23 19.5304 22.7893 20.0391 22.4142 20.4142C22.0391 20.7893 21.5304 21 21 21H3C2.46957 21 1.96086 20.7893 1.58579 20.4142C1.21071 20.0391 1 19.5304 1 19V8C1 7.46957 1.21071 6.96086 1.58579 6.58579C1.96086 6.21071 2.46957 6 3 6H7L9 4H15L17 6H21C21.5304 6 22.0391 6.21071 22.4142 6.58579C22.7893 6.96086 23 7.46957 23 8V19Z" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 17C14.2091 17 16 15.2091 16 13C16 10.7909 14.2091 9 12 9C9.79086 9 8 10.7909 8 13C8 15.2091 9.79086 17 12 17Z" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' +
            '<p>Add your photo</p><p>Front-facing photo works best</p>';
          uploadArea.onclick = function() {
            window.vtonWidgetInstance.triggerFileInput();
          };
        }
        if (generateBtn) {
          generateBtn.classList.remove('hidden');
          generateBtn.disabled = true;
        }
        if (errorEl) {
          errorEl.classList.remove('active', 'info');
          errorEl.textContent = '';
        }
        state.userPhoto = null;
        vtonResetRetryState(state);
        state.isGenerating = false;
        vtonShowFunnelPanel(shadowRoot, 'upload');
      }

      function vtonResetRetryState(state) {
        state.lastFailedJobId = null;
        state.retryOfJobId = null;
        state._autoRetryUsed = false;
      }

      function vtonShowAiFailure(shadowRoot, state, message, failedJobId, options) {
        options = options || {};
        state.isGenerating = false;
        stopLoadingMessages(shadowRoot);

        if (failedJobId) {
          state.lastFailedJobId = String(failedJobId);
        }

        var generateBtn = shadowRoot.getElementById('vton-generate-btn');
        if (generateBtn) {
          generateBtn.disabled = false;
        }

        var canAutoRetry =
          !state._autoRetryUsed &&
          state.userPhoto &&
          state.lastFailedJobId &&
          options.allowAutoRetry !== false;

        if (canAutoRetry) {
          state._autoRetryUsed = true;
          state.retryOfJobId = state.lastFailedJobId;
          var errorElement = shadowRoot.getElementById('vton-error');
          if (errorElement) {
            errorElement.classList.add('active');
            errorElement.classList.remove('info');
            errorElement.textContent =
              'Retrying your try-on… you were not charged for the failed attempt.';
          }
          vtonShowFunnelPanel(shadowRoot, 'loading');
          startLoadingMessages(shadowRoot);
          if (generateBtn) {
            generateBtn.disabled = true;
          }
          setTimeout(function() {
            state.isGenerating = false;
            generateTryOn(shadowRoot, state);
          }, 1200);
          return;
        }

        vtonShowFunnelPanel(shadowRoot, 'upload');
        var errorEl = shadowRoot.getElementById('vton-error');
        if (!errorEl) {
          return;
        }

        errorEl.classList.add('active');
        errorEl.classList.remove('info');
        var baseMsg = message || 'Generation failed.';
        errorEl.innerHTML =
          '<p class="vton-error-text">' +
          vtonEscapeHtml(baseMsg + ' You were not charged.') +
          '</p>';

        var oldBtn = shadowRoot.getElementById('vton-free-retry-btn');
        if (oldBtn) {
          oldBtn.remove();
        }

        if (state.userPhoto) {
          var retryBtn = document.createElement('button');
          retryBtn.type = 'button';
          retryBtn.id = 'vton-free-retry-btn';
          retryBtn.className = 'vton-free-retry-btn';
          retryBtn.textContent = 'Try again — free';
          retryBtn.addEventListener('click', function() {
            if (state.lastFailedJobId) {
              state.retryOfJobId = state.lastFailedJobId;
            }
            generateTryOn(shadowRoot, state);
          });
          errorEl.appendChild(retryBtn);
        }
      }

      function renderTryonResultPanel(shadowRoot, state) {
        var result = shadowRoot.getElementById('vton-result');
        if (!result || !state.resultImageUrl) {
          return;
        }
        state.selectedVariantId = vtonNormalizeVariantIdForCart(vtonResolveVariantId());
        result.innerHTML = buildResultPanelHtml(state);
        var modalContent = shadowRoot.querySelector('.vton-modal-content');
        if (modalContent) {
          modalContent.classList.add('has-result');
        }
        vtonShowFunnelPanel(shadowRoot, 'result');
        bindResultPanelEvents(shadowRoot, state);
        vtonRefreshOptionSelectAvailability(shadowRoot, state);
        if (state.selectedVariantId) {
          vtonSyncThemeVariant(state.selectedVariantId);
        }
      }

      function handleAddToCart(shadowRoot, state) {
        log('[VTON] handleAddToCart called');

        var atcButton = shadowRoot.querySelector('.vton-add-to-cart-btn');
        var atcError = shadowRoot.querySelector('.vton-atc-error');
        var originalButtonText = atcButton
          ? atcButton.textContent
          : 'Add to cart';
        var buttonBg = state.widgetSettings.widget_bg || '#000000';

        if (atcError) {
          atcError.classList.remove('active');
          atcError.textContent = '';
        }

          if (atcButton) {
          atcButton.disabled = true;
          atcButton.textContent = 'Adding to cart...';
        }

        var form = vtonFindBestProductForm();
        var hasOptionPicker = shadowRoot.querySelectorAll('.vton-option-select').length > 0;
        var variantSelect = shadowRoot.getElementById('vton-variant-select');

        if (
          (hasOptionPicker || variantSelect) &&
          !vtonEnsureVariantSelectValid(shadowRoot, state)
        ) {
          if (atcButton) {
            atcButton.disabled = false;
            atcButton.textContent = originalButtonText;
          }
          if (atcError) {
            atcError.textContent =
              'Please choose an available option before adding to cart.';
            atcError.classList.add('active');
          }
          return;
        }

        var variantId = vtonResolveSelectedVariantId(state, shadowRoot);
        var quantity = vtonResolveQuantity(form);
        var properties = vtonCollectLineItemProperties(form);

        if (!variantId) {
          warn('[VTON] Variant ID not resolved');
          if (atcButton) {
            atcButton.disabled = false;
            atcButton.textContent = originalButtonText;
          }
          if (atcError) {
            atcError.textContent =
              hasOptionPicker || variantSelect
                ? 'Please choose an available option above.'
                : 'Please select a size or variant on the product page, then try again.';
            atcError.classList.add('active');
          }
          return;
        }

        if (variantSelect && !hasOptionPicker) {
          var selectedOpt = variantSelect.options[variantSelect.selectedIndex];
          if (selectedOpt && selectedOpt.disabled) {
            if (atcButton) {
              atcButton.disabled = false;
              atcButton.textContent = originalButtonText;
            }
            if (atcError) {
              atcError.textContent = 'This option is sold out. Choose another variant.';
              atcError.classList.add('active');
            }
            return;
          }
        }

        log('[VTON] Adding variant', variantId, 'qty', quantity);

        state.selectedVariantId = variantId;
        vtonSyncThemeVariant(variantId);

        vtonAddToCartWithFallback(variantId, quantity, properties)
          .then(function(data) {
            log('[VTON] Product added to cart:', data);

            if (atcButton) {
              atcButton.textContent = 'Added to cart';
              atcButton.style.background = '#16a34a';
            setTimeout(function() {
                atcButton.textContent = originalButtonText;
                atcButton.style.background = buttonBg;
                atcButton.disabled = false;
              }, 2200);
            }

            trackAddToCart(state);
            if (state.abBucket) {
              trackAbEvent(state.shop, state.productId, state.abBucket, 'atc');
            }
            if (data && !data.themeTriggered) {
              vtonPublishCartUpdate(data);
            } else {
              fetch(vtonGetShopifyRoot() + 'cart.js', { credentials: 'same-origin' })
                .then(function(r) {
                  return r.json();
                })
                .then(function(cart) {
                  vtonPublishCartUpdate(cart);
                })
                .catch(function() {
                  vtonPublishCartUpdate({});
                });
            }
            vtonTryOpenCartDrawer();
        })
        .catch(function(err) {
          error('[VTON] Error adding to cart:', err);
          if (atcButton) {
            atcButton.disabled = false;
              atcButton.textContent = 'Try again';
              atcButton.style.background = '#dc2626';
            setTimeout(function() {
                atcButton.textContent = originalButtonText;
                atcButton.style.background = buttonBg;
              }, 2800);
              }
            if (atcError) {
              atcError.textContent =
                (err && err.message) || 'Unable to add to cart.';
              atcError.classList.add('active');
          }
        });
      }
      
      function trackAddToCart(state) {
        var atcUrl =
          window.location.origin +
          '/apps/tryon/atc?shop=' +
          encodeURIComponent(state.shop) +
          '&product_id=' +
          encodeURIComponent(state.productId);
        var payload = JSON.stringify({ product_id: state.productId });

        fetch(atcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          credentials: 'same-origin',
          keepalive: true
        }).catch(function(err) {
          warn('[VTON] Failed to track Add to Cart:', err);
        });
      }
      
      // Loading messages that rotate during generation
      let loadingMessageInterval = null;
      let progressInterval = null;
      let timerInterval = null;
      let tipInterval = null;
      let startTime = null;
      
      // Contextual messages based on elapsed time
      const getContextualMessage = function(elapsedSeconds) {
        if (elapsedSeconds < 10) {
          return [
            'Setting up your virtual try-on experience',
            'Analyzing your photo with AI precision',
            'Detecting colors and patterns',
            'Initializing advanced algorithms',
            'Preparing the generation...'
          ];
        } else if (elapsedSeconds < 20) {
          return [
            'Processing your image in high resolution',
            'Matching your photo with product details',
            'Applying realistic fabric textures',
            'Creating seamless blend effects',
            'Optimizing every pixel for perfection'
          ];
        } else if (elapsedSeconds < 30) {
          return [
            'Fine-tuning the fit and proportions',
            'Adjusting lighting and shadows',
            'Adding final touches to make it perfect',
            'Almost there! Adding the final touches',
            'Polishing every detail for you'
          ];
        } else {
          return [
            'Taking a bit longer than usual, but it\'s worth it!',
            'Creating something truly special for you',
            'Our AI is working extra hard to make it perfect',
            'Great things take time - your result is almost ready!',
            'Final quality check in progress...'
          ];
        }
      };
      
      // Fun tips to show during waiting
      const tips = [
        'Tip: Good lighting improves results',
        'Tip: Processing usually takes 30 seconds',
        'Tip: Your photos are deleted after use'
      ];
      
      function startLoadingMessages(shadowRoot) {
        startTime = Date.now();
        let messageIndex = 0;
        let tipIndex = 0;
        let progress = 0;
        let currentStep = 1;
        const messageElement = shadowRoot.getElementById('vton-loading-message');
        const progressBar = shadowRoot.getElementById('vton-progress-bar');
        const progressText = shadowRoot.getElementById('vton-progress-text');
        const timerValue = shadowRoot.getElementById('vton-timer-value');
        const tipElement = shadowRoot.querySelector('.vton-tip');
        
        if (!messageElement) return;
        
        // Start timer with estimated time remaining
        timerInterval = setInterval(function() {
          if (startTime && timerValue) {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const estimatedTotal = 30; // Average 30 seconds
            const remaining = Math.max(0, estimatedTotal - elapsed);
            
            if (remaining > 0 && elapsed < 35) {
              timerValue.textContent = elapsed + 's - ~' + remaining + 's left';
            } else {
              timerValue.textContent = elapsed + 's';
            }
          }
        }, 1000);
        
        // Animate progress bar (simulated progress with realistic curve)
        progressInterval = setInterval(function() {
          if (progress < 92) {
            // More realistic progress curve: fast start, slow middle, medium end
            let increment;
            if (progress < 25) {
              increment = 2.5; // Fast start
            } else if (progress < 50) {
              increment = 1.2; // Slower middle
            } else if (progress < 75) {
              increment = 0.9; // Slow near end
            } else {
              increment = 0.6; // Very slow at 90%
            }
            
            progress = Math.min(progress + increment, 92);
            
            if (progressBar) {
              progressBar.style.width = progress + '%';
            }
            if (progressText) {
              progressText.textContent = Math.floor(progress) + '%';
            }
            
            // Update steps based on progress with smoother transitions
            if (progress >= 18 && currentStep === 1) {
              currentStep = 2;
              updateStep(shadowRoot, 1, true);
              updateStep(shadowRoot, 2, false);
            } else if (progress >= 42 && currentStep === 2) {
              currentStep = 3;
              updateStep(shadowRoot, 2, true);
              updateStep(shadowRoot, 3, false);
            } else if (progress >= 68 && currentStep === 3) {
              currentStep = 4;
              updateStep(shadowRoot, 3, true);
              updateStep(shadowRoot, 4, false);
            }
          }
        }, 400);
        
        // Change message every 3 seconds with contextual messages
        loadingMessageInterval = setInterval(function() {
          if (startTime) {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const contextualMessages = getContextualMessage(elapsed);
            messageIndex = (messageIndex + 1) % contextualMessages.length;
            
            if (messageElement) {
              // Fade out
              messageElement.classList.add('fade-out');
              
              // Change text and fade in after short delay
              setTimeout(function() {
                const dots = '<span class="vton-loading-dots"><span></span><span></span><span></span></span>';
                messageElement.innerHTML = contextualMessages[messageIndex] + dots;
                messageElement.classList.remove('fade-out');
              }, 250);
            }
          }
        }, 3000);
        
        // Show tips every 8 seconds
        if (tipElement) {
          tipInterval = setInterval(function() {
            tipIndex = (tipIndex + 1) % tips.length;
            tipElement.style.opacity = '0';
            setTimeout(function() {
              tipElement.textContent = tips[tipIndex];
              tipElement.style.opacity = '1';
            }, 300);
          }, 8000);
        }
      }
      
      function updateStep(shadowRoot, stepNum, completed) {
        const stepElement = shadowRoot.getElementById('vton-step-' + stepNum);
        if (stepElement) {
          stepElement.classList.remove('active');
          if (completed) {
            stepElement.classList.add('completed');
          }
        }
      }
      
      function stopLoadingMessages(shadowRoot) {
        if (loadingMessageInterval) {
          clearInterval(loadingMessageInterval);
          loadingMessageInterval = null;
        }
        if (progressInterval) {
          clearInterval(progressInterval);
          progressInterval = null;
        }
        if (timerInterval) {
          clearInterval(timerInterval);
          timerInterval = null;
        }
        if (tipInterval) {
          clearInterval(tipInterval);
          tipInterval = null;
        }
        
        if (shadowRoot) {
          // Complete progress bar
          const progressBar = shadowRoot.getElementById('vton-progress-bar');
          const progressText = shadowRoot.getElementById('vton-progress-text');
          if (progressBar) {
            progressBar.style.width = '100%';
          }
          if (progressText) {
            progressText.textContent = '100%';
          }
          
          // Complete all steps
          for (let i = 1; i <= 4; i++) {
            const stepElement = shadowRoot.getElementById('vton-step-' + i);
            if (stepElement) {
              stepElement.classList.remove('active');
              stepElement.classList.add('completed');
            }
          }
        }
      }
      
      function pollJobStatus(shadowRoot, state, jobId, loading, result, generateBtn) {
        const maxAttempts = 80;
        let attempts = 0;
        let consecutiveErrors = 0;
        let pollInterval = null;

        function pollOnce() {
          attempts++;

          if (attempts > maxAttempts) {
            if (pollInterval) clearInterval(pollInterval);
            vtonShowAiFailure(
              shadowRoot,
              state,
              'Generation timed out.',
              jobId,
              { allowAutoRetry: true }
            );
            return;
          }

          const statusUrl =
            window.location.origin +
            '/apps/tryon/job/' +
            jobId +
            '?shop=' +
            encodeURIComponent(state.shop);

          log('[VTON] Polling job status (attempt ' + attempts + '):', statusUrl);

          const controller = new AbortController();
          const timeoutId = setTimeout(function() { controller.abort(); }, 4000);

          fetch(statusUrl, {
            signal: controller.signal,
            credentials: 'same-origin',
            cache: 'no-store'
          })
            .then(function(response) {
              clearTimeout(timeoutId);
              consecutiveErrors = 0;

              if (!response.ok) {
                throw new Error('Status check failed: ' + response.status);
              }
              return response.json();
            })
            .then(function(statusData) {
              if (!statusData) {
                return;
              }
              
              log('[VTON] Job status:', statusData.status, statusData);
              
              if (statusData.status === 'completed' && statusData.result_url) {
                if (pollInterval) clearInterval(pollInterval);
                log('[VTON] Job completed, result URL:', statusData.result_url);
                displayResult(shadowRoot, state, statusData.result_url, loading, result, generateBtn);
              } else if (statusData.status === 'failed' || statusData.status === 'error') {
                if (pollInterval) clearInterval(pollInterval);
                vtonShowAiFailure(
                  shadowRoot,
                  state,
                  statusData.error || 'Generation failed.',
                  jobId,
                  { allowAutoRetry: true }
                );
              } else if (statusData.status === 'pending' || statusData.status === 'processing') {
                // Continue polling
                log('[VTON] Job still pending/processing, continuing to poll...');
              } else {
                // Unknown status, stop polling after a few attempts
                warn('[VTON] Unknown status:', statusData.status);
                if (attempts > 10) {
                  if (pollInterval) clearInterval(pollInterval);
                  vtonShowAiFailure(
                    shadowRoot,
                    state,
                    'Unexpected status: ' + (statusData.status || 'unknown') + '.',
                    jobId,
                    { allowAutoRetry: true }
                  );
                }
              }
            })
            .catch(function(err) {
              clearTimeout(timeoutId);
              consecutiveErrors++;
              error('[VTON] Polling error (attempt ' + attempts + ', consecutive errors: ' + consecutiveErrors + '):', err);

              if (consecutiveErrors >= 5) {
                error('[VTON] Multiple consecutive polling errors, stopping...');
                if (pollInterval) clearInterval(pollInterval);
                vtonShowAiFailure(
                  shadowRoot,
                  state,
                  'Connection error.',
                  jobId,
                  { allowAutoRetry: true }
                );
              }
            });
        }

        pollOnce();
        pollInterval = setInterval(pollOnce, 2500);
      }
      
      function displayResult(shadowRoot, state, resultUrl, loading, result, generateBtn) {
        state.resultImageUrl = resultUrl;
        vtonResetRetryState(state);

        if (state.abBucket) {
          trackAbEvent(state.shop, state.productId, state.abBucket, 'tryon');
        }
        
        log('[VTON] Displaying result:', resultUrl);
        
        // Validate result URL
        if (!state.resultImageUrl || typeof state.resultImageUrl !== 'string' || !state.resultImageUrl.startsWith('http')) {
          error('[VTON] Invalid result URL:', state.resultImageUrl);
          const errorElement = shadowRoot.getElementById('vton-error');
          if (errorElement) {
            errorElement.classList.add('active');
            errorElement.textContent = 'Error: Invalid result URL. Please try again.';
          }
          if (generateBtn) generateBtn.disabled = false;
          return;
        }
        
        // Complete progress to 100% before stopping
        const progressBar = shadowRoot.getElementById('vton-progress-bar');
        const progressText = shadowRoot.getElementById('vton-progress-text');
        if (progressBar) {
          progressBar.style.width = '100%';
        }
        if (progressText) {
          progressText.textContent = '100%';
        }
        
        // Complete all steps
        for (let i = 1; i <= 4; i++) {
          const stepElement = shadowRoot.getElementById('vton-step-' + i);
          if (stepElement) {
            stepElement.classList.remove('active');
            stepElement.classList.add('completed');
          }
        }
        
        // Stop loading messages
        stopLoadingMessages(shadowRoot);
        
        if (
          result &&
          state.resultImageUrl &&
          typeof state.resultImageUrl === 'string' &&
          state.resultImageUrl.startsWith('http')
        ) {
          renderTryonResultPanel(shadowRoot, state);
          log('[VTON] Result displayed with conversion panel');
        } else {
          error('[VTON] Cannot display result:', {
            hasResult: !!result,
            resultImageUrl: state.resultImageUrl
          });
          const errorElement = shadowRoot.getElementById('vton-error');
          if (errorElement) {
            errorElement.classList.add('active');
            errorElement.textContent = 'Error: Unable to display the result. Please try again.';
          }
        }
        
        state.isGenerating = false;
        if (generateBtn) generateBtn.disabled = false;
      }
      
      function generateTryOn(shadowRoot, state) {
        if (!state.userPhoto || !state.productId) {
          return;
        }
        
        // Prevent double submission
        if (state.isGenerating) {
          warn('[VTON] Generation already in progress, ignoring duplicate request');
          return;
        }
        state.isGenerating = true;
        
        const loading = shadowRoot.getElementById('vton-loading');
        const generateBtn = shadowRoot.getElementById('vton-generate-btn');
        const result = shadowRoot.getElementById('vton-result');
        const errorElement = shadowRoot.getElementById('vton-error');
        
        vtonShowFunnelPanel(shadowRoot, 'loading');
        if (generateBtn) {
          generateBtn.disabled = true;
        }
        if (result) {
          result.innerHTML = '';
        }
        if (errorElement) {
          errorElement.classList.remove('active');
          errorElement.classList.remove('info');
          errorElement.textContent = '';
        }
        
        // Start rotating loading messages
        startLoadingMessages(shadowRoot);
        
        var generateUrl =
          window.location.origin +
          '/apps/tryon/generate?shop=' +
          encodeURIComponent(state.shop) +
          '&product_id=' +
          encodeURIComponent(state.productId);
        if (state.productHandle) {
          generateUrl += '&product_handle=' + encodeURIComponent(state.productHandle);
        }

        function makeGenerateRequest(url) {
          // Create AbortController for timeout handling
          // Use 60 seconds timeout to allow server to respond (even if generation is async, server should respond quickly with job_id or result)
          const controller = new AbortController();
          const requestTimeout = setTimeout(() => {
            controller.abort();
            error('[VTON] Request timeout after 60 seconds - server did not respond');
          }, 60000); // 60 seconds timeout - enough for server to respond, but not too long
          
          log('[VTON] Sending generation request to:', url);
          const requestStartTime = Date.now();
          
          return fetch(url, {
          method: 'POST',
          headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify((function() {
                var payload = {
                  user_photo: state.userPhoto,
                  product_id: state.productId,
                  product_handle: state.productHandle,
                  product_image_url: state.productImageUrl
                };
                if (state.retryOfJobId) {
                  payload.retry_of_job_id = state.retryOfJobId;
                  state.retryOfJobId = null;
                }
                return payload;
              })()),
            credentials: 'same-origin',
            signal: controller.signal
          }).then(function(response) {
            clearTimeout(requestTimeout);
            const requestTime = Date.now() - requestStartTime;
            log('[VTON] Request sent successfully in', requestTime + 'ms');
            
            log('[VTON] Response status:', response.status, response.statusText);
            
            if (!response.ok) {
              // Clone the response before consuming the body, so we can read it multiple times if needed
              const clonedResponse = response.clone();
              
              // Try to parse as JSON first
              return clonedResponse.json().then(function(errorData) {
                error('[VTON] Error response:', errorData);
                // Extract error message from response
                const errorMessage = errorData?.error || errorData?.message || 'Generation failed: ' + response.status;
                // Create error object with status code for detection
                const err = new Error(errorMessage);
                err.status = response.status;
                err.isDailyLimit = errorMessage.includes('used all your available credits') || 
                                   (errorMessage.includes('limit') && errorMessage.includes('per day')) ||
                                   errorMessage.includes('Please try again tomorrow');
                throw err;
              }).catch(function(parseError) {
                // If JSON parsing fails, read from original response as text
                return response.text().then(function(text) {
                  error('[VTON] Error response (text):', text);
                  const err = new Error(text || 'Generation failed: ' + response.status);
                  err.status = response.status;
                  throw err;
                });
              });
            }
            return response.json();
          }).catch(function(err) {
            clearTimeout(requestTimeout);
            const requestTime = Date.now() - requestStartTime;
            error('[VTON] Request failed after', requestTime + 'ms:', err);
            throw err;
          });
        }
        
        makeGenerateRequest(generateUrl).then(function(data) {
          log('[VTON] Generation response data:', JSON.stringify(data, null, 2));
          
          // First, check if result_url is already available (synchronous mode)
          const immediateResultUrl = data.result_url || data.image_url || data.output || 
                                     (data.result && (data.result.url || data.result)) || 
                                     (Array.isArray(data.result) && data.result[0]) ||
                                     (data.data && data.data.result_url) ||
                                     (data.data && data.data.url);
          
          if (immediateResultUrl && typeof immediateResultUrl === 'string' && immediateResultUrl.startsWith('http')) {
            log('[VTON] Result URL available immediately, displaying result');
            displayResult(shadowRoot, state, immediateResultUrl, loading, result, generateBtn);
            return;
          }
          
          // Check if response contains a job_id (asynchronous mode)
          const jobId = data.job_id || data.jobId || data.job || 
                       (data.data && data.data.job_id) ||
                       (data.data && data.data.jobId);
          
          if (jobId) {
            // Asynchronous mode: start polling for job status
            log('[VTON] Job ID received, starting polling:', jobId);
            state.lastFailedJobId = String(jobId);
            pollJobStatus(shadowRoot, state, jobId, loading, result, generateBtn);
            return; // Exit early, polling will handle the rest
          }
          
          // If we reach here, neither result_url nor job_id were found
          error('[VTON] Invalid response format: no result_url or job_id found', data);
          state.isGenerating = false;
          stopLoadingMessages(shadowRoot);
          vtonShowFunnelPanel(shadowRoot, 'upload');
          const errorElement = shadowRoot.getElementById('vton-error');
          if (errorElement) {
            errorElement.classList.add('active');
            errorElement.textContent = 'Invalid response from server. Please try again.';
          }
          if (generateBtn) generateBtn.disabled = false;
        }).catch(function(err) {
          error('[VTON] Generation error:', err);

          var errorMessage = 'An error occurred. Please try again.';
          var isDailyLimitError = false;

          if (err.message) {
            errorMessage = err.message;
            if (
              err.isDailyLimit ||
              err.message.includes('used all your available credits') ||
              (err.message.includes('limit') && err.message.includes('per day')) ||
              err.message.includes('Please try again tomorrow') ||
              (err.status === 402 &&
                (err.message.includes('limit') || err.message.includes('credits')))
            ) {
              isDailyLimitError = true;
            }
          } else if (
            err.name === 'AbortError' ||
            (err.message &&
              (err.message.includes('timeout') || err.message.includes('504')))
          ) {
            errorMessage =
              'Generation is taking longer than expected. Please wait a moment and try again.';
          }

          if (isDailyLimitError) {
            state.isGenerating = false;
            stopLoadingMessages(shadowRoot);
            vtonShowFunnelPanel(shadowRoot, 'upload');
            if (generateBtn) generateBtn.disabled = false;
            var limitEl = shadowRoot.getElementById('vton-error');
            if (limitEl) {
              limitEl.classList.add('active', 'credits-limit');
              limitEl.textContent = errorMessage;
            }
            return;
          }

          vtonShowAiFailure(shadowRoot, state, errorMessage, state.lastFailedJobId, {
            allowAutoRetry: true,
          });
        });
      }
    } catch (vtonFatal) {
      console.error('[VTON] Widget failed to start:', vtonFatal);
      }
    })();
