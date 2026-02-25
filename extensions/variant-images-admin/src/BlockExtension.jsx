import { useState, useEffect, useCallback } from "react";
import {
  reactExtension,
  useApi,
  AdminBlock,
  BlockStack,
  InlineStack,
  Box,
  Text,
  Heading,
  Button,
  Divider,
  Badge,
  Banner,
  Image,
  Pressable,
  ProgressIndicator,
  Select,
} from "@shopify/ui-extensions-react/admin";

const TARGET = "admin.product-details.block.render";
const METAFIELD_NAMESPACE = "variant_images";
const METAFIELD_KEY = "image_map";

// Strip "gid://shopify/X/" prefix → numeric string
function toNumericId(gid) {
  if (!gid) return "";
  return String(gid).split("/").pop();
}

// Append Shopify CDN thumbnail params so images display at a small consistent size
function thumbUrl(url) {
  if (!url) return url;
  const base = url.split("?")[0];
  return `${base}?width=80&height=80&crop=center`;
}

// ── GraphQL ──────────────────────────────────────────────────────────────────

const PRODUCT_QUERY = `#graphql
  query GetProductForVariantImages($id: ID!) {
    product(id: $id) {
      id
      variants(first: 100) {
        edges {
          node {
            id
            title
          }
        }
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
      metafield(namespace: "${METAFIELD_NAMESPACE}", key: "${METAFIELD_KEY}") {
        id
        value
      }
    }
  }
`;

const SAVE_MUTATION = `#graphql
  mutation SaveVariantImageMap($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id namespace key value }
      userErrors { field message }
    }
  }
`;

// ── Extension Entry ───────────────────────────────────────────────────────────

export default reactExtension(TARGET, () => <VariantImagesBlock />);

// ── Main Component ────────────────────────────────────────────────────────────

