    (function() {
      'use strict';

      var isProduction = !/localhost|127\.0\.0\.1/.test(window.location.hostname) && window.location.search.indexOf('vton_debug') === -1;
      var log = isProduction ? function() {} : console.log.bind(console);
      var warn = isProduction ? function() {} : console.warn.bind(console);
      var error = console.error.bind(console);

      var VTON_STATUS_CACHE_TTL = 300000;
      var _vtonWidgetRenderQueued = false;
      var _vtonStatusInFlight = null;

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
        initWidget();
      }

      function bootWidgetWithRetries() {
        if (!isProductPageContext()) return;
        bootWidget();
        if (document.getElementById('vton-widget-container')) return;
        [800, 2000, 4500, 9000, 15000, 22000].forEach(function(delayMs) {
          setTimeout(function() {
            if (!isProductPageContext()) return;
            if (document.getElementById('vton-widget-container')) return;
            _vtonWidgetRenderQueued = false;
            bootWidget();
          }, delayMs);
        });
      }

      var bootIdleMs = (window.VTON_LIQUID && window.VTON_LIQUID.productId) ? 200 : 2000;

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
          runWhenIdle(bootWidgetWithRetries, bootIdleMs);
        }, { once: true });
      } else {
        runWhenIdle(bootWidgetWithRetries, bootIdleMs);
      }

      function vtonScheduleRetryBoot() {
        if (!isProductPageContext()) return;
        if (document.getElementById('vton-widget-container')) return;
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
          var raw = sessionStorage.getItem(vtonStatusCacheKey(shop, productId));
          if (!raw) return null;
          var parsed = JSON.parse(raw);
          if (!parsed || Date.now() - parsed.ts > VTON_STATUS_CACHE_TTL) {
            sessionStorage.removeItem(vtonStatusCacheKey(shop, productId));
            return null;
          }
          return parsed.data;
        } catch (e) {
          return null;
        }
      }

      function writeStatusCache(shop, productId, data) {
        try {
          sessionStorage.setItem(vtonStatusCacheKey(shop, productId), JSON.stringify({ ts: Date.now(), data: data }));
        } catch (e) {}
      }

      function queueWidgetRender(shop, productId, productHandle, widgetSettings) {
        if (document.getElementById('vton-widget-container')) return;
        if (_vtonWidgetRenderQueued) return;
        _vtonWidgetRenderQueued = true;
        initializeWidget(shop, productId, productHandle, widgetSettings || {});
      }

      function removeWidgetContainer() {
        var el = document.getElementById('vton-widget-container');
        if (el) el.remove();
        _vtonWidgetRenderQueued = false;
      }

      function applyTryonStatus(status, shop, productId, productHandle) {
        if (status && typeof status.enabled === 'boolean' && !status.error) {
          writeStatusCache(shop, productId, status);
        }
        if (status && status.enabled === true) {
          queueWidgetRender(shop, productId, productHandle, status.widget_settings || {});
        } else if (!status || status.enabled !== true) {
          removeWidgetContainer();
        }
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

      function initWidget() {
        var shop = extractShop();
        if (!shop) return;

        var productId = extractProductId();
        if (!productId) return;

        var productHandle = extractProductHandle();
        var cachedStatus = readStatusCache(shop, productId);

        if (cachedStatus) {
          applyTryonStatus(cachedStatus, shop, productId, productHandle);
          runWhenIdle(function() {
            refreshTryonStatus(shop, productId, productHandle);
          }, 5000);
          return;
        }

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
      
      function checkStatus(shop, productId, productHandle) {
        var appProxyUrl =
          window.location.origin +
          '/apps/tryon/status?shop=' +
          encodeURIComponent(shop) +
          '&product_id=' +
          encodeURIComponent(productId);
        if (productHandle) {
          appProxyUrl += '&product_handle=' + encodeURIComponent(productHandle);
        }

        var controller = new AbortController();
        var timeoutId = setTimeout(function() { controller.abort(); }, 1500);

        return fetch(appProxyUrl, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
          credentials: 'same-origin',
          cache: 'default',
          priority: 'low'
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
            if (err.name === 'AbortError') {
              warn('[VTON] Status check timed out');
              return { enabled: false, error: 'timeout' };
            }
            warn('[VTON] Status check error:', err);
            return { enabled: false, error: err.message || 'status_check_failed' };
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

          var obs = new MutationObserver(function() {
            var anchor = vtonFindInjectionAnchor(customSelector, { allowHidden: false });
            if (!anchor) anchor = vtonFindInjectionAnchor(customSelector, { allowHidden: true });
            if (anchor) {
              resolved = true;
              try { obs.disconnect(); } catch (e) {}
              resolve(anchor);
            }
          });

          var observeRoot = vtonGetObserverRoot();
          obs.observe(observeRoot, { childList: true, subtree: true });
          if (observeRoot !== document.body) {
            obs.observe(document.body, { childList: true, subtree: true });
          }

          setTimeout(finish, timeoutMs);
        });
      }

      function vtonWatchForDomRemoval(shop, productId, productHandle, widgetSettings) {
        var container = document.getElementById('vton-widget-container');
        if (!container || !container.parentNode) return;

        var parent = container.parentNode;
        var reinjectTimer = null;
        var reinjectCount = 0;
        var observer = new MutationObserver(function() {
          if (document.getElementById('vton-widget-container')) return;
          if (reinjectCount >= 3) {
            observer.disconnect();
            return;
          }
          clearTimeout(reinjectTimer);
          reinjectTimer = setTimeout(function() {
            reinjectCount++;
            log('[VTON] Widget removed from DOM, re-injecting (attempt ' + reinjectCount + ')');
            _vtonWidgetRenderQueued = false;
            initializeWidget(shop, productId, productHandle, widgetSettings);
          }, 500);
        });
        observer.observe(parent, { childList: true });
        setTimeout(function() {
          observer.disconnect();
        }, 30000);
      }
      
      function initializeWidget(shop, productId, productHandle, widgetSettings) {
        if (document.getElementById('vton-widget-container')) {
          warn('[VTON] Widget container already exists, skipping');
          return;
        }

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
          var productImageUrl = getProductImage();

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

              vtonWatchForDomRemoval(shop, productId, productHandle, widgetSettings);
            });
          });
        });
      }

      function renderWidget(shadowRoot, state) {
        const settings = state.widgetSettings;
        const buttonText = settings.widget_text || 'Try It On Now';
        const buttonBg = settings.widget_bg || '#000000';
        const buttonColor = settings.widget_color || '#ffffff';
        
        shadowRoot.innerHTML = `
          <style>
            .vton-widget-container {
              margin: 24px 0 0 0;
              width: 100%;
              display: block;
            }
            .vton-button {
              width: 100%;
              padding: 18px 32px;
              border: 2px solid #000000;
              border-radius: 8px;
              font-size: 15px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.2s ease;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
              letter-spacing: 0.01em;
              position: relative;
              overflow: hidden;
              text-transform: uppercase;
            }
            .vton-button::before {
              content: '';
              position: absolute;
              top: 0;
              left: -100%;
              width: 100%;
              height: 100%;
              background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.15), transparent);
              transition: left 0.5s;
            }
            .vton-button:hover::before {
              left: 100%;
              }
              .vton-button:hover {
              transform: translateY(-2px);
              box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
              background: #000000;
              color: #ffffff;
            }
            .vton-button:active {
              transform: translateY(0);
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
            }
            .vton-modal-overlay {
              position: fixed;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background: rgba(0, 0, 0, 0.78);
              display: none;
              align-items: center;
              justify-content: center;
              z-index: 999999;
              padding: 24px;
              animation: fadeIn 0.2s ease-out;
              overflow-y: auto;
              overscroll-behavior: contain;
            }
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            .vton-modal-overlay.active {
              display: flex;
            }
            .vton-modal {
              background: #ffffff;
              border-radius: 12px;
              max-width: 600px;
              width: 100%;
              max-height: 90vh;
              overflow-y: auto;
              overflow-x: hidden;
              position: relative;
              display: flex;
              flex-direction: column;
              box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25), 0 8px 16px rgba(0, 0, 0, 0.15);
              border: 1px solid rgba(0, 0, 0, 0.08);
              animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
              overscroll-behavior: contain;
            }
            @keyframes slideUp {
              from {
                opacity: 0;
                transform: translateY(20px) scale(0.95);
              }
              to {
                opacity: 1;
                transform: translateY(0) scale(1);
              }
            }
            .vton-modal-close {
              position: absolute;
              top: 24px;
              right: 24px;
              background: rgba(0, 0, 0, 0.04);
              border: 1px solid rgba(0, 0, 0, 0.06);
                font-size: 24px;
              cursor: pointer;
              padding: 12px;
              line-height: 1;
              color: #4b5563;
              border-radius: 50%;
              width: 44px;
              height: 44px;
              display: flex;
              align-items: center;
              justify-content: center;
              transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
              z-index: 10;
              font-weight: 300;
            }
            .vton-modal-close:hover {
              background: rgba(0, 0, 0, 0.08);
              border-color: rgba(0, 0, 0, 0.12);
              color: #111827;
              transform: scale(1.1) rotate(90deg);
            }
            .vton-modal-close:active {
              transform: scale(1.05) rotate(90deg);
            }
            .vton-modal-content {
              padding: 40px 32px;
              display: flex;
              flex-direction: column;
              flex: 1;
              overflow: hidden;
            }
            .vton-modal-content.has-result {
              padding: 40px;
              justify-content: center;
            }
            .vton-upload-area {
              border: 2px dashed #d1d5db;
              border-radius: 8px;
              padding: 60px 40px;
              text-align: center;
              cursor: pointer;
              margin-bottom: 24px;
              transition: all 0.25s ease;
              background: #fafafa;
              position: relative;
              overflow: hidden;
            }
            .vton-upload-area::before {
              content: '';
              position: absolute;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              border-radius: 20px;
              background: linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.2) 50%, transparent 100%);
              opacity: 0;
              transition: opacity 0.35s ease;
            }
            .vton-upload-area::after {
              content: '';
              position: absolute;
              top: -50%;
              left: -50%;
              width: 200%;
              height: 200%;
              background: radial-gradient(circle, rgba(0, 128, 96, 0.05) 0%, transparent 70%);
              opacity: 0;
              transition: opacity 0.35s ease;
            }
              .vton-upload-area:hover {
              border-color: #000000;
              border-width: 2px;
              background: #ffffff;
              box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
            }
            .vton-upload-area:hover::before {
              opacity: 1;
            }
            .vton-upload-area:hover::after {
              opacity: 1;
            }
            .vton-upload-area.hidden {
              display: none;
            }
            .vton-upload-area p {
              margin: 0;
              font-size: 16px;
              color: #000000;
              font-weight: 600;
              line-height: 1.5;
            }
            .vton-upload-area p:first-of-type {
              margin-bottom: 8px;
            }
            .vton-upload-area p:last-of-type {
              font-size: 13px;
              color: #666666;
              font-weight: 400;
              margin-top: 8px;
            }
            .vton-upload-icon {
              width: 48px;
              height: 48px;
              margin: 0 auto 20px;
              display: block;
              position: relative;
              z-index: 1;
            }
            .vton-upload-icon svg {
              width: 100%;
              height: 100%;
              stroke: #666666;
              transition: stroke 0.25s ease;
            }
            .vton-upload-area:hover .vton-upload-icon svg {
              stroke: #000000;
            }
            .vton-upload-area.has-image {
              border: none;
              padding: 0;
              background: transparent;
            }
            .vton-upload-area.has-image:hover {
              background: transparent;
            }
            .vton-upload-area img {
              max-width: 100%;
              max-height: 280px;
              border-radius: 16px;
              object-fit: contain;
              box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), 0 4px 8px rgba(0, 0, 0, 0.08);
              border: 1px solid rgba(0, 0, 0, 0.06);
            }
            .vton-privacy-notice {
              font-size: 12px;
              color: #666666;
              text-align: center;
              margin: 20px 0;
              flex-shrink: 0;
              line-height: 1.6;
              font-weight: 400;
              padding: 12px 16px;
              background: #f5f5f5;
              border-radius: 6px;
              border: 1px solid #e5e5e5;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
            }
            .vton-privacy-notice svg {
              width: 14px;
              height: 14px;
              stroke: #666666;
              flex-shrink: 0;
            }
            .vton-privacy-notice.hidden {
              display: none;
            }
            .vton-generate-btn {
              width: 100%;
              padding: 16px 32px;
              border: 2px solid #000000;
              border-radius: 8px;
              font-size: 15px;
              font-weight: 600;
              cursor: pointer;
              margin-top: 20px;
              transition: all 0.2s ease;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
              letter-spacing: 0.01em;
              position: relative;
              overflow: hidden;
              text-transform: uppercase;
            }
            .vton-generate-btn::before {
              content: '';
              position: absolute;
              top: 0;
              left: -100%;
              width: 100%;
              height: 100%;
              background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.15), transparent);
              transition: left 0.5s;
            }
            .vton-generate-btn:hover:not(:disabled)::before {
              left: 100%;
            }
            .vton-generate-btn:hover:not(:disabled) {
              transform: translateY(-2px);
              box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
              background: #000000;
              color: #ffffff;
            }
            .vton-generate-btn.hidden {
              display: none;
            }
            .vton-generate-btn:disabled {
              opacity: 0.5;
              cursor: not-allowed;
              transform: none;
            }
            .vton-loading {
              text-align: center;
              padding: 40px 32px;
              display: none;
              flex-shrink: 0;
              background: #ffffff;
              border-radius: 8px;
              margin: 24px 0;
              position: relative;
              overflow: visible;
              min-height: 200px;
            }
            .vton-loading.active {
              display: block;
              animation: fadeInUp 0.4s ease-out;
            }
            @keyframes fadeInUp {
              from {
                opacity: 0;
                transform: translateY(10px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
            .vton-spinner {
              border: 3px solid #e5e7eb;
              border-top: 3px solid #000000;
              border-radius: 50%;
              width: 40px;
              height: 40px;
              animation: spin 0.8s linear infinite;
              margin: 0 auto 24px;
              position: relative;
              flex-shrink: 0;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            .vton-loading-text {
              margin: 0 0 20px 0;
              font-size: 16px;
              color: #000000;
              font-weight: 600;
              min-height: 24px;
              transition: opacity 0.3s ease;
              line-height: 1.5;
              display: block;
              width: 100%;
            }
            .vton-loading-text.fade-out {
              opacity: 0;
            }
            .vton-loading-subtext {
              margin: 16px 0 0 0;
              font-size: 13px;
              color: #666666;
              line-height: 1.6;
              font-weight: 400;
              display: block;
              width: 100%;
            }
            .vton-progress-container {
              width: 100%;
              max-width: 300px;
              margin: 0 auto 12px;
              background: #e5e7eb;
              border-radius: 4px;
              height: 6px;
              overflow: hidden;
                position: relative;
              flex-shrink: 0;
            }
            .vton-progress-bar {
              height: 100%;
              background: #000000;
              border-radius: 4px;
              width: 0%;
              transition: width 0.4s ease;
              position: relative;
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
              width: 4px;
              height: 4px;
              border-radius: 50%;
              background: #000000;
              margin: 0 2px;
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
              display: none;
              flex: 1;
              overflow: hidden;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 0;
            }
            .vton-result.active {
              display: flex;
            }
            .vton-result-content {
                width: 100%;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              gap: 24px;
            }
            .vton-result-title {
              font-size: 24px;
              font-weight: 800;
              color: #111827;
              text-align: center;
              margin: 0 0 8px 0;
              letter-spacing: -0.02em;
              line-height: 1.3;
            }
            .vton-result img {
              max-width: 100%;
              max-height: 55vh;
              width: auto;
              height: auto;
              border-radius: 20px;
              object-fit: contain;
              display: block;
              box-shadow: 0 16px 40px rgba(0, 0, 0, 0.18), 0 8px 16px rgba(0, 0, 0, 0.12);
              border: 1px solid rgba(0, 0, 0, 0.06);
              background: #ffffff;
            }
            .vton-add-to-cart-btn {
              width: 100%;
              max-width: 420px;
              padding: 22px 40px;
              border: none;
              border-radius: 14px;
              font-size: 17px;
              font-weight: 800;
              cursor: pointer;
              transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
              box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18), 0 3px 6px rgba(0, 0, 0, 0.12);
              letter-spacing: 0.03em;
              position: relative;
              overflow: hidden;
            }
            .vton-add-to-cart-btn::before {
              content: '';
                position: absolute;
                top: 0;
              left: -100%;
              width: 100%;
              height: 100%;
              background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
              transition: left 0.5s;
            }
            .vton-add-to-cart-btn:hover::before {
              left: 100%;
            }
            .vton-add-to-cart-btn:hover {
              transform: translateY(-3px);
              box-shadow: 0 10px 32px rgba(0, 0, 0, 0.22), 0 6px 12px rgba(0, 0, 0, 0.15);
            }
            .vton-add-to-cart-btn:active {
              transform: translateY(-1px);
              box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18), 0 3px 6px rgba(0, 0, 0, 0.12);
            }
            .vton-error {
              color: #dc2626;
              text-align: center;
              padding: 16px 20px;
              display: none;
              background: #fef2f2;
              border: 1px solid #fecaca;
              border-radius: 8px;
              margin: 24px 0;
              font-size: 14px;
              line-height: 1.6;
              font-weight: 500;
            }
            .vton-error.active {
              display: block;
            }
            .vton-error.info {
              color: #1e40af;
              background: #eff6ff;
              border: 1px solid #bfdbfe;
            }
            @media (max-width: 640px) {
              .vton-widget-container {
                margin: 20px 0 0 0;
              }
              .vton-button {
                padding: 18px 28px;
                font-size: 15px;
                border-radius: 10px;
              }
              .vton-modal-overlay {
                padding: 0;
                align-items: center;
                justify-content: center;
              }
              .vton-modal {
                max-width: 100%;
                max-height: 100vh;
                height: auto;
                min-height: auto;
                margin: auto;
                border-radius: 0;
                border: none;
                align-self: center;
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
            }
            @media (max-width: 480px) {
              .vton-button {
                padding: 11px 16px;
                font-size: 14px;
              }
              .vton-modal-overlay {
                align-items: center;
                justify-content: center;
              }
              .vton-modal {
                margin: auto;
                align-self: center;
              }
              .vton-modal-content {
                padding: 20px;
                justify-content: center;
                align-items: center;
                display: flex;
                flex-direction: column;
              }
              .vton-modal-content.has-result {
                padding: 16px;
                justify-content: center;
                align-items: center;
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
                max-height: 55vh;
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
            <button class="vton-button" style="background: ${buttonBg}; color: ${buttonColor};" onclick="window.vtonWidgetInstance.openModal()">
              ${buttonText}
            </button>
          </div>
          <div id="vton-modal-overlay" class="vton-modal-overlay" onclick="if(event.target === this) window.vtonWidgetInstance.closeModal()">
            <div class="vton-modal">
              <button class="vton-modal-close" onclick="window.vtonWidgetInstance.closeModal()">&times;</button>
              <div class="vton-modal-content">
                <div id="vton-upload-area" class="vton-upload-area" onclick="window.vtonWidgetInstance.triggerFileInput()">
                  <input type="file" id="vton-file-input" accept="image/*" style="display: none;" onchange="window.vtonWidgetInstance.handleFileChange(event)" />
                  <span class="vton-upload-icon">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M23 19C23 19.5304 22.7893 20.0391 22.4142 20.4142C22.0391 20.7893 21.5304 21 21 21H3C2.46957 21 1.96086 20.7893 1.58579 20.4142C1.21071 20.0391 1 19.5304 1 19V8C1 7.46957 1.21071 6.96086 1.58579 6.58579C1.96086 6.21071 2.46957 6 3 6H7L9 4H15L17 6H21C21.5304 6 22.0391 6.21071 22.4142 6.58579C22.7893 6.96086 23 7.46957 23 8V19Z" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M12 17C14.2091 17 16 15.2091 16 13C16 10.7909 14.2091 9 12 9C9.79086 9 8 10.7909 8 13C8 15.2091 9.79086 17 12 17Z" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </span>
                  <p>Add your photo</p>
                  <p>Front-facing photo recommended for best results</p>
                </div>
                <p class="vton-privacy-notice">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M12 8V12" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M12 16H12.01" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Your photos are processed securely and deleted after use
                </p>
                <button id="vton-generate-btn" class="vton-generate-btn" style="background: ${buttonBg}; color: ${buttonColor};" onclick="window.vtonWidgetInstance.generate()" disabled>
                  Try it on now
                </button>
                <div id="vton-loading" class="vton-loading">
                  <div class="vton-spinner"></div>
                  <p id="vton-loading-message" class="vton-loading-text">Creating your perfect fit<span class="vton-loading-dots"><span></span><span></span><span></span></span></p>
                  <div class="vton-progress-container">
                    <div id="vton-progress-bar" class="vton-progress-bar"></div>
                  </div>
                  <div class="vton-progress-info">
                    <span id="vton-progress-text" class="vton-progress-text">0%</span>
                    <span id="vton-timer-value" class="vton-timer-value">~30s</span>
                  </div>
                  <p class="vton-loading-subtext">Crafting your personalized try-on - usually takes about 30 seconds</p>
                </div>
                <div id="vton-result" class="vton-result"></div>
                <div id="vton-error" class="vton-error"></div>
              </div>
            </div>
          </div>
        `;
      }
      
      function openModal(shadowRoot, state) {
        const overlay = shadowRoot.getElementById('vton-modal-overlay');
        if (overlay) {
          overlay.classList.add('active');
          state.modalOpen = true;
          
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
      }
      
      function closeModal(shadowRoot, state) {
        const overlay = shadowRoot.getElementById('vton-modal-overlay');
        if (overlay) {
          overlay.classList.remove('active');
          state.modalOpen = false;
          
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
        }
      }
      
      function handleFileChange(event, shadowRoot, state) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(e) {
          state.userPhoto = e.target.result;
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
      
      function handleAddToCart(shadowRoot, state) {
        log('[VTON] handleAddToCart called');
        
        // Get the button in the result to show loading state
        const atcButton = shadowRoot.querySelector('.vton-add-to-cart-btn');
        const originalButtonText = atcButton ? atcButton.textContent : 'Add to Cart';
        
        // Disable button and show loading
        if (atcButton) {
          atcButton.disabled = true;
          atcButton.textContent = 'Adding to cart...';
          atcButton.style.opacity = '0.7';
          atcButton.style.cursor = 'not-allowed';
        }
        
        // Method 1: Try to find and click the original Add to Cart button (most reliable)
        var addToCartForm = vtonFindBestProductForm();
        var addToCartButton = addToCartForm ? vtonFindAddToCartButton(addToCartForm) : vtonFindAddToCartButton(document);
        
        if (addToCartButton) {
          log('[VTON] Found Add to Cart button, clicking it...');
          
          // Trigger click on the original button
          if (addToCartButton instanceof HTMLElement) {
            addToCartButton.click();
            
            // Update button to show success after a short delay
            setTimeout(function() {
              if (atcButton) {
                atcButton.textContent = 'Added to cart!';
                atcButton.style.background = '#28a745';
                
                setTimeout(function() {
                  if (atcButton) {
                    atcButton.textContent = originalButtonText;
                    atcButton.style.background = state.widgetSettings.widget_bg || '#000000';
                    atcButton.disabled = false;
                    atcButton.style.opacity = '1';
                    atcButton.style.cursor = 'pointer';
                  }
                }, 2000);
              }
              
              // Track the add to cart event
              trackAddToCart(state);
            }, 500);
            
            return;
          }
        }
        
        // Method 2: Find the form and submit it directly
        if (!addToCartForm) {
          addToCartForm = vtonFindBestProductForm();
        }
        
        if (addToCartForm) {
          log('[VTON] Found Add to Cart form, submitting...');
          
          // Check if form has variant selected
          const variantInput = addToCartForm.querySelector('input[name="id"], select[name="id"]');
          if (!variantInput || !variantInput.value) {
            warn('[VTON] No variant selected in form');
            if (atcButton) {
              atcButton.disabled = false;
              atcButton.textContent = originalButtonText;
              atcButton.style.opacity = '1';
              atcButton.style.cursor = 'pointer';
            }
            alert('Please select a product variant (size, color, etc.) before adding to cart.');
            return;
          }
          
          // Submit the form directly
          if (addToCartForm instanceof HTMLFormElement) {
            addToCartForm.submit();
            
            // Update button to show success
            setTimeout(function() {
              if (atcButton) {
                atcButton.textContent = 'Added to cart!';
                atcButton.style.background = '#28a745';
                
                setTimeout(function() {
                  if (atcButton) {
                    atcButton.textContent = originalButtonText;
                    atcButton.style.background = state.widgetSettings.widget_bg || '#000000';
                    atcButton.disabled = false;
                    atcButton.style.opacity = '1';
                    atcButton.style.cursor = 'pointer';
                  }
                }, 2000);
              }
              
              // Track the add to cart event
              trackAddToCart(state);
            }, 500);
            
            return;
          }
        }
        
        // Method 3: Use AJAX API as fallback
        log('[VTON] Trying AJAX method...');
        
        if (!addToCartForm) {
          error('[VTON] Add to Cart form not found');
          if (atcButton) {
            atcButton.disabled = false;
            atcButton.textContent = originalButtonText;
            atcButton.style.opacity = '1';
            atcButton.style.cursor = 'pointer';
          }
          alert('Unable to find the product form. Please use the regular Add to Cart button on the page.');
          return;
        }
        
        // Collect form data
        const formData = new FormData(addToCartForm);
        
        // Get quantity (default to 1 if not specified)
        let quantity = formData.get('quantity') || '1';
        if (!quantity || quantity === '') {
          quantity = '1';
        }
        
        // Get variant ID (required) - try multiple methods
        let variantId = formData.get('id') || formData.get('variant_id');
        
        // If not found in form data, try to find it in the form inputs
        if (!variantId) {
          const variantInput = addToCartForm.querySelector('input[name="id"], select[name="id"]');
          if (variantInput) {
            variantId = variantInput.value;
          }
        }
        
        if (!variantId) {
          error('[VTON] Variant ID not found in form');
          if (atcButton) {
            atcButton.disabled = false;
            atcButton.textContent = originalButtonText;
            atcButton.style.opacity = '1';
            atcButton.style.cursor = 'pointer';
          }
          alert('Please select a product variant (size, color, etc.) before adding to cart.');
          return;
        }
        
        log('[VTON] Using variant ID:', variantId, 'quantity:', quantity);
        
        // Prepare cart add data
        const cartData = {
          id: variantId,
          quantity: parseInt(quantity, 10) || 1
        };
        
        // Add any additional properties (for custom products)
        formData.forEach((value, key) => {
          if (key.startsWith('properties[')) {
            if (!cartData.properties) {
              cartData.properties = {};
            }
            const propKey = key.replace('properties[', '').replace(']', '');
            cartData.properties[propKey] = value;
          }
        });
        
        log('[VTON] Sending cart data:', cartData);
        
        // Submit to Shopify cart using AJAX
        fetch('/cart/add.js', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(cartData)
        })
        .then(function(response) {
          log('[VTON] Cart add response status:', response.status);
          return response.json().then(function(data) {
            log('[VTON] Cart add response data:', data);
            if (!response.ok) {
              throw new Error(data.description || data.message || 'Failed to add to cart');
            }
            return data;
          });
        })
        .then(function(data) {
          log('[VTON] Product added to cart successfully:', data);
          
          // Update button to show success
          if (atcButton) {
            atcButton.textContent = 'Added to cart!';
            atcButton.style.background = '#28a745';
            
            // Reset button after 2 seconds
            setTimeout(function() {
              if (atcButton) {
                atcButton.textContent = originalButtonText;
                atcButton.style.background = state.widgetSettings.widget_bg || '#000000';
                atcButton.disabled = false;
                atcButton.style.opacity = '1';
                atcButton.style.cursor = 'pointer';
              }
            }, 2000);
          }
          
          // Track the add to cart event
          trackAddToCart(state);
          
          // Trigger cart drawer/notification if theme supports it
          const cartUpdatedEvent = new CustomEvent('cart:updated', { detail: data });
          document.dispatchEvent(cartUpdatedEvent);
          
          // Also trigger other common cart events
          document.dispatchEvent(new CustomEvent('cart:add', { detail: data }));
          document.dispatchEvent(new Event('cart:refresh'));
          
          // Try to open cart drawer if theme uses this pattern
          const cartDrawerButton = document.querySelector('[data-cart-drawer-toggle], .cart-drawer-toggle, [aria-controls*="cart"], [data-cart-toggle]');
          if (cartDrawerButton) {
            setTimeout(function() {
              cartDrawerButton.click();
            }, 500);
          }
          
          // Try to refresh cart count if theme has a cart count element
          const cartCountElements = document.querySelectorAll('[data-cart-count], .cart-count, #cart-count');
          cartCountElements.forEach(function(el) {
            if (el instanceof HTMLElement) {
              const currentCount = parseInt(el.textContent || '0', 10);
              el.textContent = String(currentCount + parseInt(quantity, 10));
            }
          });
        })
        .catch(function(err) {
          error('[VTON] Error adding to cart:', err);
          
          // Show error on button
          if (atcButton) {
            atcButton.textContent = 'Error - Try Again';
            atcButton.style.background = '#dc3545';
            atcButton.disabled = false;
            atcButton.style.opacity = '1';
            atcButton.style.cursor = 'pointer';
            
            // Reset after 3 seconds
            setTimeout(function() {
              if (atcButton) {
                atcButton.textContent = originalButtonText;
                atcButton.style.background = state.widgetSettings.widget_bg || '#000000';
              }
            }, 3000);
          }
          
          // Show alert for user feedback
          alert('Unable to add product to cart: ' + (error.message || 'Unknown error') + '. Please try using the regular Add to Cart button on the page.');
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

        if (navigator.sendBeacon) {
          try {
            navigator.sendBeacon(
              atcUrl,
              new Blob([payload], { type: 'application/json' })
            );
          } catch (e) {
            warn('[VTON] sendBeacon failed', e);
          }
          return;
        }

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
        const maxAttempts = 48;
        let attempts = 0;
        let consecutiveErrors = 0;
        let pollInterval = null;

        function pollOnce() {
          attempts++;

          if (attempts > maxAttempts) {
            if (pollInterval) clearInterval(pollInterval);
            state.isGenerating = false;
            stopLoadingMessages(shadowRoot);
            if (loading) loading.classList.remove('active');
            const errorElement = shadowRoot.getElementById('vton-error');
            if (errorElement) {
              errorElement.classList.add('active');
              errorElement.textContent = 'Generation timed out. Please try again.';
            }
            if (generateBtn) generateBtn.disabled = false;
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
                state.isGenerating = false;
                stopLoadingMessages(shadowRoot);
                if (loading) loading.classList.remove('active');
                const errorElement = shadowRoot.getElementById('vton-error');
                if (errorElement) {
                  errorElement.classList.add('active');
                  errorElement.textContent = statusData.error || 'Generation failed. Please try again.';
                }
                if (generateBtn) generateBtn.disabled = false;
              } else if (statusData.status === 'pending' || statusData.status === 'processing') {
                // Continue polling
                log('[VTON] Job still pending/processing, continuing to poll...');
              } else {
                // Unknown status, stop polling after a few attempts
                warn('[VTON] Unknown status:', statusData.status);
                if (attempts > 10) {
                  if (pollInterval) clearInterval(pollInterval);
                  state.isGenerating = false;
                  stopLoadingMessages(shadowRoot);
                  if (loading) loading.classList.remove('active');
                  const errorElement = shadowRoot.getElementById('vton-error');
                  if (errorElement) {
                    errorElement.classList.add('active');
                    errorElement.textContent = 'Unexpected status: ' + (statusData.status || 'unknown') + '. Please try again.';
                  }
                  if (generateBtn) generateBtn.disabled = false;
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
                state.isGenerating = false;
                stopLoadingMessages(shadowRoot);
                if (loading) loading.classList.remove('active');
                const errorElement = shadowRoot.getElementById('vton-error');
                if (errorElement) {
                  errorElement.classList.add('active');
                  errorElement.textContent = 'Connection error. Please try again.';
                }
                if (generateBtn) generateBtn.disabled = false;
              }
            });
        }

        pollOnce();
        pollInterval = setInterval(pollOnce, 2500);
      }
      
      function displayResult(shadowRoot, state, resultUrl, loading, result, generateBtn) {
        state.resultImageUrl = resultUrl;
        
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
        
        // Hide loading
        if (loading) loading.classList.remove('active');
        
        // Hide upload area (source image), generate button, and privacy notice
        const uploadArea = shadowRoot.getElementById('vton-upload-area');
        const modalContent = shadowRoot.querySelector('.vton-modal-content');
        const privacyNotice = shadowRoot.querySelector('.vton-privacy-notice');
        if (uploadArea) {
          uploadArea.classList.add('hidden');
        }
        if (generateBtn) {
          generateBtn.classList.add('hidden');
        }
        if (privacyNotice) {
          privacyNotice.classList.add('hidden');
        }
        if (modalContent) {
          modalContent.classList.add('has-result');
        }
        
        // Display result with "Add to Cart" button - ONLY the result, no original image
        if (result && state.resultImageUrl && typeof state.resultImageUrl === 'string' && state.resultImageUrl.startsWith('http')) {
          result.classList.add('active');
          const buttonBg = state.widgetSettings.widget_bg || '#000000';
          const buttonColor = state.widgetSettings.widget_color || '#ffffff';
          result.innerHTML = 
            '<div class="vton-result-content">' +
            '<h3 class="vton-result-title">Here\'s your result!</h3>' +
            '<img src="' + state.resultImageUrl + '" alt="Try-on result" />' +
            '<button class="vton-add-to-cart-btn" style="background: ' + buttonBg + '; color: ' + buttonColor + ';" onclick="window.vtonWidgetInstance.handleAddToCart()">' +
            'Add to Cart' +
            '</button>' +
            '</div>';
          log('[VTON] Result displayed successfully with Add to Cart button');
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
        
        // Show loading and hide button, privacy notice during generation
        if (loading) loading.classList.add('active');
        if (generateBtn) {
          generateBtn.disabled = true;
          generateBtn.classList.add('hidden');
        }
        const privacyNotice = shadowRoot.querySelector('.vton-privacy-notice');
        if (privacyNotice) {
          privacyNotice.classList.add('hidden');
        }
        if (result) {
          result.classList.remove('active');
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
              body: JSON.stringify({
              user_photo: state.userPhoto,
              product_id: state.productId,
              product_handle: state.productHandle,
              product_image_url: state.productImageUrl
            }),
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
            // Synchronous mode: result is already available
            log('[VTON] Result URL available immediately, displaying result');
            state.resultImageUrl = immediateResultUrl;
            
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
            
            // Hide loading
            if (loading) loading.classList.remove('active');
            
            // Hide upload area (source image), generate button, and privacy notice
            const uploadArea = shadowRoot.getElementById('vton-upload-area');
            const modalContent = shadowRoot.querySelector('.vton-modal-content');
            const privacyNotice = shadowRoot.querySelector('.vton-privacy-notice');
            if (uploadArea) {
              uploadArea.classList.add('hidden');
            }
            if (generateBtn) {
              generateBtn.classList.add('hidden');
            }
            if (privacyNotice) {
              privacyNotice.classList.add('hidden');
            }
            if (modalContent) {
              modalContent.classList.add('has-result');
            }
            
            // Display result with "Add to Cart" button
            if (result && state.resultImageUrl) {
              result.classList.add('active');
              const buttonBg = state.widgetSettings.widget_bg || '#000000';
              const buttonColor = state.widgetSettings.widget_color || '#ffffff';
              result.innerHTML = 
                '<div class="vton-result-content">' +
                '<h3 class="vton-result-title">Here\'s your result!</h3>' +
                '<img src="' + state.resultImageUrl + '" alt="Try-on result" />' +
                '<button class="vton-add-to-cart-btn" style="background: ' + buttonBg + '; color: ' + buttonColor + ';" onclick="window.vtonWidgetInstance.handleAddToCart()">' +
                'Add to Cart' +
                '</button>' +
                '</div>';
              log('[VTON] Result displayed successfully with Add to Cart button');
            }
            
            state.isGenerating = false;
            if (generateBtn) generateBtn.disabled = false;
            return; // Exit early, result is already displayed
          }
          
          // Check if response contains a job_id (asynchronous mode)
          const jobId = data.job_id || data.jobId || data.job || 
                       (data.data && data.data.job_id) ||
                       (data.data && data.data.jobId);
          
          if (jobId) {
            // Asynchronous mode: start polling for job status
            log('[VTON] Job ID received, starting polling:', jobId);
            pollJobStatus(shadowRoot, state, jobId, loading, result, generateBtn);
            return; // Exit early, polling will handle the rest
          }
          
          // If we reach here, neither result_url nor job_id were found
          error('[VTON] Invalid response format: no result_url or job_id found', data);
          state.isGenerating = false;
          stopLoadingMessages(shadowRoot);
          if (loading) loading.classList.remove('active');
          const errorElement = shadowRoot.getElementById('vton-error');
          if (errorElement) {
            errorElement.classList.add('active');
            errorElement.textContent = 'Invalid response from server. Please try again.';
          }
          if (generateBtn) generateBtn.disabled = false;
        }).catch(function(err) {
          state.isGenerating = false;
          error('[VTON] Generation error:', err);
          
          // Stop loading messages
          stopLoadingMessages(shadowRoot);
          
          if (loading) loading.classList.remove('active');
          if (generateBtn) generateBtn.disabled = false;
          const errorElement = shadowRoot.getElementById('vton-error');
          if (errorElement) {
            errorElement.classList.add('active');
            // Extract error message from the error object
            let errorMessage = 'An error occurred. Please try again.';
            let isDailyLimitError = false;
            
            if (err.message) {
              // Use the error message from the backend if available
              errorMessage = err.message;
              // Check if this is a daily limit error (should be displayed as info, not error)
              // Check both the message content and the status code (402 = Payment Required, used for limits)
              if (err.isDailyLimit || 
                  err.message.includes('used all your available credits') || 
                  (err.message.includes('limit') && err.message.includes('per day')) ||
                  err.message.includes('Please try again tomorrow') ||
                  (err.status === 402 && (err.message.includes('limit') || err.message.includes('credits')))) {
                isDailyLimitError = true;
              }
            } else if (err.name === 'AbortError' || (err.message && (err.message.includes('timeout') || err.message.includes('504')))) {
              errorMessage = 'Generation is taking longer than expected. Please wait a moment and check back, or try again.';
            }
            
            // If it's a daily limit error, use info style instead of error style
            if (isDailyLimitError) {
              errorElement.classList.add('info');
            } else {
              errorElement.classList.remove('info');
            }
            
            errorElement.textContent = errorMessage;
          }
          if (generateBtn) generateBtn.disabled = false;
        });
      }
    })();
