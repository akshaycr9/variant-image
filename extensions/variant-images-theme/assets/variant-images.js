/**
 * Variant Images Filter – Storefront Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads the variant→image mapping from the embedded JSON block, then shows
 * only the gallery items that are mapped to the selected variant.
 *
 * Compatible with: Dawn, Craft, Sense, Refresh, Taste, Debut, and most
 * themes that use standard Shopify image markup.
 */
(function () {
  "use strict";

  if (window.__variantImagesFilterInitialized) return;
  window.__variantImagesFilterInitialized = true;

  // ── Read embedded data ──────────────────────────────────────────────────────
  const dataEl = document.getElementById("variant-image-data");
  if (!dataEl) return;

  let config;
  try {
    config = JSON.parse(dataEl.textContent);
  } catch {
    return;
  }

  let {
    mapping,
    imageUrls,
    initialVariantId,
    settings,
    optionNames,
    variantOptions,
  } = config;
  if (!mapping || !imageUrls) return;
  if (typeof mapping === "string") {
    try {
      mapping = JSON.parse(mapping);
    } catch {
      return;
    }
  }
  if (typeof settings === "string") {
    try {
      settings = JSON.parse(settings);
    } catch {
      settings = null;
    }
  }
  const normalizedSettings = {
    enabled: settings?.enabled ?? true,
    hideUnassignedImages: settings?.hideUnassignedImages ?? false,
  };
  if (!normalizedSettings.enabled) return;

  let mappingMode = "variant";
  let mappedOptionName = null;
  let mappingTable = mapping;
  if (mapping && typeof mapping === "object" && mapping.mode === "option") {
    mappingMode = "option";
    mappedOptionName = mapping.optionName || null;
    mappingTable = mapping.mapping || {};
  }
  if (!mappingTable || typeof mappingTable !== "object") return;

  // ── Build filename → imgNumId lookup ─────────────────────────────────────
  // Shopify CDN URLs end in the original filename, sometimes with a size
  // suffix like _800x.jpg. Strip that to get a stable match key.
  function baseFilename(url) {
    if (!url) return "";
    const path = url.split("?")[0];
    const name = path.split("/").pop() || "";
    // Remove Shopify size suffix: _800x.jpg / _800x600.jpg / _x600.jpg
    return name.replace(/_\d*x\d*\.([^.]+)$/, ".$1");
  }

  // Map: cleaned filename → image numeric ID
  const filenameToId = {};
  for (const [imgNumId, src] of Object.entries(imageUrls)) {
    filenameToId[baseFilename(src)] = imgNumId;
  }

  // ── Gallery selectors (ordered most → least specific) ──────────────────────
  // We try each until we find items that contain img elements.
  const GALLERY_SELECTORS = [
    // Dawn / Craft / Sense / Refresh / Taste (OS 2.0)
    ".product__media-list .product__media-item",
    ".product__media-list > li",
    // Debut
    ".product-single__photos .product-single__photo-wrapper",
    // Narrative
    ".slideshow__slide",
    // Supply / Simple / Pop
    ".product-photos .product-photo-container",
    // Generic OS 2.0
    "[data-media-id]",
    // Fallback
    ".product-gallery li",
    ".product-images li",
  ];

  const THUMBNAIL_SELECTORS = [
    // Dawn thumbnails
    ".thumbnail-list .thumbnail-list__item",
    ".product__media-list--thumbnail-preview li",
    // Generic
    ".product-thumbnails li",
    ".product-single__thumbnails li",
  ];

  function findGalleryItems() {
    for (const sel of GALLERY_SELECTORS) {
      const items = Array.from(document.querySelectorAll(sel));
      if (items.length > 0) return items;
    }
    return [];
  }

  function getImgSrc(el) {
    const img = el.querySelector("img");
    return img ? img.getAttribute("src") || img.currentSrc || "" : "";
  }

  // ── Core filter function ───────────────────────────────────────────────────
  function filterGallery(variantId) {
    if (!variantId) return;

    const variantKey = String(variantId);
    let mappingKey = variantKey;

    if (mappingMode === "option" && mappedOptionName && Array.isArray(optionNames)) {
      const optionIndex = optionNames.indexOf(mappedOptionName);
      if (optionIndex >= 0) {
        const selectedOptionsForVariant = variantOptions?.[variantKey];
        mappingKey = selectedOptionsForVariant?.[optionIndex] || "__unknown__";
      }
    }

    const allowedIds = mappingTable[mappingKey];
    const allAssignedImageIds = new Set(Object.values(mappingTable).flat());

    // No mapping for selected variant → show none (requested fallback)
    if (!allowedIds) {
      showNone();
      return;
    }

    const allowedSet = new Set(allowedIds);
    const galleryItems = findGalleryItems();

    if (galleryItems.length === 0) return;

    let firstVisible = null;

    galleryItems.forEach((item) => {
      const src = getImgSrc(item);
      const filename = baseFilename(src);
      const imgId = filenameToId[filename];
      let visible = false;
      if (imgId && allowedSet.has(imgId)) {
        visible = true;
      } else if (
        imgId &&
        !normalizedSettings.hideUnassignedImages &&
        !allAssignedImageIds.has(imgId)
      ) {
        visible = true;
      }

      setVisible(item, visible);
      if (visible && !firstVisible) firstVisible = item;
    });

    // Mirror visibility on thumbnail strips
    const thumbItems = THUMBNAIL_SELECTORS.flatMap((sel) =>
      Array.from(document.querySelectorAll(sel))
    );
    thumbItems.forEach((thumb) => {
      const src = getImgSrc(thumb);
      const filename = baseFilename(src);
      const imgId = filenameToId[filename];
      let visible = false;
      if (imgId && allowedSet.has(imgId)) {
        visible = true;
      } else if (
        imgId &&
        !normalizedSettings.hideUnassignedImages &&
        !allAssignedImageIds.has(imgId)
      ) {
        visible = true;
      }
      setVisible(thumb, visible);
    });

    // If the currently-active slide is now hidden, activate the first visible one
    if (firstVisible) activateFirstVisible(firstVisible);
  }

  function setVisible(el, visible) {
    if (visible) {
      el.style.removeProperty("display");
      el.removeAttribute("aria-hidden");
      el.classList.remove("vi--hidden");
    } else {
      el.style.display = "none";
      el.setAttribute("aria-hidden", "true");
      el.classList.add("vi--hidden");
    }
  }

  function showNone() {
    findGalleryItems().forEach((el) => setVisible(el, false));
    THUMBNAIL_SELECTORS.flatMap((sel) =>
      Array.from(document.querySelectorAll(sel))
    ).forEach((el) => setVisible(el, false));
  }

  // Scroll / click the first visible gallery item when the active one is hidden
  function activateFirstVisible(firstVisible) {
    // Dawn uses a media-gallery with a "selected" data attribute
    const selectedAttrItem = document.querySelector(
      ".product__media-item[aria-current='true']"
    );
    if (selectedAttrItem && selectedAttrItem.classList.contains("vi--hidden")) {
      firstVisible.click?.();
      firstVisible.querySelector("button, a")?.click?.();
    }
  }

  // ── Variant change detection ───────────────────────────────────────────────

  function getCurrentVariantId() {
    // 1. URL ?variant= param
    const param = new URLSearchParams(window.location.search).get("variant");
    if (param) return param;

    // 2. Hidden form input
    const input = document.querySelector(
      'form[action*="/cart/add"] input[name="id"],' +
      'form.product-form input[name="id"],' +
      'input[name="id"][form]'
    );
    if (input?.value) return input.value;

    // 3. Shopify global JS (older themes)
    const meta = window.ShopifyAnalytics?.meta;
    if (meta?.selectedVariantId) return String(meta.selectedVariantId);

    return null;
  }

  let lastVariantId = null;

  function handleVariantChange(variantId) {
    if (!variantId || variantId === lastVariantId) return;
    lastVariantId = variantId;
    filterGallery(variantId);
  }

  function init() {
    // Apply initial filter
    const initial = initialVariantId || getCurrentVariantId();
    if (initial) handleVariantChange(String(initial));

    // ── Event listeners ───────────────────────────────────────────────────

    // 1. Native "variant:changed" event (Dawn and many modern themes)
    document.addEventListener("variant:changed", (e) => {
      const id = e.detail?.variant?.id;
      if (id) handleVariantChange(String(id));
    });

    // 2. MutationObserver on the hidden id input (most themes)
    const idInput = document.querySelector('input[name="id"]');
    if (idInput) {
      new MutationObserver(() => {
        if (idInput.value) handleVariantChange(idInput.value);
      }).observe(idInput, { attributes: true, attributeFilter: ["value"] });

      idInput.addEventListener("change", () => {
        if (idInput.value) handleVariantChange(idInput.value);
      });
    }

    // 3. URL change (themes that push ?variant= to history)
    let lastUrl = location.href;
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        const vid = getCurrentVariantId();
        if (vid) handleVariantChange(vid);
      }
    }).observe(document.body, { childList: true, subtree: true });

    window.addEventListener("popstate", () => {
      const vid = getCurrentVariantId();
      if (vid) handleVariantChange(vid);
    });

    // 4. Shopify section:load (theme preview / Customize editor reloads)
    document.addEventListener("shopify:section:load", () => {
      const vid = getCurrentVariantId();
      if (vid) filterGallery(vid);
    });
  }

  // Boot after DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    // Slight delay so theme JS sets initial variant state first
    setTimeout(init, 50);
  }
})();
