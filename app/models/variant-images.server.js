import { toNumericId } from "../utils/ids";

const METAFIELD_NAMESPACE = "variant_images";
const MAP_METAFIELD_KEY = "image_map";
const SETTINGS_METAFIELD_KEY = "settings";

const DEFAULT_SETTINGS = {
  enabled: true,
  allowSharedImages: true,
  hideUnassignedImages: false,
};

async function adminGraphql(admin, query, variables) {
  const response = await admin.graphql(query, variables ? { variables } : undefined);
  const json = await response.json();

  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }

  return json.data;
}

function stripJsonComments(text) {
  if (typeof text !== "string") return text;
  return text.replace(/^\uFEFF?\s*\/\*[\s\S]*?\*\/\s*/u, "");
}

function safeParseJson(value, fallback) {
  if (value == null || value === "") return fallback;

  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeSettings(rawSettings) {
  const input = safeParseJson(rawSettings, {});
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : DEFAULT_SETTINGS.enabled,
    allowSharedImages:
      typeof input.allowSharedImages === "boolean"
        ? input.allowSharedImages
        : DEFAULT_SETTINGS.allowSharedImages,
    hideUnassignedImages:
      typeof input.hideUnassignedImages === "boolean"
        ? input.hideUnassignedImages
        : DEFAULT_SETTINGS.hideUnassignedImages,
  };
}

function normalizeMapping(rawMapping, validVariantIds = [], validImageIds = []) {
  const parsed = safeParseJson(rawMapping, {});

  // Backward compatibility: accept {mapping: {...}} as well as direct object maps.
  const source = parsed && typeof parsed === "object" && parsed.mapping ? parsed.mapping : parsed;

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return {};
  }

  const validVariantSet = validVariantIds.length ? new Set(validVariantIds.map(toNumericId)) : null;
  const validImageSet = validImageIds.length ? new Set(validImageIds.map(toNumericId)) : null;

  const normalized = {};

  for (const [rawVariantId, value] of Object.entries(source)) {
    const variantId = toNumericId(rawVariantId);
    if (!variantId) continue;
    if (validVariantSet && !validVariantSet.has(variantId)) continue;

    const candidateImages = Array.isArray(value)
      ? value
      : Array.isArray(value?.imageIds)
        ? value.imageIds
        : [];

    const imageIds = [...new Set(candidateImages.map(toNumericId).filter(Boolean))].filter((imageId) => {
      return validImageSet ? validImageSet.has(imageId) : true;
    });

    if (imageIds.length > 0) {
      normalized[variantId] = imageIds;
    }
  }

  return normalized;
}

function normalizeOptionMapping(rawMapping, validOptionValues = [], validImageIds = []) {
  const parsed = safeParseJson(rawMapping, {});
  const source = parsed && typeof parsed === "object" && parsed.mapping ? parsed.mapping : parsed;

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return {};
  }

  const validValuesSet = validOptionValues.length ? new Set(validOptionValues) : null;
  const validImageSet = validImageIds.length ? new Set(validImageIds.map(toNumericId)) : null;
  const normalized = {};

  for (const [optionValue, value] of Object.entries(source)) {
    if (!optionValue) continue;
    if (validValuesSet && !validValuesSet.has(optionValue)) continue;

    const candidateImages = Array.isArray(value)
      ? value
      : Array.isArray(value?.imageIds)
        ? value.imageIds
        : [];

    const imageIds = [...new Set(candidateImages.map(toNumericId).filter(Boolean))].filter((imageId) => {
      return validImageSet ? validImageSet.has(imageId) : true;
    });

    if (imageIds.length > 0) {
      normalized[optionValue] = imageIds;
    }
  }

  return normalized;
}

function normalizeProductMapping(rawValue, productOptions = [], variants = [], imageIds = []) {
  const parsed = safeParseJson(rawValue, {});
  const optionsList = Array.isArray(productOptions) ? productOptions : [];
  const fallbackOptionName = optionsList[0]?.name ?? "Option";

  // New format:
  // { mode: "option", optionName: "Color", mapping: { Black: ["123"], Red: ["456"] } }
  if (parsed && typeof parsed === "object" && parsed.mode === "option") {
    const optionName = optionsList.some((option) => option.name === parsed.optionName)
      ? parsed.optionName
      : fallbackOptionName;
    const optionValues = optionsList.find((option) => option.name === optionName)?.values ?? [];
    const mapping = normalizeOptionMapping(parsed.mapping ?? {}, optionValues, imageIds);
    return {
      mode: "option",
      optionName,
      mapping,
    };
  }

  // Backward-compat old variant map:
  // { "variantId": ["imgId"] }
  const legacyVariantMap = normalizeMapping(
    parsed,
    variants.map((variant) => variant.id),
    imageIds,
  );

  const optionName = fallbackOptionName;
  const optionValueByVariant = new Map();
  for (const variant of variants) {
    const selected = (variant.selectedOptions ?? []).find((opt) => opt.name === optionName);
    optionValueByVariant.set(toNumericId(variant.id), selected?.value ?? null);
  }

  const optionMap = {};
  for (const [variantId, imageList] of Object.entries(legacyVariantMap)) {
    const optionValue = optionValueByVariant.get(variantId);
    if (!optionValue) continue;
    optionMap[optionValue] = [...new Set([...(optionMap[optionValue] ?? []), ...imageList])];
  }

  return {
    mode: "option",
    optionName,
    mapping: optionMap,
  };
}

