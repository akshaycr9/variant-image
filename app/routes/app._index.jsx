import { useLoaderData } from "@remix-run/react";
import { TitleBar } from "@shopify/app-bridge-react";
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  DataTable,
  Divider,
  InlineStack,
  Layout,
  Link,
  List,
  Page,
  ProgressBar,
  Text,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import {
  ensureMetafieldDefinitions,
  getThemeEmbedStatus,
  getShopSettings,
  listProducts,
} from "../models/variant-images.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  await ensureMetafieldDefinitions(admin);

  const [{ settings }, embedStatus, products] = await Promise.all([
    getShopSettings(admin),
    getThemeEmbedStatus(admin),
    listProducts(admin, { first: 80 }),
  ]);

  const multiVariantProducts = products.filter((product) => product.variantsCount > 1);
  const configuredProducts = multiVariantProducts.filter((product) => product.isConfigured);
  const unconfiguredProducts = multiVariantProducts.filter((product) => !product.isConfigured);

  const setupSteps = [
    {
      key: "theme",
      label: "Activate Variant Images Filter Embed in Theme Editor",
      complete: embedStatus.enabled,
    },
    {
      key: "mapping",
      label: "Assign images to product variants",
      complete: configuredProducts.length > 0,
    },
    {
      key: "settings",
      label: "Review storefront visibility settings",
      complete: true,
    },
  ];

  const completedSteps = setupSteps.filter((step) => step.complete).length;

  return {
    settings,
    embedStatus,
    completedSteps,
    totalSteps: setupSteps.length,
    setupSteps,
    configuredProducts: configuredProducts.slice(0, 8),
    unconfiguredProducts: unconfiguredProducts.slice(0, 12),
  };
};

function ProductCell({ product }) {
  return (
    <InlineStack gap="200" blockAlign="center" wrap={false}>
      {product.image ? (
        <img
          src={`${product.image.url.split("?")[0]}?width=72&height=72&crop=center`}
          alt={product.image.altText || product.title}
          width={36}
          height={36}
          style={{ borderRadius: 6, border: "1px solid #dfe3e8" }}
        />
      ) : null}
      <Text as="span" variant="bodyMd" fontWeight="medium">
        {product.title}
      </Text>
    </InlineStack>
  );
}

export default function DashboardPage() {
  const {
    settings,
    embedStatus,
    completedSteps,
    totalSteps,
    setupSteps,
    configuredProducts,
    unconfiguredProducts,
  } = useLoaderData();

  const completion = Math.round((completedSteps / totalSteps) * 100);

  return (
    <Page>
      <TitleBar title="Variant Images" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <div>
                    <Text as="h2" variant="headingLg">
                      Variant Images &amp; Swatch
                    </Text>
                    <Text as="p" tone="subdued">
                      Show only relevant gallery images for the currently selected variant.
                    </Text>
                  </div>
                  <Button url="/app/configured-products" variant="primary">
                    Assign images
                  </Button>
                </InlineStack>

                {!embedStatus.known ? (
                  <Banner tone="warning" title="Theme embed status unavailable">
                    To detect embed activation automatically, add the <code>read_themes</code> app scope and redeploy.
                  </Banner>
                ) : null}

                <InlineStack gap="300" align="space-between" wrap={false}>
                  <Card roundedAbove="sm" background="bg-surface-secondary">
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Embed
                      </Text>
                      <Badge tone={embedStatus.enabled ? "success" : "attention"}>
                        {embedStatus.enabled ? "Active" : "Inactive"}
                      </Badge>
                    </BlockStack>
                  </Card>
                  <Card roundedAbove="sm" background="bg-surface-secondary">
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Storefront filtering
                      </Text>
                      <Badge tone={settings.enabled ? "success" : "critical"}>
                        {settings.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </BlockStack>
                  </Card>
                  <Card roundedAbove="sm" background="bg-surface-secondary">
                    <BlockStack gap="100">
                      <Text as="p" variant="bodySm" tone="subdued">
                        Configured products
                      </Text>
                      <Text as="p" variant="headingMd">
                        {configuredProducts.length}
                      </Text>
                    </BlockStack>
                  </Card>
                </InlineStack>
                <Divider />

                <Card roundedAbove="sm" background="bg-surface-secondary">
                  <BlockStack gap="300">
                    <Text as="h3" variant="headingMd">
                      Setup guide
                    </Text>
                    <Text as="p" tone="subdued">
                      {completedSteps} / {totalSteps} completed
                    </Text>
                    <ProgressBar progress={completion} size="small" />
                    <List>
                      {setupSteps.map((step) => (
                        <List.Item key={step.key}>
                          <InlineStack gap="200" blockAlign="center">
                            <Badge tone={step.complete ? "success" : "attention"}>
                              {step.complete ? "Done" : "Action needed"}
                            </Badge>
                            <Text as="span">{step.label}</Text>
                          </InlineStack>
                        </List.Item>
                      ))}
                    </List>
                  </BlockStack>
                </Card>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    Variant image status
                  </Text>
                  <Badge tone={settings.enabled ? "success" : "critical"}>
                    {embedStatus.enabled ? "Active" : "Action needed"}
                  </Badge>
                  <Text as="p" tone="subdued">
                    This checks whether the app embed is turned on in your live theme.
                  </Text>
                  <Button url="shopify:admin/themes/current/editor">Open Theme Editor</Button>
                </BlockStack>
              </Card>
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    Theme activation
                  </Text>
                  <Text as="p" tone="subdued">
                    Enable the <strong>Variant Images Filter Embed</strong> in Theme Editor → App embeds.
                  </Text>
                  <Link url="shopify:admin/themes/current/editor" removeUnderline>
                    Open Theme Editor
                  </Link>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h3" variant="headingMd">
                    Configured products
                  </Text>
                  <Button url="/app/configured-products">Show more</Button>
                </InlineStack>

                {configuredProducts.length === 0 ? (
                  <Text as="p" tone="subdued">
                    No mapped products yet.
                  </Text>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text"]}
                    headings={["Product", "Variants mapped", "Assigned images", "Action"]}
                    rows={configuredProducts.map((product) => [
                      <ProductCell key={`${product.id}-cell`} product={product} />,
                      String(product.configuredVariants),
                      String(product.assignedImagesCount),
                      <Link
                        key={`${product.id}-assign`}
                        url={`/app/assign-images?productId=${encodeURIComponent(product.id)}`}
                        removeUnderline
                      >
                        Assign images
                      </Link>,
                    ])}
                  />
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h3" variant="headingMd">
                    Configure new products
                  </Text>
                  <Button url="/app/configured-products" variant="plain">
                    Open catalog
                  </Button>
                </InlineStack>

                {unconfiguredProducts.length === 0 ? (
                  <Text as="p" tone="subdued">
                    All multi-variant products are configured.
                  </Text>
                ) : (
                  <DataTable
                    columnContentTypes={["text", "numeric", "numeric", "text"]}
                    headings={["Product", "Variants", "Media", "Assign"]}
                    rows={unconfiguredProducts.map((product) => [
                      <ProductCell key={`${product.id}-new`} product={product} />,
                      String(product.variantsCount),
                      String(product.mediaCount),
                      <Link
                        key={`${product.id}-new-link`}
                        url={`/app/assign-images?productId=${encodeURIComponent(product.id)}`}
                        removeUnderline
                      >
                        Assign images
                      </Link>,
                    ])}
                  />
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
