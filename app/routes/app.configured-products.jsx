import { useLoaderData, useSearchParams } from "@remix-run/react";
import { TitleBar } from "@shopify/app-bridge-react";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  DataTable,
  EmptySearchResult,
  Filters,
  InlineStack,
  Page,
  Text,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { ensureMetafieldDefinitions, listProducts } from "../models/variant-images.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";

  await ensureMetafieldDefinitions(admin);

  const products = await listProducts(admin, {
    first: 80,
    query: query ? `title:*${query.replace(/\s+/g, "*")}*` : "",
  });

  const multiVariantProducts = products.filter((product) => product.variantsCount > 1);

  return {
    query,
    configured: multiVariantProducts.filter((product) => product.isConfigured),
    unconfigured: multiVariantProducts.filter((product) => !product.isConfigured),
  };
};

function ProductCell({ product }) {
  return (
    <InlineStack gap="200" blockAlign="center" wrap={false}>
      {product.image ? (
        <img
          src={`${product.image.url.split("?")[0]}?width=72&height=72&crop=center`}
          alt={product.image.altText || product.title}
          width={40}
          height={40}
          style={{ borderRadius: 6, border: "1px solid #dfe3e8" }}
        />
      ) : null}
      <div>
        <Text as="span" variant="bodyMd" fontWeight="medium">
          {product.title}
        </Text>
        <Text as="p" variant="bodySm" tone="subdued">
          Updated {new Date(product.updatedAt).toLocaleDateString()}
        </Text>
      </div>
    </InlineStack>
  );
}

function ProductsTable({ products, isConfigured }) {
  if (products.length === 0) {
    return (
      <EmptySearchResult
        title={isConfigured ? "No configured products" : "No products to configure"}
        description={
          isConfigured
            ? "Assign images to a product variant to see it here."
            : "No multi-variant products matched your search."
        }
        withIllustration
      />
    );
  }

  return (
    <DataTable
      columnContentTypes={["text", "numeric", "numeric", "text", "text"]}
      headings={["Product", "Variants", "Media", "Status", "Action"]}
      rows={products.map((product) => [
        <ProductCell key={`${product.id}-title`} product={product} />,
        String(product.variantsCount),
        String(product.mediaCount),
        <Badge
          key={`${product.id}-status`}
          tone={product.isConfigured ? "success" : "attention"}
        >
          {product.isConfigured ? "Active" : "Action needed"}
        </Badge>,
        <Button
          key={`${product.id}-button`}
          url={`/app/assign-images?productId=${encodeURIComponent(product.id)}`}
          variant={product.isConfigured ? "secondary" : "primary"}
          size="slim"
        >
          Assign images
        </Button>,
      ])}
    />
  );
}

export default function ConfiguredProductsPage() {
  const { configured, unconfigured, query } = useLoaderData();
  const [searchParams, setSearchParams] = useSearchParams();

  return (
    <Page
      title="Configured products"
      backAction={{ content: "Overview", url: "/app" }}
      primaryAction={{
        content: "Configure new product",
        url: "/app/configured-products",
      }}
    >
      <TitleBar title="Configured products" />

      <Card>
        <BlockStack gap="400">
          <Filters
            queryValue={query}
            onQueryChange={(value) => {
              const next = new URLSearchParams(searchParams);
              if (value) {
                next.set("q", value);
              } else {
                next.delete("q");
              }
              setSearchParams(next, { replace: true });
            }}
            onQueryClear={() => {
              const next = new URLSearchParams(searchParams);
              next.delete("q");
              setSearchParams(next, { replace: true });
            }}
            filters={[]}
            appliedFilters={[]}
          />

          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                Active mappings
              </Text>
              <Badge tone="success">{configured.length}</Badge>
            </InlineStack>
            <ProductsTable products={configured} isConfigured />
          </BlockStack>

          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                Products to configure
              </Text>
              <Badge tone="attention">{unconfigured.length}</Badge>
            </InlineStack>
            <ProductsTable products={unconfigured} isConfigured={false} />
          </BlockStack>
        </BlockStack>
      </Card>
    </Page>
  );
}
