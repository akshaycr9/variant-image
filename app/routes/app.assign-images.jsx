import { useEffect, useMemo, useState } from "react";
import { useFetcher, useLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
import { json } from "@remix-run/node";
import {
  Badge,
  BlockStack,
  Button,
  ButtonGroup,
  Card,
  EmptyState,
  InlineStack,
  Modal,
  Page,
  Scrollable,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import {
  ensureMetafieldDefinitions,
  getProductForAssignment,
  getShopSettings,
  listProducts,
  normalizeOptionMapping,
  saveProductMapping,
} from "../models/variant-images.server";
import { toNumericId } from "../utils/ids";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");

  await ensureMetafieldDefinitions(admin);

  const [{ settings }, products] = await Promise.all([
    getShopSettings(admin),
    listProducts(admin, { first: 80 }),
  ]);

  const candidateProducts = products.filter((product) => product.variantsCount > 1);
  const selectedProductId = productId || candidateProducts[0]?.id || null;

  if (!selectedProductId) {
    return {
      product: null,
      products: [],
      settings,
    };
  }

  const product = await getProductForAssignment(admin, selectedProductId);

  if (!product) {
    return {
      product: null,
      products: candidateProducts,
      settings,
    };
  }

  return {
    product,
    products: candidateProducts,
    settings,
  };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();

  const intent = formData.get("intent");
  const productId = formData.get("productId");
  const optionName = formData.get("optionName");
  const rawMapping = formData.get("mapping");

  if (typeof productId !== "string" || !productId) {
    return json({ ok: false, error: "Missing product id" }, { status: 400 });
  }

  const product = await getProductForAssignment(admin, productId);
  if (!product) {
    return json({ ok: false, error: "Product not found" }, { status: 404 });
  }

  const resolvedOptionName =
    typeof optionName === "string" && product.options.some((opt) => opt.name === optionName)
      ? optionName
      : product.options[0]?.name;

  if (!resolvedOptionName) {
    return json({ ok: false, error: "Product has no options" }, { status: 400 });
  }

  const optionValues = product.options.find((opt) => opt.name === resolvedOptionName)?.values ?? [];

  const mapping =
    intent === "reset"
      ? {}
      : normalizeOptionMapping(rawMapping, optionValues, product.images.map((image) => image.id));

  await saveProductMapping(admin, product.id, {
    mode: "option",
    optionName: resolvedOptionName,
    mapping,
  });

  return json({ ok: true, mapping, intent, optionName: resolvedOptionName });
};

function OptionValueCard({ value, imageCount, onAssign }) {
  return (
    <Card>
      <InlineStack align="space-between" blockAlign="center">
        <Text as="h3" variant="headingSm">
          {value}
        </Text>
        <InlineStack gap="200" blockAlign="center">
          <Badge tone={imageCount > 0 ? "success" : "attention"}>
            {imageCount > 0 ? `${imageCount} assigned` : "No images"}
          </Badge>
          <Button onClick={onAssign}>Assign images</Button>
        </InlineStack>
      </InlineStack>
    </Card>
  );
}

export default function AssignImagesPage() {
  const { product, products, settings } = useLoaderData();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [selectedOptionName, setSelectedOptionName] = useState(product?.optionName ?? "");
  const [mapping, setMapping] = useState(product?.mapping ?? {});
  const [activeOptionValue, setActiveOptionValue] = useState(null);
  const [imageSearch, setImageSearch] = useState("");
  const [showAssignedOnly, setShowAssignedOnly] = useState(false);

  const isSaving = fetcher.state !== "idle";

  const selectedOption = useMemo(() => {
    return product?.options.find((opt) => opt.name === selectedOptionName) ?? null;
  }, [product, selectedOptionName]);

  const activeOptionImages = activeOptionValue ? mapping[activeOptionValue] ?? [] : [];

  const filteredImages = useMemo(() => {
    const q = imageSearch.trim().toLowerCase();
    const sourceImages = (product?.images ?? []).filter((image) => {
      if (!showAssignedOnly || !activeOptionValue) return true;
      return (mapping[activeOptionValue] ?? []).includes(toNumericId(image.id));
    });

    if (!q) return sourceImages;

    return sourceImages.filter((image) => {
      return image.altText?.toLowerCase().includes(q) || image.url.toLowerCase().includes(q);
    });
  }, [activeOptionValue, imageSearch, mapping, product, showAssignedOnly]);

  useEffect(() => {
    setSelectedOptionName(product?.optionName ?? product?.options[0]?.name ?? "");
    setMapping(product?.mapping ?? {});
    setActiveOptionValue(null);
    setImageSearch("");
    setShowAssignedOnly(false);
  }, [product]);

  if (!product) {
    return (
      <Page title="Assign images" backAction={{ content: "Configured products", url: "/app/configured-products" }}>
        <Card>
          <EmptyState
            heading="No multi-variant products found"
            action={{ content: "Go to configured products", url: "/app/configured-products" }}
            image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
          >
            <p>Create or import products with multiple variants to start assigning images.</p>
          </EmptyState>
        </Card>
      </Page>
    );
  }

  const optionValues = selectedOption?.values ?? [];

  return (
    <Page
      title="Assign images"
      subtitle={product.title}
      backAction={{ content: "Configured products", url: "/app/configured-products" }}
      primaryAction={{
        content: isSaving ? "Saving..." : "Save",
        disabled: isSaving,
        onAction: () => {
          fetcher.submit(
            {
              intent: "save",
              productId: product.id,
              optionName: selectedOptionName,
              mapping: JSON.stringify(mapping),
            },
            { method: "post" },
          );
        },
      }}
      secondaryActions={[
        {
          content: "Reset",
          disabled: isSaving,
          onAction: () => {
            setMapping({});
            fetcher.submit(
              { intent: "reset", productId: product.id, optionName: selectedOptionName, mapping: "{}" },
              { method: "post" },
            );
          },
        },
      ]}
    >
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  {product.title}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Select one variant type (for example Color) and assign images only to its values.
                </Text>
              </BlockStack>
              <ButtonGroup>
                <Button
                  variant="plain"
                  url={product.onlineStoreUrl || undefined}
                  target="_blank"
                  disabled={!product.onlineStoreUrl}
                >
                  View on store
                </Button>
                <Select
                  label="Select another product"
                  labelHidden
                  options={products.map((p) => ({ label: p.title, value: p.id }))}
                  value={product.id}
                  onChange={(value) => {
                    const next = new URLSearchParams(searchParams);
                    next.set("productId", value);
                    navigate(`/app/assign-images?${next.toString()}`);
                  }}
                />
              </ButtonGroup>
            </InlineStack>

            <Select
              label="Variant type to map"
              options={product.options.map((opt) => ({ label: opt.name, value: opt.name }))}
              value={selectedOptionName}
              onChange={(value) => {
                setSelectedOptionName(value);
                setMapping({});
                setActiveOptionValue(null);
              }}
            />

            <InlineStack gap="200" blockAlign="center">
              <Badge tone={settings.allowSharedImages ? "success" : "warning"}>
                {settings.allowSharedImages
                  ? "Same image can be assigned to multiple values"
                  : "Image can only belong to one value"}
              </Badge>
              <Badge tone={settings.hideUnassignedImages ? "warning" : "info"}>
                {settings.hideUnassignedImages ? "Unassigned images are hidden" : "Unassigned images remain visible"}
              </Badge>
            </InlineStack>
          </BlockStack>
        </Card>

        <BlockStack gap="300">
          {optionValues.map((value) => {
            const imageIds = mapping[value] ?? [];
            return (
              <OptionValueCard
                key={value}
                value={value}
                imageCount={imageIds.length}
                onAssign={() => {
                  setActiveOptionValue(value);
                  setImageSearch("");
                  setShowAssignedOnly(false);
                }}
              />
            );
          })}
        </BlockStack>

        {fetcher.data?.ok ? (
          <Card>
            <Text as="p" tone="success">
              {fetcher.data.intent === "reset" ? "Mappings reset." : "Mappings saved successfully."}
            </Text>
          </Card>
        ) : null}

        {fetcher.data?.error ? (
          <Card>
            <Text as="p" tone="critical">{fetcher.data.error}</Text>
          </Card>
        ) : null}
      </BlockStack>

      <Modal
        open={Boolean(activeOptionValue)}
        onClose={() => setActiveOptionValue(null)}
        title={activeOptionValue ? `Manage images · ${selectedOptionName}: ${activeOptionValue}` : "Manage images"}
        primaryAction={{
          content: "Confirm selection",
          onAction: () => setActiveOptionValue(null),
        }}
        secondaryActions={[
          {
            content: showAssignedOnly ? "Show all images" : "Show assigned images",
            onAction: () => setShowAssignedOnly((prev) => !prev),
          },
          {
            content: "Select all",
            onAction: () => {
              if (!activeOptionValue) return;
              const allIds = (product.images ?? []).map((image) => toNumericId(image.id));

              if (!settings.allowSharedImages) {
                const next = { ...mapping };
                for (const key of Object.keys(next)) {
                  if (key !== activeOptionValue) {
                    next[key] = next[key].filter((id) => !allIds.includes(id));
                  }
                }
                next[activeOptionValue] = allIds;
                setMapping(next);
                return;
              }

              setMapping((prev) => ({ ...prev, [activeOptionValue]: allIds }));
            },
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <TextField
              label="Search images"
              value={imageSearch}
              onChange={setImageSearch}
              autoComplete="off"
              placeholder="Search by alt text or file URL"
            />

            <Scrollable style={{ maxHeight: 420 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                  gap: 12,
                }}
              >
                {filteredImages.map((image) => {
                  const imageId = toNumericId(image.id);
                  const selected = activeOptionImages.includes(imageId);

                  return (
                    <button
                      key={image.id}
                      type="button"
                      onClick={() => {
                        if (!activeOptionValue) return;

                        setMapping((prev) => {
                          const current = prev[activeOptionValue] ?? [];
                          const isSelected = current.includes(imageId);

                          let nextValueImages;
                          if (isSelected) {
                            nextValueImages = current.filter((id) => id !== imageId);
                          } else {
                            nextValueImages = [...current, imageId];
                          }

                          const next = {
                            ...prev,
                            [activeOptionValue]: nextValueImages,
                          };

                          if (!settings.allowSharedImages && !isSelected) {
                            for (const key of Object.keys(next)) {
                              if (key === activeOptionValue) continue;
                              next[key] = (next[key] ?? []).filter((id) => id !== imageId);
                            }
                          }

                          return next;
                        });
                      }}
                      style={{
                        border: selected ? "3px solid #111" : "1px solid #dfe3e8",
                        borderRadius: 8,
                        background: "#fff",
                        cursor: "pointer",
                        padding: 6,
                        textAlign: "left",
                      }}
                    >
                      <img
                        src={`${image.url.split("?")[0]}?width=240&height=240&crop=center`}
                        alt={image.altText || "Product image"}
                        width="100%"
                        style={{ borderRadius: 6, aspectRatio: "1/1", objectFit: "cover" }}
                      />
                    </button>
                  );
                })}
              </div>
            </Scrollable>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