const ENSURE_DEFINITIONS_MUTATION = `#graphql
  mutation EnsureMetafieldDefinitions {
    productDefinition: metafieldDefinitionCreate(definition: {
      name: "Variant Image Map"
      namespace: "${METAFIELD_NAMESPACE}"
      key: "${MAP_METAFIELD_KEY}"
      type: "json"
      ownerType: PRODUCT
      access: { storefront: PUBLIC_READ }
    }) {
      userErrors { message }
    }
    shopDefinition: metafieldDefinitionCreate(definition: {
      name: "Variant Image Settings"
      namespace: "${METAFIELD_NAMESPACE}"
      key: "${SETTINGS_METAFIELD_KEY}"
      type: "json"
      ownerType: SHOP
      access: { storefront: PUBLIC_READ }
    }) {
      userErrors { message }
    }
  }
`;

async function ensureMetafieldDefinitions(admin) {
  try {
    await adminGraphql(admin, ENSURE_DEFINITIONS_MUTATION);
  } catch {
    // Idempotent best-effort.
  }
}

const SHOP_BASIC_QUERY = `#graphql
  query GetShopBasic {
    shop {
      id
    }
  }
`;

const SHOP_SETTINGS_QUERY = `#graphql
  query GetShopSettingsMetafield {
    shop {
      metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${SETTINGS_METAFIELD_KEY}") {
        value
      }
    }
  }
`;

async function getShopSettings(admin) {
  const basic = await adminGraphql(admin, SHOP_BASIC_QUERY);
  const shopId = basic.shop.id;

  try {
    const data = await adminGraphql(admin, SHOP_SETTINGS_QUERY);
    return {
      shopId,
      settings: normalizeSettings(data.shop.metafield?.value),
    };
  } catch {
    return {
      shopId,
      settings: normalizeSettings({}),
    };
  }
}

const SAVE_SHOP_SETTINGS_MUTATION = `#graphql
  mutation SaveShopSettings($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      userErrors { field message }
    }
  }
`;

async function saveShopSettings(admin, shopId, settings) {
  const sanitized = normalizeSettings(settings);
  const data = await adminGraphql(admin, SAVE_SHOP_SETTINGS_MUTATION, {
    metafields: [
      {
        ownerId: shopId,
        namespace: METAFIELD_NAMESPACE,
        key: SETTINGS_METAFIELD_KEY,
        type: "json",
        value: JSON.stringify(sanitized),
      },
    ],
  });

  const userErrors = data.metafieldsSet?.userErrors ?? [];
  if (userErrors.length) {
    throw new Error(userErrors[0].message);
  }

  return sanitized;
}

const MAIN_THEME_SETTINGS_QUERY = `#graphql
  query MainThemeSettingsData {
    themes(first: 1, roles: [MAIN]) {
      nodes {
        id
        name
        files(first: 1, filenames: ["config/settings_data.json"]) {
          nodes {
            body {
              ... on OnlineStoreThemeFileBodyText {
                content
              }
            }
          }
        }
      }
    }
  }
`;

function isVariantImagesEmbedEnabledFromSettingsData(rawContent) {
  const cleaned = stripJsonComments(rawContent);
  const parsed = safeParseJson(cleaned, null);
  const blocks = parsed?.current?.blocks;
  if (!blocks || typeof blocks !== "object") return false;

  return Object.values(blocks).some((block) => {
    if (!block || typeof block !== "object") return false;
    if (block.disabled === true) return false;
    const type = String(block.type || "");
    return type.includes("/variant-images-embed/");
  });
}

async function getThemeEmbedStatus(admin) {
  try {
    const data = await adminGraphql(admin, MAIN_THEME_SETTINGS_QUERY);
    const mainTheme = data?.themes?.nodes?.[0];
    const content = mainTheme?.files?.nodes?.[0]?.body?.content;
    const enabled = isVariantImagesEmbedEnabledFromSettingsData(content);

    return {
      known: typeof content === "string",
      enabled,
      themeName: mainTheme?.name ?? null,
    };
  } catch {
    return {
      known: false,
      enabled: false,
      themeName: null,
    };
  }
}