function VariantImagesBlock() {
  const { data, adminApiClient, i18n } = useApi(TARGET);
  const productGid = data?.product?.id;

  const [variants, setVariants] = useState([]);
  const [images, setImages] = useState([]);
  // mapping: { "variantNumId": ["imgNumId", ...], ... }
  const [mapping, setMapping] = useState({});
  const [selectedVariantNumId, setSelectedVariantNumId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState(null); // { tone, title }

  // ── Load product data ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!productGid || !adminApiClient) return;

    async function load() {
      setLoading(true);
      setBanner(null);
      try {
        const { data: gqlData, errors } = await adminApiClient.request(
          PRODUCT_QUERY,
          { variables: { id: productGid } }
        );

        if (errors?.length) throw new Error(errors[0].message);

        const product = gqlData?.product;
        if (!product) throw new Error("Product not found");

        const loadedVariants = product.variants.edges.map((e) => e.node);
        const loadedImages = product.images.edges.map((e) => e.node);
        const existingMapping = product.metafield?.value
          ? JSON.parse(product.metafield.value)
          : {};

        setVariants(loadedVariants);
        setImages(loadedImages);
        setMapping(existingMapping);
        if (loadedVariants.length > 0) {
          setSelectedVariantNumId(toNumericId(loadedVariants[0].id));
        }
      } catch (err) {
        setBanner({ tone: "critical", title: i18n.translate("load_error") });
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [productGid, adminApiClient]);

  // ── Toggle an image for the selected variant ──────────────────────────────
  const toggleImage = useCallback(
    (imgNumId) => {
      if (!selectedVariantNumId) return;
      setBanner(null);
      setMapping((prev) => {
        const current = prev[selectedVariantNumId] ?? [];
        const updated = current.includes(imgNumId)
          ? current.filter((id) => id !== imgNumId)
          : [...current, imgNumId];
        const next = { ...prev, [selectedVariantNumId]: updated };
        if (next[selectedVariantNumId].length === 0) {
          delete next[selectedVariantNumId];
        }
        return next;
      });
    },
    [selectedVariantNumId]
  );

  // ── Save mapping as product metafield ─────────────────────────────────────
  const saveMapping = async () => {
    setSaving(true);
    setBanner(null);
    try {
      const { data: gqlData, errors } = await adminApiClient.request(
        SAVE_MUTATION,
        {
          variables: {
            metafields: [
              {
                ownerId: productGid,
                namespace: METAFIELD_NAMESPACE,
                key: METAFIELD_KEY,
                value: JSON.stringify(mapping),
                type: "json",
              },
            ],
          },
        }
      );

      const userErrors = gqlData?.metafieldsSet?.userErrors ?? [];
      if (errors?.length || userErrors.length) {
        const msg =
          userErrors[0]?.message ??
          errors?.[0]?.message ??
          i18n.translate("save_error");
        setBanner({ tone: "critical", title: msg });
      } else {
        setBanner({ tone: "success", title: i18n.translate("save_success") });
      }
    } catch (_err) {
      setBanner({ tone: "critical", title: i18n.translate("save_error") });
    } finally {
      setSaving(false);
    }
  };

  // ── Derived state ──────────────────────────────────────────────────────────
  const selectedImages = selectedVariantNumId
    ? (mapping[selectedVariantNumId] ?? [])
    : [];

  // Build Select options from variants list
  const variantOptions = variants.map((v) => ({
    label: v.title,
    value: toNumericId(v.id),
  }));

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <AdminBlock title={i18n.translate("title")}>
        <BlockStack gap="base" inlineAlignment="center">
          <ProgressIndicator size="large" />
        </BlockStack>
      </AdminBlock>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <AdminBlock title={i18n.translate("title")}>
      <BlockStack gap="base">
        {/* Status banner */}
        {banner && (
          <Banner
            tone={banner.tone}
            title={banner.title}
            dismissible
            onDismiss={() => setBanner(null)}
          />
        )}

        {/* Step 1 — Variant picker */}
        <BlockStack gap="small">
          <Heading size={4}>{i18n.translate("variants_heading")}</Heading>

          {variants.length === 0 ? (
            <Text>{i18n.translate("no_variants")}</Text>
          ) : (
            <BlockStack gap="small">
              <Select
                label={i18n.translate("select_variant_label")}
                options={variantOptions}
                value={selectedVariantNumId ?? ""}
                onChange={(val) => {
                  setSelectedVariantNumId(val);
                  setBanner(null);
                }}
              />
              {selectedImages.length > 0 && (
                <Text>
                  {i18n.translate("images_assigned", {
                    count: selectedImages.length,
                  })}
                </Text>
              )}
            </BlockStack>
          )}
        </BlockStack>

        <Divider />

        {/* Step 2 — Image grid */}
        <BlockStack gap="small">
          <InlineStack inlineAlignment="space-between" blockAlignment="center">
            <Heading size={4}>{i18n.translate("images_heading")}</Heading>
            <Text>{i18n.translate("images_hint")}</Text>
          </InlineStack>

          {images.length === 0 ? (
            <Text>{i18n.translate("no_images")}</Text>
          ) : (
            <InlineStack gap="small">
              {images.map((image) => {
                const imgNumId = toNumericId(image.id);
                const isChecked = selectedImages.includes(imgNumId);

                return (
                  <Pressable
                    key={image.id}
                    onPress={() => toggleImage(imgNumId)}
                  >
                    <BlockStack gap="none" inlineAlignment="center">
                      <Image
                        source={thumbUrl(image.url)}
                        alt={image.altText ?? "Product image"}
                      />
                      {isChecked ? (
                        <Badge tone="success">
                          {i18n.translate("selected_badge")}
                        </Badge>
                      ) : (
                        <Text>{i18n.translate("unselected_badge")}</Text>
                      )}
                    </BlockStack>
                  </Pressable>
                );
              })}
            </InlineStack>
          )}
        </BlockStack>

        <Divider />

        {/* Save */}
        <InlineStack inlineAlignment="end">
          <Button
            variant="primary"
            onPress={saveMapping}
            disabled={saving || variants.length === 0}
          >
            {saving
              ? i18n.translate("saving")
              : i18n.translate("save")}
          </Button>
        </InlineStack>
      </BlockStack>
    </AdminBlock>
  );
}
