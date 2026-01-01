/**
 * ==========================================
 * APP PROXY - WIDGET JAVASCRIPT
 * ==========================================
 * 
 * Route: GET /apps/tryon/widget.js
 * Serves the widget JavaScript for the storefront.
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
            productImage: '.product__media img',
            addToCartButton: 'form[action*="/cart/add"] button[type="submit"]'
        }
    };
    
    class VTONWidget {
        constructor() {
            this.shop = window.Shopify?.shop || '';
            this.productId = this.extractProductId();
            this.productImage = this.getProductImage();
            this.init();
        }
        
        extractProductId() {
            const meta = document.querySelector('meta[property="og:url"]');
            if (meta) {
                const match = meta.content.match(/products\\/([^?]+)/);
                return match ? match[1] : null;
            }
            return null;
        }
        
        getProductImage() {
            const img = document.querySelector(CONFIG.selectors.productImage);
            return img ? img.src : null;
        }
        
        init() {
            if (!this.productId || !this.productImage) {
                console.log('[VTON] Not a product page, skipping...');
                return;
            }
            
            window.addEventListener('DOMContentLoaded', () => {
                this.injectButton();
            });
        }
        
        injectButton() {
            const addToCartBtn = document.querySelector(CONFIG.selectors.addToCartButton);
            if (!addToCartBtn) return;
            
            const vtonBtn = document.createElement('button');
            vtonBtn.type = 'button';
            vtonBtn.className = 'vton-button';
            vtonBtn.innerHTML = \`
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2"/>
                    <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2"/>
                    <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2"/>
                </svg>
                <span>Try It On</span>
            \`;
            vtonBtn.onclick = () => this.openModal();
            
            addToCartBtn.parentElement.insertAdjacentElement('afterend', vtonBtn);
            this.injectStyles();
        }
        
        injectStyles() {
            if (document.getElementById('vton-styles')) return;
            
            const styles = document.createElement('style');
            styles.id = 'vton-styles';
            styles.textContent = \`
                .vton-button {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    width: 100%;
                    padding: 12px 24px;
                    margin-top: 12px;
                    background: #000;
                    color: #fff;
                    border: none;
                    border-radius: 4px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    justify-content: center;
                }
                .vton-button:hover {
                    background: #333;
                    transform: translateY(-1px);
                }
                .vton-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.8);
                    display: none;
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                }
                .vton-modal.active {
                    display: flex;
                }
                .vton-modal-content {
                    background: white;
                    border-radius: 12px;
                    padding: 32px;
                    max-width: 600px;
                    width: 90%;
                    max-height: 90vh;
                    overflow-y: auto;
                }
            \`;
            document.head.appendChild(styles);
        }
        
        openModal() {
            let modal = document.getElementById('vton-modal');
            if (!modal) {
                modal = this.createModal();
                document.body.appendChild(modal);
            }
            modal.classList.add('active');
        }
        
        createModal() {
            const modal = document.createElement('div');
            modal.id = 'vton-modal';
            modal.className = 'vton-modal';
            modal.innerHTML = \`
                <div class="vton-modal-content">
                    <h2>Virtual Try-On</h2>
                    <div class="vton-upload-area">
                        <label for="vton-photo-upload">
                            <div class="upload-box">
                                <svg width="48" height="48" viewBox="0 0 24 24">
                                    <path d="M12 4L12 20M4 12L20 12" stroke="#666" stroke-width="2"/>
                                </svg>
                                <p>Upload your photo</p>
                            </div>
                        </label>
                        <input type="file" id="vton-photo-upload" accept="image/*" style="display:none;">
                    </div>
                    <div id="vton-preview" style="display:none;">
                        <img id="vton-preview-img" src="" alt="Preview">
                    </div>
                    <button id="vton-generate-btn" class="vton-button" disabled>
                        Generate Try-On
                    </button>
                    <div id="vton-result" style="display:none;">
                        <img id="vton-result-img" src="" alt="Result">
                    </div>
                    <button class="vton-close" onclick="document.getElementById('vton-modal').classList.remove('active')">
                        Close
                    </button>
                </div>
            \`;
            
            const uploadInput = modal.querySelector('#vton-photo-upload');
            const generateBtn = modal.querySelector('#vton-generate-btn');
            
            uploadInput.addEventListener('change', (e) => this.handlePhotoUpload(e));
            generateBtn.addEventListener('click', () => this.generateTryOn());
            
            return modal;
        }
        
        handlePhotoUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                this.userPhoto = e.target.result;
                
                const preview = document.getElementById('vton-preview');
                const previewImg = document.getElementById('vton-preview-img');
                previewImg.src = e.target.result;
                preview.style.display = 'block';
                
                document.getElementById('vton-generate-btn').disabled = false;
            };
            reader.readAsDataURL(file);
        }
        
        async generateTryOn() {
            const btn = document.getElementById('vton-generate-btn');
            btn.disabled = true;
            btn.textContent = 'Generating...';
            
            try {
                const personBase64 = this.userPhoto.split(',')[1];
                
                const response = await fetch(\`\${CONFIG.apiBase}/generate\`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        person_image_base64: personBase64,
                        clothing_url: this.productImage,
                        product_id: this.productId
                    })
                });
                
                if (!response.ok) {
                    throw new Error('Generation failed');
                }
                
                const data = await response.json();
                
                const resultDiv = document.getElementById('vton-result');
                const resultImg = document.getElementById('vton-result-img');
                resultImg.src = data.result_image_url;
                resultDiv.style.display = 'block';
                
                btn.textContent = 'Generate Another';
                btn.disabled = false;
                
            } catch (error) {
                console.error('[VTON] Error:', error);
                alert('An error occurred. Please try again.');
                btn.textContent = 'Generate Try-On';
                btn.disabled = false;
            }
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