const PRODUCTS_QUERY = `#graphql
  query ListProductsForVariantImages($first: Int!, $query: String) {
    products(first: $first, query: $query, sortKey: UPDATED_AT, reverse: true) {
      edges {
        node {
          id
          title
          handle
          updatedAt
          onlineStoreUrl
          images(first: 8) {
            edges {
              node {
                id
                url
                altText
              }
            }
          }
          variants(first: 100) {
            edges {
              node {
                id
                title
              }
            }
          }
          metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${MAP_METAFIELD_KEY}") {
            value
          }
        }
      }
    }
  }
`;

function summarizeProduct(node) {
  const variants = node.variants.edges.map((edge) => edge.node);
  const images = node.images.edges.map((edge) => edge.node);
  const parsed = safeParseJson(node.metafield?.value, {});
  const mappingTable =
    parsed && typeof parsed === "object" && parsed.mode === "option"
      ? safeParseJson(parsed.mapping, {})
      : safeParseJson(parsed, {});

  const configuredVariants =
    mappingTable && typeof mappingTable === "object"
      ? Object.keys(mappingTable).length
      : 0;
  const assignedImageIds = new Set(
    mappingTable && typeof mappingTable === "object" ? Object.values(mappingTable).flat() : [],
  );

  return {
    id: node.id,
    numericId: toNumericId(node.id),
    title: node.title,
    handle: node.handle,
    updatedAt: node.updatedAt,
    onlineStoreUrl: node.onlineStoreUrl,
    image: images[0] ?? null,
    mediaCount: images.length,
    variantsCount: variants.length,
    configuredVariants,
    assignedImagesCount: assignedImageIds.size,
    isConfigured: configuredVariants > 0,
  };
}

async function listProducts(admin, { first = 50, query = "" } = {}) {
  const data = await adminGraphql(admin, PRODUCTS_QUERY, { first, query: query || null });
  return data.products.edges.map((edge) => summarizeProduct(edge.node));
}

const PRODUCT_DETAIL_QUERY = `#graphql
  query GetProductForAssignPage($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      onlineStoreUrl
      options {
        id
        name
        values
      }
      images(first: 250) {
        edges {
          node {
            id
            url
            altText
          }
        }
      }
      variants(first: 100) {
        edges {
          node {
            id
            title
            selectedOptions {
              name
              value
            }
          }
        }
      }
      metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${MAP_METAFIELD_KEY}") {
        value
      }
    }
  }
`;

async function getProductForAssignment(admin, productId) {
  const data = await adminGraphql(admin, PRODUCT_DETAIL_QUERY, { id: productId });
  const product = data.product;

  if (!product) return null;

  const images = product.images.edges.map((edge) => edge.node);
  const variants = product.variants.edges.map((edge) => edge.node);

  const mappingData = normalizeProductMapping(
    product.metafield?.value,
    product.options,
    variants,
    images.map((image) => image.id),
  );

  return {
    id: product.id,
    numericId: toNumericId(product.id),
    title: product.title,
    handle: product.handle,
    onlineStoreUrl: product.onlineStoreUrl,
    options: product.options,
    images,
    variants,
    mappingMode: mappingData.mode,
    optionName: mappingData.optionName,
    mapping: mappingData.mapping,
  };
}

const SAVE_PRODUCT_MAPPING_MUTATION = `#graphql
  mutation SaveVariantImageMapping($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      userErrors { field message }
    }
  }
`;

async function saveProductMapping(admin, productId, mapping) {
  const data = await adminGraphql(admin, SAVE_PRODUCT_MAPPING_MUTATION, {
    metafields: [
      {
        ownerId: productId,
        namespace: METAFIELD_NAMESPACE,
        key: MAP_METAFIELD_KEY,
        type: "json",
        value: JSON.stringify(mapping),
      },
    ],
  });

  const userErrors = data.metafieldsSet?.userErrors ?? [];
  if (userErrors.length) {
    throw new Error(userErrors[0].message);
  }
}

export {
  DEFAULT_SETTINGS,
  METAFIELD_NAMESPACE,
  MAP_METAFIELD_KEY,
  SETTINGS_METAFIELD_KEY,
  toNumericId,
  normalizeSettings,
  normalizeMapping,
  normalizeOptionMapping,
  normalizeProductMapping,
  ensureMetafieldDefinitions,
  getShopSettings,
  saveShopSettings,
  getThemeEmbedStatus,
  listProducts,
  getProductForAssignment,
  saveProductMapping,
};
