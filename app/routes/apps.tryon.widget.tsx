/**
 * ==========================================
 * APP PROXY - WIDGET JAVASCRIPT (V2)
 * ==========================================
 * 
 * Route: GET /apps/tryon/widget.js
 * Serves the widget JavaScript for the storefront.
 * 
 * Design: Tailwind CSS - Blanc, propre, ombres douces, accent bleu
 * Mobile: Bottom Sheet ou Full Screen
 */

import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // This is a public route for App Proxy - no authentication needed
  // The signature verification is handled in the generate endpoint

  const widgetCode = `
(function() {
    'use strict';
    
    // Configuration
    const CONFIG = {
        apiBase: window.location.origin + '/apps/tryon',
        selectors: {
            productImage: '.product__media img, .product-single__media img, [data-product-image], .product-media img, .product-photos img, .product-gallery img, img[data-product-image]',
            addToCartButton: 'form[action*="/cart/add"] button[type="submit"], button[name="add"], [data-add-to-cart], .product-form__cart-submit, .btn--add-to-cart, .add-to-cart, button[type="submit"][form*="product"], .product-form button[type="submit"], .product-form__submit, [aria-label*="cart" i], [aria-label*="add" i]'
        },
        maxRetries: 10,
        retryDelay: 500
    };
    
    // États du modal
    const STATE = {
        INITIAL: 'initial',
        VERIFICATION: 'verification',
        LOADING: 'loading',
        RESULT: 'result',
        ERROR: 'error'
    };
    
    class VTONWidget {
        constructor() {
            this.shop = window.Shopify?.shop || '';
            this.productId = this.extractProductId();
            this.productImage = this.getProductImage();
            this.currentState = STATE.INITIAL;
            this.userPhoto = null;
            this.resultImageUrl = null;
            this.retryCount = 0;
            this.init();
        }
        
        extractProductId() {
            // Try multiple methods to get product ID
            const meta = document.querySelector('meta[property="og:url"]');
            if (meta) {
                const match = meta.content.match(/products\\/([^?\\/]+)/);
                if (match) return match[1];
            }
            
            // Try data attribute
            const productForm = document.querySelector('form[action*="/cart/add"]');
            if (productForm) {
                const productId = productForm.querySelector('[name="id"]')?.value;
                if (productId) return productId;
            }
            
            return null;
        }
        
        getProductImage() {
            const selectors = CONFIG.selectors.productImage.split(', ');
            for (const selector of selectors) {
                const img = document.querySelector(selector);
                if (img && img.src) return img.src;
            }
            return null;
        }
        
        async checkCredits() {
            // Check credit balance via API
            try {
                const shop = window.Shopify?.shop || this.extractShopFromUrl() || '';
                const url = new URL(\`\${CONFIG.apiBase}/check-credits\`, window.location.origin);
                if (shop) {
                    url.searchParams.set('shop', shop);
                }
                
                const response = await fetch(url.toString(), {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    return data.credits > 0;
                }
                return false;
            } catch {
                return true; // Assume credits available if check fails
            }
        }
        
        init() {
            if (!this.productId || !this.productImage) {
                console.log('[VTON] Not a product page, skipping...');
                return;
            }
            
            // Remove old widgets that might exist
            this.removeOldWidgets();
            
            // Check credits before displaying button
            this.checkCredits().then(hasCredits => {
                if (hasCredits) {
                    if (document.readyState === 'loading') {
                        window.addEventListener('DOMContentLoaded', () => this.injectButton());
                    } else {
                        this.injectButton();
                    }
                }
            });
        }
        
        removeOldWidgets() {
            // Remove old widget buttons
            const oldButtons = document.querySelectorAll('.vton-widget-button, [data-vton-widget], .try-on-button, .virtual-try-on-button');
            oldButtons.forEach(btn => btn.remove());
            
            // Remove old styles
            const oldStyles = document.getElementById('vton-v2-styles');
            if (oldStyles) oldStyles.remove();
        }
        
        injectButton() {
            // Check if button already exists
            if (document.querySelector('.vton-widget-button')) {
                return;
            }
            
            // Limiter le nombre de tentatives
            if (this.retryCount >= CONFIG.maxRetries) {
                console.warn('[VTON] Max retries reached, could not find Add to Cart button');
                return;
            }
            
            const cartSelectors = CONFIG.selectors.addToCartButton.split(', ');
            let addToCartBtn = null;
            
            // Try all selectors
            for (const selector of cartSelectors) {
                const trimmedSelector = selector.trim();
                if (!trimmedSelector) continue;
                
                addToCartBtn = document.querySelector(trimmedSelector);
                if (addToCartBtn) {
                    console.log('[VTON] Found Add to Cart button with selector:', trimmedSelector);
                    break;
                }
            }
            
            // If not found, try to find the product form
            if (!addToCartBtn) {
                const productForm = document.querySelector('form[action*="/cart/add"]');
                if (productForm) {
                    addToCartBtn = productForm.querySelector('button[type="submit"]') || 
                                   productForm.querySelector('button') ||
                                   productForm.querySelector('[type="submit"]');
                }
            }
            
            // If still not found, retry
            if (!addToCartBtn) {
                this.retryCount++;
                setTimeout(() => this.injectButton(), CONFIG.retryDelay);
                return;
            }
            
            // Create widget button
            const vtonBtn = document.createElement('button');
            vtonBtn.type = 'button';
            vtonBtn.className = 'vton-widget-button';
            vtonBtn.setAttribute('data-vton-widget', 'true');
            vtonBtn.innerHTML = \`
                <svg class="vton-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2L2 7L12 12L22 7L12 2Z"/>
                    <path d="M2 17L12 22L22 17"/>
                    <path d="M2 12L12 17L22 12"/>
                </svg>
                <span>Virtual Try-On</span>
            \`;
            vtonBtn.onclick = () => this.openModal();
            
            // Try multiple insertion methods
            const parent = addToCartBtn.parentElement;
            const grandParent = parent?.parentElement;
            
            // Method 1: Insert after button directly
            if (addToCartBtn.nextSibling) {
                addToCartBtn.parentNode.insertBefore(vtonBtn, addToCartBtn.nextSibling);
            } else {
                // Method 2: Add to parent if it's a flex container
                if (parent && (parent.style.display === 'flex' || 
                               parent.classList.contains('flex') || 
                               getComputedStyle(parent).display === 'flex')) {
                    parent.appendChild(vtonBtn);
                } 
                // Method 3: Create a wrapper for both buttons
                else if (parent) {
                    const wrapper = document.createElement('div');
                    wrapper.style.display = 'flex';
                    wrapper.style.flexDirection = 'column';
                    wrapper.style.gap = '12px';
                    wrapper.style.width = '100%';
                    
                    parent.insertBefore(wrapper, addToCartBtn);
                    wrapper.appendChild(addToCartBtn);
                    wrapper.appendChild(vtonBtn);
                }
                // Method 4: Insert after parent
                else {
                    addToCartBtn.insertAdjacentElement('afterend', vtonBtn);
                }
            }
            
            // Ajuster le style pour que le bouton prenne toute la largeur
            if (addToCartBtn.style.width === '100%' || 
                getComputedStyle(addToCartBtn).width === '100%' ||
                addToCartBtn.classList.contains('full-width')) {
                vtonBtn.style.width = '100%';
            }
            
            this.injectStyles();
            console.log('[VTON] Widget button injected successfully');
        }
        
        injectStyles() {
            if (document.getElementById('vton-v2-styles')) return;
            
            const styles = document.createElement('style');
            styles.id = 'vton-v2-styles';
            styles.textContent = \`
                /* Widget Button */
                .vton-widget-button {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    width: 100%;
                    padding: 12px 24px;
                    margin-top: 12px;
                    background: #ffffff;
                    color: #1e40af;
                    border: 2px solid #3b82f6;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
                }
                .vton-widget-button:hover {
                    background: #eff6ff;
                    border-color: #2563eb;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                    transform: translateY(-1px);
                }
                .vton-icon {
                    flex-shrink: 0;
                }
                
                /* Modal Overlay */
                .vton-modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.5);
                    display: none;
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                    padding: 16px;
                }
                .vton-modal-overlay.active {
                    display: flex;
                }
                
                /* Modal Content */
                .vton-modal {
                    background: #ffffff;
                    border-radius: 16px;
                    width: 100%;
                    max-width: 600px;
                    max-height: 90vh;
                    overflow-y: auto;
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                    position: relative;
                }
                
                /* Mobile: Bottom Sheet */
                @media (max-width: 640px) {
                    .vton-modal-overlay {
                        align-items: flex-end;
                        padding: 0;
                    }
                    .vton-modal {
                        border-radius: 24px 24px 0 0;
                        max-height: 90vh;
                        animation: slideUp 0.3s ease-out;
                    }
                    @keyframes slideUp {
                        from {
                            transform: translateY(100%);
                        }
                        to {
                            transform: translateY(0);
                        }
                    }
                }
                
                /* Modal Header */
                .vton-modal-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 24px;
                    border-bottom: 1px solid #e5e7eb;
                }
                .vton-modal-title {
                    font-size: 20px;
                    font-weight: 700;
                    color: #111827;
                }
                .vton-modal-close {
                    background: none;
                    border: none;
                    font-size: 24px;
                    color: #6b7280;
                    cursor: pointer;
                    padding: 4px;
                    line-height: 1;
                    transition: color 0.2s;
                }
                .vton-modal-close:hover {
                    color: #111827;
                }
                
                /* Modal Body */
                .vton-modal-body {
                    padding: 24px;
                }
                
                /* État Initial */
                .vton-state-initial {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }
                .vton-upload-option {
                    border: 2px solid #e5e7eb;
                    border-radius: 12px;
                    padding: 24px;
                    cursor: pointer;
                    transition: all 0.2s;
                    text-align: center;
                    background: #f9fafb;
                }
                .vton-upload-option:hover {
                    border-color: #3b82f6;
                    background: #eff6ff;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                }
                .vton-upload-icon {
                    font-size: 48px;
                    margin-bottom: 12px;
                }
                .vton-upload-title {
                    font-size: 18px;
                    font-weight: 600;
                    color: #111827;
                    margin-bottom: 8px;
                }
                .vton-upload-subtitle {
                    font-size: 14px;
                    color: #6b7280;
                }
                
                /* État Vérification */
                .vton-state-verification {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }
                .vton-preview-container {
                    position: relative;
                    border-radius: 12px;
                    overflow: hidden;
                    background: #f9fafb;
                }
                .vton-preview-image {
                    width: 100%;
                    max-height: 400px;
                    object-fit: contain;
                    display: block;
                }
                .vton-preview-overlay {
                    position: absolute;
                    top: 12px;
                    right: 12px;
                    background: rgba(255, 255, 255, 0.9);
                    border-radius: 8px;
                    padding: 8px 12px;
                    font-size: 12px;
                    font-weight: 600;
                    color: #111827;
                }
                .vton-generate-btn {
                    width: 100%;
                    padding: 14px 24px;
                    background: #3b82f6;
                    color: #ffffff;
                    border: none;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.3);
                }
                .vton-generate-btn:hover:not(:disabled) {
                    background: #2563eb;
                    box-shadow: 0 6px 8px -1px rgba(59, 130, 246, 0.4);
                    transform: translateY(-1px);
                }
                .vton-generate-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .vton-credit-cost {
                    text-align: center;
                    font-size: 14px;
                    color: #6b7280;
                    margin-top: 8px;
                }
                
                /* État Loading */
                .vton-state-loading {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 48px 24px;
                    gap: 24px;
                }
                .vton-spinner {
                    width: 48px;
                    height: 48px;
                    border: 4px solid #e5e7eb;
                    border-top-color: #3b82f6;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                .vton-loading-text {
                    font-size: 18px;
                    font-weight: 600;
                    color: #111827;
                    text-align: center;
                }
                .vton-loading-subtext {
                    font-size: 14px;
                    color: #6b7280;
                    text-align: center;
                }
                
                /* État Résultat */
                .vton-state-result {
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }
                .vton-result-slider {
                    position: relative;
                    border-radius: 12px;
                    overflow: hidden;
                    background: #f9fafb;
                }
                .vton-slider-container {
                    position: relative;
                    width: 100%;
                    height: 0;
                    padding-bottom: 100%;
                }
                .vton-slider-image {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    object-fit: contain;
                }
                .vton-slider-divider {
                    position: absolute;
                    top: 0;
                    left: 50%;
                    width: 2px;
                    height: 100%;
                    background: #3b82f6;
                    transform: translateX(-50%);
                    z-index: 10;
                    cursor: col-resize;
                }
                .vton-slider-label {
                    position: absolute;
                    top: 12px;
                    padding: 6px 12px;
                    background: rgba(255, 255, 255, 0.9);
                    border-radius: 6px;
                    font-size: 12px;
                    font-weight: 600;
                    z-index: 11;
                }
                .vton-slider-label-left {
                    left: 12px;
                }
                .vton-slider-label-right {
                    right: 12px;
                }
                .vton-result-actions {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                @media (min-width: 640px) {
                    .vton-result-actions {
                        flex-direction: row;
                    }
                }
                .vton-btn {
                    flex: 1;
                    padding: 12px 24px;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    border: none;
                }
                .vton-btn-primary {
                    background: #3b82f6;
                    color: #ffffff;
                    box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.3);
                }
                .vton-btn-primary:hover {
                    background: #2563eb;
                    box-shadow: 0 6px 8px -1px rgba(59, 130, 246, 0.4);
                }
                .vton-btn-secondary {
                    background: #ffffff;
                    color: #374151;
                    border: 2px solid #e5e7eb;
                }
                .vton-btn-secondary:hover {
                    border-color: #3b82f6;
                    color: #3b82f6;
                }
                
                /* Error State */
                .vton-state-error {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 48px 24px;
                    gap: 16px;
                    text-align: center;
                }
                .vton-error-icon {
                    font-size: 64px;
                    color: #ef4444;
                }
                .vton-error-title {
                    font-size: 20px;
                    font-weight: 700;
                    color: #111827;
                }
                .vton-error-message {
                    font-size: 14px;
                    color: #6b7280;
                    max-width: 400px;
                }
                .vton-error-retry {
                    margin-top: 8px;
                    padding: 12px 24px;
                    background: #3b82f6;
                    color: #ffffff;
                    border: none;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                }
                .vton-error-retry:hover {
                    background: #2563eb;
                }
                
                /* Hidden state */
                .vton-state-hidden {
                    display: none;
                }
            \`;
            document.head.appendChild(styles);
        }
        
        openModal() {
            let modal = document.getElementById('vton-modal-overlay');
            if (!modal) {
                modal = this.createModal();
                document.body.appendChild(modal);
            }
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
        
        closeModal() {
            const modal = document.getElementById('vton-modal-overlay');
            if (modal) {
                modal.classList.remove('active');
                document.body.style.overflow = '';
            }
            this.resetState();
        }
        
        resetState() {
            this.currentState = STATE.INITIAL;
            this.userPhoto = null;
            this.resultImageUrl = null;
            this.updateModalState();
        }
        
        setState(newState) {
            this.currentState = newState;
            this.updateModalState();
        }
        
        updateModalState() {
            const states = ['initial', 'verification', 'loading', 'result', 'error'];
            states.forEach(state => {
                const el = document.getElementById(\`vton-state-\${state}\`);
                if (el) {
                    if (state === this.currentState) {
                        el.classList.remove('vton-state-hidden');
                    } else {
                        el.classList.add('vton-state-hidden');
                    }
                }
            });
        }
        
        createModal() {
            const overlay = document.createElement('div');
            overlay.id = 'vton-modal-overlay';
            overlay.className = 'vton-modal-overlay';
            overlay.innerHTML = \`
                <div class="vton-modal">
                    <div class="vton-modal-header">
                        <h2 class="vton-modal-title">Virtual Try-On</h2>
                        <button class="vton-modal-close" onclick="this.closest('.vton-modal-overlay').querySelector('.vton-modal-close').dispatchEvent(new Event('click'))">×</button>
                    </div>
                    <div class="vton-modal-body">
                        <!-- État Initial -->
                        <div id="vton-state-initial" class="vton-state-initial">
                            <div class="vton-upload-option" data-option="upload">
                                <div class="vton-upload-icon">📷</div>
                                <div class="vton-upload-title">Upload Photo</div>
                                <div class="vton-upload-subtitle">Caméra ou Galerie</div>
                                <input type="file" id="vton-photo-input" accept="image/*" style="display: none;">
                            </div>
                            <div class="vton-upload-option" data-option="mannequin">
                                <div class="vton-upload-icon">🤖</div>
                                <div class="vton-upload-title">Mannequin IA</div>
                                <div class="vton-upload-subtitle">Utiliser un mannequin virtuel</div>
                            </div>
                        </div>
                        
                        <!-- État Vérification -->
                        <div id="vton-state-verification" class="vton-state-verification vton-state-hidden">
                            <div class="vton-preview-container">
                                <img id="vton-preview-img" class="vton-preview-image" src="" alt="Preview">
                                <div class="vton-preview-overlay">Preview</div>
                            </div>
                            <button class="vton-generate-btn" id="vton-generate-btn">
                                Générer (1 jeton)
                            </button>
                            <div class="vton-credit-cost">Coût: 1 jeton</div>
                        </div>
                        
                        <!-- État Loading -->
                        <div id="vton-state-loading" class="vton-state-loading vton-state-hidden">
                            <div class="vton-spinner"></div>
                            <div class="vton-loading-text">L'IA prépare votre essayage...</div>
                            <div class="vton-loading-subtext">Cela peut prendre ~15 secondes</div>
                        </div>
                        
                        <!-- État Résultat -->
                        <div id="vton-state-result" class="vton-state-result vton-state-hidden">
                            <div class="vton-result-slider">
                                <div class="vton-slider-container">
                                    <img id="vton-result-before" class="vton-slider-image" src="" alt="Avant" style="clip-path: polygon(0 0, 50% 0, 50% 100%, 0 100%);">
                                    <img id="vton-result-after" class="vton-slider-image" src="" alt="Après" style="clip-path: polygon(50% 0, 100% 0, 100% 100%, 50% 100%);">
                                    <div class="vton-slider-divider" id="vton-slider-divider"></div>
                                    <div class="vton-slider-label vton-slider-label-left">Avant</div>
                                    <div class="vton-slider-label vton-slider-label-right">Après</div>
                                </div>
                            </div>
                            <div class="vton-result-actions">
                                <button class="vton-btn vton-btn-primary" id="vton-add-to-cart-btn">Add to Cart</button>
                                <button class="vton-btn vton-btn-secondary" id="vton-download-btn">Download</button>
                                <button class="vton-btn vton-btn-secondary" id="vton-new-try-btn">New Try</button>
                            </div>
                        </div>
                        
                        <!-- Error State -->
                        <div id="vton-state-error" class="vton-state-error vton-state-hidden">
                            <div class="vton-error-icon">⚠️</div>
                            <div class="vton-error-title">Error</div>
                            <div class="vton-error-message" id="vton-error-message">An error occurred</div>
                            <button class="vton-error-retry" id="vton-error-retry">Retry</button>
                        </div>
                    </div>
                </div>
            \`;
            
            // Setup event listeners
            this.setupModalEvents(overlay);
            
            return overlay;
        }
        
        setupModalEvents(overlay) {
            const widget = this;
            
            // Close button
            const closeBtn = overlay.querySelector('.vton-modal-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => widget.closeModal());
            }
            
            // Close on overlay click
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    widget.closeModal();
                }
            });
            
            // Upload option
            const uploadOption = overlay.querySelector('[data-option="upload"]');
            const photoInput = overlay.querySelector('#vton-photo-input');
            if (uploadOption && photoInput) {
                uploadOption.addEventListener('click', () => photoInput.click());
                photoInput.addEventListener('change', (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) widget.handlePhotoUpload(file);
                });
            }
            
            // Mannequin option (placeholder)
            const mannequinOption = overlay.querySelector('[data-option="mannequin"]');
            if (mannequinOption) {
                mannequinOption.addEventListener('click', () => {
                    alert('Fonctionnalité Mannequin IA à venir');
                });
            }
            
            // Generate button
            const generateBtn = overlay.querySelector('#vton-generate-btn');
            if (generateBtn) {
                generateBtn.addEventListener('click', () => widget.generateTryOn());
            }
            
            // Add to Cart button
            const addToCartBtn = overlay.querySelector('#vton-add-to-cart-btn');
            if (addToCartBtn) {
                addToCartBtn.addEventListener('click', () => widget.handleAddToCart());
            }
            
            // Download button
            const downloadBtn = overlay.querySelector('#vton-download-btn');
            if (downloadBtn) {
                downloadBtn.addEventListener('click', () => widget.downloadResult());
            }
            
            // New try button
            const newTryBtn = overlay.querySelector('#vton-new-try-btn');
            if (newTryBtn) {
                newTryBtn.addEventListener('click', () => widget.resetState());
            }
            
            // Error retry button
            const errorRetryBtn = overlay.querySelector('#vton-error-retry');
            if (errorRetryBtn) {
                errorRetryBtn.addEventListener('click', () => widget.resetState());
            }
            
            // Slider divider (drag to compare)
            const sliderDivider = overlay.querySelector('#vton-slider-divider');
            if (sliderDivider) {
                let isDragging = false;
                sliderDivider.addEventListener('mousedown', (e) => {
                    isDragging = true;
                    e.preventDefault();
                });
                document.addEventListener('mousemove', (e) => {
                    if (isDragging) {
                        widget.updateSliderPosition(e.clientX);
                    }
                });
                document.addEventListener('mouseup', () => {
                    isDragging = false;
                });
            }
        }
        
        handlePhotoUpload(file) {
            if (!file || !file.type.startsWith('image/')) {
                this.showError('Veuillez uploader un fichier image');
                return;
            }
            
            const reader = new FileReader();
            reader.onload = (e) => {
                this.userPhoto = e.target?.result;
                const previewImg = document.getElementById('vton-preview-img');
                if (previewImg && this.userPhoto) {
                    previewImg.src = this.userPhoto;
                }
                this.setState(STATE.VERIFICATION);
            };
            reader.readAsDataURL(file);
        }
        
        async generateTryOn() {
            this.setState(STATE.LOADING);
            
            try {
                if (!this.userPhoto) {
                    throw new Error('Aucune photo uploadée');
                }
                
                if (!this.productImage) {
                    throw new Error('Product image not found');
                }
                
                const personBase64 = this.userPhoto.includes(',') 
                    ? this.userPhoto.split(',')[1] 
                    : this.userPhoto;
                
                const shop = window.Shopify?.shop || this.extractShopFromUrl() || '';
                const url = new URL(\`\${CONFIG.apiBase}/generate\`, window.location.origin);
                if (shop) {
                    url.searchParams.set('shop', shop);
                }
                
                const response = await fetch(url.toString(), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        person_image_base64: personBase64,
                        clothing_url: this.productImage,
                        product_id: this.productId
                    })
                });
                
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ error: \`HTTP \${response.status}\` }));
                    throw new Error(errorData.error || `Generation failed: ${response.status}`);
                }
                
                const data = await response.json();
                
                if (data.error) {
                    throw new Error(data.error);
                }
                
                if (!data.result_image_url) {
                    throw new Error('Aucune image de résultat reçue');
                }
                
                this.resultImageUrl = data.result_image_url;
                this.showResult();
                
            } catch (error) {
                console.error('[VTON] Error:', error);
                const errorMessage = error instanceof Error ? error.message : 'An error occurred. Please try again.';
                this.showError(errorMessage);
            }
        }
        
        showResult() {
            const beforeImg = document.getElementById('vton-result-before');
            const afterImg = document.getElementById('vton-result-after');
            
            if (beforeImg && this.userPhoto) {
                beforeImg.src = this.userPhoto;
            }
            if (afterImg && this.resultImageUrl) {
                afterImg.src = this.resultImageUrl;
            }
            
            this.setState(STATE.RESULT);
        }
        
        showError(message) {
            const errorMsgEl = document.getElementById('vton-error-message');
            if (errorMsgEl) {
                errorMsgEl.textContent = message;
            }
            this.setState(STATE.ERROR);
        }
        
        handleAddToCart() {
            try {
                // Find the product form
                const productForm = document.querySelector('form[action*="/cart/add"]');
                
                if (!productForm) {
                    this.showError('Product form not found on page');
                    return;
                }
                
                // Submit the form directly
                if (productForm instanceof HTMLFormElement) {
                    productForm.submit();
                } else {
                    // If not a standard form, try to find and click the submit button
                    const submitBtn = productForm.querySelector('button[type="submit"]') || 
                                     productForm.querySelector('button') ||
                                     productForm.querySelector('[type="submit"]');
                    if (submitBtn && submitBtn instanceof HTMLElement) {
                        submitBtn.click();
                    }
                }
                
                // Track the add to cart event in background (don't wait)
                const shop = window.Shopify?.shop || this.extractShopFromUrl() || '';
                if (shop && this.productId) {
                    const atcUrl = new URL(\`\${CONFIG.apiBase}/atc\`, window.location.origin);
                    atcUrl.searchParams.set('shop', shop);
                    fetch(atcUrl.toString(), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ product_id: this.productId })
                    }).catch(() => {
                        // Ignore tracking errors
                    });
                }
            } catch (error) {
                console.error('[VTON] Error in handleAddToCart:', error);
                this.showError('Error adding to cart');
            }
        }
        
        downloadResult() {
            if (!this.resultImageUrl) return;
            
            const link = document.createElement('a');
            link.href = this.resultImageUrl;
            link.download = \`vton-result-\${Date.now()}.jpg\`;
            link.target = '_blank';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
        
        updateSliderPosition(x) {
            const slider = document.querySelector('.vton-slider-container');
            if (!slider) return;
            
            const rect = slider.getBoundingClientRect();
            const percentage = Math.max(0, Math.min(100, ((x - rect.left) / rect.width) * 100));
            
            const beforeImg = document.getElementById('vton-result-before');
            const divider = document.getElementById('vton-slider-divider');
            
            if (beforeImg) {
                beforeImg.style.clipPath = \`polygon(0 0, \${percentage}% 0, \${percentage}% 100%, 0 100%)\`;
            }
            if (divider) {
                divider.style.left = \`\${percentage}%\`;
            }
        }
        
        extractShopFromUrl() {
            const match = window.location.hostname.match(/([^.]+)\\.myshopify\\.com/);
            return match ? match[0] : null;
        }
    }
    
    new VTONWidget();
})();
  `;

  return new Response(widgetCode, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
};

